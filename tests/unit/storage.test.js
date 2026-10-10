/* Unit tests — corrupt storage, invalid payloads, storage failures (port of unit-recovery). */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  __setStorageForTests,
  getStorageError,
  loadTasks as loadTasksFrom,
} from '../../src/lib/storage.js';
import { useTaskStore } from '../../src/store/tasks.js';
import { STORAGE_KEY } from '../../src/constants.js';

const store = useTaskStore();

beforeEach(() => {
  __setStorageForTests();
  localStorage.clear();
  store.load();
});

afterEach(() => {
  __setStorageForTests();
});

function failingBackend({ failGet = false, failSet = false } = {}) {
  const mem = new Map();
  return {
    getItem(k) {
      if (failGet) throw new Error('getItem failed');
      return mem.has(k) ? mem.get(k) : null;
    },
    setItem(k, v) {
      if (failSet) throw new Error('setItem failed');
      mem.set(k, v);
    },
  };
}

describe('non-array payload', () => {
  it('object payload → [] and storageError flagged', () => {
    localStorage.setItem(STORAGE_KEY, '{"not":"array"}');
    const list = loadTasksFrom();
    expect(list).toEqual([]);
    expect(getStorageError()).toBe(true);
  });
});

describe('corrupt JSON', () => {
  it('corrupt → [] and storageError flagged', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    expect(loadTasksFrom()).toEqual([]);
    expect(getStorageError()).toBe(true);
  });
});

describe('null / empty / whitespace payload', () => {
  it('JSON null → []', () => {
    localStorage.setItem(STORAGE_KEY, 'null');
    expect(loadTasksFrom()).toEqual([]);
  });
  it('missing key → []', () => {
    localStorage.removeItem(STORAGE_KEY);
    expect(loadTasksFrom()).toEqual([]);
  });
});

describe('invalid items filtered, valid kept', () => {
  it('only valid items kept, no storageError for partial invalid', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
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
      ])
    );
    const list = loadTasksFrom();
    expect(list.map((t) => t.title)).toEqual(['ok', 'ok2']);
    expect(getStorageError()).toBe(false);
  });
});

describe('proto / unexpected keys in payload', () => {
  it('unknown extra keys allowed but task loads; no pollution', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { id: 'x', title: 'ok', status: 'todo', priority: 'medium', __proto__: { admin: true }, evil: 'x' },
      ])
    );
    const list = loadTasksFrom();
    expect(list.length).toBe(1);
    expect(({}).admin).toBeUndefined();
  });
});

describe('loadTasks does not throw on weird shapes', () => {
  const weird = ['123', '"str"', 'true', '[]', '[1,2,3]', '[[]]'];
  for (const payload of weird) {
    it(`payload ${payload} → [] without throw`, () => {
      localStorage.setItem(STORAGE_KEY, payload);
      let err = null;
      let list = null;
      try {
        list = loadTasksFrom();
      } catch (e) {
        err = e;
      }
      expect(err).toBeNull();
      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBe(0);
    });
  }
});

describe('localStorage getItem throws', () => {
  it('getItem throw caught, returns [], storageError set', () => {
    __setStorageForTests(failingBackend({ failGet: true }));
    let err = null;
    let list = null;
    try {
      list = loadTasksFrom();
    } catch (e) {
      err = e;
    }
    expect(err).toBeNull();
    expect(list).toEqual([]);
    expect(getStorageError()).toBe(true);
  });
});

describe('localStorage setItem throws', () => {
  it('createTask still returns task on save fail; next save recovers', () => {
    const backend = failingBackend();
    __setStorageForTests(backend);
    store.load();
    // flip to failing set
    __setStorageForTests(failingBackend({ failSet: true }));
    const t = store.createTask({ title: '会失败' });
    expect(t && t.title).toBe('会失败');
    expect(getStorageError()).toBe(true);
    expect(store.getTask(t.id)).not.toBeNull();
    // recover
    __setStorageForTests(backend);
    store.persistNow();
    expect(getStorageError()).toBe(false);
    expect(store.getTask(t.id)).not.toBeNull();
  });
});

describe('update / remove under save failure', () => {
  it('in-memory reflects updates and removes; storageError set', () => {
    const t = store.createTask({ title: '原始' });
    __setStorageForTests(failingBackend({ failSet: true }));
    const u = store.updateTask(t.id, { title: '改过' });
    expect(u.title).toBe('改过');
    expect(getStorageError()).toBe(true);
    store.removeTask(t.id);
    expect(store.getTask(t.id)).toBeNull();
    __setStorageForTests();
  });
});

describe('load failure surfaces storageError on boot', () => {
  it('storageError true after corrupt load', () => {
    localStorage.setItem(STORAGE_KEY, '{corrupt');
    loadTasksFrom();
    expect(getStorageError()).toBe(true);
    // store.load copies the flag into state
    store.load();
    expect(store.state.storageError).toBe(true);
    // error-banner DOM cases are covered in tests/component/error-banner.test.js
  });
});
