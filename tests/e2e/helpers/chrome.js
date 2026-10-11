/**
 * Locates a Chromium binary for the e2e suites.
 * Resolution order: WORK_TODO_CHROME_PATH override → newest chromium-* build
 * under the playwright browsers dirs (so a build newer than the pinned
 * playwright-core revision also works) → playwright-core's own
 * executablePath(), which throws a actionable error when nothing is installed
 * (fix: npx playwright-core install chromium).
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { chromium } from 'playwright-core';

// playwright build layouts per platform (chrome-win64 is the 1.53+ layout,
// chrome-win the older one matching our pinned playwright-core 1.49).
const SUBDIRS = ['chrome-win64', 'chrome-win', 'chrome-linux'];
const BINARIES = ['chrome.exe', 'chrome'];

function scanBase(base) {
  let entries;
  try {
    entries = fs.readdirSync(base);
  } catch (_) {
    return null;
  }
  const revisions = entries
    .filter((e) => /^chromium-\d+$/.test(e)) // skips chromium_headless_shell-*
    .sort((a, b) => Number(b.slice(9)) - Number(a.slice(9)));
  for (const rev of revisions) {
    for (const sub of SUBDIRS) {
      for (const bin of BINARIES) {
        const candidate = path.join(base, rev, sub, bin);
        if (fs.existsSync(candidate)) return candidate;
      }
    }
  }
  return null;
}

export function findChrome() {
  if (process.env.WORK_TODO_CHROME_PATH) return process.env.WORK_TODO_CHROME_PATH;
  const bases = [];
  if (process.env.LOCALAPPDATA) bases.push(path.join(process.env.LOCALAPPDATA, 'ms-playwright'));
  bases.push(path.join(os.homedir(), '.cache', 'ms-playwright')); // linux (CI); macOS falls through to executablePath()
  for (const base of bases) {
    const found = scanBase(base);
    if (found) return found;
  }
  return chromium.executablePath();
}
