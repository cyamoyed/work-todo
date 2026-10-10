/* WorkTodo — WebDAV sync provider (raw fetch).
 *
 * The payload is one JSON file on any WebDAV endpoint (a cloud drive folder,
 * e.g. 坚果云). Optimistic locking uses If-Match on the file ETag.
 * Browser use requires the server to allow CORS; the Tauri desktop app is
 * not subject to CORS.
 */

import { SyncConflictError, SyncAuthError } from '../errors.js';

function basicAuth(user, pass) {
  const bytes = new TextEncoder().encode(`${user}:${pass}`);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return 'Basic ' + btoa(bin);
}

export function createWebDavProvider({ url }) {
  const base = String(url || '').replace(/\/+$/, '');

  function headers(session, extra = {}) {
    return {
      Authorization: basicAuth(session.identity || '', session.password || ''),
      ...extra,
    };
  }

  function authError(res) {
    return res.status === 401 || res.status === 403;
  }

  async function request(method, session, extraHeaders, body) {
    let res;
    try {
      res = await fetch(base, {
        method,
        headers: headers(session, extraHeaders),
        body,
      });
    } catch (_) {
      throw new Error('无法连接 WebDAV 服务器');
    }
    return res;
  }

  return {
    kind: 'webdav',
    url: base,

    async login({ identity, password }) {
      const session = { identity: String(identity || '').trim(), password: String(password || '') };
      if (!session.identity || !session.password) throw new SyncAuthError('请填写账号和密码');
      // Probe the file: 404 (not created yet) counts as success.
      const res = await request('GET', session);
      if (authError(res)) throw new SyncAuthError('WebDAV 账号或密码错误');
      if (!res.ok && res.status !== 404) throw new Error(`WebDAV 连接失败（${res.status}）`);
      return { identity: session.identity, token: null };
    },

    async pull(session) {
      const res = await request('GET', session);
      if (authError(res)) throw new SyncAuthError();
      if (res.status === 404) return { payload: null, version: null };
      if (!res.ok) throw new Error(`WebDAV 读取失败（${res.status}）`);
      const etag = res.headers.get('ETag');
      let payload = null;
      try {
        payload = JSON.parse(await res.text());
      } catch (_) {
        payload = null;
      }
      return { payload, version: etag || '' };
    },

    async push(session, payload, expectedVersion) {
      const extra = { 'Content-Type': 'application/json' };
      if (expectedVersion === null || expectedVersion === undefined) {
        extra['If-None-Match'] = '*'; // create-only
      } else if (expectedVersion !== '') {
        extra['If-Match'] = expectedVersion;
      }
      const res = await request('PUT', session, extra, JSON.stringify(payload));
      if (res.status === 412 || res.status === 409) throw new SyncConflictError();
      if (authError(res)) throw new SyncAuthError();
      if (!res.ok) throw new Error(`WebDAV 写入失败（${res.status}）`);
      return { version: res.headers.get('ETag') || '' };
    },
  };
}
