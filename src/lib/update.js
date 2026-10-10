/* work-todo — update checks against GitHub Releases (no Vue) */

import {
  UPDATE_KEY,
  UPDATE_REPO,
  UPDATE_AUTO_CHECK_MS,
  UPDATE_RETRY_MS,
} from '../constants.js';
import { detectPlatform, isNewerVersion, normalizeRelease, parseAtomFeed } from '../core/update.js';
import { isTauri, tauriInvoke } from './tauri.js';

/** GitHub API endpoint for the newest published (non-prerelease) release. */
export const LATEST_RELEASE_URL = `https://api.github.com/repos/${UPDATE_REPO}/releases/latest`;

/** Releases Atom feed — a plain page, not the API: no auth, no rate limit. */
export const ATOM_FEED_URL = `https://github.com/${UPDATE_REPO}/releases.atom`;

/** Frontend version — injected from src-tauri/Cargo.toml at build time (Vite define). */
export function getAppVersion() {
  return typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';
}

function currentPlatform() {
  return detectPlatform(typeof navigator !== 'undefined' ? navigator.userAgent : '');
}

function readCheckState() {
  try {
    const raw = JSON.parse(localStorage.getItem(UPDATE_KEY) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch (_) {
    return {};
  }
}

function writeCheckState(patch) {
  try {
    localStorage.setItem(UPDATE_KEY, JSON.stringify({ ...readCheckState(), ...patch }));
  } catch (_) {
    /* ignore */
  }
}

function compareWithCurrent(latest, currentVersion) {
  return isNewerVersion(latest.version, currentVersion || getAppVersion())
    ? { status: 'available', latest }
    : { status: 'up-to-date', latest };
}

/** Ask the Atom feed for the latest release (fallback when the API rate-limits). */
async function checkViaAtom(fetchImpl, currentVersion) {
  try {
    const res = await fetchImpl(ATOM_FEED_URL, { headers: { Accept: 'application/xml' } });
    if (!res || !res.ok || typeof res.text !== 'function') return null;
    const parsed = parseAtomFeed(await res.text());
    if (!parsed) return null;
    const latest = {
      ...parsed,
      url: parsed.url || `https://github.com/${UPDATE_REPO}/releases`,
    };
    // The feed carries no asset list — the release page is the best download target.
    latest.downloadUrl = latest.url;
    return compareWithCurrent(latest, currentVersion);
  } catch (_) {
    return null;
  }
}

/**
 * Fetch the latest GitHub release and compare it with the running version.
 * Resolves to { status: 'available'|'up-to-date'|'no-release'|'error',
 * latest?, reason? } — never rejects. Successful (or definitive) outcomes
 * stamp the 6h throttle clock; failures only stamp the 15min retry clock so a
 * boot offline doesn't burn the whole auto-check window. A cached ETag is
 * sent as If-None-Match — GitHub 304 answers don't count against the rate
 * limit. A 403 falls back to the releases Atom feed before giving up.
 */
export async function checkForUpdates(opts = {}) {
  const fetchImpl = opts.fetch || (typeof fetch === 'function' ? fetch : null);
  if (!fetchImpl) return { status: 'error', reason: 'no-fetch' };
  const prev = readCheckState();
  const headers = { Accept: 'application/vnd.github+json' };
  if (prev.etag && prev.cached) headers['If-None-Match'] = prev.etag;
  try {
    const res = await fetchImpl(LATEST_RELEASE_URL, { headers });
    // 304 → the cached payload still stands.
    if (res && res.status === 304 && prev.cached) {
      markChecked(Date.now(), { ok: true });
      return compareWithCurrent(prev.cached, opts.currentVersion);
    }
    if (res && res.status === 404) {
      markChecked(Date.now(), { ok: true });
      return { status: 'no-release' };
    }
    if (!res || !res.ok) {
      if (res && res.status === 403) {
        const viaAtom = await checkViaAtom(fetchImpl, opts.currentVersion);
        if (viaAtom) {
          markChecked(Date.now(), { ok: true });
          return viaAtom;
        }
        markChecked(Date.now(), { ok: false });
        return { status: 'error', reason: 'rate-limited' };
      }
      markChecked(Date.now(), { ok: false });
      return { status: 'error', reason: 'http' };
    }
    const latest = normalizeRelease(await res.json(), opts.platform || currentPlatform());
    if (!latest) {
      markChecked(Date.now(), { ok: false });
      return { status: 'error', reason: 'bad-payload' };
    }
    const etag =
      res.headers && typeof res.headers.get === 'function' ? res.headers.get('etag') || '' : '';
    markChecked(Date.now(), { ok: true, etag, cached: latest });
    return compareWithCurrent(latest, opts.currentVersion);
  } catch (_) {
    markChecked(Date.now(), { ok: false });
    return { status: 'error', reason: 'network' };
  }
}

/**
 * Auto checks run at most once per UPDATE_AUTO_CHECK_MS. A failed attempt
 * (failedAt) short of that window allows an earlier retry after
 * UPDATE_RETRY_MS, so transient network errors don't stall updates for hours.
 */
export function shouldAutoCheck(now = Date.now()) {
  const raw = readCheckState();
  const lastOk = Date.parse(raw.lastCheckAt || '') || 0;
  const lastTry = Date.parse(raw.failedAt || '') || 0;
  if (!lastOk) return !lastTry || now - lastTry >= UPDATE_RETRY_MS;
  if (now >= lastOk + UPDATE_AUTO_CHECK_MS) return true;
  return lastTry >= lastOk && now - lastTry >= UPDATE_RETRY_MS;
}

/**
 * Stamp the check clocks. `ok` marks a completed (or definitive) check and
 * opens a fresh throttle window; failures only stamp `failedAt`. `etag` /
 * `cached` persist the latest API answer for If-None-Match revalidation.
 */
export function markChecked(now = Date.now(), { ok = true, etag, cached } = {}) {
  if (ok) {
    const patch = { lastCheckAt: new Date(now).toISOString(), failedAt: null };
    if (etag !== undefined) patch.etag = etag;
    if (cached !== undefined) patch.cached = cached;
    writeCheckState(patch);
  } else {
    writeCheckState({ failedAt: new Date(now).toISOString() });
  }
}

/** Open a URL with the system browser (desktop) or in a new tab (web). */
export function openExternal(url) {
  if (typeof url !== 'string' || !url) return Promise.resolve(false);
  const openInTab = () => {
    if (typeof window !== 'undefined' && typeof window.open === 'function') {
      window.open(url, '_blank');
      return true;
    }
    return false;
  };
  if (isTauri()) {
    return tauriInvoke('plugin:opener|open_url', { url })
      .then(() => true)
      .catch(() => openInTab());
  }
  return Promise.resolve(openInTab());
}

/** Open the best download target of a `latest` release (installer or release page). */
export function openDownload(latest) {
  return openExternal(latest && (latest.downloadUrl || latest.url));
}
