/* work-todo — pure filtering / sorting / grouping (no DOM / no Vue) */

import { PRIORITY_RANK } from '../constants.js';
import {
  addDays,
  dayDiff,
  isCompletedThisWeek,
  isCompletedToday,
  isDueTodayOpen,
  isOverdue,
  isThisWeek,
  isTodayScope,
  shortDay,
  todayString,
  weekRange,
} from './dates.js';

export function sortTasks(list, sortMode) {
  return list.slice().sort((a, b) => {
    const aDone = a.status === 'done' ? 1 : 0;
    const bDone = b.status === 'done' ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;

    if (sortMode === 'priority') {
      const ap = PRIORITY_RANK[a.priority] ?? 1;
      const bp = PRIORITY_RANK[b.priority] ?? 1;
      if (ap !== bp) return ap - bp;
    }

    if (sortMode === 'created') {
      const aCreated = a.createdAt || '';
      const bCreated = b.createdAt || '';
      if (aCreated !== bCreated) return aCreated < bCreated ? 1 : -1;
    }

    const aDue = a.dueDate || '9999-12-31';
    const bDue = b.dueDate || '9999-12-31';
    if (aDue !== bDue) return aDue < bDue ? -1 : 1;

    const aTime = a.dueTime || '99:99';
    const bTime = b.dueTime || '99:99';
    if (aDue !== '9999-12-31' && aTime !== bTime) return aTime < bTime ? -1 : 1;

    const ap = PRIORITY_RANK[a.priority] ?? 1;
    const bp = PRIORITY_RANK[b.priority] ?? 1;
    if (ap !== bp) return ap - bp;

    const aCreated = a.createdAt || '';
    const bCreated = b.createdAt || '';
    if (aCreated === bCreated) return 0;
    return aCreated < bCreated ? 1 : -1;
  });
}

export function matchSearch(t, q) {
  if (!q) return true;
  const title = (t.title || '').toLowerCase();
  const notes = (t.notes || '').toLowerCase();
  const tags = (t.tags || []).join(' ').toLowerCase();
  return title.includes(q) || notes.includes(q) || tags.includes(q);
}

export function matchRange(t, filters) {
  if (filters.range === 'today') {
    return isTodayScope(t);
  }
  // 统计 chip 专属档位:待推进(今天)的两个子集
  if (filters.range === 'due-today') {
    return isDueTodayOpen(t) && !isOverdue(t);
  }
  if (filters.range === 'overdue') {
    return isOverdue(t);
  }
  if (filters.range === 'week') {
    return (t.status !== 'done' && isThisWeek(t.dueDate)) || isOverdue(t);
  }
  return true;
}

export function matchProject(t, filters) {
  if (!filters.projectId) return true;
  return t.projectId === filters.projectId;
}

export function visibleTasks(tasks, filters, sortMode) {
  const q = filters.search.trim().toLowerCase();
  const list = tasks.filter((t) => {
    if (filters.status !== 'all' && t.status !== filters.status) return false;
    if (filters.priority !== 'all' && t.priority !== filters.priority) return false;
    if (!matchProject(t, filters)) return false;
    if (!matchRange(t, filters)) return false;
    if (!matchSearch(t, q)) return false;
    return true;
  });
  return sortTasks(list, sortMode);
}

export function projectStats(tasks, projectId) {
  const list = tasks.filter((t) => t.projectId === projectId);
  const done = list.filter((t) => t.status === 'done').length;
  return { total: list.length, done, open: list.length - done };
}

export function navCounts(tasks) {
  return {
    today: tasks.filter((t) => isDueTodayOpen(t) || isOverdue(t)).length,
    week: tasks.filter((t) => t.status !== 'done' && (isThisWeek(t.dueDate) || isOverdue(t))).length,
    dayline: tasks.filter((t) => t.status !== 'done').length,
    all: tasks.length,
    done: tasks.filter((t) => t.status === 'done').length,
    review: tasks.filter((t) => isCompletedThisWeek(t)).length,
  };
}

