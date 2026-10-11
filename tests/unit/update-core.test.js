/* Unit tests — pure update helpers: version parse/compare, release parsing. */
import { describe, it, expect } from 'vitest';
import {
  parseVersion,
  compareVersions,
  isNewerVersion,
  detectPlatform,
  pickDownloadUrl,
  normalizeRelease,
  trimReleaseNotes,
  parseAtomFeed,
  pickNewestTag,
  createDownloadProgress,
  formatBytes,
} from '../../src/core/update.js';

describe('parseVersion', () => {
  it('parses plain and v-prefixed triples', () => {
    expect(parseVersion('0.4.0')).toEqual([0, 4, 0]);
    expect(parseVersion('v0.5.1')).toEqual([0, 5, 1]);
    expect(parseVersion('  V1.2.3  ')).toEqual([1, 2, 3]);
  });

  it('pads short versions with zeros', () => {
    expect(parseVersion('1.2')).toEqual([1, 2, 0]);
    expect(parseVersion('7')).toEqual([7, 0, 0]);
  });

  it('ignores prerelease/build suffixes', () => {
    expect(parseVersion('v1.2.3-beta.1')).toEqual([1, 2, 3]);
    expect(parseVersion('0.4.0+build.5')).toEqual([0, 4, 0]);
  });

  it('returns null for unparseable input', () => {
    expect(parseVersion('nightly')).toBe(null);
    expect(parseVersion('')).toBe(null);
    expect(parseVersion(null)).toBe(null);
    expect(parseVersion(42)).toBe(null);
  });
});

describe('compareVersions / isNewerVersion', () => {
  it('compares numerically (0.10.0 beats 0.9.0)', () => {
    expect(compareVersions('0.9.0', '0.10.0')).toBe(-1);
    expect(compareVersions('0.10.0', '0.9.0')).toBe(1);
    expect(compareVersions('v0.10.0', '0.10.0')).toBe(0);
    expect(compareVersions('0.4', '0.4.0')).toBe(0);
  });

  it('isNewerVersion is strict', () => {
    expect(isNewerVersion('0.5.0', '0.4.0')).toBe(true);
    expect(isNewerVersion('0.4.0', '0.4.0')).toBe(false);
    expect(isNewerVersion('0.3.9', '0.4.0')).toBe(false);
    expect(isNewerVersion('garbage', '0.4.0')).toBe(false);
  });
});

