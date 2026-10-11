/* work-todo — update checks against GitHub Releases (no Vue) */

import {
  UPDATE_KEY,
  UPDATE_REPO,
  UPDATE_AUTO_CHECK_MS,
  UPDATE_RETRY_MS,
  UPDATE_CHECK_TIMEOUT_MS,
} from '../constants.js';
import {
  detectPlatform,
  isNewerVersion,
  normalizeRelease,
  parseAtomFeed,
  pickNewestTag,
} from '../core/update.js';
import { isTauri, tauriInvoke } from './tauri.js';

/** GitHub API endpoint for the newest published (non-prerelease) release. */
export const LATEST_RELEASE_URL = `https://api.github.com/repos/${UPDATE_REPO}/releases/latest`;

/** Releases Atom feed — a plain page, not the API: no auth, no rate limit. */
export const ATOM_FEED_URL = `https://github.com/${UPDATE_REPO}/releases.atom`;

/** jsDelivr data API — CDN-served tag list, no GitHub API quota, CORS-open. */
export const JSDIVLR_VERSIONS_URL = `https://data.jsdelivr.com/v1/packages/gh/${UPDATE_REPO}`;

/** Official releases page — the only download target mirror results may point at. */
export const RELEASES_PAGE_URL = `https://github.com/${UPDATE_REPO}/releases`;

/** Frontend version — injected from src-tauri/Cargo.toml at build time (Vite define). */
export function getAppVersion() {
  return typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';
}

/** Wrap a fetch with an abort timer so a hung GitHub connection degrades to the mirror chain. */
async function fetchWithTimeout(fetchImpl, url, opts = {}) {
  if (typeof AbortController !== 'function') return fetchImpl(url, opts);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), UPDATE_CHECK_TIMEOUT_MS);
  try {
    return await fetchImpl(url, { ...opts, signal: ctl.signal });
  } finally {
    clearTimeout(timer);
  }
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
    const res = await fetchWithTimeout(fetchImpl, ATOM_FEED_URL, {
      headers: { Accept: 'application/xml' },
    });
    if (!res || !res.ok || typeof res.text !== 'function') return null;
    const parsed = parseAtomFeed(await res.text());
    if (!parsed) return null;
    const latest = {
      ...parsed,
      url: parsed.url || RELEASES_PAGE_URL,
    };
    // The feed carries no asset list — the release page is the best download target.
    latest.downloadUrl = latest.url;
    return compareWithCurrent(latest, currentVersion);
  } catch (_) {
    return null;
  }
}

/**
 * Ask the jsDelivr data API for the newest release tag (second fallback: the
 * CDN is reachable where github.com is not). The mirror only answers "which
 * version is newest" — notes and the download target are pinned to the
 * official releases page, never taken from the mirror.
 */
async function checkViaJsDelivr(fetchImpl, currentVersion) {
  try {
    const res = await fetchWithTimeout(fetchImpl, JSDIVLR_VERSIONS_URL, {
      headers: { Accept: 'application/json' },
    });
    if (!res || !res.ok || typeof res.json !== 'function') return null;
    const version = pickNewestTag(await res.json());
    if (!version) return null;
    return compareWithCurrent(
      {
        version,
        notes: '',
        url: RELEASES_PAGE_URL,
        publishedAt: '',
        downloadUrl: RELEASES_PAGE_URL,
      },
      currentVersion
    );
  } catch (_) {
    return null;
  }
}

/** Mirror chain for any check the primary API could not answer. */
async function checkViaMirrors(fetchImpl, currentVersion) {
  return (
    (await checkViaAtom(fetchImpl, currentVersion)) ||
    (await checkViaJsDelivr(fetchImpl, currentVersion))
  );
}

/**
 * Fetch the latest GitHub release and compare it with the running version.
 * Resolves to { status: 'available'|'up-to-date'|'no-release'|'error',
 * latest?, reason?, stale? } — never rejects. Successful (or definitive)
 * outcomes stamp the 6h throttle clock; failures only stamp the 15min retry
 * clock so a boot offline doesn't burn the whole auto-check window. A cached
 * ETag is sent as If-None-Match — GitHub 304 answers don't count against the
 * rate limit. When the API gives no definitive answer (403/429 rate limit,
 * 5xx, hung or failed connection) the mirror chain (Atom feed, then the
 * jsDelivr tag list) takes over; if that fails too but a previous check left
 * a cached release, it is replayed flagged `stale` so the user still sees
 * last-known update info.
 */
export async function checkForUpdates(opts = {}) {
  const fetchImpl = opts.fetch || (typeof fetch === 'function' ? fetch : null);
  if (!fetchImpl) return { status: 'error', reason: 'no-fetch' };
  const prev = readCheckState();
  const headers = { Accept: 'application/vnd.github+json' };
  if (prev.etag && prev.cached) headers['If-None-Match'] = prev.etag;
  let res = null;
  try {
    res = await fetchWithTimeout(fetchImpl, LATEST_RELEASE_URL, { headers });
  } catch (_) {
    res = null;
  }
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
    const viaMirror = await checkViaMirrors(fetchImpl, opts.currentVersion);
    if (viaMirror) {
      markChecked(Date.now(), { ok: true });
      return viaMirror;
    }
    markChecked(Date.now(), { ok: false });
    const reason = !res
      ? 'network'
      : res.status === 403 || res.status === 429
        ? 'rate-limited'
        : 'http';
    // All sources down — the last successful answer is still worth showing.
    if (prev.cached) {
      return { ...compareWithCurrent(prev.cached, opts.currentVersion), reason, stale: true };
    }
    return { status: 'error', reason };
  }
  try {
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
    // A 200 that fails to parse is still a payload problem, not a network one.
    markChecked(Date.now(), { ok: false });
    return { status: 'error', reason: 'bad-payload' };
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
