/* work-todo — PocketBase sync provider (raw fetch, no SDK).
 *
 * Server setup (once, in the PocketBase admin UI):
 *   - a data collection (default name `work-todo`, configurable per session)
 *     with fields: user (relation → users), payload (json), rev (number);
 *   - list/view/update rules scoped to the record owner.
 */

import { SyncConflictError, SyncAuthError } from '../errors.js';
import { DEFAULT_SYNC_COLLECTION } from '../../../constants.js';

const COLLECTION_NAME_RE = /^[A-Za-z0-9_-]+$/;

export function createPocketBaseProvider({ url, collection }) {
  const base = String(url || '').replace(/\/+$/, '');
  const col = String(collection || '').trim() || DEFAULT_SYNC_COLLECTION;
  if (!COLLECTION_NAME_RE.test(col)) {
    throw new Error('同步集合名只能包含字母、数字、下划线和短横线');
  }
  const colPath = encodeURIComponent(col);

  async function api(path, { method = 'GET', body, token } = {}) {
    let res;
    try {
      res = await fetch(base + path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: token } : {}),
        },
        body: body != null ? JSON.stringify(body) : undefined,
      });
    } catch (_) {
      throw new Error('无法连接同步服务器');
    }
    return res;
  }

  async function readDoc(session) {
    const filter = encodeURIComponent(`user="${session.userId}"`);
    const res = await api(
      `/api/collections/${colPath}/records?filter=${filter}&sort=-rev`,
      { token: session.token }
    );
    if (res.status === 401 || res.status === 403) throw new SyncAuthError();
    if (!res.ok) throw new Error(`读取同步数据失败（${res.status}）`);
    const data = await res.json();
    const item = (data.items && data.items[0]) || null;
    if (!item) return null;
    let payload = item.payload;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch (_) {
        payload = null;
      }
    }
    return { id: item.id, payload: payload || null, rev: Number(item.rev) || 0 };
  }

  return {
    kind: 'pocketbase',
    url: base,
    collection: col,

    async login({ identity, password, register = false }) {
      const id = String(identity || '').trim();
      const pw = String(password || '');
      if (!id || !pw) throw new SyncAuthError('请填写邮箱和密码');
      if (register) {
        const res = await api('/api/collections/users/records', {
          method: 'POST',
          body: { email: id, password: pw, passwordConfirm: pw },
        });
        if (res.status === 401 || res.status === 403) throw new SyncAuthError('注册失败');
        if (!res.ok) {
          let msg = '注册失败';
          try {
            const data = await res.json();
            if (data && data.message) msg = `注册失败：${data.message}`;
          } catch (_) {
            /* keep default */
          }
          throw new Error(msg);
        }
      }
      const res = await api('/api/collections/users/auth-with-password', {
        method: 'POST',
        body: { identity: id, password: pw },
      });
      if (res.status === 400 || res.status === 401 || res.status === 403) {
        throw new SyncAuthError('邮箱或密码错误');
      }
      if (!res.ok) throw new Error(`登录失败（${res.status}）`);
      const data = await res.json();
      if (!data || !data.token) throw new SyncAuthError('登录响应异常');
      return {
        token: data.token,
        identity: (data.record && (data.record.email || data.record.username)) || id,
        userId: data.record && data.record.id,
      };
    },

    async pull(session) {
      const doc = await readDoc(session);
      return {
        payload: doc ? doc.payload : null,
        version: doc ? doc.rev : 0,
      };
    },

    async push(session, payload, expectedVersion) {
      const expected = Number(expectedVersion) || 0;
      const doc = await readDoc(session);
      const current = doc ? doc.rev : 0;
      if (current !== expected) throw new SyncConflictError();
      const rev = current + 1;
      if (doc) {
        const res = await api(`/api/collections/${colPath}/records/${doc.id}`, {
          method: 'PATCH',
          token: session.token,
          body: { payload, rev },
        });
        if (res.status === 401 || res.status === 403) throw new SyncAuthError();
        if (res.status === 409 || res.status === 412) throw new SyncConflictError();
        if (!res.ok) throw new Error(`写入同步数据失败（${res.status}）`);
      } else {
        const res = await api(`/api/collections/${colPath}/records`, {
          method: 'POST',
          token: session.token,
          body: { user: session.userId, payload, rev },
        });
        if (res.status === 401 || res.status === 403) throw new SyncAuthError();
        if (res.status === 409 || res.status === 412) throw new SyncConflictError();
        if (!res.ok) throw new Error(`写入同步数据失败（${res.status}）`);
      }
      return { version: rev };
    },
  };
}
