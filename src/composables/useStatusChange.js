/* work-todo — shared status-change semantics (row checkbox + status menu).
 * Keeps the done/repeat toast + next-occurrence behavior in one place.
 * Completing a task always goes through a confirm dialog (product rule). */

import { useRouter } from 'vue-router';
import { useTaskStore } from '../store/tasks.js';
import { useUiStore } from '../store/ui.js';
import { STATUS_CYCLE, STATUS_LABELS } from '../constants.js';

export function useStatusChange() {
  const tasks = useTaskStore();
  const ui = useUiStore();
  const router = useRouter();

  /** Next status in the todo → in-progress → done → todo cycle. */
  function nextStatus(current) {
    const i = STATUS_CYCLE.indexOf(current);
    return STATUS_CYCLE[(i + 1) % STATUS_CYCLE.length];
  }

  /** Set a task's status with the done/repeat semantics shared by all entry points. */
  function setStatus(taskId, st) {
    const task = tasks.getTask(taskId);
    if (!task) return;
    tasks.updateTask(taskId, { status: st });
    if (st === 'done' && task.repeat) {
      const next = tasks.cloneNextOccurrence(task);
      if (next) {
        ui.showToast(`已完成 · 已生成下一次「${next.title}」`, '查看', () => {
          router.push('/all');
          ui.setFilters({ status: 'all' });
        });
      } else {
        ui.showToast('已完成');
      }
    } else {
      ui.showToast(st === 'done' ? '已完成' : `状态：${STATUS_LABELS[st]}`);
    }
  }

  /**
   * Entry point for user-driven status changes. Completing a not-yet-done
   * task asks for confirmation first; every other transition applies
   * immediately.
   */
  function requestSetStatus(task, st) {
    if (!task || task.status === st) return;
    if (st === 'done') {
      ui.openConfirmCustom(`将「${task.title}」标记为已完成？`, () => setStatus(task.id, 'done'));
      return;
    }
    setStatus(task.id, st);
  }

  return { nextStatus, setStatus, requestSetStatus };
}