describe('detectPlatform', () => {
  it('maps common user agents', () => {
    expect(detectPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('win');
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('mac');
    expect(detectPlatform('Mozilla/5.0 (X11; Linux x86_64)')).toBe('linux');
    expect(detectPlatform('')).toBe('other');
    expect(detectPlatform(undefined)).toBe('other');
  });
});

describe('pickDownloadUrl', () => {
  const assets = [
    { name: 'work-todo_0.5.0_x64_en-US.msi', url: 'https://example.com/x.msi' },
    { name: 'work-todo_0.5.0_x64-setup.exe', url: 'https://example.com/x-setup.exe' },
    { name: 'work-todo_0.5.0_aarch64.dmg', url: 'https://example.com/x.dmg' },
    { name: 'work-todo_0.5.0_amd64.AppImage', url: 'https://example.com/x.AppImage' },
  ];

  it('windows prefers the NSIS setup exe over the MSI', () => {
    expect(pickDownloadUrl(assets, 'win')).toBe('https://example.com/x-setup.exe');
  });

  it('windows falls back to the MSI when no exe is attached', () => {
    const msiOnly = assets.filter((a) => a.name.endsWith('.msi'));
    expect(pickDownloadUrl(msiOnly, 'win')).toBe('https://example.com/x.msi');
  });

  it('mac picks the dmg, linux the AppImage', () => {
    expect(pickDownloadUrl(assets, 'mac')).toBe('https://example.com/x.dmg');
    expect(pickDownloadUrl(assets, 'linux')).toBe('https://example.com/x.AppImage');
  });

  it('returns null when nothing matches', () => {
    expect(pickDownloadUrl([], 'win')).toBe(null);
    expect(pickDownloadUrl(assets, 'other')).toBe(null);
    expect(pickDownloadUrl([{ name: 'notes.txt', url: 'u' }], 'win')).toBe(null);
  });
});

describe('normalizeRelease', () => {
  const raw = {
    tag_name: 'v0.5.0',
    body: '更新内容',
    html_url: 'https://github.com/cyamoyed/work-todo/releases/tag/v0.5.0',
    published_at: '2026-10-01T00:00:00Z',
    assets: [
      {
        name: 'work-todo_0.5.0_x64-setup.exe',
        browser_download_url: 'https://github.com/x/work-todo_0.5.0_x64-setup.exe',
      },
    ],
  };

  it('maps the GitHub payload to the app shape', () => {
    const r = normalizeRelease(raw, 'win');
    expect(r.version).toBe('0.5.0');
    expect(r.notes).toBe('更新内容');
    expect(r.url).toBe('https://github.com/cyamoyed/work-todo/releases/tag/v0.5.0');
    expect(r.publishedAt).toBe('2026-10-01T00:00:00Z');
    expect(r.downloadUrl).toBe('https://github.com/x/work-todo_0.5.0_x64-setup.exe');
  });

  it('falls back to the release page when no installer matches', () => {
    const r = normalizeRelease(raw, 'other');
    expect(r.downloadUrl).toBe('https://github.com/cyamoyed/work-todo/releases/tag/v0.5.0');
  });

  it('returns null without a parseable tag', () => {
    expect(normalizeRelease(null, 'win')).toBe(null);
    expect(normalizeRelease({ tag_name: 'nightly' }, 'win')).toBe(null);
  });

  it('trims the CI-appended download-guidance tail from notes', () => {
    const r = normalizeRelease(
      { ...raw, body: '新功能\n- 某功能\n\n---\n下载：Windows 选 `.msi`；macOS 选 `.dmg`。' },
      'win'
    );
    expect(r.notes).toBe('新功能\n- 某功能');
  });
});

describe('trimReleaseNotes', () => {
  it('keeps bodies without the guidance tail untouched', () => {
    expect(trimReleaseNotes('修复若干问题')).toBe('修复若干问题');
    expect(trimReleaseNotes('---\n普通分隔线，无下载指引')).toBe('---\n普通分隔线，无下载指引');
    expect(trimReleaseNotes('')).toBe('');
    expect(trimReleaseNotes(null)).toBe('');
  });
});

describe('parseAtomFeed', () => {
  const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Releases · cyamoyed/work-todo</title>
  <entry>
    <id>tag:github.com,2008:repo/123456/v9.9.9</id>
    <updated>2026-10-01T08:00:00Z</updated>
    <published>2026-10-01T08:00:00Z</published>
    <link rel="alternate" type="text/html" href="https://github.com/cyamoyed/work-todo/releases/tag/v9.9.9"/>
    <title>work-todo v9.9.9</title>
    <content type="html">&lt;p&gt;新功能&lt;/p&gt;&lt;ul&gt;&lt;li&gt;同步&amp;备份&lt;/li&gt;&lt;/ul&gt;&lt;hr&gt;下载：Windows 选 setup</content>
  </entry>
  <entry>
    <id>tag:github.com,2008:repo/123456/v9.8.0</id>
    <title>work-todo v9.8.0</title>
  </entry>
</feed>`;

  it('maps the first entry to the update shape', () => {
    const r = parseAtomFeed(FEED);
    expect(r.version).toBe('9.9.9');
    expect(r.url).toBe('https://github.com/cyamoyed/work-todo/releases/tag/v9.9.9');
    expect(r.publishedAt).toBe('2026-10-01T08:00:00Z');
  });

  it('unescapes entities, strips html, and trims the download tail', () => {
    const r = parseAtomFeed(FEED);
    expect(r.notes).toContain('新功能');
    expect(r.notes).toContain('同步&备份');
    expect(r.notes).not.toContain('下载：');
    expect(r.notes).not.toContain('<');
  });

  it('returns null for feeds without a parseable entry', () => {
    expect(parseAtomFeed('<feed></feed>')).toBe(null);
    expect(parseAtomFeed('<entry><id>tag:github.com,2008:repo/1/nightly</id></entry>')).toBe(null);
    expect(parseAtomFeed('')).toBe(null);
    expect(parseAtomFeed(null)).toBe(null);
  });
});

describe('createDownloadProgress', () => {
  it('accumulates chunks against the announced content length, capping at 99', () => {
    const track = createDownloadProgress();
    expect(track({ event: 'Started', data: { contentLength: 1000 } })).toEqual({
      finished: false,
      received: 0,
      total: 1000,
      percent: 0,
    });
    expect(track({ event: 'Progress', data: { chunkLength: 400 } }).percent).toBe(40);
    expect(track({ event: 'Progress', data: { chunkLength: 599 } }).percent).toBe(99);
    expect(track({ event: 'Progress', data: { chunkLength: 500 } }).percent).toBe(99); // capped pre-finish
    expect(track({ event: 'Finished' })).toEqual({ finished: true, received: 1499, total: 1000, percent: 100 });
  });

  it('reports null percent while the total size is unknown', () => {
    const track = createDownloadProgress();
    expect(track({ event: 'Started', data: {} }).percent).toBe(null);
    const p = track({ event: 'Progress', data: { chunkLength: 2048 } });
    expect(p.percent).toBe(null);
    expect(p.received).toBe(2048);
    expect(track({ event: 'Finished' }).percent).toBe(100);
  });

  it('ignores malformed events', () => {
    const track = createDownloadProgress();
    expect(track(null).percent).toBe(null);
    expect(track({ event: 'Progress', data: { chunkLength: -5 } }).received).toBe(0);
    expect(track('nonsense').received).toBe(0);
  });
});

describe('formatBytes', () => {
  it('formats MB and KB ranges', () => {
    expect(formatBytes(12 * 1024 * 1024 + 300 * 1024)).toBe('12.3 MB');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(1)).toBe('1 KB');
    expect(formatBytes(0)).toBe('0 MB');
    expect(formatBytes('x')).toBe('0 MB');
  });
});

describe('pickNewestTag', () => {
  it('picks the newest plain version from a jsDelivr payload', () => {
    expect(
      pickNewestTag({
        versions: [{ version: '0.9.0' }, { version: 'v0.10.4' }, { version: '0.10.3' }],
      })
    ).toBe('0.10.4');
  });

  it('skips prerelease tags, unparseable entries and malformed payloads', () => {
    expect(
      pickNewestTag({
        versions: [
          { version: '0.11.0-beta.1' },
          { version: '0.11.0-rc.2' },
          { version: 'nightly' },
          { version: '' },
          null,
          { version: '0.10.4' },
        ],
      })
    ).toBe('0.10.4');
    expect(pickNewestTag({ versions: [{ version: '1.2.3-rc.1' }] })).toBe(null);
    expect(pickNewestTag(null)).toBe(null);
    expect(pickNewestTag({})).toBe(null);
    expect(pickNewestTag({ versions: 'nope' })).toBe(null);
  });
});
