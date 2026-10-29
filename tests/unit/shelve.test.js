/* Unit — 搁置（shelve）语义：核心字段/补丁、视图分流、统计口径、提醒排除。
 *
 * 搁置 = 暂缓推进：shelvedAt 非空的任务从今天/本周/日程/全部/已完成等推进视图、
 * 侧栏计数与统计、到期提醒中隐藏，只在「搁置」视图（filters.shelved='only'）可见。
 * 完成任务自动脱离搁置（applyTaskPatch 规则）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  normalizeTask,
  createTaskData,
  applyTaskPatch,
  buildNextOccurrence,
  isShelved,
  applyShelvedPatch,
} from '../../src/core/tasks.js';
import {
  visibleTasks,
  matchShelved,
  navCounts,
  statusCounts,
  stripStats,
  footerStats,
  projectStats,
  listTitleFor,
} from '../../src/core/filters.js';
import { computeDueReminders } from '../../src/core/reminders.js';
import { useTaskStore } from '../../src/store/tasks.js';
import { useUiStore } from '../../src/store/ui.js';

const NOW = '2026-10-29T06:00:00.000Z';

const mkT = (over) => ({
  id: 't1',
  title: '任务',
  status: 'todo',
  priority: 'medium',
  dueDate: null,
  dueTime: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...over,
});

const filtersOf = (shelved = 'active') => ({
  status: 'all',
  priority: 'all',
  range: 'all',
  search: '',
  projectId: null,
  shelved,
});

describe('core/tasks — shelvedAt 字段', () => {
  it('normalizeTask 读旧数据自动补 null', () => {
    expect(normalizeTask(mkT()).shelvedAt).toBe(null);
  });

  it('normalizeTask 保留合法搁置时间戳、清洗非法值', () => {
    expect(normalizeTask(mkT({ shelvedAt: NOW })).shelvedAt).toBe(NOW);
    expect(normalizeTask(mkT({ shelvedAt: 5 })).shelvedAt).toBe(null);
    expect(normalizeTask(mkT({ shelvedAt: '' })).shelvedAt).toBe(null);
  });

  it('createTaskData 新任务默认未搁置', () => {
    expect(createTaskData({ title: ' 新任务 ' }, { now: NOW }).shelvedAt).toBe(null);
  });

  it('isShelved 只认非空字符串', () => {
    expect(isShelved({ shelvedAt: NOW })).toBe(true);
    expect(isShelved({ shelvedAt: null })).toBe(false);
    expect(isShelved({})).toBe(false);
    expect(isShelved(null)).toBe(false);
    expect(isShelved({ shelvedAt: true })).toBe(false);
  });

  it('applyShelvedPatch：字符串原样、真值记此刻、假值清除', () => {
    expect(applyShelvedPatch(NOW, 'x')).toBe(NOW);
    expect(applyShelvedPatch(true, NOW)).toBe(NOW);
    expect(applyShelvedPatch(false, NOW)).toBe(null);
    expect(applyShelvedPatch(null, NOW)).toBe(null);
  });

  it('applyTaskPatch 搁置 / 恢复都更新 updatedAt', () => {
    const prev = mkT();
    const shelved = applyTaskPatch(prev, { shelvedAt: true }, { now: NOW });
    expect(shelved.shelvedAt).toBe(NOW);
    expect(shelved.updatedAt).toBe(NOW);
    const resumed = applyTaskPatch(shelved, { shelvedAt: false }, { now: '2026-10-29T07:00:00.000Z' });
    expect(resumed.shelvedAt).toBe(null);
  });

  it('完成任务自动脱离搁置（未显式传 shelvedAt 时）', () => {
    const shelved = mkT({ shelvedAt: NOW });
    const done = applyTaskPatch(shelved, { status: 'done' }, { now: '2026-10-29T08:00:00.000Z' });
    expect(done.shelvedAt).toBe(null);
  });

  it('显式携带 shelvedAt 时以其为准（批量补丁不误伤）', () => {
    const done = applyTaskPatch(mkT(), { status: 'done', shelvedAt: NOW }, { now: '2026-10-29T08:00:00.000Z' });
    expect(done.shelvedAt).toBe(NOW);
  });

  it('buildNextOccurrence 不继承搁置状态', () => {
    const next = buildNextOccurrence(mkT({ repeat: 'daily', dueDate: '2026-10-29', shelvedAt: NOW }), { now: NOW });
    expect(next.shelvedAt).toBe(null);
  });
});

describe('core/filters — 搁置分流与统计口径', () => {
  const plain = mkT({ id: 'a', title: '正常' });
  const shelved = mkT({ id: 'b', title: '搁置中', shelvedAt: NOW, dueDate: '2000-01-01' });
  const list = [plain, shelved];

  it('matchShelved：active 挡掉搁置，only 只留搁置', () => {
    expect(matchShelved(plain, filtersOf('active'))).toBe(true);
    expect(matchShelved(shelved, filtersOf('active'))).toBe(false);
    expect(matchShelved(plain, filtersOf('only'))).toBe(false);
    expect(matchShelved(shelved, filtersOf('only'))).toBe(true);
  });

  it('visibleTasks 默认隐藏搁置任务，only 模式只看搁置任务', () => {
    expect(visibleTasks(list, filtersOf('active'), 'due').map((t) => t.id)).toEqual(['a']);
    expect(visibleTasks(list, filtersOf('only'), 'due').map((t) => t.id)).toEqual(['b']);
  });

  it('only 模式下逾期 chip 也只统计搁置里的逾期任务', () => {
    const filters = { ...filtersOf('only'), range: 'overdue' };
    expect(visibleTasks(list, filters, 'due').map((t) => t.id)).toEqual(['b']);
  });

  it('navCounts：搁置单列计数，其余视图计数不含搁置', () => {
    const counts = navCounts(list);
    expect(counts.shelved).toBe(1);
    expect(counts.all).toBe(1);
    expect(counts.today).toBe(0); // 逾期任务已搁置，不算今天待推进
  });

  it('statusCounts 不含搁置任务', () => {
    expect(statusCounts(list)).toEqual({ all: 1, todo: 1, 'in-progress': 0, done: 0 });
  });

  it('stripStats 逾期不计已搁置任务', () => {
    expect(stripStats(list).overdue).toBe(0);
  });

  it('footerStats 不含搁置任务', () => {
    expect(footerStats(list).text).toBe('1 未完成 · 0 已完成 · 逾期 0');
  });

  it('projectStats 进度不含搁置任务', () => {
    const inProject = [
      mkT({ id: 'p1', projectId: 'proj', status: 'done' }),
      mkT({ id: 'p2', projectId: 'proj' }),
      mkT({ id: 'p3', projectId: 'proj', shelvedAt: NOW }),
    ];
    expect(projectStats(inProject, 'proj')).toEqual({ total: 2, done: 1, open: 1 });
  });

  it('listTitleFor 搁置视图标题为「搁置」', () => {
    expect(listTitleFor('shelved', filtersOf('only'), [])).toBe('搁置');
  });
});

describe('store/ui — applyView 对搁置分流的设置', () => {
  const ui = useUiStore();

  it("applyView('shelved') → only；其余视图回 active", () => {
    ui.applyView('shelved');
    expect(ui.state.viewMode).toBe('shelved');
    expect(ui.state.filters.shelved).toBe('only');
    expect(ui.state.filters.range).toBe('all');
    ui.applyView('today');
    expect(ui.state.filters.shelved).toBe('active');
    ui.applyView('done');
    expect(ui.state.filters.shelved).toBe('active');
  });
});

describe('store/tasks — 搁置 API 与持久化', () => {
  const store = useTaskStore();
  const ui = useUiStore();

  beforeEach(() => {
    localStorage.clear();
    store.load();
    ui.setFilters(filtersOf('active'));
  });

  it('shelveTask 标记并持久化，shelveTask(id,false) 恢复', () => {
    const t = store.createTask({ title: '写周报' }, { id: 's1', now: NOW });
    store.shelveTask(t.id, true, { now: NOW });
    expect(store.getTask(t.id).shelvedAt).toBe(NOW);
    const saved = JSON.parse(localStorage.getItem('work-todo.tasks.v1'));
    expect(saved.find((x) => x.id === t.id).shelvedAt).toBe(NOW);

    store.shelveTask(t.id, false, { now: NOW });
    expect(store.getTask(t.id).shelvedAt).toBe(null);
  });

  it('shelveTasks 批量搁置，列表视图随即隐藏', () => {
    const a = store.createTask({ title: 'A' }, { id: 's2', now: NOW });
    const b = store.createTask({ title: 'B' }, { id: 's3', now: NOW });
    store.createTask({ title: 'C' }, { id: 's4', now: NOW });
    const { updated } = store.shelveTasks([a.id, b.id], true, { now: NOW });
    expect(updated).toBe(2);
    const visible = visibleTasks(store.state.tasks, filtersOf('active'), 'due');
    expect(visible.map((t) => t.title)).toEqual(['C']);
    expect(navCounts(store.state.tasks).shelved).toBe(2);
  });

  it('搁置任务被导出，导入后仍处于搁置', () => {
    const t = store.createTask({ title: '随同步走' }, { id: 's5', now: NOW });
    store.shelveTask(t.id, true, { now: NOW });
    const payload = store.exportPayload({ now: NOW });
    store.setTasks([]);
    store.importPayload(payload, 'replace');
    expect(store.getTask('s5').shelvedAt).toBe(NOW);
  });
});

describe('core/reminders — 搁置任务不再提醒', () => {
  // 固定到一个今天日期：用真实 now 的日期拼 dueDate，保证与 computeDueReminders 的“今天”一致
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const soonHM = `${pad(now.getHours())}:${pad(Math.max(0, now.getMinutes() - 5))}`;

  it('到期时间提醒跳过搁置任务', () => {
    const tasks = [
      mkT({ id: 'r1', title: '开会', dueDate: today, dueTime: soonHM }),
      mkT({ id: 'r2', title: '搁置的会', dueDate: today, dueTime: soonHM, shelvedAt: NOW }),
    ];
    const keys = computeDueReminders(tasks, now).map((r) => r.key);
    expect(keys.some((k) => k.includes('r1'))).toBe(true);
    expect(keys.some((k) => k.includes('r2'))).toBe(false);
  });

  it('当天日期型任务的 17:00 摘要也不含搁置任务', () => {
    const evening = new Date(now.getTime());
    evening.setHours(17, 0, 0, 0);
    const tasks = [mkT({ id: 'r3', title: '被搁置的日期任务', dueDate: today, shelvedAt: NOW })];
    expect(computeDueReminders(tasks, evening)).toEqual([]);
  });
});
