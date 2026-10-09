/** Unit tests — pure logic: sort, overdue, date formatting, validation. */
const { loadApp } = require('./helpers/harness');
const { ok, eq, section, summary } = require('./helpers/runner');

const { API } = loadApp({ autoInit: true });

section('isValidTask');
const base = { id: 'a', title: 't', status: 'todo', priority: 'medium' };
ok('accepts valid task', API.isValidTask(base));
ok('rejects null', !API.isValidTask(null));
ok('rejects undefined', !API.isValidTask(undefined));
ok('rejects string', !API.isValidTask('task'));
ok('rejects array', !API.isValidTask([base]));
ok('rejects missing id', !API.isValidTask({ ...base, id: 123 }));
ok('rejects missing title', !API.isValidTask({ ...base, title: 1 }));
ok('rejects bad status', !API.isValidTask({ ...base, status: 'nope' }));
ok('rejects bad priority', !API.isValidTask({ ...base, priority: 'urgent' }));
ok('rejects empty status', !API.isValidTask({ ...base, status: '' }));
ok('rejects prototype status constructor', !API.isValidTask({ ...base, status: 'constructor' }));
ok('rejects prototype status toString', !API.isValidTask({ ...base, status: 'toString' }));
ok('accepts all legal statuses', ['todo', 'in-progress', 'done'].every((s) => API.isValidTask({ ...base, status: s })));
ok('accepts all legal priorities', ['high', 'medium', 'low'].every((p) => API.isValidTask({ ...base, priority: p })));

section('todayString / isOverdue / dayDiff');
const today = API.todayString();
ok('todayString format YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(today));
ok('today is not overdue', !API.isOverdue({ dueDate: today, status: 'todo' }));
ok('yesterday is overdue', API.isOverdue({ dueDate: shiftDay(today, -1), status: 'todo' }));
ok('tomorrow not overdue', !API.isOverdue({ dueDate: shiftDay(today, 1), status: 'todo' }));
ok('null dueDate not overdue', !API.isOverdue({ dueDate: null, status: 'todo' }));
ok('done + past due NOT overdue', !API.isOverdue({ dueDate: shiftDay(today, -10), status: 'done' }));
ok('in-progress + past due IS overdue', API.isOverdue({ dueDate: shiftDay(today, -10), status: 'in-progress' }));
eq('dayDiff today is 0', API.dayDiff(today), 0);
eq('dayDiff +1', API.dayDiff(shiftDay(today, 1)), 1);
eq('dayDiff -3', API.dayDiff(shiftDay(today, -3)), -3);

function shiftDay(dateStr, delta) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  return API.toDateStr(d.getFullYear(), d.getMonth(), d.getDate());
}

section('formatDue');
const mk = (dueDate, status = 'todo') => ({ dueDate, status });
eq('no dueDate → null', API.formatDue(mk(null)), null);
eq('today → 今天', API.formatDue(mk(today)), '今天');
eq('tomorrow → 明天', API.formatDue(mk(shiftDay(today, 1))), '明天');
eq('yesterday → 逾期 1 天', API.formatDue(mk(shiftDay(today, -1))), '逾期 1 天');
eq('3 days ago → 逾期 3 天', API.formatDue(mk(shiftDay(today, -3))), '逾期 3 天');
eq('in 3 days → 3 天后', API.formatDue(mk(shiftDay(today, 3))), '3 天后');
eq('in 7 days → 7 天后', API.formatDue(mk(shiftDay(today, 7))), '7 天后');
// beyond 7 days → "M 月 D 日"
const far = shiftDay(today, 30);
const farLabel = API.formatDue(mk(far));
ok('far date is M 月 D 日', /\d+ 月 \d+ 日/.test(farLabel), farLabel);
// done tasks never show overdue wording
const donePast = API.formatDue(mk(shiftDay(today, -5), 'done'));
ok('done past date has no 逾期', !String(donePast).includes('逾期'), donePast);
ok('done past date is calendar form', /\d+ 月 \d+ 日/.test(donePast), donePast);
const doneToday = API.formatDue(mk(today, 'done'));
ok('done today is calendar form not 今天', /\d+ 月 \d+ 日/.test(doneToday) && doneToday !== '今天', doneToday);

section('formatDueLabel / parseDateStr');
eq('empty → 选择日期', API.formatDueLabel(''), '选择日期');
eq('null → 选择日期', API.formatDueLabel(null), '选择日期');
eq('invalid → 选择日期', API.formatDueLabel('2026-13-99'), '选择日期');
eq('valid date', API.formatDueLabel('2026-10-08'), '2026 年 10 月 8 日');
ok('parseDateStr valid', JSON.stringify(API.parseDateStr('2026-01-02')) === JSON.stringify({ y: 2026, m: 0, d: 2 }));
eq('parseDateStr bad', API.parseDateStr('nope'), null);
eq('parseDateStr empty', API.parseDateStr(''), null);

section('sortTasks — full ranking matrix');
const mkT = (over) => ({
  id: Math.random().toString(36).slice(2),
  title: '?',
  status: 'todo',
  priority: 'medium',
  dueDate: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...over,
});

