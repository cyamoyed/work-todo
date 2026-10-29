/* work-todo — sync session persistence (work-todo.sync.v1, localStorage) */

import { SYNC_KEY } from '../../constants.js';

/**
 * Session shape:
 * {
 *   provider: 'pocketbase' | 'webdav',
 *   url: string,
 *   identity: string,        // email / username (not a secret)
 *   userId: string | null,   // pocketbase user record id
 *   token: string | null,    // pocketbase API token (JWT; auto-renewed before exp)
 *   password: string | null, // provider secret kept on-device only (webdav
 *                            // basic-auth / pocketbase silent re-login) —
 *                            // never exported, never synced, never in
 *                            // sessionStorage
 *   collection: string | null, // pocketbase data collection (default work_todo)
 *   version: string | number | null, // last seen remote version (rev / etag)
 *   lastSyncedAt: string | null,
 * }
 */
function normalizeSession(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.provider !== 'pocketbase' && raw.provider !== 'webdav') return null;
  if (typeof raw.url !== 'string' || !raw.url) return null;
  return {
    provider: raw.provider,
    url: raw.url.replace(/\/+$/, ''),
    identity: typeof raw.identity === 'string' ? raw.identity : '',
    userId: typeof raw.userId === 'string' && raw.userId ? raw.userId : null,
    token: typeof raw.token === 'string' && raw.token ? raw.token : null,
    password: typeof raw.password === 'string' && raw.password ? raw.password : null,
    collection: typeof raw.collection === 'string' && raw.collection ? raw.collection : null,
    version: raw.version != null ? raw.version : null,
    lastSyncedAt: typeof raw.lastSyncedAt === 'string' ? raw.lastSyncedAt : null,
  };
}

export function loadSession() {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(SYNC_KEY);
    if (!raw) return null;
    return normalizeSession(JSON.parse(raw));
  } catch (_) {
    return null;
  }
}

export function saveSession(session) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(SYNC_KEY, JSON.stringify(normalizeSession(session)));
  } catch (_) {
    /* ignore quota / privacy-mode failures */
  }
}

export function clearSession() {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(SYNC_KEY);
  } catch (_) {
    /* ignore */
  }
}
