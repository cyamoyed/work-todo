/** Unit tests — security & input boundaries (XSS, pollution, limits). */
const { loadApp } = require('./helpers/harness');
const { ok, eq, section, summary } = require('./helpers/runner');

const app = loadApp();
const API = app.API;

section('XSS payloads survive as data (not executed at data layer)');
const xssList = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '"><svg onload=alert(1)>',
  'javascript:alert(1)',
  '{{constructor.constructor("alert(1)")()}}',
  '&lt;script&gt;',
  '\x00null\x00byte',
];
for (const payload of xssList) {
  const t = API.createTask({ title: payload });
  eq(`stored as-is: ${payload.slice(0, 24)}…`, t.title, payload.trim());
  const got = API.getTask(t.id);
  eq(`retrieved as-is: ${payload.slice(0, 24)}…`, got.title, payload.trim());
}

section('title is trimmed but content preserved');
eq('leading/trailing space trimmed', API.createTask({ title: '  <b>x</b>  ' }).title, '<b>x</b>');
eq('inner spaces kept', API.createTask({ title: 'a  b   c' }).title, 'a  b   c');

section('very long titles');
{
  const long = '任务'.repeat(200); // 400 chars
  const t = API.createTask({ title: long });
  eq('data layer accepts long title', t.title, long);
  // HTML maxlength=120 is a UI constraint, not data-layer
}

section('prototype pollution via JSON.parse payload');
{
  const a = loadApp();
  a.seedRaw('[{"id":"x","title":"ok","status":"todo","priority":"medium","__proto__":{"isAdmin":true}}]');
  const list = a.API.loadTasks();
  eq('task still loads', list.length, 1);
  ok('Object.prototype.isAdmin is undefined', ({}).isAdmin === undefined);
  ok('list[0].isAdmin is undefined', list[0].isAdmin === undefined);

  a.seedRaw('[{"id":"x","title":"ok","status":"todo","priority":"medium","constructor":{"prototype":{"isAdmin":true}}}]');
  a.API.loadTasks();
  ok('constructor.prototype pollution blocked', ({}).isAdmin === undefined);
}

section('status/priority injection via API calls');
{
  const a = loadApp();
  const t = a.API.createTask({ title: 't', status: 'hack', priority: 'hack' });
  eq('createTask stores status as given', t.status, 'hack');
  a.seedRaw(JSON.stringify(a.API.getTasksRef()));
  const reloaded = a.API.loadTasks();
  eq('reload drops invalid status', reloaded.length, 0);
}

section('getTask with weird string ids (in-memory list)');
{
  const a = loadApp();
  // loadTasks() is a pure storage read; getTask() reads the in-memory list.
  // Seed memory via createTask, then swap in weird ids through the live ref.
  a.API.createTask({ title: 'p' });
  a.API.createTask({ title: 'c' });
  a.API.createTask({ title: 'empty-id' });
  const ref = a.API.getTasksRef();
  ref[0].id = '__proto__';
  ref[1].id = 'constructor';
  ref[2].id = '';
  a.API.saveTasks();

  eq('getTask(__proto__) finds by string id', (a.API.getTask('__proto__') || {}).title, 'p');
  eq('getTask(constructor) finds by string id', (a.API.getTask('constructor') || {}).title, 'c');
  eq('getTask("") finds by string id', (a.API.getTask('') || {}).title, 'empty-id');
  ok('no pollution after getTask', ({}).title === undefined);
  ok('no pollution isAdmin', ({}).isAdmin === undefined);
}

section('loadTasks vs in-memory list semantics');
{
  const a = loadApp();
  a.API.createTask({ title: 'in-memory' });
  // Simulate another tab writing storage
  a.seedRaw(JSON.stringify([{ id: 'other', title: 'other-tab', status: 'todo', priority: 'medium' }]));
  eq('loadTasks reads fresh storage', a.API.loadTasks()[0].title, 'other-tab');
  eq('getTask still uses in-memory list', a.API.getTask(a.API.getTasksRef()[0].id).title, 'in-memory');
}

section('dueDate format boundaries');
{
  const a = loadApp();
  const dates = ['2026-10-08', '2026-1-1', '20261008', '2026/10/08', 'not-a-date', '9999-99-99', '', null, '2026-10-08T00:00:00Z'];
  for (const d of dates) {
    const t = a.API.createTask({ title: `d:${d}`, dueDate: d });
    let err = null;
    try {
      a.API.isOverdue(t);
      a.API.formatDue(t);
    } catch (e) {
      err = e;
    }
    ok(`dueDate ${JSON.stringify(d)} does not throw`, err === null);
  }
}

section('overdue boundary uses date string compare');
{
  const a = loadApp();
  const today = a.API.todayString();
  ok('due==today not overdue', !a.API.isOverdue({ dueDate: today, status: 'todo' }));
  const noPad = { dueDate: '2026-1-01', status: 'todo' };
  ok('unpadded date does not crash isOverdue', typeof a.API.isOverdue(noPad) === 'boolean');
  ok('unpadded date does not crash formatDue', a.API.formatDue(noPad) !== undefined);
}

section('search input special regex chars are literal');
{
  const a = loadApp();
  a.API.createTask({ title: 'price is $100 (urgent) [1]' });
  a.API.createTask({ title: 'price is 100' });
  a.API.setFilters({ status: 'all', priority: 'all', search: '$100 (urgent)' });
  eq('regex chars treated literally', a.API.visibleTasks().length, 1);
  a.API.setFilters({ status: 'all', priority: 'all', search: '(' });
  eq('open paren matches literally', a.API.visibleTasks().length, 1);
  a.API.setFilters({ status: 'all', priority: 'all', search: '[1]' });
  eq('brackets literal', a.API.visibleTasks().length, 1);
}

section('updateTask patch cannot smuggle identity fields');
{
  const a = loadApp();
  const t = a.API.createTask({ title: 'base' });
  const u = a.API.updateTask(t.id, {
    title: 'ok',
    status: 'done',
    id: 'hijack-id',
    createdAt: '1999-01-01T00:00:00Z',
    __proto__: { x: 1 },
  });
  eq('title updated', u.title, 'ok');
  eq('id cannot be overwritten via patch', u.id, t.id);
  eq('createdAt cannot be overwritten via patch', u.createdAt, t.createdAt);
  ok('no prototype pollution from updateTask', ({}).x === undefined);
}

section('createTask id from crypto is string and unique');
{
  const a = loadApp();
  const ids = new Set();
  for (let i = 0; i < 50; i++) {
    const t = a.API.createTask({ title: 'n' + i });
    ok('id is non-empty string', typeof t.id === 'string' && t.id.length > 0);
    ids.add(t.id);
  }
  eq('50 unique ids', ids.size, 50);
}

process.exit(summary('unit-security') ? 0 : 1);
