/* work-todo — system notification helpers (work-todo.notified.v1 dedupe) */

import { NOTIFY_KEY } from '../constants.js';
import { isOverdue, isCompletedToday, todayString } from '../core/dates.js';
import { computeDueReminders } from '../core/reminders.js';
import { isTauri, tauriInvoke } from '../lib/tauri.js';

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

/** Whether notifications may go out at all — dedupe stamps are only written when
 * this passes, so a denied browser permission never consumes reminders. */
function canNotify() {
  if (isTauri()) return true; // desktop: plugin permission is requested at startup; notify errors are swallowed
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
  return true;
}

/** Fire one system notification: native plugin on desktop, Web Notification API in the browser. */
function sendSystemNotification(title, body) {
  if (isTauri()) {
    tauriInvoke('plugin:notification|notify', { title, body }).catch(() => {});
    return;
  }
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    new Notification(title, { body });
  } catch (_) {
    /* ignore */
  }
}

export function notifyOverdue(tasks) {
  try {
    const overdue = (tasks || []).filter((t) => !t.shelvedAt && isOverdue(t));
    if (!overdue.length) return;
    if (!canNotify()) return;
    const stamp = notifiedStamp();
    const dayKey = 'overdue:' + todayString();
    if (stamp[dayKey]) return;
    const body = overdue
      .slice(0, 3)
      .map((t) => t.title)
      .join('、');
    sendSystemNotification('work-todo · 有逾期任务', overdue.length > 3 ? `${body} 等 ${overdue.length} 项` : body);
    markNotified(dayKey);
  } catch (_) {
    /* ignore */
  }
}

/** Reminder tick: fire today's due reminders once each (dedupe via NOTIFY_KEY). */
export function notifyReminders(tasks, now = new Date()) {
  try {
    if (!canNotify()) return;
    const stamp = notifiedStamp();
    for (const r of computeDueReminders(tasks, now)) {
      if (stamp[r.key]) continue;
      markNotified(r.key);
      sendSystemNotification(r.title, r.body);
    }
  } catch (_) {
    /* ignore */
  }
}

const REMINDER_TICK_MS = 30 * 1000;

/** Minute-granularity reminder loop: tick now, then every 30s and on tab focus
 * (throttled timers after sleep/wake are covered by the same catch-up rules). */
export function startReminderLoop(getTasks) {
  const tick = () => notifyReminders(getTasks());
  tick();
  const timer = setInterval(tick, REMINDER_TICK_MS);
  const onVisible = () => {
    if (document.visibilityState === 'visible') tick();
  };
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

export function requestNotifyPermission() {
  try {
    if (isTauri()) {
      tauriInvoke('plugin:notification|is_permission_granted')
        .then((granted) => (granted === true ? undefined : tauriInvoke('plugin:notification|request_permission')))
        .catch(() => {});
      return;
    }
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  } catch (_) {
    /* ignore */
  }
}

export { isCompletedToday };
