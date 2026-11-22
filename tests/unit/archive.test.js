/* Unit — 归档（archive）语义：核心字段/补丁、视图分流、统计口径、提醒排除。
 *
 * 归档 = 收尾归档：archivedAt 非空的任务从今天/本周/日程/全部/逾期/已完成等推进
 * 视图、侧栏计数与统计、到期提醒中隐藏，只在「归档」视图（filters.archived='only'）
 * 可见。归档与搁置互斥（归档即脱离搁置）；旧数据/旧载荷读入自动补 null。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  normalizeTask,
  createTaskData,
  applyTaskPatch,
  buildNextOccurrence,
  isArchived,
  isShelved,
  applyArchivedPatch,
} from '../../src/core/tasks.js';
import {
  visibleTasks,
  matchArchived,
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

const filtersOf = (archived = 'active') => ({
  status: 'all',
  priority: 'all',
  range: 'all',
  search: '',
  projectId: null,
  shelved: 'active',
  archived,
});

describe('core/tasks — archivedAt 字段', () => {
  it('normalizeTask 读旧数据自动补 null', () => {
    expect(normalizeTask(mkT()).archivedAt).toBe(null);
  });

  it('normalizeTask 保留合法归档时间戳、清洗非法值', () => {
    expect(normalizeTask(mkT({ archivedAt: NOW })).archivedAt).toBe(NOW);
    expect(normalizeTask(mkT({ archivedAt: 5 })).archivedAt).toBe(null);
    expect(normalizeTask(mkT({ archivedAt: '' })).archivedAt).toBe(null);
  });

  it('createTaskData 新任务默认未归档', () => {
    expect(createTaskData({ title: ' 新任务 ' }, { now: NOW }).archivedAt).toBe(null);
  });

  it('isArchived 只认非空字符串', () => {
    expect(isArchived({ archivedAt: NOW })).toBe(true);
    expect(isArchived({ archivedAt: null })).toBe(false);
    expect(isArchived({})).toBe(false);
    expect(isArchived(null)).toBe(false);
    expect(isArchived({ archivedAt: true })).toBe(false);
  });

  it('applyArchivedPatch：字符串原样、真值记此刻、假值清除', () => {
    expect(applyArchivedPatch(NOW, 'x')).toBe(NOW);
    expect(applyArchivedPatch(true, NOW)).toBe(NOW);
    expect(applyArchivedPatch(false, NOW)).toBe(null);
    expect(applyArchivedPatch(null, NOW)).toBe(null);
  });

  it('applyTaskPatch 归档 / 恢复都更新 updatedAt', () => {
    const prev = mkT();
    const archived = applyTaskPatch(prev, { archivedAt: true }, { now: NOW });
    expect(archived.archivedAt).toBe(NOW);
    expect(archived.updatedAt).toBe(NOW);
    const restored = applyTaskPatch(archived, { archivedAt: false }, { now: '2026-10-29T07:00:00.000Z' });
    expect(restored.archivedAt).toBe(null);
  });

  it('归档即脱离搁置（归档与搁置互斥）', () => {
    const shelved = mkT({ shelvedAt: NOW });
    const archived = applyTaskPatch(shelved, { archivedAt: true }, { now: NOW });
    expect(archived.archivedAt).toBe(NOW);
    expect(archived.shelvedAt).toBe(null);
    expect(isShelved(archived)).toBe(false);
  });

  it('完成任务保持归档（归档不受完成影响）', () => {
    const archived = mkT({ archivedAt: NOW });
    const done = applyTaskPatch(archived, { status: 'done' }, { now: '2026-10-29T08:00:00.000Z' });
    expect(done.archivedAt).toBe(NOW);
    expect(done.status).toBe('done');
  });

  it('buildNextOccurrence 不继承归档状态', () => {
    const next = buildNextOccurrence(
      mkT({ repeat: 'daily', dueDate: '2026-10-29', archivedAt: NOW }),
      { now: NOW }
    );
    expect(next.archivedAt).toBe(null);
  });
});

describe('core/filters — 归档分流与统计口径', () => {
  const plain = mkT({ id: 'a', title: '正常' });
  const archived = mkT({ id: 'b', title: '已归档', archivedAt: NOW, dueDate: '2000-01-01' });
  const list = [plain, archived];

  it('matchArchived：active 挡掉归档，only 只留归档', () => {
    expect(matchArchived(plain, filtersOf('active'))).toBe(true);
    expect(matchArchived(archived, filtersOf('active'))).toBe(false);
    expect(matchArchived(plain, filtersOf('only'))).toBe(false);
    expect(matchArchived(archived, filtersOf('only'))).toBe(true);
  });

  it('visibleTasks 默认隐藏归档任务，only 模式只看归档任务', () => {
    expect(visibleTasks(list, filtersOf('active'), 'due').map((t) => t.id)).toEqual(['a']);
    expect(visibleTasks(list, filtersOf('only'), 'due').map((t) => t.id)).toEqual(['b']);
  });

  it('归档任务不再计入逾期范围与逾期视图', () => {
    const overdueList = [
      mkT({ id: 'a', title: '正常', dueDate: '2000-01-01' }),
      mkT({ id: 'b', title: '已归档', archivedAt: NOW, dueDate: '2000-01-01' }),
    ];
    const filters = { ...filtersOf('active'), range: 'overdue' };
    expect(visibleTasks(overdueList, filters, 'due').map((t) => t.id)).toEqual(['a']);
  });

  it('navCounts：归档单列计数，其余视图计数不含归档', () => {
    const counts = navCounts(list);
    expect(counts.archive).toBe(1);
    expect(counts.all).toBe(1);
    expect(counts.today).toBe(0); // 已逾期的任务被归档，不算今天待推进
    expect(counts.overdue).toBe(0);
  });

  it('statusCounts 不含归档任务', () => {
    expect(statusCounts(list)).toEqual({ all: 1, todo: 1, 'in-progress': 0, done: 0 });
  });

  it('stripStats 逾期不计已归档任务', () => {
    expect(stripStats(list).overdue).toBe(0);
  });

  it('footerStats 不含归档任务', () => {
    expect(footerStats(list).text).toBe('1 未完成 · 0 已完成 · 逾期 0');
  });

  it('projectStats 进度不含归档任务', () => {
    const inProject = [
      mkT({ id: 'p1', projectId: 'proj', status: 'done' }),
      mkT({ id: 'p2', projectId: 'proj' }),
      mkT({ id: 'p3', projectId: 'proj', archivedAt: NOW }),
    ];
    expect(projectStats(inProject, 'proj')).toEqual({ total: 2, done: 1, open: 1 });
  });

  it('listTitleFor 视图标题：归档为「归档」、逾期为「逾期」', () => {
    expect(listTitleFor('archive', filtersOf('only'), [])).toBe('归档');
    expect(listTitleFor('overdue', filtersOf(), [])).toBe('逾期');
  });
});

describe('navCounts — 逾期视图计数', () => {
  it('逾期未完成任务单列计数，已完成不逾期', () => {
    const list = [
      mkT({ id: 'o1', dueDate: '2000-01-01' }),
      mkT({ id: 'o2', dueDate: '2000-01-02' }),
      mkT({ id: 'd1', dueDate: '2000-01-01', status: 'done' }),
    ];
    const counts = navCounts(list);
    expect(counts.overdue).toBe(2);
    expect(counts.today).toBe(2); // 逾期计入今天待推进（原有口径不变）
    expect(counts.archive).toBe(0);
  });
});

describe('store/ui — applyView 对逾期/归档视图的设置', () => {
  const ui = useUiStore();

  it("applyView('overdue') → range='overdue'，status done 复位", () => {
    ui.applyView('done');
    expect(ui.state.filters.status).toBe('done');
    ui.applyView('overdue');
    expect(ui.state.viewMode).toBe('overdue');
    expect(ui.state.filters.range).toBe('overdue');
    expect(ui.state.filters.status).toBe('all');
    expect(ui.state.filters.shelved).toBe('active');
    expect(ui.state.filters.archived).toBe('active');
  });

  it("applyView('archive') → only；其余视图回 active", () => {
    ui.applyView('archive');
    expect(ui.state.viewMode).toBe('archive');
    expect(ui.state.filters.archived).toBe('only');
    expect(ui.state.filters.shelved).toBe('active');
    expect(ui.state.filters.range).toBe('all');
    ui.applyView('today');
    expect(ui.state.filters.archived).toBe('active');
    ui.applyView('done');
    expect(ui.state.filters.archived).toBe('active');
  });
});

describe('store/tasks — 归档 API 与持久化', () => {
  const store = useTaskStore();
  const ui = useUiStore();

  beforeEach(() => {
    localStorage.clear();
    store.load();
    ui.setFilters(filtersOf('active'));
  });

  it('archiveTask 标记并持久化，archiveTask(id,false) 恢复', () => {
    const t = store.createTask({ title: '写周报' }, { id: 'a1', now: NOW });
    store.archiveTask(t.id, true, { now: NOW });
    expect(store.getTask(t.id).archivedAt).toBe(NOW);
    const saved = JSON.parse(localStorage.getItem('work-todo.tasks.v1'));
    expect(saved.find((x) => x.id === t.id).archivedAt).toBe(NOW);

    store.archiveTask(t.id, false, { now: NOW });
    expect(store.getTask(t.id).archivedAt).toBe(null);
  });

  it('归档搁置中的任务会脱离搁置', () => {
    const t = store.createTask({ title: '先搁置后归档' }, { id: 'a2', now: NOW });
    store.shelveTask(t.id, true, { now: NOW });
    store.archiveTask(t.id, true, { now: '2026-10-29T07:00:00.000Z' });
    expect(store.getTask(t.id).archivedAt).toBe('2026-10-29T07:00:00.000Z');
    expect(store.getTask(t.id).shelvedAt).toBe(null);
    expect(navCounts(store.state.tasks).shelved).toBe(0);
    expect(navCounts(store.state.tasks).archive).toBe(1);
  });

  it('archiveTasks 批量归档（含已完成），列表视图随即隐藏', () => {
    const a = store.createTask({ title: 'A' }, { id: 'a3', now: NOW });
    const b = store.createTask({ title: 'B', status: 'done' }, { id: 'a4', now: NOW });
    store.createTask({ title: 'C' }, { id: 'a5', now: NOW });
    const { updated } = store.archiveTasks([a.id, b.id], true, { now: NOW });
    expect(updated).toBe(2);
    const visible = visibleTasks(store.state.tasks, filtersOf('active'), 'due');
    expect(visible.map((t) => t.title)).toEqual(['C']);
    expect(navCounts(store.state.tasks).archive).toBe(2);
    expect(navCounts(store.state.tasks).done).toBe(0); // 已完成归档后不再计入已完成视图
  });

  it('归档任务被导出，导入后仍处于归档', () => {
    const t = store.createTask({ title: '随同步走' }, { id: 'a6', now: NOW });
    store.archiveTask(t.id, true, { now: NOW });
    const payload = store.exportPayload({ now: NOW });
    store.setTasks([]);
    store.importPayload(payload, 'replace');
    expect(store.getTask('a6').archivedAt).toBe(NOW);
  });

  it('旧载荷（无 archivedAt 字段）导入后自动补 null', () => {
    const legacy = {
      schemaVersion: 4,
      tasks: [mkT({ id: 'legacy-1', title: '旧数据' })],
      projects: [],
    };
    store.importPayload(legacy, 'replace');
    expect(store.getTask('legacy-1').archivedAt).toBe(null);
    expect(visibleTasks(store.state.tasks, filtersOf('active'), 'due').length).toBe(1);
  });
});

describe('core/reminders — 归档任务不再提醒', () => {
  // 固定到一个今天日期：用真实 now 的日期拼 dueDate，保证与 computeDueReminders 的“今天”一致
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const soonHM = `${pad(now.getHours())}:${pad(Math.max(0, now.getMinutes() - 5))}`;

  it('到期时间提醒跳过归档任务', () => {
    const tasks = [
      mkT({ id: 'r1', title: '开会', dueDate: today, dueTime: soonHM }),
      mkT({ id: 'r2', title: '已归档的会', dueDate: today, dueTime: soonHM, archivedAt: NOW }),
    ];
    const keys = computeDueReminders(tasks, now).map((r) => r.key);
    expect(keys.some((k) => k.includes('r1'))).toBe(true);
    expect(keys.some((k) => k.includes('r2'))).toBe(false);
  });

  it('当天日期型任务的 17:00 摘要也不含归档任务', () => {
    const evening = new Date(now.getTime());
    evening.setHours(17, 0, 0, 0);
    const tasks = [mkT({ id: 'r3', title: '被归档的日期任务', dueDate: today, archivedAt: NOW })];
    expect(computeDueReminders(tasks, evening)).toEqual([]);
  });
});
