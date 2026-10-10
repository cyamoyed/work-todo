/* work-todo — pure date helpers + recurrence math (no DOM / no Vue) */

import { REPEAT_LABELS } from '../constants.js';

export function pad2(n) {
  return String(n).padStart(2, '0');
}

export function toDateStr(y, m, d) {
  return `${y}-${pad2(m + 1)}-${pad2(d)}`;
}

export function parseDateStr(s) {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  if (m < 1 || m > 12) return null;
  const daysInMonth = new Date(y, m, 0).getDate();
  if (d < 1 || d > daysInMonth) return null;
  return { y, m: m - 1, d };
}

export function todayString() {
  const d = new Date();
  return toDateStr(d.getFullYear(), d.getMonth(), d.getDate());
}

export function nowTimeHM() {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function dateStr(d) {
  return toDateStr(d.getFullYear(), d.getMonth(), d.getDate());
}

export function isToday(dueDate) {
  return dueDate === todayString();
}

export function weekRange() {
  const now = new Date();
  const day = (now.getDay() + 6) % 7;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  return { start: dateStr(monday), end: dateStr(sunday) };
}

export function isThisWeek(dueDate) {
  if (!dueDate) return false;
  const r = weekRange();
  return dueDate >= r.start && dueDate <= r.end;
}

export function isDueTodayOpen(t) {
  return t.dueDate === todayString() && t.status !== 'done';
}

export function isOverdue(task) {
  if (!task.dueDate || task.status === 'done') return false;
  const today = todayString();
  if (task.dueDate < today) return true;
  if (task.dueDate === today && task.dueTime) {
    return task.dueTime < nowTimeHM();
  }
  return false;
}

export function isCompletedToday(task) {
  if (task.status !== 'done') return false;
  const stamp = (task.completedAt || task.updatedAt || '').slice(0, 10);
  return stamp === todayString();
}

export function isCompletedThisWeek(task) {
  if (task.status !== 'done') return false;
  const stamp = (task.completedAt || task.updatedAt || '').slice(0, 10);
  return stamp ? isThisWeek(stamp) : false;
}

export function isTodayScope(t) {
  return isDueTodayOpen(t) || isOverdue(t) || isCompletedToday(t);
}

export function dayDiff(dateStrVal) {
  const a = new Date(dateStrVal + 'T00:00:00');
  const b = new Date(todayString() + 'T00:00:00');
  return Math.round((a - b) / 86400000);
}

export function formatDue(task) {
  if (!task.dueDate) return null;
  const time = task.dueTime ? ' ' + task.dueTime : '';
  const diff = dayDiff(task.dueDate);
  const done = task.status === 'done';

  if (done) {
    const d = new Date(task.dueDate + 'T00:00:00');
    return `${d.getMonth() + 1} 月 ${d.getDate()} 日${time}`;
  }

  if (diff < 0) return `逾期 ${Math.abs(diff)} 天${time}`;
  if (diff === 0) return `今天${time}`;
  if (diff === 1) return `明天${time}`;
  if (diff <= 7) return `${diff} 天后${time}`;
  const d = new Date(task.dueDate + 'T00:00:00');
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日${time}`;
}

export function formatDueLabel(value) {
  const parsed = parseDateStr(value);
  if (!parsed) return '选择日期';
  return `${parsed.y} 年 ${parsed.m + 1} 月 ${parsed.d} 日`;
}

export function formatTodayLabel() {
  const d = new Date();
  const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 · 星期${week}`;
}

export function shortDay(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const wk = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
  return `${d.getMonth() + 1}月${d.getDate()}日 ${wk}`;
}

export function addDays(dateStrVal, days) {
  const d = parseDateStr(dateStrVal) || { y: new Date().getFullYear(), m: new Date().getMonth(), d: new Date().getDate() };
  const base = new Date(d.y, d.m, d.d);
  base.setDate(base.getDate() + days);
  return toDateStr(base.getFullYear(), base.getMonth(), base.getDate());
}

export function nextDueDate(task) {
  if (!task.dueDate) return todayString();
  const repeat = task.repeat || 'weekly';
  if (repeat === 'daily') return addDays(task.dueDate, 1);
  if (repeat === 'weekday') {
    let next = addDays(task.dueDate, 1);
    for (let i = 0; i < 7; i++) {
      const parsed = parseDateStr(next);
      const dow = new Date(parsed.y, parsed.m, parsed.d).getDay();
      if (dow !== 0 && dow !== 6) return next;
      next = addDays(next, 1);
    }
    return next;
  }
  if (repeat === 'monthly') {
    const parsed = parseDateStr(task.dueDate);
    if (!parsed) return addDays(task.dueDate, 28);
    const y = parsed.m === 11 ? parsed.y + 1 : parsed.y;
    const m = parsed.m === 11 ? 0 : parsed.m + 1;
    const last = new Date(y, m + 1, 0).getDate();
    return toDateStr(y, m, Math.min(parsed.d, last));
  }
  return addDays(task.dueDate, 7);
}

export { REPEAT_LABELS };
