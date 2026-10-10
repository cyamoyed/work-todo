/* Unit tests — sync engine state machine over a mocked WebDAV endpoint. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  initSync,
  bootSync,
  configureSync,
  logoutSync,
  syncNow,
  scheduleSync,
  stopSyncLoop,
  getSyncState,
  onSyncStateChange,
  SYNC_DEBOUNCE_MS,
  SYNC_INTERVAL_MS,
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

let server; // { payload, etag, failPutCount, offline }
let fetchLog;
let local; // fake store buffer
let applied;

function mockFetch() {
  fetchLog = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, init = {}) => {
      const method = init.method || 'GET';
      fetchLog.push({ url: String(url), method, headers: init.headers || {}, body: init.body });
      if (server.offline) throw new TypeError('Failed to fetch');
      if (method === 'GET') {
        if (server.payload == null) return jsonResponse(404, '');
        return jsonResponse(200, server.payload, { ETag: server.etag });
      }
      if (method === 'PUT') {
        if (server.failPutCount > 0) {
          server.failPutCount -= 1;
          return jsonResponse(412, '');
        }
        server.payload = JSON.parse(init.body);
        server.etag = '"v-next"';
        return jsonResponse(204, '', { ETag: server.etag });
      }
      throw new Error('unexpected ' + method);
    })
  );
}

/** Flush pending microtasks (syncNow is fire-and-forget from timer callbacks). */
async function flushAsync(ticks = 50) {
  for (let i = 0; i < ticks; i++) await Promise.resolve();
}

const WEBDAV_URL = 'https://dav.example.com/worktodo-sync.json';

async function configure() {
  return configureSync({
    provider: 'webdav',
    url: WEBDAV_URL,
    identity: 'user',
    password: 'pass',
  });
}

beforeEach(() => {
  localStorage.clear();
  server = { payload: null, etag: null, failPutCount: 0, offline: false };
  local = { tasks: [], projects: [] };
  applied = [];
  mockFetch();
  initSync({
    getPayload: () => ({ tasks: local.tasks.map((t) => ({ ...t })), projects: [] }),
    applyMerged: (tasks) => {
      applied.push(tasks.map((t) => t.id));
      local.tasks = tasks.map((t) => ({ ...t }));
    },
  });
});

afterEach(() => {
  logoutSync();
  stopSyncLoop();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('configureSync / session', () => {
  it('logs in, saves worktodo.sync.v1, runs the first cycle', async () => {
    const state = await configure();
    expect(state.status).toBe('ok');
    expect(state.configured).toBe(true);
    expect(state.lastSyncedAt).toBeTruthy();
    const saved = JSON.parse(localStorage.getItem(SYNC_KEY));
    expect(saved.provider).toBe('webdav');
    expect(saved.url).toBe(WEBDAV_URL);
    expect(saved.token).toBe(null);
    expect(saved.password).toBe('pass');
    // login probe (GET) + pull (GET) + push create (PUT)
    expect(fetchLog.some((c) => c.method === 'PUT')).toBe(true);
  });

  it('bad credentials surface as an error, no session saved', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(401, ''))
    );
    await expect(configure()).rejects.toThrow();
    expect(localStorage.getItem(SYNC_KEY)).toBe(null);
  });

  it('bootSync resumes a saved session and syncs', async () => {
    await configure();
    const before = fetchLog.length;
    logoutSync(); // stops loop, clears in-memory state but we re-seed storage
    localStorage.setItem(
      SYNC_KEY,
      JSON.stringify({ provider: 'webdav', url: WEBDAV_URL, identity: 'user', password: 'pass' })
    );
    const resumed = bootSync();
    expect(resumed).toBe(true);
    await vi.waitFor(() => expect(fetchLog.length).toBeGreaterThan(before));
    expect(getSyncState().configured).toBe(true);
  });

  it('bootSync is a no-op without a saved session', () => {
    expect(bootSync()).toBe(false);
    expect(getSyncState().status).toBe('disabled');
  });

  it('logoutSync clears the session and disables syncing', async () => {
    await configure();
    logoutSync();
    expect(localStorage.getItem(SYNC_KEY)).toBe(null);
    expect(getSyncState().configured).toBe(false);
    scheduleSync(); // must not schedule anything
    await syncNow(); // must be a no-op
    expect(getSyncState().status).toBe('disabled');
  });
});

