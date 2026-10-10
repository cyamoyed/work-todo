/* Unit tests — update checks: GitHub fetch mapping, throttle, external open. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  checkForUpdates,
  getAppVersion,
  shouldAutoCheck,
  markChecked,
  openExternal,
  openDownload,
  LATEST_RELEASE_URL,
} from '../../src/lib/update.js';
import { UPDATE_KEY, UPDATE_AUTO_CHECK_MS } from '../../src/constants.js';

const RELEASE = {
  tag_name: 'v9.9.9',
  body: '修复若干问题',
  html_url: 'https://github.com/cyamoyed/workTodo/releases/tag/v9.9.9',
  published_at: '2026-10-01T00:00:00Z',
  assets: [
    {
      name: 'WorkTodo_9.9.9_x64-setup.exe',
      browser_download_url:
        'https://github.com/cyamoyed/workTodo/releases/download/v9.9.9/WorkTodo_9.9.9_x64-setup.exe',
    },
    {
      name: 'WorkTodo_9.9.9_x64_en-US.msi',
      browser_download_url:
        'https://github.com/cyamoyed/workTodo/releases/download/v9.9.9/WorkTodo_9.9.9_x64_en-US.msi',
    },
  ],
};

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

let savedWindow;

beforeEach(() => {
  savedWindow = globalThis.window;
  localStorage.clear();
});

afterEach(() => {
  globalThis.window = savedWindow;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('checkForUpdates', () => {
  it('reports an available update with the platform installer', async () => {
    const fetch = vi.fn(async () => jsonResponse(200, RELEASE));
    const res = await checkForUpdates({ fetch, platform: 'win', currentVersion: '0.4.0' });
    expect(fetch.mock.calls[0][0]).toBe(LATEST_RELEASE_URL);
    expect(res.status).toBe('available');
    expect(res.latest.version).toBe('9.9.9');
    expect(res.latest.notes).toBe('修复若干问题');
    expect(res.latest.downloadUrl).toContain('-setup.exe');
  });

  it('reports up-to-date on the same or newer local version', async () => {
    const fetch = vi.fn(async () => jsonResponse(200, RELEASE));
    const same = await checkForUpdates({ fetch, platform: 'win', currentVersion: '9.9.9' });
    expect(same.status).toBe('up-to-date');
    const ahead = await checkForUpdates({ fetch, platform: 'win', currentVersion: '10.0.0' });
    expect(ahead.status).toBe('up-to-date');
  });

  it('reports no-release on 404 (repo has no published releases)', async () => {
    const fetch = vi.fn(async () => jsonResponse(404, {}));
    const res = await checkForUpdates({ fetch, currentVersion: '0.4.0' });
    expect(res.status).toBe('no-release');
  });

  it('maps rate limiting and network failures to error', async () => {
    const limited = await checkForUpdates({
      fetch: vi.fn(async () => jsonResponse(403, {})),
      currentVersion: '0.4.0',
    });
    expect(limited).toEqual({ status: 'error', reason: 'rate-limited' });

    const down = await checkForUpdates({
      fetch: vi.fn(async () => {
        throw new Error('offline');
      }),
      currentVersion: '0.4.0',
    });
    expect(down).toEqual({ status: 'error', reason: 'network' });
  });

  it('rejects unparseable release payloads', async () => {
    const res = await checkForUpdates({
      fetch: vi.fn(async () => jsonResponse(200, { tag_name: 'nightly' })),
      currentVersion: '0.4.0',
    });
    expect(res).toEqual({ status: 'error', reason: 'bad-payload' });
  });

  it('uses the running app version by default', () => {
    expect(getAppVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe('update-check throttle', () => {
  it('any completed attempt stamps the throttle clock', async () => {
    expect(shouldAutoCheck()).toBe(true);
    await checkForUpdates({ fetch: vi.fn(async () => jsonResponse(200, RELEASE)) });
    expect(shouldAutoCheck()).toBe(false);
  });

  it('re-allows after UPDATE_AUTO_CHECK_MS', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-10T10:00:00Z'));
    markChecked();
    expect(shouldAutoCheck()).toBe(false);
    vi.setSystemTime(new Date(Date.now() + UPDATE_AUTO_CHECK_MS + 1000));
    expect(shouldAutoCheck()).toBe(true);
  });

  it('tolerates a corrupt throttle record', () => {
    localStorage.setItem(UPDATE_KEY, 'not-json');
    expect(shouldAutoCheck()).toBe(true);
  });
});

describe('openExternal / openDownload', () => {
  it('opens a new tab in the browser build', async () => {
    const open = vi.fn();
    globalThis.window = { open };
    await expect(openExternal('https://github.com/x')).resolves.toBe(true);
    expect(open).toHaveBeenCalledWith('https://github.com/x', '_blank');
  });

  it('routes through the Tauri opener plugin on desktop', async () => {
    const invoke = vi.fn().mockResolvedValue(null);
    globalThis.window = { __TAURI_INTERNALS__: { invoke }, open: vi.fn() };
    await expect(openExternal('https://github.com/x')).resolves.toBe(true);
    expect(invoke).toHaveBeenCalledWith('plugin:opener|open_url', { url: 'https://github.com/x' });
  });

  it('falls back to a new tab when the opener is denied', async () => {
    const open = vi.fn();
    const invoke = vi.fn().mockRejectedValue(new Error('forbidden'));
    globalThis.window = { __TAURI_INTERNALS__: { invoke }, open };
    await expect(openExternal('https://github.com/x')).resolves.toBe(true);
    expect(open).toHaveBeenCalledWith('https://github.com/x', '_blank');
  });

  it('ignores empty urls', async () => {
    await expect(openExternal('')).resolves.toBe(false);
    await expect(openExternal(null)).resolves.toBe(false);
  });

  it('openDownload prefers the installer, then the release page', async () => {
    const open = vi.fn();
    globalThis.window = { open };
    await openDownload({ downloadUrl: 'https://github.com/x-setup.exe', url: 'https://github.com/tag' });
    expect(open).toHaveBeenLastCalledWith('https://github.com/x-setup.exe', '_blank');
    await openDownload({ downloadUrl: '', url: 'https://github.com/tag' });
    expect(open).toHaveBeenLastCalledWith('https://github.com/tag', '_blank');
  });
});
