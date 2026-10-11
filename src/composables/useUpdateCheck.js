/* work-todo — update-check presentation: dialog for new versions, toasts otherwise */

import { useUiStore } from '../store/ui.js';
import { runUpdateCheck, updateState } from '../store/update.js';
import { openExternal, RELEASES_PAGE_URL } from '../lib/update.js';

/** Failure copies keyed by checkForUpdates' error reason. */
const FAILURE_NOTES = {
  'rate-limited': 'GitHub 请求受限，稍后会自动重试',
  network: '网络异常，请检查网络后重试',
};

export function useUpdateCheck() {
  const ui = useUiStore();

  /** Manual「检查更新」: dialog on a new version, toast feedback otherwise. */
  async function checkNow(anchor = null) {
    const res = await runUpdateCheck({ manual: true });
    if (!res) return res;
    if (res.status === 'available') {
      ui.openUpdateModal(anchor);
    } else if (res.status === 'up-to-date') {
      const staleNote = res.stale ? '（基于上次检查）' : '';
      ui.showToast(`已是最新版本 v${updateState.currentVersion}${staleNote}`);
    } else if (res.status === 'no-release') {
      ui.showToast('GitHub 上暂无发布版本');
    } else {
      const note = FAILURE_NOTES[res.reason] || '检查更新失败，请稍后重试';
      // The releases page works even when the check API is throttled or blocked.
      ui.showToast(note, '发布页', () => openExternal(RELEASES_PAGE_URL));
    }
    return res;
  }

  /** Startup check: silent unless there is a newer version. */
  async function autoCheck() {
    const res = await runUpdateCheck();
    if (res && res.status === 'available') {
      const staleNote = res.stale ? '（基于上次检查）' : '';
      ui.showToast(`发现新版本 v${res.latest.version}${staleNote}`, '查看', () =>
        ui.openUpdateModal(null)
      );
    }
    return res;
  }

  return { checkNow, autoCheck };
}
