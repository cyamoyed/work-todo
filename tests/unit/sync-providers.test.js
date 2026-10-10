/* Unit tests — PocketBase / WebDAV providers against mocked fetch. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createPocketBaseProvider } from '../../src/lib/sync/providers/pocketbase.js';
import { createWebDavProvider } from '../../src/lib/sync/providers/webdav.js';
import { SyncConflictError, SyncAuthError } from '../../src/lib/sync/errors.js';

let calls;

function jsonResponse(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => headers[k] ?? headers[k.toLowerCase()] ?? null },
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

function mockFetch(handler) {
  calls = [];
  vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
    const req = { url: String(url), method: init.method || 'GET', headers: init.headers || {}, body: init.body };
    calls.push(req);
    return handler(req);
  }));
}

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PocketBase provider', () => {
  const pb = () => createPocketBaseProvider({ url: 'https://pb.example.com/' });

  it('defaults to the work_todo collection and accepts custom names', async () => {
    expect(pb().collection).toBe('work_todo');
    mockFetch((req) => {
      expect(req.url).toContain('/collections/mySync/records');
      return jsonResponse(200, { items: [] });
    });
    const custom = createPocketBaseProvider({ url: 'https://pb.example.com', collection: 'mySync' });
    expect(custom.collection).toBe('mySync');
    await custom.pull({ token: 'tok', userId: 'u1' });
  });

  it('rejects invalid collection names early', () => {
    expect(() => createPocketBaseProvider({ url: 'x', collection: 'bad name!' })).toThrow('集合名');
    expect(() => createPocketBaseProvider({ url: 'x', collection: '../etc' })).toThrow('集合名');
  });

  it('login: auth-with-password returns token + userId', async () => {
    mockFetch((req) => {
      if (req.url.includes('auth-with-password')) {
        expect(JSON.parse(req.body)).toEqual({ identity: 'a@b.c', password: 'pw' });
        return jsonResponse(200, { token: 'tok', record: { id: 'u1', email: 'a@b.c' } });
      }
      throw new Error('unexpected ' + req.url);
    });
    const auth = await pb().login({ identity: 'a@b.c', password: 'pw' });
    expect(auth).toEqual({ token: 'tok', identity: 'a@b.c', userId: 'u1' });
  });

  it('login: register posts the users record first', async () => {
    mockFetch((req) => {
      if (req.url.endsWith('/users/records')) return jsonResponse(200, { id: 'u1' });
      if (req.url.includes('auth-with-password')) {
        return jsonResponse(200, { token: 'tok', record: { id: 'u1' } });
      }
      throw new Error('unexpected ' + req.url);
    });
    await pb().login({ identity: 'a@b.c', password: 'pw', register: true });
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toContain('/users/records');
    expect(JSON.parse(calls[0].body).passwordConfirm).toBe('pw');
  });

  it('login: bad credentials map to SyncAuthError', async () => {
    mockFetch(() => jsonResponse(400, { message: 'Failed to authenticate' }));
    await expect(pb().login({ identity: 'x', password: 'y' })).rejects.toBeInstanceOf(SyncAuthError);
  });

  it('pull: empty when no record exists', async () => {
    mockFetch(() => jsonResponse(200, { page: 1, items: [] }));
    const r = await pb().pull({ token: 'tok', userId: 'u1' });
    expect(r).toEqual({ payload: null, version: 0 });
  });

  it('pull: returns payload + rev; unwraps string payloads', async () => {
    mockFetch(() =>
      jsonResponse(200, {
        items: [{ id: 'd1', rev: 7, payload: '{"tasks":[],"projects":[]}' }],
      })
    );
    const r = await pb().pull({ token: 'tok', userId: 'u1' });
    expect(r.version).toBe(7);
    expect(r.payload).toEqual({ tasks: [], projects: [] });
    expect(calls[0].headers.Authorization).toBe('tok');
  });

  it('push: creates the record with rev 1 when none exists', async () => {
    mockFetch((req) => {
      if (req.method === 'GET') return jsonResponse(200, { items: [] });
      if (req.method === 'POST') {
        const body = JSON.parse(req.body);
        expect(body.user).toBe('u1');
        expect(body.rev).toBe(1);
        return jsonResponse(200, { id: 'd1', rev: 1 });
      }
      throw new Error('unexpected');
    });
    const r = await pb().push({ token: 'tok', userId: 'u1' }, { tasks: [], projects: [] }, 0);
    expect(r).toEqual({ version: 1 });
  });

  it('push: patches with rev+1 when expected matches', async () => {
    mockFetch((req) => {
      if (req.method === 'GET') return jsonResponse(200, { items: [{ id: 'd1', rev: 3, payload: {} }] });
      if (req.method === 'PATCH') {
        expect(req.url).toContain('/records/d1');
        expect(JSON.parse(req.body).rev).toBe(4);
        return jsonResponse(200, { id: 'd1', rev: 4 });
      }
      throw new Error('unexpected');
    });
    const r = await pb().push({ token: 'tok', userId: 'u1' }, { tasks: [], projects: [] }, 3);
    expect(r).toEqual({ version: 4 });
  });

  it('push: throws SyncConflictError when the server moved on', async () => {
    mockFetch((req) => {
      if (req.method === 'GET') return jsonResponse(200, { items: [{ id: 'd1', rev: 9, payload: {} }] });
      throw new Error('must not write');
    });
    await expect(
      pb().push({ token: 'tok', userId: 'u1' }, { tasks: [], projects: [] }, 3)
    ).rejects.toBeInstanceOf(SyncConflictError);
  });
});

describe('WebDAV provider', () => {
  const dav = () => createWebDavProvider({ url: 'https://dav.example.com/work-todo-sync.json' });
  const session = { identity: 'user', password: 'pass' };

  it('login: 404 probe (file not created yet) is success; 401 is auth error', async () => {
    mockFetch(() => jsonResponse(404, ''));
    await expect(dav().login(session)).resolves.toEqual({ identity: 'user', token: null });
    mockFetch(() => jsonResponse(401, ''));
    await expect(dav().login(session)).rejects.toBeInstanceOf(SyncAuthError);
  });

  it('login sends Basic auth (non-ASCII password safe)', async () => {
    mockFetch(() => jsonResponse(404, ''));
    await dav().login({ identity: '用户', password: '密码' });
    const auth = calls[0].headers.Authorization;
    expect(auth.startsWith('Basic ')).toBe(true);
    // basicAuth encodes UTF-8 bytes; decode them back for the assertion.
    const decoded = new TextDecoder().decode(
      Uint8Array.from(atob(auth.slice(6)), (c) => c.charCodeAt(0))
    );
    expect(decoded).toBe('用户:密码');
  });

  it('pull: 404 → null payload/version; 200 → payload + ETag', async () => {
    mockFetch(() => jsonResponse(404, ''));
    expect(await dav().pull(session)).toEqual({ payload: null, version: null });

    mockFetch(() => jsonResponse(200, '{"tasks":[]}', { ETag: '"v1"' }));
    const r = await dav().pull(session);
    expect(r.payload).toEqual({ tasks: [] });
    expect(r.version).toBe('"v1"');
  });

  it('push: If-None-Match * on create, If-Match on update', async () => {
    mockFetch(() => jsonResponse(201, '', { ETag: '"v1"' }));
    expect(await dav().push(session, { tasks: [] }, null)).toEqual({ version: '"v1"' });
    expect(calls[0].headers['If-None-Match']).toBe('*');

    mockFetch(() => jsonResponse(204, '', { ETag: '"v2"' })); // resets `calls`
    expect(await dav().push(session, { tasks: [] }, '"v1"')).toEqual({ version: '"v2"' });
    expect(calls[0].headers['If-Match']).toBe('"v1"');
  });

  it('push: 412 maps to SyncConflictError', async () => {
    mockFetch(() => jsonResponse(412, ''));
    await expect(dav().push(session, {}, '"stale"')).rejects.toBeInstanceOf(SyncConflictError);
  });
});