export function statusCounts(tasks) {
  return {
    all: tasks.length,
    todo: tasks.filter((t) => t.status === 'todo').length,
    'in-progress': tasks.filter((t) => t.status === 'in-progress').length,
    done: tasks.filter((t) => t.status === 'done').length,
  };
}

export function stripStats(tasks) {
  const todayOpen = tasks.filter((t) => isDueTodayOpen(t) || isOverdue(t)).length;
  const dueToday = tasks.filter((t) => isDueTodayOpen(t) && !isOverdue(t)).length;
  const overdue = tasks.filter((t) => isOverdue(t)).length;
  const inProgress = tasks.filter((t) => t.status === 'in-progress').length;
  const doneToday = tasks.filter((t) => isCompletedToday(t)).length;
  // today-scope: doneToday + (in-progress | overdue | due-today)
  const todayScope = tasks.filter(
    (t) => isCompletedToday(t) || t.status === 'in-progress' || isOverdue(t) || isDueTodayOpen(t)
  ).length;
  return { todayOpen, dueToday, overdue, inProgress, doneToday, todayScope };
}

export function overviewSub(tasks) {
  const overdue = tasks.filter((t) => isOverdue(t)).length;
  const inProgress = tasks.filter((t) => t.status === 'in-progress').length;
  if (!tasks.length) return '先记下要做的事';
  if (overdue) return `${overdue} 项已逾期，优先处理`;
  if (inProgress) return `${inProgress} 项进行中，继续推进`;
  if (tasks.every((t) => t.status === 'done')) return '全部完成，今天可以收工了';
  return '按计划推进即可';
}

export function footerStats(tasks) {
  const open = tasks.filter((t) => t.status !== 'done').length;
  const done = tasks.filter((t) => t.status === 'done').length;
  const overdue = tasks.filter((t) => isOverdue(t)).length;
  return { open, done, overdue, text: `${open} 未完成 · ${done} 已完成 · 逾期 ${overdue}` };
}

export function listTitleFor(viewMode, filters, projects) {
  if (filters.projectId) {
    const p = projects.find((x) => x.id === filters.projectId);
    if (p) return p.name;
  }
  if (viewMode === 'done') return '已完成';
  if (viewMode === 'review') return '本周回顾';
  if (viewMode === 'dayline') return '日程';
  return '任务台账';
}

/** Dayline grouping, ported from renderDaylineInto. Input: any task list (already filtered). */
export function groupDayline(list) {
  const groups = [
    { key: 'late', title: '逾期', cls: 'late', items: [] },
    { key: 'today', title: `今天 · ${shortDay(0)}`, cls: 'today', items: [] },
    { key: 'tomorrow', title: `明天 · ${shortDay(1)}`, cls: '', items: [] },
    { key: 'week', title: '本周剩余', cls: '', items: [] },
    { key: 'nextweek', title: '下周', cls: '', items: [] },
    { key: 'later', title: '更晚', cls: '', items: [] },
    { key: 'none', title: '无截止', cls: '', items: [] },
  ];
  const week = weekRange();
  const nextWeekStart = addDays(week.end, 1);
  const nextWeekEnd = addDays(week.end, 7);
  for (const t of list) {
    if (isOverdue(t)) groups[0].items.push(t);
    else if (!t.dueDate) groups[6].items.push(t);
    else if (t.dueDate === todayString()) groups[1].items.push(t);
    else if (dayDiff(t.dueDate) === 1) groups[2].items.push(t);
    else if (t.dueDate <= week.end) groups[3].items.push(t);
    else if (t.dueDate >= nextWeekStart && t.dueDate <= nextWeekEnd) groups[4].items.push(t);
    else groups[5].items.push(t);
  }
  return groups;
}

/** Review view data, ported from renderReviewInto. */
export function reviewBlocks(tasks) {
  const week = weekRange();
  const done = tasks
    .filter((t) => isCompletedThisWeek(t))
    .sort((a, b) =>
      String(b.completedAt || b.updatedAt || '').localeCompare(String(a.completedAt || a.updatedAt || ''))
    );
  return { week, done };
}
