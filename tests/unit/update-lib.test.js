/* Unit tests — update checks: GitHub fetch mapping, throttle/backoff, ETag, atom fallback, external open. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  checkForUpdates,
  getAppVersion,
  shouldAutoCheck,
  markChecked,
  getSeenVersion,
  markUpdateSeen,
  getNotifiedVersion,
  markUpdateNotified,
  openExternal,
  openDownload,
  LATEST_RELEASE_URL,
  ATOM_FEED_URL,
  JSDIVLR_VERSIONS_URL,
  RELEASES_PAGE_URL,
} from '../../src/lib/update.js';
import {
  UPDATE_KEY,
  UPDATE_AUTO_CHECK_MS,
  UPDATE_RETRY_MS,
  UPDATE_CHECK_TIMEOUT_MS,
} from '../../src/constants.js';

const RELEASE = {
  tag_name: 'v9.9.9',
  body: '修复若干问题',
  html_url: 'https://github.com/cyamoyed/work-todo/releases/tag/v9.9.9',
  published_at: '2026-10-01T00:00:00Z',
  assets: [
    {
      name: 'work-todo_9.9.9_x64-setup.exe',
      browser_download_url:
        'https://github.com/cyamoyed/work-todo/releases/download/v9.9.9/work-todo_9.9.9_x64-setup.exe',
    },
    {
      name: 'work-todo_9.9.9_x64_en-US.msi',
      browser_download_url:
        'https://github.com/cyamoyed/work-todo/releases/download/v9.9.9/work-todo_9.9.9_x64_en-US.msi',
    },
  ],
};

const ATOM_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>tag:github.com,2008:repo/123456/v9.9.9</id>
    <updated>2026-10-01T08:00:00Z</updated>
    <link rel="alternate" type="text/html" href="https://github.com/cyamoyed/work-todo/releases/tag/v9.9.9"/>
    <content type="html">&lt;p&gt;修复若干问题&lt;/p&gt;</content>
  </entry>
</feed>`;

function jsonResponse(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: { get: (name) => headers[name.toLowerCase()] || null },
  };
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
    // 403/429 on the API and every mirror → rate-limited.
    const limited = await checkForUpdates({
      fetch: vi.fn(async () => jsonResponse(403, {})),
      currentVersion: '0.4.0',
    });
    expect(limited).toEqual({ status: 'error', reason: 'rate-limited' });

    const throttled = await checkForUpdates({
      fetch: vi.fn(async () => jsonResponse(429, {})),
      currentVersion: '0.4.0',
    });
    expect(throttled).toEqual({ status: 'error', reason: 'rate-limited' });

    const down = await checkForUpdates({
      fetch: vi.fn(async () => {
        throw new Error('offline');
      }),
      currentVersion: '0.4.0',
    });
    expect(down).toEqual({ status: 'error', reason: 'network' });
  });

  it('falls back to the releases atom feed when the API rate-limits', async () => {
    const fetch = vi.fn((url) => {
      if (url === LATEST_RELEASE_URL) return jsonResponse(403, {});
      return Promise.resolve({ ok: true, status: 200, text: async () => ATOM_FEED });
    });
    const res = await checkForUpdates({ fetch, currentVersion: '0.4.0' });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][0]).toBe(ATOM_FEED_URL);
    expect(res.status).toBe('available');
    expect(res.latest.version).toBe('9.9.9');
    expect(res.latest.downloadUrl).toContain('/releases/tag/v9.9.9');
  });

  it('falls back to the jsDelivr tag list when the atom feed is unreachable too', async () => {
    const fetch = vi.fn((url) => {
      if (url === LATEST_RELEASE_URL) return jsonResponse(403, {});
      if (url === ATOM_FEED_URL) return jsonResponse(403, {});
      return jsonResponse(200, {
        versions: [{ version: '9.10.0-beta.1' }, { version: '9.9.9' }, { version: '0.1.0' }],
      });
    });
    const res = await checkForUpdates({ fetch, currentVersion: '0.4.0' });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch.mock.calls[2][0]).toBe(JSDIVLR_VERSIONS_URL);
    // The prerelease tag never wins; the download target stays on the official page.
    expect(res.status).toBe('available');
    expect(res.latest.version).toBe('9.9.9');
    expect(res.latest.url).toBe(RELEASES_PAGE_URL);
    expect(res.latest.downloadUrl).toBe(RELEASES_PAGE_URL);
  });

  it('treats 429 like 403 and still tries the mirror chain', async () => {
    const fetch = vi.fn((url) => {
      if (url === LATEST_RELEASE_URL) return jsonResponse(429, {});
      if (url === ATOM_FEED_URL) return jsonResponse(403, {});
      return jsonResponse(200, { versions: [{ version: '9.9.9' }] });
    });
    const res = await checkForUpdates({ fetch, currentVersion: '0.4.0' });
    expect(fetch).toHaveBeenNthCalledWith(3, JSDIVLR_VERSIONS_URL, expect.anything());
    expect(res.status).toBe('available');
    expect(res.latest.version).toBe('9.9.9');
  });

  it('replays the cached release flagged stale when every source is down', async () => {
    await checkForUpdates({
      fetch: vi.fn(async () => jsonResponse(200, RELEASE, { etag: '"x"' })),
      platform: 'win',
      currentVersion: '0.4.0',
    });
    const allDown = vi.fn(async () => jsonResponse(403, {}));
    const res = await checkForUpdates({ fetch: allDown, currentVersion: '0.4.0' });
    expect(res.status).toBe('available');
    expect(res.stale).toBe(true);
    expect(res.reason).toBe('rate-limited');
    expect(res.latest.version).toBe('9.9.9');

    const same = await checkForUpdates({ fetch: allDown, currentVersion: '9.9.9' });
    expect(same.status).toBe('up-to-date');
    expect(same.stale).toBe(true);
  });

  it('aborts a hung primary request after the timeout and degrades to the mirrors', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn((url, opts = {}) => {
      if (url !== LATEST_RELEASE_URL) return Promise.reject(new Error('down'));
      return new Promise((_, reject) => {
        if (opts.signal) opts.signal.addEventListener('abort', () => reject(new Error('aborted')));
      });
    });
    const pending = checkForUpdates({ fetch, currentVersion: '0.4.0' });
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_TIMEOUT_MS + 1);
    expect(await pending).toEqual({ status: 'error', reason: 'network' });
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

describe('etag revalidation', () => {
  it('caches the release payload with its etag and revalidates with If-None-Match', async () => {
    const first = vi.fn(async () => jsonResponse(200, RELEASE, { etag: '"abc"' }));
    const res1 = await checkForUpdates({ fetch: first, platform: 'win', currentVersion: '0.4.0' });
    expect(res1.status).toBe('available');
    expect(first.mock.calls[0][1].headers['If-None-Match']).toBeUndefined();

    const second = vi.fn(async () => jsonResponse(304, null));
    const res2 = await checkForUpdates({ fetch: second, platform: 'win', currentVersion: '0.4.0' });
    expect(second.mock.calls[0][1].headers['If-None-Match']).toBe('"abc"');
    expect(res2.status).toBe('available');
    expect(res2.latest).toEqual(res1.latest);
  });

  it('a fresh 200 answer replaces the cache and its etag', async () => {
    await checkForUpdates({
      fetch: vi.fn(async () => jsonResponse(200, RELEASE, { etag: '"old"' })),
      platform: 'win',
      currentVersion: '0.4.0',
    });
    const next = vi.fn(async () => jsonResponse(200, { ...RELEASE, tag_name: 'v9.9.10' }, { etag: '"new"' }));
    const res = await checkForUpdates({ fetch: next, platform: 'win', currentVersion: '0.4.0' });
    expect(res.latest.version).toBe('9.9.10');
    const replay = vi.fn(async () => jsonResponse(304, null));
    await checkForUpdates({ fetch: replay, platform: 'win', currentVersion: '0.4.0' });
    expect(replay.mock.calls[0][1].headers['If-None-Match']).toBe('"new"');
  });

  it('a 304 without a cached payload degrades to an http error', async () => {
    const res = await checkForUpdates({
      fetch: vi.fn(async () => jsonResponse(304, null)),
      currentVersion: '0.4.0',
    });
    expect(res).toEqual({ status: 'error', reason: 'http' });
  });
});

describe('update-check throttle and retry backoff', () => {
  it('a successful check stamps the auto-check clock', async () => {
    expect(shouldAutoCheck()).toBe(true);
    await checkForUpdates({ fetch: vi.fn(async () => jsonResponse(200, RELEASE)) });
    expect(shouldAutoCheck()).toBe(false);
  });

  it('a failed check does not burn the window — retry is allowed after UPDATE_RETRY_MS', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-10T10:00:00Z'));
    const fail = await checkForUpdates({
      fetch: vi.fn(async () => {
        throw new Error('offline');
      }),
      currentVersion: '0.4.0',
    });
    expect(fail.reason).toBe('network');
    vi.setSystemTime(new Date(Date.now() + UPDATE_RETRY_MS - 1000));
    expect(shouldAutoCheck()).toBe(false);
    vi.setSystemTime(new Date(Date.now() + 2000));
    expect(shouldAutoCheck()).toBe(true);
  });

  it('a successful retry re-opens the full auto-check window', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-10T10:00:00Z'));
    await checkForUpdates({
      fetch: vi.fn(async () => {
        throw new Error('offline');
      }),
    });
    vi.setSystemTime(new Date(Date.now() + UPDATE_RETRY_MS + 1000));
    expect(shouldAutoCheck()).toBe(true);
    await checkForUpdates({ fetch: vi.fn(async () => jsonResponse(200, RELEASE)) });
    vi.setSystemTime(new Date(Date.now() + UPDATE_AUTO_CHECK_MS - 1000));
    expect(shouldAutoCheck()).toBe(false);
    vi.setSystemTime(new Date(Date.now() + 2000));
    expect(shouldAutoCheck()).toBe(true);
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

describe('update-prompt acknowledgement stamps (toast 去重 / 小红点)', () => {
  it('markUpdateSeen acks a version and implies notified', () => {
    expect(getSeenVersion()).toBe('');
    expect(getNotifiedVersion()).toBe('');
    markUpdateSeen('9.9.9');
    expect(getSeenVersion()).toBe('9.9.9');
    expect(getNotifiedVersion()).toBe('9.9.9');
  });

  it('markUpdateNotified records the toast without acking the dot', () => {
    markUpdateNotified('9.9.9');
    expect(getNotifiedVersion()).toBe('9.9.9');
    expect(getSeenVersion()).toBe('');
  });

  it('stamps persist in the update record', () => {
    markUpdateSeen('1.2.3');
    expect(JSON.parse(localStorage.getItem(UPDATE_KEY)).seenVersion).toBe('1.2.3');
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
