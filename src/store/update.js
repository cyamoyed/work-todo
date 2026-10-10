/* work-todo — update-check state (reactive view for templates) + orchestration */

import { reactive } from 'vue';
import { getAppVersion, checkForUpdates, shouldAutoCheck, openDownload } from '../lib/update.js';

export const updateState = reactive({
  status: 'idle', // idle | checking | available | up-to-date | no-release | error
  reason: '', // error detail: network | rate-limited | http | bad-payload | no-fetch
  latest: null, // { version, notes, url, publishedAt, downloadUrl }
  currentVersion: getAppVersion(),
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
}
