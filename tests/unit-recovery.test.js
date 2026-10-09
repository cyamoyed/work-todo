/** Unit tests — corrupt storage, invalid payloads, storage failures. */
const { loadApp } = require('./helpers/harness');
const { ok, eq, section, summary } = require('./helpers/runner');

section('non-array payload');
{
  const app = loadApp();
  app.seedRaw('{"not":"array"}');
  const list = app.API.loadTasks();
  eq('object payload → []', list, []);
  ok('storageError flagged', app.API.getStorageError() === true);
}

section('corrupt JSON');
{
  const app = loadApp();
  app.seedRaw('{not json');
  eq('corrupt → []', app.API.loadTasks(), []);
  ok('storageError flagged', app.API.getStorageError() === true);
}

section('null / empty / whitespace payload');
{
  const app = loadApp();
  app.seedRaw('null');
  eq('JSON null → []', app.API.loadTasks(), []);
}
{
  const app = loadApp();
  eq('missing key → []', app.API.loadTasks(), []);
}

section('invalid items filtered, valid kept');
{
  const app = loadApp();
  app.seedRaw(JSON.stringify([
    { id: 1, title: 'bad id type' },
    { id: 'x', title: 'ok', status: 'todo', priority: 'medium' },
    { id: 'y', title: 'bad-status', status: 'nope', priority: 'medium' },
    { id: 'z', title: 'bad-priority', status: 'todo', priority: 'nope' },
    { id: 'p', title: 'proto-status', status: 'constructor', priority: 'medium' },
    { id: 'q', title: 'proto-priority', status: 'todo', priority: '__proto__' },
    { id: 'r', title: 42, status: 'todo', priority: 'medium' },
    { id: 's', title: 'ok2', status: 'done', priority: 'low' },
    'not-an-object',
    null,
  ]));
  const list = app.API.loadTasks();
  eq('only valid items kept', list.map((t) => t.title), ['ok', 'ok2']);
  eq('no storageError for partial invalid', app.API.getStorageError(), false);
}

section('proto / unexpected keys in payload');
{
  const app = loadApp();
  app.seedRaw(JSON.stringify([
    { id: 'x', title: 'ok', status: 'todo', priority: 'medium', __proto__: { admin: true }, evil: 'x' },
  ]));
  const list = app.API.loadTasks();
  eq('unknown extra keys allowed but task loads', list.length, 1);
  ok('polluted Object.prototype.admin not set', ({}).admin === undefined);
}

section('loadTasks does not throw on weird shapes');
{
  const app = loadApp();
  const weird = [
    '123',
    '"str"',
    'true',
    '[]',
    '[1,2,3]',
    '[[]]',
  ];
  for (const payload of weird) {
    app.seedRaw(payload);
    let err = null;
    let list = null;
    try {
      list = app.API.loadTasks();
    } catch (e) {
      err = e;
    }
    ok(`payload ${payload} → [] without throw`, err === null && Array.isArray(list) && list.length === 0);
  }
}

section('localStorage getItem throws');
{
  const app = loadApp();
  app.localStorage._failGet(true);
  let err = null;
  let list = null;
  try {
    list = app.API.loadTasks();
  } catch (e) {
    err = e;
  }
  ok('getItem throw caught', err === null);
  eq('returns []', list, []);
  ok('storageError set', app.API.getStorageError() === true);
  app.localStorage._failGet(false);
}

section('localStorage setItem throws');
{
  const app = loadApp();
  // load cleanly first
  app.API.loadTasks();
  app.localStorage._failSet(true);
  const t = app.API.createTask({ title: '会失败' });
  ok('createTask still returns task on save fail', !!t && t.title === '会失败');
  ok('storageError set after failed save', app.API.getStorageError() === true);
  ok('in-memory list keeps task', app.API.getTask(t.id) !== null);
  app.localStorage._failSet(false);
  ok('next save recovers + clears error', app.API.saveTasks() && app.API.getStorageError() === false);
  ok('task now persisted', app.API.getTask(t.id) !== null);
}

section('update / remove under save failure');
{
  const app = loadApp();
  const t = app.API.createTask({ title: '原始' });
  app.localStorage._failSet(true);
  const u = app.API.updateTask(t.id, { title: '改过' });
  eq('update reflects in memory', u.title, '改过');
  ok('storageError set', app.API.getStorageError() === true);
  app.API.removeTask(t.id);
  eq('remove reflects in memory', app.API.getTask(t.id), null);
  app.localStorage._failSet(false);
}

section('saveTasks failure surfaces error banner (DOM present)');
{
  const app = loadApp();
  app.API.createTask({ title: 'x' });
  app.localStorage._failSet(true);
  app.API.saveTasks();
  const banner = app.ids['error-banner'];
  ok('error banner visible', banner.hidden === false);
  ok('error banner has message', String(banner.textContent).length > 0);
  app.localStorage._failSet(false);
  app.API.saveTasks();
  ok('error banner hidden after recovery', banner.hidden === true);
}

section('load failure surfaces error banner on boot');
{
  const app = loadApp();
  app.seedRaw('{corrupt');
  // re-init by calling loadTasks then simulating init path is already done at load;
  // createTask path with empty is fine — verify loadTasks side effect
  app.API.loadTasks();
  ok('storageError true after corrupt load', app.API.getStorageError() === true);
}

process.exit(summary('unit-recovery') ? 0 : 1);
