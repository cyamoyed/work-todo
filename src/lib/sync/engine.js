/* work-todo — sync engine: pull → merge → push over a pluggable provider.
 *
 * Local-first: every failure degrades to "sync paused", never to blocked local
 * edits. Conflict resolution is entity-level LWW (core/transfer.mergeImportTasks);
 * the remote blob is a merge cache, local state is authoritative for local
 * edits until merged (see docs/SYNC-DESIGN.md §5.2).
 */

import { buildExportPayload, mergeImportTasks, parseImportPayload } from '../../core/transfer.js';
import { shouldRenewToken } from '../../core/auth.js';
import { loadSession, saveSession, clearSession } from './session.js';
import { isConflict, isAuthError, SyncConflictError } from './errors.js';
import { createPocketBaseProvider } from './providers/pocketbase.js';
import { createWebDavProvider } from './providers/webdav.js';

export const SYNC_DEBOUNCE_MS = 5000;
export const SYNC_INTERVAL_MS = 60000;
export const SYNC_FOCUS_THROTTLE_MS = 10000;
const RETRY_BASE_MS = 30000;
const RETRY_MAX_MS = 300000;
const CONFLICT_RETRIES = 3;

/** disabled | syncing | ok | error | offline */
let status = 'disabled';
let lastSyncedAt = null;
let lastError = null;
let session = null;
let provider = null;
let getPayload = null;
let applyMerged = null;

let syncing = false;
let pendingSync = false;
let debounceTimer = null;
let retryTimer = null;
let intervalTimer = null;
let retryDelay = RETRY_BASE_MS;
let lastRunAt = 0;
const listeners = new Set();
let lifecycleWired = false;

function makeProvider(kind, cfg) {
  if (kind === 'pocketbase') {
    return createPocketBaseProvider({ url: cfg.url, collection: cfg.collection });
  }
  if (kind === 'webdav') return createWebDavProvider({ url: cfg.url });
  return null;
}

function setStatus(next) {
  if (status === next) return;
  status = next;
  emit();
}

function emit() {
  for (const cb of listeners) {
    try {
      cb(getSyncState());
    } catch (_) {
      /* listener errors never break the engine */
    }
  }
}

export function getSyncState() {
  return {
    status,
    lastSyncedAt,
    lastError,
    configured: !!session,
    provider: session ? session.provider : null,
    identity: session ? session.identity : '',
  };
}

export function onSyncStateChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Wire engine ↔ store. Call once at startup, before bootSync. */
export function initSync(deps = {}) {
  getPayload = deps.getPayload || null;
  applyMerged = deps.applyMerged || null;
  if (!lifecycleWired && typeof window !== 'undefined') {
    lifecycleWired = true;
    window.addEventListener('online', () => {
      if (session) throttledSyncNow();
    });
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (session && !document.hidden) throttledSyncNow();
      });
    }
  }
}

/** Restore a saved session and start the loop. No-op when never configured. */
export function bootSync() {
  session = loadSession();
  if (!session) {
    status = 'disabled';
    return false;
  }
  provider = makeProvider(session.provider, session);
  lastSyncedAt = session.lastSyncedAt;
  setStatus('ok');
  startSyncLoop();
  syncNow();
  return true;
}

/** Login (or register) and start syncing. Resolves to the sync state. */
export async function configureSync({
  provider: kind,
  url,
  identity,
  password,
  register = false,
  collection,
}) {
  const p = makeProvider(kind, { url, collection });
  if (!p) throw new Error('未知的同步方式');
  const auth = await p.login({ identity, password, register });
  session = {
    provider: kind,
    url: p.url,
    identity: auth.identity || identity || '',
    userId: auth.userId || null,
    token: auth.token || null,
    // Kept on-device only (never exported/synced): WebDAV basic-auth secret,
    // PocketBase silent re-login once a token dies.
    password: password || null,
    collection: kind === 'pocketbase' ? p.collection : null,
    version: null,
    lastSyncedAt: null,
  };
  provider = p;
  saveSession(session);
  lastError = null;
  retryDelay = RETRY_BASE_MS;
  setStatus('ok');
  startSyncLoop();
  await syncNow();
  return getSyncState();
}

export function logoutSync() {
  stopSyncLoop();
  clearSession();
  session = null;
  provider = null;
  lastSyncedAt = null;
  lastError = null;
  setStatus('disabled');
}

function startSyncLoop() {
  if (intervalTimer || typeof window === 'undefined') return;
  intervalTimer = setInterval(() => {
    if (session) syncNow();
  }, SYNC_INTERVAL_MS);
}