describe('pull → merge → push cycle', () => {
  it('merges remote entities through applyMerged and pushes the union', async () => {
    await configure();
    server.payload = {
      schemaVersion: 3,
      exportedAt: '2026-01-01T00:00:00.000Z',
      app: 'worktodo',
      tasks: [{ id: 'remote-1', title: '远端', status: 'todo', priority: 'medium', updatedAt: '2026-01-01T00:00:00.000Z' }],
      projects: [],
    };
    server.etag = '"r1"';
    local.tasks = [{ id: 'local-1', title: '本地', status: 'todo', priority: 'medium', updatedAt: '2026-01-01T00:00:00.000Z' }];

    await syncNow();
    expect(getSyncState().status).toBe('ok');
    expect(applied[applied.length - 1].sort()).toEqual(['local-1', 'remote-1']);
    // pushed payload contains both entities
    const put = fetchLog.filter((c) => c.method === 'PUT').pop();
    const pushed = JSON.parse(put.body ?? server.payload);
    expect(pushed.tasks.map((t) => t.id).sort()).toEqual(['local-1', 'remote-1']);
  });

  it('conflict on push triggers re-pull and retry until success', async () => {
    await configure();
    const putsBefore = fetchLog.filter((c) => c.method === 'PUT').length;
    server.payload = { schemaVersion: 3, tasks: [], projects: [] };
    server.etag = '"r1"';
    server.failPutCount = 1; // first PUT gets 412, the retry succeeds

    await syncNow();
    expect(getSyncState().status).toBe('ok');
    expect(fetchLog.filter((c) => c.method === 'PUT').length - putsBefore).toBe(2);
    expect(fetchLog.filter((c) => c.method === 'GET').length).toBeGreaterThanOrEqual(3); // re-pull happened
  });

  it('endless conflicts give up with an error status', async () => {
    await configure();
    const putsBefore = fetchLog.filter((c) => c.method === 'PUT').length;
    server.payload = { schemaVersion: 3, tasks: [], projects: [] };
    server.etag = '"r1"';
    server.failPutCount = 99;
    await syncNow();
    expect(getSyncState().status).toBe('error');
    expect(getSyncState().lastError).toContain('冲突');
    expect(fetchLog.filter((c) => c.method === 'PUT').length - putsBefore).toBe(3); // CONFLICT_RETRIES
  });

  it('network failure → error status and backoff retry', async () => {
    vi.useFakeTimers();
    await configure();
    const before = fetchLog.length;
    server.offline = true;
    await syncNow();
    expect(getSyncState().status).toBe('error');
    // retry is scheduled at RETRY_BASE_MS (30s)
    await vi.advanceTimersByTimeAsync(30000);
    await flushAsync();
    expect(fetchLog.length).toBeGreaterThan(before);
  });

  it('offline detection reports the offline status', async () => {
    await configure();
    Object.defineProperty(globalThis.navigator, 'onLine', { value: false, configurable: true });
    server.offline = true;
    await syncNow();
    expect(getSyncState().status).toBe('offline');
    Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });
  });
});

describe('scheduling', () => {
  it('scheduleSync debounces bursts into one cycle', async () => {
    vi.useFakeTimers();
    await configure();
    const cyclesBefore = fetchLog.filter((c) => c.method === 'PUT').length;
    scheduleSync();
    scheduleSync();
    scheduleSync();
    await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS - 1);
    await flushAsync();
    expect(fetchLog.filter((c) => c.method === 'PUT').length).toBe(cyclesBefore);
    await vi.advanceTimersByTimeAsync(2);
    await flushAsync();
    expect(fetchLog.filter((c) => c.method === 'PUT').length).toBe(cyclesBefore + 1);
  });

  it('interval loop syncs every SYNC_INTERVAL_MS', async () => {
    vi.useFakeTimers();
    await configure();
    const before = fetchLog.filter((c) => c.method === 'PUT').length;
    await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS);
    await flushAsync();
    expect(fetchLog.filter((c) => c.method === 'PUT').length).toBeGreaterThan(before);
  });

  it('state changes are observable', async () => {
    const seen = [];
    const off = onSyncStateChange((s) => seen.push(s.status));
    await configure();
    expect(seen).toContain('syncing');
    expect(seen).toContain('ok');
    off();
    expect(getSyncState().provider).toBe('webdav');
  });
});
