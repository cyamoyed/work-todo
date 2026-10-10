/* work-todo — update-check state (reactive view for templates) + orchestration */

import { reactive } from 'vue';
import { getAppVersion, checkForUpdates, shouldAutoCheck, openDownload } from '../lib/update.js';
import { nativeUpdaterCheck, nativeDownloadAndInstall, nativeRelaunch } from '../lib/updater.js';
import { createDownloadProgress } from '../core/update.js';

export const updateState = reactive({
  status: 'idle', // idle | checking | available | up-to-date | no-release | error
  reason: '', // error detail: network | rate-limited | http | bad-payload | no-fetch
  latest: null, // { version, notes, url, publishedAt, downloadUrl }
  currentVersion: getAppVersion(),
  // Native in-app update (desktop only; see lib/updater.js).
  native: {
    status: 'idle', // idle | checking | downloading | installing | ready | error
    checked: false, // a native check has run (result may be "not installable")
    installable: false, // plugin confirmed a newer installable version
    rid: 0, // update resource id for download_and_install
    percent: null, // 0-99 while downloading, 100 when finished; null = unknown size
    received: 0, // bytes received so far
    total: 0, // total bytes when the server reports it
    error: '',
  },
});

/**
 * Run an update check and record the outcome in `updateState`. `manual`
 * forces a fetch; automatic checks throttle to one per interval. Resolves to
 * the check result, or null when the check was skipped (throttled/concurrent).
 */
export async function runUpdateCheck({ manual = false } = {}) {
  if (updateState.status === 'checking') return null;
  if (!manual && !shouldAutoCheck()) return null;
  updateState.status = 'checking';
  updateState.reason = '';
  const res = await checkForUpdates();
  updateState.status = res.status;
  updateState.reason = res.reason || '';
  updateState.latest = res.status === 'available' ? res.latest : null;
  return res;
}

/**
 * Ask the native updater plugin whether an installable update exists (the
 * plugin hits the latest.json endpoint and verifies its minisign signature;
 * the browser flow above is unaffected on error). No-op on web builds.
 */
export async function checkNativeUpdate() {
  const n = updateState.native;
  if (n.status === 'downloading' || n.status === 'installing') return null;
  n.status = 'checking';
  n.error = '';
  const res = await nativeUpdaterCheck();
  n.checked = true;
  n.installable = !!(res && res.available && res.rid !== undefined);
  n.rid = res && res.available ? res.rid || 0 : 0;
  if (n.status === 'checking') n.status = 'idle';
  return res;
}

/**
 * Download and install via the updater plugin, streaming progress into
 * `updateState.native`. On Windows the installer takes over and exits the
 * app (status stays 'installing'); on macOS/Linux the install resolves and
 * status moves to 'ready' for the user to relaunch.
 */
export async function installNativeUpdate() {
  const n = updateState.native;
  if (n.status === 'downloading' || n.status === 'installing') return null;
  let rid = n.rid;
  if (!n.installable) {
    const res = await checkNativeUpdate();
    if (!res || !res.available) {
      n.status = 'error';
      n.error = '当前版本暂不支持应用内更新';
      return null;
    }
    rid = res.rid;
  }
  n.status = 'downloading';
  n.error = '';
  const track = createDownloadProgress();
  try {
    await nativeDownloadAndInstall(rid, (event) => {
      const p = track(event);
      n.percent = p.percent;
      n.received = p.received;
      n.total = p.total;
      if (p.finished && (n.status === 'downloading' || n.status === 'checking')) {
        n.status = 'installing';
      }
    });
    // Resolves only on macOS/Linux — Windows exits inside the installer.
    n.status = 'ready';
    return true;
  } catch (_) {
    n.status = 'error';
    n.error = '应用内更新失败，请前往下载安装包';
    return null;
  }
}

/** Relaunch the app after a completed in-place update. */
export function relaunchAfterUpdate() {
  return nativeRelaunch().catch(() => {
    const n = updateState.native;
    n.status = 'error';
    n.error = '重启失败，请手动重启应用完成更新';
  });
}

/** Open the download page/installer of the current `updateState.latest`. */
export function openLatestDownload() {
  return openDownload(updateState.latest);
}

/** Test hook: back to the fresh-boot state. */
export function __resetUpdateStateForTests() {
  updateState.status = 'idle';
  updateState.reason = '';
  updateState.latest = null;
  updateState.currentVersion = getAppVersion();
  const n = updateState.native;
  n.status = 'idle';
  n.checked = false;
  n.installable = false;
  n.rid = 0;
  n.percent = null;
  n.received = 0;
  n.total = 0;
  n.error = '';
}
