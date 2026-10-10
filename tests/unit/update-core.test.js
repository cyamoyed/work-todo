/* Unit tests — pure update helpers: version parse/compare, release parsing. */
import { describe, it, expect } from 'vitest';
import {
  parseVersion,
  compareVersions,
  isNewerVersion,
  detectPlatform,
  pickDownloadUrl,
  normalizeRelease,
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
    { name: 'WorkTodo_0.5.0_x64_en-US.msi', url: 'https://example.com/x.msi' },
    { name: 'WorkTodo_0.5.0_x64-setup.exe', url: 'https://example.com/x-setup.exe' },
    { name: 'WorkTodo_0.5.0_aarch64.dmg', url: 'https://example.com/x.dmg' },
    { name: 'WorkTodo_0.5.0_amd64.AppImage', url: 'https://example.com/x.AppImage' },
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
    html_url: 'https://github.com/cyamoyed/workTodo/releases/tag/v0.5.0',
    published_at: '2026-10-01T00:00:00Z',
    assets: [
      {
        name: 'WorkTodo_0.5.0_x64-setup.exe',
        browser_download_url: 'https://github.com/x/WorkTodo_0.5.0_x64-setup.exe',
      },
    ],
  };

  it('maps the GitHub payload to the app shape', () => {
    const r = normalizeRelease(raw, 'win');
    expect(r.version).toBe('0.5.0');
    expect(r.notes).toBe('更新内容');
    expect(r.url).toBe('https://github.com/cyamoyed/workTodo/releases/tag/v0.5.0');
    expect(r.publishedAt).toBe('2026-10-01T00:00:00Z');
    expect(r.downloadUrl).toBe('https://github.com/x/WorkTodo_0.5.0_x64-setup.exe');
  });

  it('falls back to the release page when no installer matches', () => {
    const r = normalizeRelease(raw, 'other');
    expect(r.downloadUrl).toBe('https://github.com/cyamoyed/workTodo/releases/tag/v0.5.0');
  });

  it('returns null without a parseable tag', () => {
    expect(normalizeRelease(null, 'win')).toBe(null);
    expect(normalizeRelease({ tag_name: 'nightly' }, 'win')).toBe(null);
  });
});
