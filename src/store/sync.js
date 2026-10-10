/* WorkTodo — reactive view over the sync engine state (for templates) */

import { reactive } from 'vue';
import { getSyncState, onSyncStateChange } from '../lib/sync/engine.js';

export const syncState = reactive(getSyncState());

onSyncStateChange((s) => {
  Object.assign(syncState, s);
});

/** Human-readable status line for the side footer. */
export function syncStatusText(s = syncState) {
  if (!s.configured) return '未配置同步';
  if (s.status === 'syncing') return '同步中…';
  if (s.status === 'offline') return '离线，稍后重试';
  if (s.status === 'error') return '同步失败';
  if (s.lastSyncedAt) {
    const d = new Date(s.lastSyncedAt);
    const pad = (n) => String(n).padStart(2, '0');
    return `已同步 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  return '已就绪';
}
