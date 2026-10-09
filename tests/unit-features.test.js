/** v0.2 feature tests — export/import, notes, today/week, quick add, sort, bulk, due time. */
const { loadApp } = require('./helpers/harness');
const { ok, eq, section, summary } = require('./helpers/runner');

section('notes field');
{
  const a = loadApp();
  const t = a.API.createTask({ title: '带备注', notes: '  背景说明  ' });
  eq('notes stored', t.notes, '背景说明');
  const u = a.API.updateTask(t.id, { notes: 'updated notes' });
  eq('notes updatable', u.notes, 'updated notes');
  const long = a.API.createTask({ title: 'long', notes: 'x'.repeat(3000) });
  eq('notes capped at NOTES_MAX', long.notes.length, a.API.NOTES_MAX);
  const old = a.API.normalizeTask({ id: '1', title: 'old', status: 'todo', priority: 'medium' });
  eq('legacy task without notes defaults empty', old.notes, '');
}

section('search covers notes');
{
  const a = loadApp();
  a.API.createTask({ title: '标题A', notes: '包含关键词西游' });
  a.API.createTask({ title: '西游标题B', notes: '无' });
  a.API.createTask({ title: '无关', notes: '无' });
  a.API.setFilters({ search: '西游' });
  eq('search hits title OR notes', a.API.visibleTasks().length, 2);
  a.API.setFilters({ search: '标题A' });
  eq('search title still works', a.API.visibleTasks().length, 1);
}

section('export / import payload');
{
  const a = loadApp();
  a.API.createTask({ title: '导出1', notes: 'n1', dueDate: '2026-12-01', dueTime: '15:00' });
  a.API.createTask({ title: '导出2' });
  const payload = a.API.buildExportPayload();
  eq('schemaVersion', payload.schemaVersion, a.API.SCHEMA_VERSION);
  ok('exportedAt ISO', typeof payload.exportedAt === 'string' && payload.exportedAt.includes('T'));
  eq('tasks exported', payload.tasks.length, 2);
  eq('notes in export', payload.tasks.find((t) => t.title === '导出1').notes, 'n1');
  eq('dueTime in export', payload.tasks.find((t) => t.title === '导出1').dueTime, '15:00');
  ok('filename uses date', /^worktodo-\d{8}\.json$/.test(a.API.exportFilename()));

  const parsed = a.API.parseImportPayload(JSON.stringify(payload));
  ok('parse ok', parsed.ok);
  eq('parsed tasks', parsed.tasks.length, 2);
}

section('import validation');
{
  const a = loadApp();
  eq('invalid object', a.API.parseImportPayload({ foo: 1 }).ok, false);
  eq('missing tasks', a.API.parseImportPayload({ schemaVersion: 2 }).ok, false);
  eq('bad schemaVersion', a.API.parseImportPayload({ schemaVersion: 99, tasks: [] }).ok, false);
  eq('non-json string handled', (() => {
    try {
      return a.API.parseImportPayload('not-json').ok;
    } catch (e) {
      return 'throws';
    }
  })(), false);
  const mixed = a.API.parseImportPayload({
    schemaVersion: 1,
    tasks: [
      { id: 'a', title: 'ok', status: 'todo', priority: 'high' },
      { id: 1, title: 'bad' },
      { id: 'b', title: 'bad-status', status: 'nope', priority: 'medium' },
    ],
  });
  ok('filters invalid items', mixed.ok && mixed.tasks.length === 1 && mixed.tasks[0].id === 'a');
}

