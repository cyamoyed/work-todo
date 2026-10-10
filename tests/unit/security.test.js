/* Unit tests — security & input boundaries (XSS-as-data, pollution resistance, limits). */
import { describe, it, expect, beforeEach } from 'vitest';
import { useTaskStore } from '../../src/store/tasks.js';
import { useUiStore } from '../../src/store/ui.js';
import { isOverdue, formatDue, todayString } from '../../src/core/dates.js';
import { visibleTasks } from '../../src/core/filters.js';
import { loadTasks as loadTasksFrom } from '../../src/lib/storage.js';
import { STORAGE_KEY } from '../../src/constants.js';

const store = useTaskStore();
const ui = useUiStore();

beforeEach(() => {
  localStorage.clear();
  store.load();
  ui.setFilters({ status: 'all', priority: 'all', range: 'all', search: '', projectId: null });
  ui.setSortMode('due');
});

describe('XSS payloads survive as data (not executed at data layer)', () => {
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
    it(`stored as-is: ${payload.slice(0, 24)}…`, () => {
      const t = store.createTask({ title: payload });
      expect(t.title).toBe(payload.trim());
    });
    it(`retrieved as-is: ${payload.slice(0, 24)}…`, () => {
      const t = store.createTask({ title: payload });
      expect(store.getTask(t.id).title).toBe(payload.trim());
    });
  }
});

describe('title is trimmed but content preserved', () => {
  it('leading/trailing space trimmed', () => {
    expect(store.createTask({ title: '  <b>x</b>  ' }).title).toBe('<b>x</b>');
  });
  it('inner spaces kept', () => {
    expect(store.createTask({ title: 'a  b   c' }).title).toBe('a  b   c');
  });
});

describe('very long titles', () => {
  it('data layer accepts long title', () => {
    const long = '任务'.repeat(200); // 400 chars
    const t = store.createTask({ title: long });
    expect(t.title).toBe(long);
    // HTML maxlength=120 is a UI constraint, not data-layer
  });
});

describe('prototype pollution via JSON.parse payload', () => {
  it('__proto__ key cannot pollute Object.prototype', () => {
    localStorage.setItem(
      STORAGE_KEY,
      '[{"id":"x","title":"ok","status":"todo","priority":"medium","__proto__":{"isAdmin":true}}]'
    );
    const list = loadTasksFrom();
    expect(list.length).toBe(1);
    expect(({}).isAdmin).toBeUndefined();
    expect(list[0].isAdmin).toBeUndefined();
  });

  it('constructor.prototype pollution blocked', () => {
    localStorage.setItem(
      STORAGE_KEY,
      '[{"id":"x","title":"ok","status":"todo","priority":"medium","constructor":{"prototype":{"isAdmin":true}}}]'
    );
    const list = loadTasksFrom();
    expect(({}).isAdmin).toBeUndefined();
    expect(list.length).toBe(1);
  });
});

describe('status/priority injection via API calls', () => {
  it('reload drops invalid status', () => {
    const t = store.createTask({ title: 't', status: 'hack', priority: 'hack' });
    expect(t.status).toBe('hack'); // createTask stores status as given
    // reload goes through isValidTask filtering
    const reloaded = loadTasksFrom();
    expect(reloaded.length).toBe(0);
  });
});

describe('getTask with weird string ids (in-memory list)', () => {
  it('finds by string id without pollution', () => {
    store.createTask({ title: 'p' });
    store.createTask({ title: 'c' });
    store.createTask({ title: 'empty-id' });
    const ref = store.getTasks();
    ref[0].id = '__proto__';
    ref[1].id = 'constructor';
    ref[2].id = '';

    expect((store.getTask('__proto__') || {}).title).toBe('p');
    expect((store.getTask('constructor') || {}).title).toBe('c');
    expect((store.getTask('') || {}).title).toBe('empty-id');
    expect(({}).title).toBeUndefined();
    expect(({}).isAdmin).toBeUndefined();
  });
});

describe('loadTasks vs in-memory list semantics', () => {
  it('loadTasks reads fresh storage; getTask uses in-memory list', () => {
    store.createTask({ title: 'in-memory' });
    // Simulate another tab writing storage
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([{ id: 'other', title: 'other-tab', status: 'todo', priority: 'medium' }])
    );
    expect(loadTasksFrom()[0].title).toBe('other-tab');
    expect(store.getTask(store.getTasks()[0].id).title).toBe('in-memory');
  });
});

describe('dueDate format boundaries', () => {
  const dates = ['2026-10-08', '2026-1-1', '20261008', '2026/10/08', 'not-a-date', '9999-99-99', '', null, '2026-10-08T00:00:00Z'];
  for (const d of dates) {
    it(`dueDate ${JSON.stringify(d)} does not throw`, () => {
      const t = store.createTask({ title: `d:${d}`, dueDate: d });
      expect(() => {
        isOverdue(t);
        formatDue(t);
      }).not.toThrow();
    });
  }
});

describe('overdue boundary uses date string compare', () => {
  it('due==today not overdue', () => {
    expect(isOverdue({ dueDate: todayString(), status: 'todo' })).toBe(false);
  });
  it('unpadded date does not crash isOverdue / formatDue', () => {
    const noPad = { dueDate: '2026-1-01', status: 'todo' };
    expect(typeof isOverdue(noPad)).toBe('boolean');
    expect(formatDue(noPad)).not.toBeUndefined();
  });
});

describe('search input special regex chars are literal', () => {
  function visibleCount() {
    return visibleTasks(store.getTasks(), ui.state.filters, ui.state.sortMode).length;
  }
  beforeEach(() => {
    store.createTask({ title: 'price is $100 (urgent) [1]' });
    store.createTask({ title: 'price is 100' });
    ui.setFilters({ status: 'all', priority: 'all', search: '' });
  });

  it('regex chars treated literally', () => {
    ui.setFilters({ status: 'all', priority: 'all', search: '$100 (urgent)' });
    expect(visibleCount()).toBe(1);
  });
  it('open paren matches literally', () => {
    ui.setFilters({ status: 'all', priority: 'all', search: '(' });
    expect(visibleCount()).toBe(1);
  });
  it('brackets literal', () => {
    ui.setFilters({ status: 'all', priority: 'all', search: '[1]' });
    expect(visibleCount()).toBe(1);
  });
});

describe('updateTask patch cannot smuggle identity fields', () => {
  it('id/createdAt survive; no pollution from patch', () => {
    const t = store.createTask({ title: 'base' });
    const u = store.updateTask(t.id, {
      title: 'ok',
      status: 'done',
      id: 'hijack-id',
      createdAt: '1999-01-01T00:00:00Z',
      __proto__: { x: 1 },
    });
    expect(u.title).toBe('ok');
    expect(u.id).toBe(t.id);
    expect(u.createdAt).toBe(t.createdAt);
    expect(({}).x).toBeUndefined();
  });
});

describe('createTask id from crypto is string and unique', () => {
  it('50 unique non-empty string ids', () => {
    const ids = new Set();
    for (let i = 0; i < 50; i++) {
      const t = store.createTask({ title: 'n' + i });
      expect(typeof t.id).toBe('string');
      expect(t.id.length).toBeGreaterThan(0);
      ids.add(t.id);
    }
    expect(ids.size).toBe(50);
  });
});