export function stopSyncLoop() {
  if (intervalTimer) {
    clearInterval(intervalTimer);
    intervalTimer = null;
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

/** Debounced trigger for local edits. */
export function scheduleSync() {
  if (!session) return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    syncNow();
  }, SYNC_DEBOUNCE_MS);
}

/** Focus/online trigger, throttled to one run per SYNC_FOCUS_THROTTLE_MS. */
export function throttledSyncNow() {
  const now = Date.now();
  if (now - lastRunAt < SYNC_FOCUS_THROTTLE_MS) return;
  syncNow();
}

function scheduleRetry() {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (session) syncNow();
  }, retryDelay);
  retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
}

/** Persist fresh credentials from a refresh / silent re-login. */
function applyAuth(auth) {
  if (!auth || !session) return;
  if (auth.token) session.token = auth.token;
  if (auth.userId) session.userId = auth.userId;
  if (auth.identity) session.identity = auth.identity;
  saveSession(session);
}

/**
 * Keep the login alive across long-running sessions: renew a PocketBase token
 * before its JWT `exp`, or silently re-login with the on-device password once
 * the token is dead (revoked / missing). Never throws — a false return means
 * nothing recoverable is stored and the user has to log in again. WebDAV basic
 * auth has no token to renew (credentials travel with every request).
 */
async function renewAuth() {
  if (!session || session.provider !== 'pocketbase') return true;
  if (!session.token) return silentRelogin();
  if (!shouldRenewToken(session.token, Date.now())) return true;
  try {
    applyAuth(await provider.refresh(session));
    return true;
  } catch (_) {
    return silentRelogin();
  }
}

/** Re-run the stored-password login (PocketBase only). Never throws. */
async function silentRelogin() {
  if (!session || session.provider !== 'pocketbase' || !session.password) return false;
  try {
    applyAuth(await provider.login({ identity: session.identity, password: session.password }));
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * One full cycle: pull → merge → apply → push.
 * Serializes concurrent calls; a call during a run sets a follow-up pass.
 */
export async function syncNow() {
  if (!session || !provider || !getPayload || !applyMerged) return getSyncState();
  if (syncing) {
    pendingSync = true;
    return getSyncState();
  }
  syncing = true;
  lastRunAt = Date.now();
  setStatus('syncing');
  try {
    const renewed = await renewAuth();
    try {
      await runSyncCycle();
    } catch (e) {
      // The token can die mid-session (revoked / server clock): silently
      // re-login with the on-device password once and retry the cycle before
      // surfacing the failure.
      if (!isAuthError(e) || renewed === false || !(await silentRelogin())) throw e;
      await runSyncCycle();
    }
    lastError = null;
    retryDelay = RETRY_BASE_MS;
    setStatus('ok');
  } catch (e) {
    lastError = (e && e.message) || String(e);
    if (isAuthError(e)) {
      // Credentials dead: pause the loop instead of hammering the server.
      setStatus('error');
    } else if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setStatus('offline');
    } else {
      setStatus('error');
    }
    scheduleRetry();
  } finally {
    syncing = false;
    if (pendingSync) {
      pendingSync = false;
      scheduleSync();
    }
    emit();
  }
  return getSyncState();
}

/** One pull → merge → apply → push pass with conflict retries. Throws on failure. */
async function runSyncCycle() {
  let done = false;
  for (let attempt = 0; attempt < CONFLICT_RETRIES && !done; attempt++) {
    const remote = await provider.pull(session);
    const remotePayload = normalizeRemote(remote && remote.payload);
    const local = getPayload();
    const merged = mergeImportTasks(
      { tasks: local.tasks, projects: local.projects },
      remotePayload,
      'merge'
    );
    // Re-merge against the live store inside applyMerged — edits made while
    // this cycle was in flight must survive.
    applyMerged(merged.tasks, merged.projects);
    const pushPayload = buildExportPayload(merged.tasks, merged.projects);
    try {
      const res = await provider.push(session, pushPayload, remote.version);
      session.version = res.version;
      session.lastSyncedAt = new Date().toISOString();
      saveSession(session);
      lastSyncedAt = session.lastSyncedAt;
      done = true;
    } catch (e) {
      if (!isConflict(e)) throw e;
      // fall through: re-pull and re-merge
    }
  }
  if (!done) throw new SyncConflictError('同步冲突重试超限');
}

/** Remote payloads may be stale/foreign — normalize or drop. */
function normalizeRemote(payload) {
  if (!payload) return { tasks: [], projects: [] };
  const parsed = parseImportPayload(payload);
  if (!parsed.ok) return { tasks: [], projects: [] };
  return { tasks: parsed.tasks, projects: parsed.projects };
}
