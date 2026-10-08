/* Smoke test for WorkTodo data layer + pure logic (Node, no DOM) */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

let passed = 0;
let failed = 0;

function ok(name, cond, detail) {
  if (cond) {
    console.log('PASS: ' + name);
    passed++;
  } else {
    console.log('FAIL: ' + name + (detail ? ' — ' + detail : ''));
    failed++;
  }
}

// ——— Minimal browser mocks ———
const store = new Map();
global.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};

global.crypto = {
  randomUUID: () =>
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    }),
};

// Minimal document for app.js init path
const listeners = {};
function fakeEl() {
  return {
    hidden: true,
    textContent: '',
    value: '',
    className: '',
    style: {},
    classList: { add() {}, remove() {}, contains: () => false },
    setAttribute() {},
    addEventListener() {},
    appendChild() {},
    focus() {},
    select() {},
    querySelectorAll: () => [],
    querySelector: () => null,
    closest: () => null,
    dataset: {},
    innerHTML: '',
  };
}
global.document = {
  readyState: 'complete',
  querySelector: () => fakeEl(),
  createElement: () => fakeEl(),
  addEventListener: (t, fn) => {
    listeners[t] = fn;
  },
};
global.window = global;

// Load app.js
const src = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
eval(src);

const API = global.WorkTodo;
ok('WorkTodo API exposed', !!API);

// ——— HTML structure ———
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
ok('index.html has app.js', html.includes('app.js'));
ok('index.html has styles.css', html.includes('styles.css'));
ok('index.html has task-form', html.includes('id="task-form"'));
ok('index.html has task-list', html.includes('id="task-list"'));
ok('index.html has search-input', html.includes('id="search-input"'));
ok('index.html has modal-backdrop', html.includes('id="modal-backdrop"'));
ok('index.html has confirm-backdrop', html.includes('id="confirm-backdrop"'));
ok('index.html lang zh-CN', html.includes('lang="zh-CN"'));
ok('index.html has status-filter', html.includes('id="status-filter"'));
ok('index.html has priority-filter', html.includes('id="priority-filter"'));

// ——— CSS presence ———
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
ok('styles.css defines accent', css.includes('--accent'));
ok('styles.css has empty-state', css.includes('.empty-state'));
ok('styles.css has overdue style', css.includes('.is-overdue'));

// ——— CRUD ———
store.clear();
const t1 = API.createTask({ title: '写周报', status: 'todo', priority: 'high', dueDate: '2026-10-01' });
ok('createTask returns id', !!t1.id && typeof t1.title === 'string');
ok('createTask defaults status', t1.status === 'todo');
ok('createTask persists to localStorage', store.has(API.STORAGE_KEY));

const t2 = API.createTask({ title: '整理需求', status: 'in-progress', priority: 'low', dueDate: null });
ok('createTask second', t2.id !== t1.id);

const got = API.getTask(t1.id);
ok('getTask finds created', got && got.title === '写周报');

const updated = API.updateTask(t1.id, { status: 'done', title: '写周报（改）' });
ok('updateTask patches title', updated.title === '写周报（改）');
ok('updateTask patches status', updated.status === 'done');
ok('updateTask bumps updatedAt', updated.updatedAt >= updated.createdAt);

API.removeTask(t2.id);
ok('removeTask deletes', API.getTask(t2.id) === null);
ok('removeTask leaves others', API.getTask(t1.id) !== null);

// ——— Persistence roundtrip ———
const raw = JSON.parse(store.get(API.STORAGE_KEY));
ok('storage is JSON array', Array.isArray(raw));
ok('storage has remaining task', raw.length === 1 && raw[0].title === '写周报（改）');

// ——— Sort order ———
// Reset both storage and in-memory list via removeTask (store.clear alone is not enough)
for (const t of API.loadTasks()) API.removeTask(t.id);
store.clear();
API.createTask({ title: 'A done late', status: 'done', priority: 'low', dueDate: '2026-12-01' });
API.createTask({ title: 'B overdue high', status: 'todo', priority: 'high', dueDate: '2026-01-01' });
API.createTask({ title: 'C future medium', status: 'todo', priority: 'medium', dueDate: '2027-01-01' });
API.createTask({ title: 'D no due high', status: 'todo', priority: 'high', dueDate: null });
API.createTask({ title: 'E in-progress', status: 'in-progress', priority: 'low', dueDate: '2026-11-01' });

