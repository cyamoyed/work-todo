/* Unit tests — sync login renewal over a mocked PocketBase endpoint.
 *
 * Regression coverage for "登录状态用久了会丢": PocketBase tokens are JWTs with
 * an exp claim, so the engine must renew them before expiry (auth-refresh) and
 * silently re-login with the on-device password once a token is rejected.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  initSync,
  bootSync,
  configureSync,
  logoutSync,
  stopSyncLoop,
  getSyncState,
} from '../../src/lib/sync/engine.js';
import { SYNC_KEY } from '../../src/constants.js';

function jsonResponse(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => headers[k] ?? null },
    json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

/** Unsigned JWT with the given payload — same base64url shape the server issues. */
function makeJwt(payload) {
  const enc = (obj) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${enc({ alg: 'HS256' })}.${enc(payload)}.sig`;
}

const NOW_S = Math.floor(Date.now() / 1000);
const FAR = makeJwt({ exp: NOW_S + 7 * 24 * 3600, tag: 'far' }); // fresh for a week
const NEAR = makeJwt({ exp: NOW_S + 3600, tag: 'near' }); // inside the 24h renew margin
const DEAD = makeJwt({ exp: NOW_S + 7 * 24 * 3600, tag: 'dead' }); // far exp, but revoked
const LIVE = makeJwt({ exp: NOW_S + 7 * 24 * 3600, tag: 'live' }); // accepted after re-login

const PB_URL = 'https://pb.example.com';

let server;
let fetchLog;

function mockPocketBase(overrides = {}) {
  fetchLog = [];
  server = {
    loginTokens: [FAR], // issued per auth-with-password call (shifts, last repeats)
    validTokens: new Set(), // tokens the data endpoints accept
    refreshToken: FAR,
    refreshFails: false,
    authCalls: 0,
    refreshCalls: 0,
    ...overrides,
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, init = {}) => {
      const u = String(url);
      const method = (init.method || 'GET').toUpperCase();
      const auth = (init.headers && init.headers.Authorization) || '';
      fetchLog.push({ url: u, method, auth });
      if (u.includes('/auth-with-password')) {
        server.authCalls += 1;
        const token =
          server.loginTokens.length > 1 ? server.loginTokens.shift() : server.loginTokens[0];
        return jsonResponse(200, { token, record: { id: 'u1', email: 'a@b.c' } });
      }
      if (u.includes('/auth-refresh')) {
        server.refreshCalls += 1;
        if (server.refreshFails) return jsonResponse(401, '');
        return jsonResponse(200, {
          token: server.refreshToken,
          record: { id: 'u1', email: 'a@b.c' },
        });
      }
      if (!server.validTokens.has(auth)) return jsonResponse(401, '');
      if (method === 'GET') return jsonResponse(200, { items: [] });
      if (method === 'POST') return jsonResponse(200, { id: 'd1', rev: 1 });
      if (method === 'PATCH') return jsonResponse(200, { id: 'd1', rev: 2 });
      throw new Error('unexpected ' + method + ' ' + u);
    })
  );
}

async function configure(overrides = {}) {
  return configureSync({
    provider: 'pocketbase',
    url: PB_URL,
    identity: 'a@b.c',
    password: 'pw',
    ...overrides,
  });
}

function savedSession() {
  return JSON.parse(localStorage.getItem(SYNC_KEY));
}

beforeEach(() => {
  localStorage.clear();
  mockPocketBase();
  initSync({
    getPayload: () => ({ tasks: [], projects: [] }),
    applyMerged: () => {},
  });
});

afterEach(() => {
  logoutSync();
  stopSyncLoop();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('token renewal', () => {
  it('renews an expiring token via auth-refresh before the cycle runs', async () => {
    mockPocketBase({
      loginTokens: [NEAR],
      refreshToken: FAR,
      validTokens: new Set([NEAR, FAR]),
    });
    const state = await configure();
    expect(state.status).toBe('ok');
    expect(server.refreshCalls).toBe(1);
    expect(server.authCalls).toBe(1); // no password re-login needed
    expect(savedSession().token).toBe(FAR);
  });

  it('leaves a fresh token alone', async () => {
    mockPocketBase({ loginTokens: [FAR], validTokens: new Set([FAR]) });
    const state = await configure();
    expect(state.status).toBe('ok');
    expect(server.refreshCalls).toBe(0);
    expect(savedSession().token).toBe(FAR);
  });

  it('falls back to password re-login when auth-refresh fails', async () => {
    mockPocketBase({
      loginTokens: [NEAR, LIVE],
      validTokens: new Set([NEAR, LIVE]),
      refreshFails: true,
    });
    const state = await configure();
    expect(state.status).toBe('ok');
    expect(server.refreshCalls).toBe(1);
    expect(server.authCalls).toBe(2); // configure login + silent re-login
    expect(savedSession().token).toBe(LIVE);
    expect(savedSession().password).toBe('pw');
  });
});

describe('silent re-login', () => {
  it('re-logs-in with the on-device password when the token is rejected mid-sync', async () => {
    mockPocketBase({
      loginTokens: [DEAD, LIVE],
      validTokens: new Set([LIVE]),
    });
    const state = await configure();
    expect(state.status).toBe('ok');
    expect(server.authCalls).toBe(2); // configure login + silent re-login
    expect(savedSession().token).toBe(LIVE);
    expect(savedSession().password).toBe('pw'); // kept for the next expiry
  });

  it('a legacy session without a stored password errors honestly but stays configured', async () => {
    mockPocketBase({ validTokens: new Set([LIVE]) });
    // Pre-upgrade session shape: only the token was stored.
    localStorage.setItem(
      SYNC_KEY,
      JSON.stringify({
        provider: 'pocketbase',
        url: PB_URL,
        identity: 'a@b.c',
        userId: 'u1',
        token: DEAD,
      })
    );
    expect(bootSync()).toBe(true);
    await vi.waitFor(() => expect(getSyncState().status).toBe('error'));
    expect(getSyncState().lastError).toContain('登录已失效');
    expect(getSyncState().configured).toBe(true); // one manual login upgrades the session
    expect(localStorage.getItem(SYNC_KEY)).not.toBe(null);
    expect(server.authCalls).toBe(0); // nothing recoverable stored, no hammering
  });
});
