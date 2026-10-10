/* work-todo — browser Notification helpers (work-todo.notified.v1 dedupe) */

import { NOTIFY_KEY } from '../constants.js';
import { isOverdue, isCompletedToday, nowTimeHM, todayString } from '../core/dates.js';

export function notifiedStamp() {
  try {
    return JSON.parse(localStorage.getItem(NOTIFY_KEY) || '{}');
  } catch (_) {
    return {};
  }
}

export function markNotified(key) {
  try {
    const data = notifiedStamp();
    data[key] = Date.now();
    const keys = Object.keys(data);
    if (keys.length > 40) {
      const sorted = keys.sort((a, b) => data[b] - data[a]).slice(0, 40);
      const next = {};
      for (const k of sorted) next[k] = data[k];
      localStorage.setItem(NOTIFY_KEY, JSON.stringify(next));
    } else {
      localStorage.setItem(NOTIFY_KEY, JSON.stringify(data));
    }
  } catch (_) {
    /* ignore */
  }
}

export function notifyOverdue(tasks) {
  try {
    const overdue = tasks.filter((t) => isOverdue(t));
    if (!overdue.length) return;
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;
    const stamp = notifiedStamp();
    const dayKey = 'overdue:' + todayString();
    if (stamp[dayKey]) return;
    const body = overdue
      .slice(0, 3)
      .map((t) => t.title)
      .join('、');
    new Notification('work-todo · 有逾期任务', {
      body: overdue.length > 3 ? `${body} 等 ${overdue.length} 项` : body,
    });
    markNotified(dayKey);
  } catch (_) {
    /* ignore */
  }
}

export function notifyDueSoon(tasks) {
  try {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;
    const today = todayString();
    const now = nowTimeHM();
    const soon = tasks.filter((t) => {
      if (t.status === 'done' || !t.dueDate || t.dueDate !== today || !t.dueTime) return false;
      if (t.dueTime < now) return false;
      // within 60 minutes
      const [th, tm] = t.dueTime.split(':').map(Number);
      const [nh, nm] = now.split(':').map(Number);
      const diff = th * 60 + tm - (nh * 60 + nm);
      return diff > 0 && diff <= 60;
    });
    if (!soon.length) return;
    const stamp = notifiedStamp();
    for (const t of soon) {
      const key = 'due:' + t.id + ':' + today;
      if (stamp[key]) continue;
      new Notification(`work-todo · ${t.dueTime} 到期`, {
        body: t.title,
      });
      markNotified(key);
    }
  } catch (_) {
    /* ignore */
  }
}

export function requestNotifyPermission() {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  } catch (_) {
    /* ignore */
  }
}

export { isCompletedToday };
