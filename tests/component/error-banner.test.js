/* Component tests — save/load error banner (deferred port from the recovery
 * suite: legacy only ever banners on SAVE failure; a corrupt load sets
 * state.storageError but keeps the banner hidden). */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { mountApp, resetState, cleanup } from './helpers/mountApp.js';
import { __setStorageForTests } from '../../src/lib/storage.js';
import { SAVE_ERROR_MESSAGE } from '../../src/store/tasks.js';
import { STORAGE_KEY } from '../../src/constants.js';

let wrapper;
let tasks;

beforeEach(() => {
  resetState();
});

afterEach(async () => {
  await cleanup();
});

/** Same failingBackend pattern as tests/unit/storage.test.js. */
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

describe('save error banner', () => {
  it('banner shown on write fail with the exact message', async () => {
    __setStorageForTests(failingBackend({ failSet: true }));
    ({ wrapper, tasks } = await mountApp());

    tasks.createTask({ title: 'x' });
    await flushPromises();

    const banner = wrapper.find('#error-banner');
    expect(banner.element.hidden).toBe(false); // banner shown on write fail
    expect(banner.text()).toBe(SAVE_ERROR_MESSAGE);
    expect(banner.text()).toBe('无法写入本地存储，数据可能不会被保存。');
  });

  it('banner hidden after recovery', async () => {
    const working = failingBackend();
    __setStorageForTests(failingBackend({ failSet: true }));
    ({ wrapper, tasks } = await mountApp());

    tasks.createTask({ title: 'x' });
    await flushPromises();
    expect(wrapper.find('#error-banner').element.hidden).toBe(false);

    // storage recovers → next successful save clears the banner
    __setStorageForTests(working);
    tasks.persistNow();
    await flushPromises();
    expect(wrapper.find('#error-banner').element.hidden).toBe(true); // hidden after recovery
    expect(tasks.state.errorMessage).toBe(null);
    expect(tasks.state.storageError).toBe(false);
  });
});

describe('load failure state', () => {
  it('corrupt JSON → storageError true but banner hidden (legacy only banners on save)', async () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    tasks.load(); // store.load() against the corrupt payload
    expect(tasks.state.storageError).toBe(true);
    ({ wrapper, tasks } = await mountApp());

    expect(tasks.state.storageError).toBe(true);
    expect(tasks.state.errorMessage).toBe(null);
    expect(wrapper.find('#error-banner').element.hidden).toBe(true);
  });
});
