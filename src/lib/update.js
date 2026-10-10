/* work-todo — update checks against GitHub Releases (no Vue) */

import { UPDATE_KEY, UPDATE_REPO, UPDATE_AUTO_CHECK_MS } from '../constants.js';
import { detectPlatform, isNewerVersion, normalizeRelease } from '../core/update.js';
import { isTauri, tauriInvoke } from './tauri.js';

/** GitHub API endpoint for the newest published (non-prerelease) release. */
export const LATEST_RELEASE_URL = `https://api.github.com/repos/${UPDATE_REPO}/releases/latest`;

/** Frontend version — injected from src-tauri/Cargo.toml at build time (Vite define). */
export function getAppVersion() {
  return typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';
}

function currentPlatform() {
  return detectPlatform(typeof navigator !== 'undefined' ? navigator.userAgent : '');
}

/**
 * Fetch the latest GitHub release and compare it with the running version.
 * Resolves to { status: 'available'|'up-to-date'|'no-release'|'error',
 * latest?, reason? } — never rejects. Any attempt stamps the throttle clock.
 */
export async function checkForUpdates(opts = {}) {
  markChecked();
  const fetchImpl = opts.fetch || (typeof fetch === 'function' ? fetch : null);
  if (!fetchImpl) return { status: 'error', reason: 'no-fetch' };
  try {
    const res = await fetchImpl(LATEST_RELEASE_URL, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (res && res.status === 404) return { status: 'no-release' };
    if (!res || !res.ok) {
      return { status: 'error', reason: res && res.status === 403 ? 'rate-limited' : 'http' };
    }
    const latest = normalizeRelease(await res.json(), opts.platform || currentPlatform());
    if (!latest) return { status: 'error', reason: 'bad-payload' };
    const current = opts.currentVersion || getAppVersion();
    return isNewerVersion(latest.version, current)
      ? { status: 'available', latest }
      : { status: 'up-to-date', latest };
  } catch (_) {
    return { status: 'error', reason: 'network' };
  }
}

/** Auto checks are throttled to one per UPDATE_AUTO_CHECK_MS; manual always runs. */
export function shouldAutoCheck(now = Date.now()) {
  try {
    const raw = JSON.parse(localStorage.getItem(UPDATE_KEY) || '{}');
    const last = Date.parse((raw && raw.lastCheckAt) || '') || 0;
    return !last || now - last >= UPDATE_AUTO_CHECK_MS;
  } catch (_) {
    return true;
  }
}

/** Stamp the last update-check time (any completed attempt counts). */
export function markChecked(now = Date.now()) {
  try {
    localStorage.setItem(UPDATE_KEY, JSON.stringify({ lastCheckAt: new Date(now).toISOString() }));
  } catch (_) {
    /* ignore */
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
