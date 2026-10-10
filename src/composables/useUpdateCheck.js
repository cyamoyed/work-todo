/* WorkTodo — update-check presentation: dialog for new versions, toasts otherwise */

import { useUiStore } from '../store/ui.js';
import { runUpdateCheck, updateState } from '../store/update.js';

export function useUpdateCheck() {
  const ui = useUiStore();

  /** Manual「检查更新」: dialog on a new version, toast feedback otherwise. */
  async function checkNow(anchor = null) {
    const res = await runUpdateCheck({ manual: true });
    if (!res) return res;
    if (res.status === 'available') {
      ui.openUpdateModal(anchor);
    } else if (res.status === 'up-to-date') {
      ui.showToast(`已是最新版本 v${updateState.currentVersion}`);
    } else if (res.status === 'no-release') {
      ui.showToast('GitHub 上暂无发布版本');
    } else {
      ui.showToast('检查更新失败，请稍后重试');
    }
    return res;
  }

  /** Startup check: silent unless there is a newer version. */
  async function autoCheck() {
    const res = await runUpdateCheck();
    if (res && res.status === 'available') {
      ui.showToast(`发现新版本 v${res.latest.version}`, '查看', () => ui.openUpdateModal(null));
    }
    return res;
  }

  return { checkNow, autoCheck };
}
