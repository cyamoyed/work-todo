/**
 * v0.3 tests — semantics, view sync, completedAt, repeat, tags, dayline groups.
 */
const fs = require('fs');
const path = require('path');
const { loadApp } = require('./helpers/harness');

let pass = 0;
let fail = 0;
const failures = [];

function section(name) {
  console.log('');
  console.log('· ' + name);
}

function ok(label, cond) {
  if (cond) {
    pass++;
    console.log('  PASS  ' + label);
  } else {
    fail++;
    failures.push(label);
    console.log('  FAIL  ' + label);
  }
}

function eq(label, actual, expected) {
  const good = actual === expected;
  if (good) {
    pass++;
    console.log('  PASS  ' + label);
  } else {
    fail++;
    failures.push(`${label} (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`);
    console.log(`  FAIL  ${label} — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
  }
}

const a = loadApp();
const API = a.API;

function resetTasks() {
  const cur = API.loadTasks();
  for (const t of cur) API.removeTask(t.id);
}

function todayStr() {
  return API.isToday && false; // placeholder
}

function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

section('footer / strip copy semantics');
{
  resetTasks();
  API.createTask({ title: '待办一项', status: 'todo' });
  API.createTask({ title: '进行一项', status: 'in-progress' });
  API.createTask({ title: '做完一项', status: 'done' });
  API.render();
  const footer = a.ids['task-stats'] ? a.ids['task-stats'].textContent : '';
  ok('footer uses 未完成 not 进行中 for open count', footer.includes('未完成'));
  ok('footer counts open as 2 未完成', footer.includes('2 未完成'));
  ok('footer counts done', footer.includes('1 已完成'));
}

section('completedAt field');
{
  resetTasks();
  const t = API.createTask({ title: '完成时间', status: 'todo' });
  eq('todo has null completedAt', t.completedAt, null);
  const done = API.updateTask(t.id, { status: 'done' });
  ok('done sets completedAt', typeof done.completedAt === 'string' && done.completedAt.length > 0);
  const stamp = done.completedAt;
  const again = API.updateTask(t.id, { title: '改个名字' });
  eq('edit keeps completedAt', again.completedAt, stamp);
  const back = API.updateTask(t.id, { status: 'todo' });
  eq('reopen clears completedAt', back.completedAt, null);
}

section('isCompletedToday uses completedAt not updatedAt');
{
  resetTasks();
  const t = API.createTask({ title: '今天完成', status: 'done' });
  const raw = API.loadTasks().map((x) =>
    x.id === t.id ? { ...x, updatedAt: '2020-01-01T00:00:00.000Z', completedAt: new Date().toISOString() } : x
  );
  a.localStorage.setItem('worktodo.tasks.v1', JSON.stringify(raw));
  const fresh = API.loadTasks().find((x) => x.id === t.id);
  ok('completed today despite old updatedAt', API.isCompletedToday(fresh) === true);

  const t2 = API.createTask({ title: '旧完成', status: 'done' });
  const raw2 = API.loadTasks().map((x) =>
    x.id === t2.id ? { ...x, updatedAt: '2020-01-01T00:00:00.000Z', completedAt: '2020-01-01T00:00:00.000Z' } : x
  );
  a.localStorage.setItem('worktodo.tasks.v1', JSON.stringify(raw2));
  const fresh2 = API.loadTasks().find((x) => x.id === t2.id);
  ok('old completedAt not today', API.isCompletedToday(fresh2) === false);
}

section('tags normalize + search');
{
  resetTasks();
  const t = API.createTask({
    title: '带标签',
    tags: ['发布', '发布', 'P0', '', 'x'.repeat(20), 'a', 'b', 'c', 'd', 'e', 'f'],
  });
  eq('tags deduped + capped', t.tags.length, 5);
  ok('tag length capped', t.tags.every((x) => x.length <= 12));
  const updated = API.updateTask(t.id, { tags: ['周会'] });
  eq('tags updatable', updated.tags.join(','), '周会');

  API.createTask({ title: '另一个', tags: ['发布'] });
  API.setFilters({ search: '发布', range: 'all', status: 'all', priority: 'all' });
  const hits = API.visibleTasks().map((x) => x.title);
  ok('search hits tags', hits.includes('另一个') || hits.includes('带标签'));
  API.setFilters({ search: '' });
}

section('repeat + cloneNextOccurrence');
{
  resetTasks();
  const base = API.createTask({
    title: '周会',
    status: 'todo',
    dueDate: '2026-10-12',
    dueTime: '10:00',
    repeat: 'weekly',
    notes: '例会',
  });
  eq('repeat stored', base.repeat, 'weekly');
  const next = API.cloneNextOccurrence(base);
  ok('clone created', !!next && next.id !== base.id);
  eq('weekly +7 days', next.dueDate, '2026-10-19');
  eq('clone status todo', next.status, 'todo');
  eq('clone keeps repeat', next.repeat, 'weekly');
  eq('clone keeps time', next.dueTime, '10:00');

  const daily = API.createTask({ title: '日站', dueDate: '2026-10-12', repeat: 'daily' });
  eq('daily +1', API.cloneNextOccurrence(daily).dueDate, '2026-10-13');

  const monthly = API.createTask({ title: '月报', dueDate: '2026-01-31', repeat: 'monthly' });
  eq('monthly clamps to Feb 28', API.cloneNextOccurrence(monthly).dueDate, '2026-02-28');

  const weekday = API.createTask({ title: '工作日', dueDate: '2026-10-09', repeat: 'weekday' });
  eq('weekday skips weekend', API.cloneNextOccurrence(weekday).dueDate, '2026-10-12');

  eq('nextDueDate weekly helper', API.nextDueDate({ dueDate: '2026-10-01', repeat: 'weekly' }), '2026-10-08');
}

section('setView keeps nav and range in sync');
{
  resetTasks();
  const past = new Date();
  past.setDate(past.getDate() - 1);
  const future = new Date();
  future.setDate(future.getDate() + 10);
  API.createTask({ title: '昨天', dueDate: fmtDate(past) });
  API.createTask({ title: '十天后', dueDate: fmtDate(future) });

  API.setView('today');
  eq('today sets range', API.getFilters().range, 'today');
  eq('today sets viewMode', API.getViewMode(), 'today');

  API.setFilters({ search: '十天后', range: 'today' });
  eq('today range hides pure future', API.visibleTasks().length, 0);
  API.setFilters({ search: '十天后', range: 'all' });
  eq('all range shows pure future', API.visibleTasks().length, 1);
  API.setFilters({ search: '' });

  API.setView('all');
  eq('all sets range', API.getFilters().range, 'all');
  eq('all sets viewMode', API.getViewMode(), 'all');

  API.setView('done');
  eq('done view forces status done', API.getFilters().status, 'done');
  API.setView('today');
  eq('today resets done status', API.getFilters().status, 'all');
}

section('dayline groups use real week boundaries');
{
  resetTasks();
  const now = new Date();
  const day = (now.getDay() + 6) % 7;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
  const thisWeekLater = new Date(monday);
  thisWeekLater.setDate(monday.getDate() + 4);
  if (thisWeekLater <= now) {
    thisWeekLater.setTime(now.getTime());
    thisWeekLater.setDate(now.getDate() + 2);
  }
  const nextWeek = new Date(monday);
  nextWeek.setDate(monday.getDate() + 7);
  const nextMonth = new Date(monday);
  nextMonth.setMonth(nextMonth.getMonth() + 1);

  API.createTask({ title: '本周内', dueDate: fmtDate(thisWeekLater) });
  API.createTask({ title: '下周', dueDate: fmtDate(nextWeek) });
  API.createTask({ title: '下月', dueDate: fmtDate(nextMonth) });
  API.createTask({ title: '无期', dueDate: null });

  API.setView('dayline');
  // exercise grouping via visibleTasks + weekRange contracts used by render
  const week = API.weekRange();
  ok('weekRange has start/end', !!(week && week.start && week.end));
  const laterThisWeek = API.visibleTasks().find((t) => t.title === '本周内');
  ok('this-week task exists', !!laterThisWeek);
  ok('this-week is within week.end', laterThisWeek.dueDate <= week.end);
  const nxt = API.visibleTasks().find((t) => t.title === '下周');
  ok('next week is after week.end', nxt.dueDate > week.end);
  const later = API.visibleTasks().find((t) => t.title === '下月');
  ok('next month is after next week window', later.dueDate > week.end);
}

section('review helpers + export fields');
{
  resetTasks();
  const t2 = API.createTask({ title: '本周做完的', status: 'done' });
  API.updateTask(t2.id, { status: 'done', completedAt: new Date().toISOString() });
  const doneWeek = API.loadTasks().filter((x) => API.isCompletedThisWeek(x));
  ok('isCompletedThisWeek finds task', doneWeek.some((x) => x.title === '本周做完的'));

  resetTasks();
  API.createTask({
    title: '导出检查',
    tags: ['tag1'],
    repeat: 'daily',
    status: 'done',
    dueDate: '2026-10-09',
    dueTime: '09:00',
    notes: 'n',
  });
  const payload = API.buildExportPayload();
  const t = payload.tasks[0];
  ok('export has tags', Array.isArray(t.tags) && t.tags[0] === 'tag1');
  ok('export has repeat', t.repeat === 'daily');
  ok('export has completedAt', typeof t.completedAt === 'string');
  const parsed = API.parseImportPayload(JSON.stringify(payload));
  ok('import keeps tags', parsed.ok && parsed.tasks[0].tags[0] === 'tag1');
  ok('import keeps repeat', parsed.ok && parsed.tasks[0].repeat === 'daily');
}

section('HTML/CSS: mobile drawer + tags + repeat + review nav');
{
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
  ok('has btn-mobile-menu', html.includes('btn-mobile-menu'));
  ok('has mobile-drawer', html.includes('mobile-drawer'));
  ok('has btn-export-mobile', html.includes('btn-export-mobile'));
  ok('has field-tags', html.includes('field-tags'));
  ok('has field-repeat', html.includes('field-repeat'));
  ok('has review nav', html.includes('data-view="review"'));
  ok('CSS has task-tags', css.includes('task-tags'));
  ok('CSS has mobile-drawer', css.includes('mobile-drawer'));
  ok('CSS hides filter on mobile', css.includes('#btn-filter { display: none; }'));
}

console.log('');
console.log(`[unit-v03] ${pass} passed, ${fail} failed`);
if (failures.length) {
  console.log('Failures:');
  for (const f of failures) console.log('    FAIL  ' + f);
}
process.exitCode = fail > 0 ? 1 : 0;
