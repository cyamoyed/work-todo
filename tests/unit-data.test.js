/** Unit tests — data layer CRUD, defaults, persistence. */
const { loadApp } = require('./helpers/harness');
const { ok, eq, section, summary } = require('./helpers/runner');

const app = loadApp();
const API = app.API;

section('storage key & boot');
eq('STORAGE_KEY is worktodo.tasks.v1', API.STORAGE_KEY, 'worktodo.tasks.v1');
ok('boot with empty storage → []', Array.isArray(API.loadTasks()) && API.loadTasks().length === 0);

section('createTask');
const t1 = API.createTask({ title: '  写周报  ', status: 'todo', priority: 'high', dueDate: '2026-10-01' });
ok('returns object with id', typeof t1.id === 'string' && t1.id.length > 0);
eq('title is trimmed', t1.title, '写周报');
eq('status preserved', t1.status, 'todo');
eq('priority preserved', t1.priority, 'high');
eq('dueDate preserved', t1.dueDate, '2026-10-01');
ok('createdAt ISO', /^\d{4}-\d{2}-\d{2}T/.test(t1.createdAt));
ok('updatedAt equals createdAt on create', t1.updatedAt === t1.createdAt);
ok('persisted to localStorage', app.localStorage._store.has(API.STORAGE_KEY));

const t2 = API.createTask({ title: '整理需求' });
eq('default status is todo', t2.status, 'todo');
eq('default priority is medium', t2.priority, 'medium');
eq('default dueDate is null', t2.dueDate, null);
ok('ids are unique', t1.id !== t2.id);

const t3 = API.createTask({ title: '', status: 'done', priority: 'low', dueDate: '' });
eq('empty dueDate coerces to null', t3.dueDate, null);
eq('empty title stays empty at data layer', t3.title, '');

section('getTask / updateTask / removeTask');
eq('getTask finds t1', API.getTask(t1.id).title, '写周报');
eq('getTask missing → null', API.getTask('nope'), null);

const u = API.updateTask(t1.id, { status: 'done', title: ' 写周报（改） ' });
eq('update patches title + trims', u.title, '写周报（改）');
eq('update patches status', u.status, 'done');
ok('update bumps updatedAt', u.updatedAt >= u.createdAt);
ok('update returns null for missing id', API.updateTask('missing', { title: 'x' }) === null);

const u2 = API.updateTask(t2.id, { dueDate: '2027-01-01' });
eq('update can set dueDate', u2.dueDate, '2027-01-01');
const u3 = API.updateTask(t2.id, { dueDate: null });
eq('update can clear dueDate', u3.dueDate, null);

API.removeTask(t2.id);
eq('removeTask deletes', API.getTask(t2.id), null);
ok('removeTask leaves others', API.getTask(t1.id) !== null);
const before = API.loadTasks().length;
API.removeTask('missing-id');
eq('removeTask on missing is no-op', API.loadTasks().length, before);

section('persistence roundtrip');
const raw = JSON.parse(app.localStorage._store.get(API.STORAGE_KEY));
ok('storage is JSON array', Array.isArray(raw));
ok('storage keeps remaining tasks', raw.length === 2);

// reload from storage (simulate new session)
const app2 = loadApp();
app2.localStorage.setItem(API.STORAGE_KEY, JSON.stringify(raw));
const reloaded = app2.API.loadTasks();
eq('reload recovers tasks', reloaded.length, 2);
eq('reload preserves title', reloaded.find((t) => t.id === t1.id).title, '写周报（改）');

section('saveTasks / loadTasks contract');
const n = API.loadTasks().length;
API.saveTasks();
eq('saveTasks keeps count', API.loadTasks().length, n);
eq('loadTasks returns [] on empty', (() => {
  const a = loadApp();
  return a.API.loadTasks().length;
})(), 0);

// unicode / emoji / long title
const uni = API.createTask({ title: '🚀 发布 v1.0 — 跨端「测试」& <b>x</b>' });
eq('unicode title preserved', uni.title, '🚀 发布 v1.0 — 跨端「测试」& <b>x</b>');
const long = API.createTask({ title: 'x'.repeat(120) });
eq('120-char title accepted', long.title.length, 120);

process.exit(summary('unit-data') ? 0 : 1);