{
  const list = [
    mkT({ id: 'done', title: 'D', status: 'done', dueDate: '2026-01-01' }),
    mkT({ id: 'a', title: 'A', dueDate: '2026-01-01' }),
    mkT({ id: 'b', title: 'B', dueDate: '2026-06-01' }),
    mkT({ id: 'c', title: 'C', dueDate: null }),
  ];
  eq('done always last', API.sortTasks(list).map((t) => t.id), ['a', 'b', 'c', 'done']);
}
{
  const list = [
    mkT({ id: 'no-due', dueDate: null, priority: 'high' }),
    mkT({ id: 'late', dueDate: '2026-12-01' }),
    mkT({ id: 'early', dueDate: '2026-01-01' }),
  ];
  eq('dueDate asc, null last', API.sortTasks(list).map((t) => t.id), ['early', 'late', 'no-due']);
}
{
  const list = [
    mkT({ id: 'low', priority: 'low' }),
    mkT({ id: 'high', priority: 'high' }),
    mkT({ id: 'med', priority: 'medium' }),
  ];
  eq('priority high > medium > low', API.sortTasks(list).map((t) => t.id), ['high', 'med', 'low']);
}
{
  const list = [
    mkT({ id: 'old', createdAt: '2026-01-01T00:00:00Z' }),
    mkT({ id: 'new', createdAt: '2026-06-01T00:00:00Z' }),
    mkT({ id: 'mid', createdAt: '2026-03-01T00:00:00Z' }),
  ];
  eq('createdAt desc when other keys tie', API.sortTasks(list).map((t) => t.id), ['new', 'mid', 'old']);
}
{
  // in-progress vs todo are both "not done" — sorted by dueDate only among active
  const list = [
    mkT({ id: 'done-x', status: 'done', dueDate: '2020-01-01' }),
    mkT({ id: 'prog', status: 'in-progress', dueDate: '2026-02-01' }),
    mkT({ id: 'todo', status: 'todo', dueDate: '2026-01-01' }),
  ];
  eq('active statuses sort by due, done last', API.sortTasks(list).map((t) => t.id), ['todo', 'prog', 'done-x']);
}
{
  const tied = [
    mkT({ id: 'a' }),
    mkT({ id: 'b' }),
    mkT({ id: 'c' }),
  ];
  eq('full ties keep stable order', API.sortTasks(tied).map((t) => t.id), ['a', 'b', 'c']);
}
{
  const missing = [
    { id: 'n2', title: 'B', status: 'todo', priority: 'medium', dueDate: null },
    { id: 'n1', title: 'A', status: 'todo', priority: 'medium', dueDate: null },
  ];
  eq('missing createdAt does not throw + stable', API.sortTasks(missing).map((t) => t.id), ['n2', 'n1']);
}
{
  // unknown priority falls back to medium rank
  const list = [
    mkT({ id: 'weird', priority: 'zzz' }),
    mkT({ id: 'low', priority: 'low' }),
    mkT({ id: 'high', priority: 'high' }),
  ];
  eq('unknown priority ranks as medium', API.sortTasks(list).map((t) => t.id), ['high', 'weird', 'low']);
}
ok('sortTasks does not mutate input', (() => {
  const list = [mkT({ id: 'z', createdAt: '2020-01-01' }), mkT({ id: 'y', createdAt: '2021-01-01' })];
  const copy = list.map((t) => t.id);
  API.sortTasks(list);
  return list.map((t) => t.id).join() === copy.join();
})());

section('visibleTasks — filter + search AND semantics');
{
  const app = loadApp();
  const A = app.API;
  A.createTask({ title: '写周报 Alpha', status: 'todo', priority: 'high', dueDate: '2026-10-01' });
  A.createTask({ title: '整理需求 beta', status: 'in-progress', priority: 'medium', dueDate: '2026-11-01' });
  A.createTask({ title: '发布 gamma', status: 'done', priority: 'low', dueDate: null });
  A.createTask({ title: 'ALPHA 大写', status: 'todo', priority: 'low', dueDate: null });

  A.setFilters({ status: 'all', priority: 'all', search: '' });
  eq('no filters → all 4', A.visibleTasks().length, 4);

  A.setFilters({ status: 'todo', priority: 'all', search: '' });
  eq('status=todo', A.visibleTasks().length, 2);

  A.setFilters({ status: 'all', priority: 'high', search: '' });
  eq('priority=high', A.visibleTasks().length, 1);

  A.setFilters({ status: 'todo', priority: 'high', search: '' });
  eq('status AND priority', A.visibleTasks().map((t) => t.title), ['写周报 Alpha']);

  A.setFilters({ status: 'all', priority: 'all', search: 'alpha' });
  eq('search case-insensitive', A.visibleTasks().length, 2);

  A.setFilters({ status: 'todo', priority: 'all', search: 'alpha' });
  eq('search AND status', A.visibleTasks().map((t) => t.title), ['写周报 Alpha', 'ALPHA 大写']);

  A.setFilters({ status: 'all', priority: 'all', search: 'zzz-no-match' });
  eq('no match → empty', A.visibleTasks().length, 0);

  A.setFilters({ status: 'all', priority: 'all', search: '  alpha  ' });
  eq('search is trimmed', A.visibleTasks().length, 2);

  A.setFilters({ status: 'done', priority: 'low', search: '' });
  eq('done + low', A.visibleTasks().map((t) => t.title), ['发布 gamma']);

  // visibleTasks returns sorted
  A.setFilters({ status: 'all', priority: 'all', search: '' });
  const titles = A.visibleTasks().map((t) => t.title);
  ok('visibleTasks is sorted (active first)', titles[titles.length - 1] === '发布 gamma', titles.join(' | '));
}

section('formatTodayLabel');
const label = API.formatTodayLabel();
ok('contains year/month/day', /年 \d+ 月 \d+ 日/.test(label), label);
ok('contains weekday', /星期[一二三四五六日]/.test(label), label);

process.exit(summary('unit-logic') ? 0 : 1);