section('import merge / replace');
{
  const a = loadApp();
  const t = a.API.createTask({ title: '本地', notes: 'old' });
  a.API.updateTask(t.id, { notes: 'local-updated' });
  const incoming = [
    {
      id: t.id,
      title: '本地',
      status: 'todo',
      priority: 'medium',
      notes: 'remote',
      createdAt: t.createdAt,
      updatedAt: '2099-01-01T00:00:00.000Z',
    },
    {
      id: 'new-1',
      title: '新增',
      status: 'todo',
      priority: 'low',
      notes: '',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ];
  const r = a.API.importTasks(incoming, 'merge');
  eq('merge added', r.added, 1);
  eq('merge updated', r.updated, 1);
  eq('merge total', r.total, 2);
  eq('newer remote wins', a.API.getTask(t.id).notes, 'remote');

  const r2 = a.API.importTasks([{ id: 'x', title: 'only', status: 'done', priority: 'low' }], 'replace');
  eq('replace total', a.API.loadTasks().length, 1);
  eq('replace content', a.API.loadTasks()[0].title, 'only');
  ok('replace snapshot kept', r2.snapshot.length === 2);
}

section('today / week scope');
{
  const a = loadApp();
  const today = a.API.todayString();
  const yest = a.API.toDateStr(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() - 1);
  a.API.createTask({ title: 'today-due', dueDate: today, status: 'todo' });
  a.API.createTask({ title: 'overdue', dueDate: yest, status: 'todo' });
  a.API.createTask({ title: 'no-due', status: 'todo' });
  a.API.createTask({ title: 'done-today', status: 'done' });
  ok('isToday', a.API.isToday(today) && !a.API.isToday(yest));
  ok('isThisWeek includes today', a.API.isThisWeek(today));
  ok('isOverdue yesterday', a.API.isOverdue(a.API.getTasksRef().find((t) => t.title === 'overdue')));
  ok('isCompletedToday', a.API.isCompletedToday(a.API.getTasksRef().find((t) => t.title === 'done-today')));

  a.API.setFilters({ range: 'today' });
  const todayList = a.API.visibleTasks().map((t) => t.title).sort();
  ok(
    'today filter includes due/overdue/done-today',
    todayList.includes('today-due') && todayList.includes('overdue') && todayList.includes('done-today'),
    todayList.join(',')
  );
  ok('today filter excludes no-due', !todayList.includes('no-due'));

  a.API.setFilters({ range: 'week' });
  const weekList = a.API.visibleTasks().map((t) => t.title);
  ok('week includes today-due', weekList.includes('today-due'));
  ok('week excludes pure no-due', !weekList.includes('no-due'));
}

section('dueTime overdue boundary');
{
  const a = loadApp();
  const today = a.API.todayString();
  const past = a.API.createTask({ title: 'past-time', dueDate: today, dueTime: '00:00' });
  const future = a.API.createTask({ title: 'future-time', dueDate: today, dueTime: '23:59' });
  ok('dueTime 00:00 today is overdue (or equal)', a.API.isOverdue(past) || a.API.nowTimeHM() === '00:00');
  ok('dueTime 23:59 today not overdue', !a.API.isOverdue(future));
  ok('formatDue shows time', String(a.API.formatDue(future)).includes('23:59'));
  eq('normalizeDueTime rejects junk', a.API.normalizeDueTime('9'), null);
  eq('normalizeDueTime accepts HH:mm', a.API.normalizeDueTime('09:30'), '09:30');
}

section('sort modes');
{
  const a = loadApp();
  const s1 = a.API.createTask({ title: 'low-soon', priority: 'low', dueDate: '2026-12-01', status: 'todo' });
  const s2 = a.API.createTask({ title: 'high-late', priority: 'high', dueDate: '2027-06-01', status: 'todo' });
  // pin createdAt so created-sort is deterministic even in the same millisecond
  s1.createdAt = '2026-01-01T00:00:00.000Z';
  s2.createdAt = '2026-06-01T00:00:00.000Z';
  a.API.setSortMode('due');
  eq('due mode: sooner first', a.API.visibleTasks()[0].title, 'low-soon');
  a.API.setSortMode('priority');
  eq('priority mode: high first', a.API.visibleTasks()[0].title, 'high-late');
  a.API.setSortMode('created');
  eq('created mode: newest first', a.API.visibleTasks()[0].title, 'high-late');
}

section('clear completed bulk + undo snapshot');
{
  const a = loadApp();
  a.API.createTask({ title: 'keep' });
  a.API.createTask({ title: 'done1', status: 'done' });
  a.API.createTask({ title: 'done2', status: 'done' });
  const done = a.API.getTasksRef().filter((t) => t.status === 'done').map((t) => ({ ...t }));
  const r = a.API.removeTasks(done.map((t) => t.id));
  eq('bulk remove count', r, 2);
  eq('remaining', a.API.loadTasks().length, 1);
  a.API.restoreTasks(done);
  eq('restore all', a.API.loadTasks().length, 3);
  eq('restore keeps ids', a.API.loadTasks().filter((t) => t.status === 'done').length, 2);
}

section('quick add form creates today task');
{
  const a = loadApp();
  a.ids['quick-title'].value = '  快速一条  ';
  a.dom.trigger('quick-add-form', 'submit', { preventDefault() {} });
  const list = a.API.loadTasks();
  eq('quick add one', list.length, 1);
  eq('quick add title trimmed', list[0].title, '快速一条');
  eq('quick add defaults todo', list[0].status, 'todo');
  eq('quick add due today', list[0].dueDate, a.API.todayString());
  eq('quick input cleared', a.ids['quick-title'].value, '');
}

section('form submit with notes + dueTime');
{
  const a = loadApp();
  a.ids['field-title'].value = '完整任务';
  a.ids['field-notes'].value = '备注内容';
  a.ids['field-due'].value = '2026-12-31';
  a.ids['field-due-time'].value = '18:30';
  a.dom.trigger('task-form', 'submit', { preventDefault() {} });
  const t = a.API.loadTasks()[0];
  eq('notes saved', t.notes, '备注内容');
  eq('dueTime saved', t.dueTime, '18:30');
  eq('dueDate saved', t.dueDate, '2026-12-31');
}

section('export/import HTML anchors present');
{
  const fs = require('fs');
  const path = require('path');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  ok('has btn-export', html.includes('id="btn-export"'));
  ok('has btn-import', html.includes('id="btn-import"'));
  ok('has import-file', html.includes('id="import-file"'));
  ok('has field-notes', html.includes('id="field-notes"'));
  ok('has quick-add-form', html.includes('id="quick-add-form"'));
  ok('has range-filter', html.includes('id="range-filter"'));
  ok('has sort-select', html.includes('id="sort-select"'));
  ok('has field-due-time', html.includes('id="field-due-time"'));
  ok('has fab-new', html.includes('id="fab-new"'));
  ok('delete copy undo', html.includes('可撤销'));
}

process.exit(summary('unit-features') ? 0 : 1);
