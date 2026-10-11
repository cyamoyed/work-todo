/* Component tests — version line, update dialog, check feedback toasts. */
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
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
let router;

beforeEach(async () => {
  resetState();
  ({ wrapper, ui, router } = await mountApp());
  // update entry points moved from the side footer to the /settings page
  await router.push('/settings');
  await flushPromises();
});

afterEach(async () => {
  await cleanup();
  vi.unstubAllGlobals();
});

describe('settings update entries', () => {
  it('shows the current version and a check button', () => {
    const ver = wrapper.find('#app-version');
    expect(ver.exists()).toBe(true);
    expect(ver.text()).toBe(`v${updateState.currentVersion}`);
    expect(ver.classes()).not.toContain('has-update');
    const btn = wrapper.find('#btn-check-update');
    expect(btn.exists()).toBe(true);
    expect(btn.text()).toBe('检查更新');
    expect(wrapper.find('#btn-settings-mobile').exists()).toBe(true);
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

  it('复制链接 copies the download URL and keeps the dialog open', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    mockFetch(200, NEWER);
    await wrapper.find('#btn-check-update').trigger('click');
    await flushPromises();
    await wrapper.find('#btn-copy-link').trigger('click');
    await flushPromises();
    const url = updateState.latest.downloadUrl || updateState.latest.url;
    expect(writeText).toHaveBeenCalledWith(url); // platform-dependent: installer or release page
    expect(url).toContain('github.com/cyamoyed/work-todo');
    expect(wrapper.find('#toast').text()).toContain('已复制下载链接');
    expect(wrapper.find('#update-modal').isVisible()).toBe(true);
  });

  it('复制失败 falls back to a failure toast', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    });
    document.execCommand = () => false; // legacy fallback also fails
    mockFetch(200, NEWER);
    await wrapper.find('#btn-check-update').trigger('click');
    await flushPromises();
    await wrapper.find('#btn-copy-link').trigger('click');
    await flushPromises();
    expect(wrapper.find('#toast').text()).toContain('复制失败');
  });

  it('shows the web refresh hint outside the desktop build', async () => {
    mockFetch(200, NEWER);
    await wrapper.find('#btn-check-update').trigger('click');
    await flushPromises();
    const hint = wrapper.find('.update-hint');
    expect(hint.exists()).toBe(true); // no window.__TAURI__ in the component env
    expect(hint.text()).toContain('刷新页面');
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
    expect(wrapper.find('#toast').text()).toContain('网络异常');
  });

  it('toasts a rate-limit hint when GitHub throttles both the API and the atom feed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 403, json: async () => ({}) })));
    await wrapper.find('#btn-check-update').trigger('click');
    await flushPromises();
    expect(wrapper.find('#toast').text()).toContain('GitHub 请求受限');
    expect(updateState.reason).toBe('rate-limited');
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

/* Desktop in-app install flow — window.__TAURI_INTERNALS__ stubbed before
 * mount so UpdateModal's isTauri() picks the desktop branch. The channel
 * events (Started/Progress/Finished) are fired through transformCallback
 * handlers, mirroring how plugin:updater streams download progress. */
describe('desktop in-app install (plugin:updater)', () => {
  const channelHandlers = new Map();
  /* 默认实现必须返回 Promise：应用挂载发生在文件级 beforeEach（早于本 describe
   * 的 beforeEach 重赋 invokeMock），挂载期 TitleBarControls 会调用
   * plugin:window|is_maximized——空 vi.fn() 返回 undefined 会以 unhandled
   * rejection 形式炸掉整个测试文件。 */
  let invokeMock = vi.fn(async () => null);
  let channelSeq = 0;

  beforeAll(() => {
    window.__TAURI_INTERNALS__ = {
      invoke: (...args) => invokeMock(...args),
      transformCallback: (fn) => {
        channelSeq += 1;
        channelHandlers.set(channelSeq, fn);
        return channelSeq;
      },
    };
  });
  afterAll(() => {
    delete window.__TAURI_INTERNALS__;
  });
  beforeEach(() => {
    invokeMock = vi.fn(async () => null);
    channelHandlers.clear();
  });

  const CHECK_OK = { rid: 7, available: true, version: '9.9.9', body: '更新内容摘要' };

  async function openModalWithNative(checkResult = CHECK_OK) {
    // Only intercept the modal-open check; tests may install their own
    // persistent impl for download_and_install / restart beforehand.
    invokeMock.mockImplementationOnce(async () => checkResult);
    mockFetch(200, NEWER);
    await wrapper.find('#btn-check-update').trigger('click');
    await flushPromises();
  }

  it('swaps the primary action to 立即更新 once the plugin confirms an update', async () => {
    await openModalWithNative();
    expect(invokeMock).toHaveBeenCalledWith('plugin:updater|check', {});
    const btn = wrapper.find('#btn-install-update');
    expect(btn.exists()).toBe(true);
    expect(btn.text()).toBe('立即更新');
    expect(wrapper.find('#btn-open-download').exists()).toBe(false);
    expect(updateState.native.installable).toBe(true);
  });

  it('keeps the browser download primary when the plugin has no installable update', async () => {
    await openModalWithNative({ available: false });
    expect(wrapper.find('#btn-install-update').exists()).toBe(false);
    expect(wrapper.find('#btn-open-download').exists()).toBe(true);
    expect(updateState.native.installable).toBe(false);
  });

  it('downloads with progress, installs, then offers 重启应用', async () => {
    let resolveInstall = null;
    let fire = null;
    invokeMock.mockImplementation((cmd, args) => {
      if (cmd === 'plugin:updater|check') return Promise.resolve(CHECK_OK);
      if (cmd === 'plugin:updater|download_and_install') {
        const id = Number(String(args.onEvent).split(':')[1]);
        fire = (e) => channelHandlers.get(id)(e);
        expect(String(args.onEvent)).toMatch(/^__CHANNEL__:\d+$/);
        expect(args.rid).toBe(7);
        return new Promise((resolve) => {
          resolveInstall = () => resolve(null);
        });
      }
      return Promise.resolve(null);
    });
    await openModalWithNative();
    await wrapper.find('#btn-install-update').trigger('click');
    await flushPromises();

    fire({ event: 'Started', data: { contentLength: 1000 } });
    fire({ event: 'Progress', data: { chunkLength: 500 } });
    await flushPromises();
    expect(wrapper.find('.update-install-status').text()).toContain('下载中 50%');
    expect(wrapper.find('.update-progress-fill').attributes('style')).toContain('width: 50%');
    expect(wrapper.find('#btn-install-update').attributes('disabled')).toBeDefined();

    fire({ event: 'Finished' });
    await flushPromises();
    expect(wrapper.find('.update-install-status').text()).toContain('正在安装');

    resolveInstall();
    await flushPromises();
    expect(wrapper.find('#btn-relaunch').exists()).toBe(true);
    expect(wrapper.find('.update-install-status').text()).toContain('重启后生效');

    await wrapper.find('#btn-relaunch').trigger('click');
    await flushPromises();
    expect(invokeMock).toHaveBeenCalledWith('plugin:process|restart', { exitCode: 0 });
  });

  it('falls back to the browser download when the install fails', async () => {
    invokeMock.mockImplementation((cmd) => {
      if (cmd === 'plugin:updater|check') return Promise.resolve(CHECK_OK);
      if (cmd === 'plugin:updater|download_and_install') return Promise.reject(new Error('signature'));
      return Promise.resolve(null);
    });
    await openModalWithNative();
    await wrapper.find('#btn-install-update').trigger('click');
    await flushPromises();
    expect(wrapper.find('.update-install-error').text()).toContain('应用内更新失败');
    expect(wrapper.find('#btn-open-download').exists()).toBe(true); // fallback primary is back
    expect(wrapper.find('#btn-install-update').exists()).toBe(false);
  });
});
