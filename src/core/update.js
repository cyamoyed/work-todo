/* work-todo — version compare + GitHub release parsing (pure, no fetch / no DOM) */

/**
 * Parse a version-ish string ("0.4.0", "v0.5.1", "v1.2.3-beta.1") into a
 * numeric triple. Anything after the patch number is ignored; unparseable
 * input returns null.
 */
export function parseVersion(v) {
  if (typeof v !== 'string') return null;
  const m = v.trim().match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/i);
  if (!m) return null;
  return [Number(m[1]), Number(m[2] || 0), Number(m[3] || 0)];
}

/** -1 / 0 / 1 — a older than / equal to / newer than b. Unparseable = equal. */
export function compareVersions(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return 0;
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
}

/** True when `candidate` is a strictly newer version than `current`. */
export function isNewerVersion(candidate, current) {
  return compareVersions(candidate, current) > 0;
}

/**
 * Map a user agent string to the installer platform key used by
 * pickDownloadUrl ('win' | 'mac' | 'linux' | 'other').
 */
export function detectPlatform(ua) {
  const s = typeof ua === 'string' ? ua : '';
  if (/windows/i.test(s)) return 'win';
  if (/macintosh|mac os x|iphone|ipad/i.test(s)) return 'mac';
  if (/linux|x11|android|cros/i.test(s)) return 'linux';
  return 'other';
}

/**
 * Pick the best installer URL for `platform` from GitHub release assets
 * ({ name, url }). Windows prefers the NSIS setup exe over the MSI; null when
 * nothing matches.
 */
export function pickDownloadUrl(assets, platform) {
  const list = (Array.isArray(assets) ? assets : []).filter((a) => a && a.name && a.url);
  const find = (pred) => {
    const hit = list.find((a) => pred(a.name.toLowerCase()));
    return hit ? hit.url : null;
  };
  if (platform === 'win') {
    return (
      find((n) => n.endsWith('-setup.exe')) ||
      find((n) => n.endsWith('.exe')) ||
      find((n) => n.endsWith('.msi'))
    );
  }
  if (platform === 'mac') {
    return find((n) => n.endsWith('.dmg'));
  }
  if (platform === 'linux') {
    return find((n) => n.endsWith('.appimage')) || find((n) => n.endsWith('.deb'));
  }
  return null;
}

/**
 * Map a GitHub /releases/latest payload to the update shape the app uses:
 * { version, notes, url, publishedAt, downloadUrl } — null when the payload
 * carries no parseable version tag. downloadUrl falls back to the release
 * page when no platform installer matches.
 */
export function normalizeRelease(raw, platform = 'other') {
  if (!raw || typeof raw !== 'object') return null;
  const tag = typeof raw.tag_name === 'string' ? raw.tag_name.trim() : '';
  if (!parseVersion(tag)) return null;
  const assets = (Array.isArray(raw.assets) ? raw.assets : [])
    .map((a) => ({
      name: a && typeof a.name === 'string' ? a.name : '',
      url: a && typeof a.browser_download_url === 'string' ? a.browser_download_url : '',
    }))
    .filter((a) => a.name && a.url);
  const url = typeof raw.html_url === 'string' ? raw.html_url : '';
  return {
    version: tag.replace(/^v/i, ''),
    notes: typeof raw.body === 'string' ? raw.body : '',
    url,
    publishedAt: typeof raw.published_at === 'string' ? raw.published_at : '',
    downloadUrl: pickDownloadUrl(assets, platform) || url,
  };
}
