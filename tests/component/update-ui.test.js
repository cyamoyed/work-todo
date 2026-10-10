/* Component tests — version line, update dialog, check feedback toasts. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { mountApp, resetState, cleanup } from './helpers/mountApp.js';
import { useUpdateCheck } from '../../src/composables/useUpdateCheck.js';
import { updateState } from '../../src/store/update.js';

const NEWER = {
  tag_name: 'v9.9.9',
  body: '更新内容摘要',
  html_url: 'https://github.com/cyamoyed/work-todo/releases/tag/v9.9.9',
  published_at: '2026-10-01T00:00:00Z',
  assets: [
    {
      name: 'work-todo_9.9.9_x64-setup.exe',
      browser_download_url:
        'https://github.com/cyamoyed/work-todo/releases/download/v9.9.9/work-todo_9.9.9_x64-setup.exe',
    },
  ],
};

function mockFetch(status, body) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body }))
  );
}

let wrapper;
let ui;

beforeEach(async () => {
  resetState();
  ({ wrapper, ui } = await mountApp());
});

afterEach(async () => {
  await cleanup();
  vi.unstubAllGlobals();
});

describe('sidebar update entries', () => {
  it('shows the current version and a check button', () => {
    const ver = wrapper.find('#app-version');
    expect(ver.exists()).toBe(true);
    expect(ver.text()).toBe(`v${updateState.currentVersion}`);
    expect(ver.classes()).not.toContain('has-update');
    const btn = wrapper.find('#btn-check-update');
    expect(btn.exists()).toBe(true);
    expect(btn.text()).toBe('检查更新');
    expect(wrapper.find('#btn-check-update-mobile').exists()).toBe(true);
  });
});

describe('manual check', () => {
  it('opens the update dialog when a newer release exists', async () => {
    mockFetch(200, NEWER);
    await wrapper.find('#btn-check-update').trigger('click');
    await flushPromises();
    expect(wrapper.find('#update-modal').isVisible()).toBe(true);
    expect(wrapper.find('#update-modal-title').text()).toContain('发现新版本 v9.9.9');
    expect(wrapper.find('#update-meta').text()).toContain(`v${updateState.currentVersion}`);
    expect(wrapper.find('#update-notes').text()).toContain('更新内容摘要');
    const ver = wrapper.find('#app-version');
    expect(ver.classes()).toContain('has-update');
    expect(ver.text()).toContain('有新版 v9.9.9');
  });

  it('the version line reopens the dialog once an update is known', async () => {
    mockFetch(200, NEWER);
    await wrapper.find('#btn-check-update').trigger('click');
    await flushPromises();
    await wrapper.find('#btn-update-later').trigger('click');
    await flushPromises();
    expect(wrapper.find('#update-modal').isVisible()).toBe(false);
    await wrapper.find('#app-version').trigger('click');
    await flushPromises();
    expect(wrapper.find('#update-modal').isVisible()).toBe(true);
  });

  it('前往下载 opens the installer URL and closes the dialog', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    mockFetch(200, NEWER);
    await wrapper.find('#btn-check-update').trigger('click');
    await flushPromises();
    await wrapper.find('#btn-open-download').trigger('click');
    await flushPromises();
    expect(open).toHaveBeenCalledWith(expect.stringContaining('github.com/cyamoyed/work-todo'), '_blank');
    expect(wrapper.find('#update-modal').isVisible()).toBe(false);
  });

  it('toasts 已是最新版本 when the running version is current', async () => {
    mockFetch(200, { ...NEWER, tag_name: `v${updateState.currentVersion}`, assets: [] });
    await wrapper.find('#btn-check-update').trigger('click');
    await flushPromises();
    expect(wrapper.find('#update-modal').isVisible()).toBe(false);
    expect(wrapper.find('#toast').text()).toContain('已是最新版本');
    expect(wrapper.find('#app-version').classes()).not.toContain('has-update');
  });

  it('toasts feedback on empty releases and on network failure', async () => {
    mockFetch(404, {});
    await wrapper.find('#btn-check-update').trigger('click');
    await flushPromises();
    expect(wrapper.find('#toast').text()).toContain('暂无发布版本');

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      })
    );
    await wrapper.find('#btn-check-update').trigger('click');
    await flushPromises();
    expect(wrapper.find('#toast').text()).toContain('检查更新失败');
  });

  it('disables the button while checking', async () => {
    let releaseFetch;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise((resolve) => {
            releaseFetch = () => resolve({ ok: true, status: 200, json: async () => NEWER });
          })
      )
    );
    await wrapper.find('#btn-check-update').trigger('click');
    await flushPromises();
    expect(wrapper.find('#btn-check-update').attributes('disabled')).toBeDefined();
    expect(wrapper.find('#btn-check-update').text()).toBe('检查中…');
    releaseFetch();
    await flushPromises();
    expect(wrapper.find('#btn-check-update').attributes('disabled')).toBeUndefined();
    expect(wrapper.find('#btn-check-update').text()).toBe('检查更新');
  });
});

describe('startup auto check', () => {
  it('is silent when already current', async () => {
    mockFetch(200, { ...NEWER, tag_name: `v${updateState.currentVersion}`, assets: [] });
    await useUpdateCheck().autoCheck();
    await flushPromises();
    expect(wrapper.find('#toast').isVisible()).toBe(false);
    expect(updateState.status).toBe('up-to-date');
  });

  it('toasts 发现新版本 with a 查看 action that opens the dialog', async () => {
    mockFetch(200, NEWER);
    await useUpdateCheck().autoCheck();
    await flushPromises();
    const toast = wrapper.find('#toast');
    expect(toast.isVisible()).toBe(true);
    expect(toast.text()).toContain('发现新版本 v9.9.9');
    await toast.find('button').trigger('click');
    await flushPromises();
    expect(wrapper.find('#update-modal').isVisible()).toBe(true);
  });
});
