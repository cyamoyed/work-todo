/* Component tests — sync settings modal, sync status line, data hint, backup modal. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { mountApp, resetState, cleanup } from './helpers/mountApp.js';
import { initSync, logoutSync, stopSyncLoop, getSyncState } from '../../src/lib/sync/engine.js';
import { useTaskStore } from '../../src/store/tasks.js';
import { isTauri } from '../../src/lib/tauri.js';

let wrapper;
let ui;
let tasks;

function mockWebDavFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, init = {}) => {
      const method = init.method || 'GET';
      return {
        ok: method === 'PUT',
        status: method === 'GET' ? 404 : 204,
        headers: { get: (k) => (k === 'ETag' ? '"v1"' : null) },
        json: async () => ({}),
        text: async () => '',
      };
    })
  );
}

beforeEach(async () => {
  logoutSync();
  stopSyncLoop();
  resetState();
  tasks = useTaskStore();
  // Same wiring as main.js so configureSync's first cycle runs for real.
  initSync({
    getPayload: () => tasks.exportPayload(),
    applyMerged: (t, p) => tasks.applySyncResult(t, p),
  });
  ({ wrapper, ui } = await mountApp());
});

afterEach(async () => {
  await cleanup();
  logoutSync();
  stopSyncLoop();
  vi.unstubAllGlobals();
});

describe('side footer: sync status + data hint', () => {
  it('shows the unconfigured status line', () => {
    const status = wrapper.find('#sync-status');
    expect(status.exists()).toBe(true);
    expect(status.text()).toContain('未配置同步');
  });

  it('browser mode shows the data-loss hint and hides the backup entry', () => {
    expect(isTauri()).toBe(false);
    expect(wrapper.find('#data-hint').exists()).toBe(true);
    expect(wrapper.find('#data-hint').text()).toContain('清除浏览器数据会丢失');
    expect(wrapper.find('#btn-backup').exists()).toBe(false);
    expect(wrapper.find('#btn-sync-settings').exists()).toBe(true);
  });
});

describe('sync settings modal', () => {
  it('opens from #btn-sync-settings with the expected form fields', async () => {
    await wrapper.find('#btn-sync-settings').trigger('click');
    await flushPromises();
    expect(wrapper.find('#sync-modal').isVisible()).toBe(true);
    expect(wrapper.find('#field-sync-url').exists()).toBe(true);
    expect(wrapper.find('#field-sync-identity').exists()).toBe(true);
    expect(wrapper.find('#field-sync-password').exists()).toBe(true);
    expect(wrapper.find('#btn-sync-login').exists()).toBe(true);
    // PocketBase-only fields: collection name + register checkbox
    expect(wrapper.find('#field-sync-collection').exists()).toBe(true);
    expect(wrapper.find('#field-sync-collection').attributes('placeholder')).toBe('work_todo');
    expect(wrapper.find('#field-sync-register').exists()).toBe(true);
    await wrapper.find('#field-sync-provider button[data-value="webdav"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('#field-sync-register').exists()).toBe(false);
    expect(wrapper.find('#field-sync-collection').exists()).toBe(false);
  });

  it('validates required fields before contacting the server', async () => {
    await wrapper.find('#btn-sync-settings').trigger('click');
    await flushPromises();
    await wrapper.find('#btn-sync-login').trigger('click');
    await flushPromises();
    expect(wrapper.find('#sync-error').exists()).toBe(true);
    expect(wrapper.find('#sync-error').text()).toContain('请填写');
    expect(getSyncState().configured).toBe(false);
  });

  it('logs in via WebDAV and flips the status line', async () => {
    mockWebDavFetch();
    await wrapper.find('#btn-sync-settings').trigger('click');
    await flushPromises();
    await wrapper.find('#field-sync-provider button[data-value="webdav"]').trigger('click');
    await wrapper.find('#field-sync-url').setValue('https://dav.example.com/work-todo-sync.json');
    await wrapper.find('#field-sync-identity').setValue('user');
    await wrapper.find('#field-sync-password').setValue('pass');
    await wrapper.find('#btn-sync-login').trigger('click');
    await flushPromises();
    expect(getSyncState().configured).toBe(true);
    expect(wrapper.find('#sync-modal').isVisible()).toBe(false);
    expect(wrapper.find('#toast').text()).toContain('同步已开启');
    expect(wrapper.find('#sync-status').text()).toContain('已同步');
  });

  it('surfaces login failures in the modal', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 401, headers: { get: () => null }, json: async () => ({}), text: async () => '' }))
    );
    await wrapper.find('#btn-sync-settings').trigger('click');
    await flushPromises();
    await wrapper.find('#field-sync-provider button[data-value="webdav"]').trigger('click');
    await wrapper.find('#field-sync-url').setValue('https://dav.example.com/f.json');
    await wrapper.find('#field-sync-identity').setValue('user');
    await wrapper.find('#field-sync-password').setValue('bad');
    await wrapper.find('#btn-sync-login').trigger('click');
    await flushPromises();
    expect(wrapper.find('#sync-error').exists()).toBe(true);
    expect(wrapper.find('#sync-error').text()).toContain('账号或密码');
    expect(getSyncState().configured).toBe(false);
  });

  it('logout clears the session and resets the status line', async () => {
    mockWebDavFetch();
    await wrapper.find('#btn-sync-settings').trigger('click');
    await flushPromises();
    await wrapper.find('#field-sync-provider button[data-value="webdav"]').trigger('click');
    await wrapper.find('#field-sync-url').setValue('https://dav.example.com/f.json');
    await wrapper.find('#field-sync-identity').setValue('user');
    await wrapper.find('#field-sync-password').setValue('pass');
    await wrapper.find('#btn-sync-login').trigger('click');
    await flushPromises();
    expect(getSyncState().configured).toBe(true);

    await wrapper.find('#btn-sync-settings').trigger('click');
    await flushPromises();
    expect(wrapper.find('#sync-current').exists()).toBe(true);
    await wrapper.find('#btn-sync-logout').trigger('click');
    await flushPromises();
    expect(getSyncState().configured).toBe(false);
    expect(wrapper.find('#sync-status').text()).toContain('未配置同步');
  });
});

describe('backup modal (browser mode)', () => {
  it('opens and shows the empty state when no backups exist', async () => {
    ui.openBackupModal();
    await flushPromises();
    expect(wrapper.find('#backup-modal-title').exists()).toBe(true);
    expect(wrapper.find('#backup-empty').exists()).toBe(true);
    expect(wrapper.find('#btn-backup-now').exists()).toBe(true);
  });

  it('close button hides the modal', async () => {
    ui.openBackupModal();
    await flushPromises();
    await wrapper.find('#btn-close-backup').trigger('click');
    await flushPromises();
    expect(wrapper.find('#backup-backdrop').isVisible()).toBe(false);
    expect(ui.state.backupModalOpen).toBe(false);
  });
});

describe('sync error visibility (错误诚实)', () => {
  it('background sync failures are shown in the modal', async () => {
    mockWebDavFetch();
    await wrapper.find('#btn-sync-settings').trigger('click');
    await flushPromises();
    await wrapper.find('#field-sync-provider button[data-value="webdav"]').trigger('click');
    await wrapper.find('#field-sync-url').setValue('https://dav.example.com/f.json');
    await wrapper.find('#field-sync-identity').setValue('user');
    await wrapper.find('#field-sync-password').setValue('pass');
    await wrapper.find('#btn-sync-login').trigger('click');
    await flushPromises();
    expect(getSyncState().configured).toBe(true);

    // Next sync cycle fails on the network.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      })
    );
    await wrapper.find('#btn-sync-settings').trigger('click');
    await flushPromises();
    await wrapper.find('#btn-sync-now').trigger('click');
    await flushPromises();
    expect(wrapper.find('#sync-last-error').exists()).toBe(true);
    expect(wrapper.find('#sync-last-error').text()).toContain('无法连接');
    // the side status line carries the reason as a tooltip
    expect(wrapper.find('#sync-status').attributes('title')).toContain('无法连接');
  });
});