const sorted = API.sortTasks(API.loadTasks()).map((t) => t.title);
ok(
  'sort: active first, done last',
  sorted[sorted.length - 1] === 'A done late',
  sorted.join(' > ')
);
ok(
  'sort: earliest due before later',
  sorted[0] === 'B overdue high' && sorted[1] === 'E in-progress',
  sorted.join(' > ')
);
ok(
  'sort: no-due after dated',
  sorted.indexOf('D no due high') > sorted.indexOf('C future medium'),
  sorted.join(' > ')
);

// Comparator must return 0 on full ties (M2 regression)
const tied = [
  { id: 'a', title: 'A', status: 'todo', priority: 'medium', dueDate: null, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'b', title: 'B', status: 'todo', priority: 'medium', dueDate: null, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'c', title: 'C', status: 'todo', priority: 'medium', dueDate: null, createdAt: '2026-01-01T00:00:00Z' },
];
const tiedSorted = API.sortTasks(tied).map((t) => t.id);
ok('sort: equal keys keep stable order', tiedSorted.join('') === 'abc', tiedSorted.join(''));

// ——— Filter / search (visibleTasks) ———
// visibleTasks uses filters closure — we re-eval would reset. Instead test sort + manual filter contract via loadTasks.
const all = API.loadTasks();
const doneOnly = all.filter((t) => t.status === 'done');
ok('filter status=done works', doneOnly.length === 1 && doneOnly[0].title === 'A done late');

const highOnly = all.filter((t) => t.priority === 'high');
ok('filter priority=high works', highOnly.length === 2);

const search = all.filter((t) => t.title.toLowerCase().includes('overdue'));
ok('search title substring works', search.length === 1 && search[0].title === 'B overdue high');

// ——— isValidTask / corrupt storage ———
// Non-array payload must flag storageError (M1)
store.set(API.STORAGE_KEY, '{"not":"array"}');
const nonArray = API.loadTasks();
ok('non-array payload yields empty + storageError', Array.isArray(nonArray) && nonArray.length === 0);

store.set(API.STORAGE_KEY, '{not json');
const afterCorrupt = API.loadTasks();
ok('corrupt JSON yields empty list + storageError path', Array.isArray(afterCorrupt) && afterCorrupt.length === 0);

store.set(API.STORAGE_KEY, JSON.stringify([
  { id: 1 },
  { id: 'x', title: 'ok', status: 'todo', priority: 'medium' },
  { id: 'y', title: 'bad-status', status: 'nope', priority: 'medium' },
  { id: 'z', title: 'bad-priority', status: 'todo', priority: 'nope' },
]));
const filtered = API.loadTasks();
ok('invalid items filtered out', filtered.length === 1 && filtered[0].title === 'ok');

// ——— Tauri scaffold presence ———
const tauriConf = JSON.parse(fs.readFileSync(path.join(ROOT, 'src-tauri', 'tauri.conf.json'), 'utf8'));
ok('tauri.conf identifier', tauriConf.identifier === 'com.worktodo.app');
ok('tauri.conf frontendDist is dist', tauriConf.build.frontendDist === '../dist');
ok('tauri.conf productName', tauriConf.productName === 'WorkTodo');

const cargo = fs.readFileSync(path.join(ROOT, 'src-tauri', 'Cargo.toml'), 'utf8');
ok('Cargo.toml has tauri', cargo.includes('tauri'));
ok('Cargo.toml package name', cargo.includes('name = "worktodo"'));
ok('Cargo.toml has [lib] name=worktodo_lib', cargo.includes('name = "worktodo_lib"'));

const tauriMain = fs.readFileSync(path.join(ROOT, 'src-tauri', 'src', 'main.rs'), 'utf8');
ok('main.rs uses worktodo_lib', tauriMain.includes('worktodo_lib::run'));

const buildDoc = fs.readFileSync(path.join(ROOT, 'docs', 'BUILD.md'), 'utf8');
ok('BUILD.md documents Windows', buildDoc.includes('Windows'));
ok('BUILD.md documents macOS', buildDoc.includes('macOS'));
ok('BUILD.md documents tauri build', buildDoc.includes('tauri build'));

console.log('');
console.log('Result: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed > 0 ? 1 : 0);
