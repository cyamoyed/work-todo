/**
 * Playwright sync E2E — real Chromium against the built dist/ with an
 * in-process mock PocketBase (same origin as the app, so no CORS involved).
 * Covers: soft-delete tombstones surviving reload, sync login + push,
 * remote edits appearing locally, and cross-device delete propagation.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const DIST = path.join(ROOT, 'dist');

function findChrome() {
  if (process.env.WORK_TODO_CHROME_PATH) return process.env.WORK_TODO_CHROME_PATH;
  const base = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright');
  try {
    for (const entry of fs.readdirSync(base)) {
      if (entry.startsWith('chromium-') && !entry.includes('headless')) {
        const candidate = path.join(base, entry, 'chrome-win64', 'chrome.exe');
        if (fs.existsSync(candidate)) return candidate;
      }
    }
  } catch (_) {
    /* fall through */
  }
  return chromium.executablePath();
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

let server;
let browser;
let context;
let page;
let BASE = '';

// —— mock PocketBase state ——
const pb = {
  doc: null, // { id, user, payload, rev }
  reset() {
    this.doc = null;
  },
};

function handleApi(req, res, body) {
  const url = req.url || '';
  const json = (code, obj) => {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(obj));
  };
  if (req.method === 'POST' && url.includes('/collections/users/records')) {
    return json(200, { id: 'u1', email: 'a@b.c' });
  }
  if (req.method === 'POST' && url.includes('/auth-with-password')) {
    return json(200, { token: 'test-token', record: { id: 'u1', email: 'a@b.c' } });
  }
  if (req.method === 'GET' && url.includes('/collections/work_todo/records')) {
    return json(200, {
      page: 1,
      perPage: 30,
      totalItems: pb.doc ? 1 : 0,
      items: pb.doc ? [pb.doc] : [],
    });
  }
  if (req.method === 'POST' && url.includes('/collections/work_todo/records')) {
    const data = JSON.parse(body || '{}');
    pb.doc = { id: 'doc1', user: data.user, payload: data.payload, rev: data.rev };
    return json(200, pb.doc);
  }
  if (req.method === 'PATCH' && url.includes('/collections/work_todo/records/')) {
    const data = JSON.parse(body || '{}');
    if (!pb.doc) return json(404, { message: 'not found' });
    pb.doc = { ...pb.doc, payload: data.payload, rev: data.rev };
    return json(200, pb.doc);
  }
  return json(404, { message: 'unknown api ' + req.method + ' ' + url });
}

function startServer() {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      let chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
        if (urlPath.startsWith('/api/')) return handleApi(req, res, body);
        let filePath = path.join(DIST, urlPath === '/' ? 'index.html' : urlPath.replace(/^\//, ''));
        if (!filePath.startsWith(DIST)) {
          res.writeHead(403);
          res.end('forbidden');
          return;
        }
        fs.readFile(filePath, (err, buf) => {
          if (err) {
            res.writeHead(404);
            res.end('not found');
            return;
          }
          res.writeHead(200, {
            'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
          });
          res.end(buf);
        });
      });
    });
    server.listen(0, '127.0.0.1', () => {
      BASE = 'http://127.0.0.1:' + server.address().port;
      resolve(server);
    });
  });
}

async function addTask(title) {
  await page.click('#btn-new');
  await page.fill('#field-title', title);
  await page.click('#task-form button[type="submit"]');
  await page.waitForTimeout(80);
}

async function openSyncModal() {
  await page.click('#btn-sync-settings');
  await page.waitForTimeout(80);
}

async function syncNowViaModal() {
  await openSyncModal();
  await page.click('#btn-sync-now');
  await page.waitForTimeout(300);
  await page.click('#btn-cancel-sync');
  await page.waitForTimeout(80);
}

async function loginSync() {
  await openSyncModal();
  await page.fill('#field-sync-url', BASE);
  await page.fill('#field-sync-identity', 'a@b.c');
  await page.fill('#field-sync-password', 'pw');
  await page.check('#field-sync-register');
  await page.click('#btn-sync-login');
  await page.waitForTimeout(500);
}

beforeAll(async () => {
  await startServer();
  browser = await chromium.launch({ executablePath: findChrome(), headless: true });
  context = await browser.newContext();
  // No external network in e2e: answer update checks with "already current".
  const appVersion = fs.readFileSync(path.join(ROOT, 'src-tauri', 'Cargo.toml'), 'utf8').match(/^version = "([^"]+)"/m)[1];
  await context.route('https://api.github.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        tag_name: `v${appVersion}`,
        body: '',
        html_url: 'https://github.com/cyamoyed/work-todo/releases',
        published_at: '2026-01-01T00:00:00Z',
        assets: [],
      }),
    })
  );
  page = await context.newPage();
});

afterAll(async () => {
  if (browser) await browser.close();
  if (server) server.close();
});

beforeEach(async () => {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  // Let the previous test's boot-sync finish BEFORE clearing storage — its
  // applyMerged would otherwise write the old data back after the clear.
  await page.waitForTimeout(300);
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(150); // boot with empty storage + no session → no sync
  pb.reset();
});

describe('soft delete (tombstones)', () => {
  it('deleted tasks stay gone after reload and persist as tombstones', async () => {
    await addTask('删除后不复活');
    await addTask('保留项');
    await page.locator('.task-card', { hasText: '删除后不复活' }).locator('[aria-label="删除任务"]').click();
    await page.waitForTimeout(80);
    await page.click('#btn-confirm-ok');
    await page.waitForTimeout(80);
    expect(await page.locator('.task-title').allTextContents()).toEqual(['保留项']);

    const raw = await page.evaluate(() => localStorage.getItem('work-todo.tasks.v1'));
    const list = JSON.parse(raw);
    const tomb = list.find((t) => t.title === '删除后不复活');
    expect(tomb.deletedAt).toBeTruthy();

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(100);
    expect(await page.locator('.task-title').allTextContents()).toEqual(['保留项']);
  });

  it('undo delete revives the task and clears the tombstone', async () => {
    await addTask('撤销复活');
    await page.locator('.task-card [aria-label="删除任务"]').click();
    await page.waitForTimeout(80);
    await page.click('#btn-confirm-ok');
    await page.waitForTimeout(80);
    await page.click('#toast button');
    await page.waitForTimeout(80);
    expect(await page.locator('.task-title').allTextContents()).toEqual(['撤销复活']);
    const raw = await page.evaluate(() => localStorage.getItem('work-todo.tasks.v1'));
    expect(JSON.parse(raw).every((t) => !t.deletedAt)).toBe(true);
  });
});

describe('pocketbase sync roundtrip', () => {
  it('login + first sync pushes local tasks to the server', async () => {
    await addTask('待同步任务');
    await loginSync();
    expect(await page.locator('#sync-status').textContent()).toContain('已同步');
    expect(pb.doc).toBeTruthy();
    expect(pb.doc.rev).toBeGreaterThanOrEqual(1);
    expect(pb.doc.payload.tasks.map((t) => t.title)).toContain('待同步任务');
  });

  it('pulls remote tasks into the UI on manual sync', async () => {
    await loginSync();
    // Another device pushed a task to the server (due today so it lands in view).
    pb.doc = {
      id: 'doc1',
      user: 'u1',
      rev: 5,
      payload: {
        schemaVersion: 3,
        exportedAt: '2026-10-10T00:00:00.000Z',
        app: 'work-todo',
        tasks: [
          {
            id: 'remote-1',
            title: '来自另一台设备',
            status: 'todo',
            priority: 'medium',
            dueDate: new Date().toISOString().slice(0, 10),
            createdAt: '2026-10-10T00:00:00.000Z',
            updatedAt: '2026-10-10T00:00:00.000Z',
          },
        ],
        projects: [],
      },
    };
    await syncNowViaModal();
    expect(await page.locator('.task-title').allTextContents()).toContain('来自另一台设备');
    // the merge result gets pushed back up
    expect(pb.doc.payload.tasks.map((t) => t.title)).toContain('来自另一台设备');
  });

  it('delete on one device propagates as a tombstone (no resurrection)', async () => {
    await addTask('双端删除');
    await addTask('双端保留');
    await loginSync();
    // "Second device" still shows the task: pull server state first.
    await syncNowViaModal();
    expect(pb.doc.payload.tasks.filter((t) => !t.deletedAt).length).toBe(2);

    // Delete locally and push.
    await page.locator('.task-card', { hasText: '双端删除' }).locator('[aria-label="删除任务"]').click();
    await page.waitForTimeout(80);
    await page.click('#btn-confirm-ok');
    await page.waitForTimeout(80);
    await syncNowViaModal();

    const pushed = pb.doc.payload.tasks.find((t) => t.title === '双端删除');
    expect(pushed.deletedAt).toBeTruthy();

    // Fresh device: wipe local data (keep the session) and resync.
    await page.evaluate(() => localStorage.removeItem('work-todo.tasks.v1'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500); // bootSync auto-runs
    const titles = await page.locator('.task-title').allTextContents();
    expect(titles).toContain('双端保留');
    expect(titles).not.toContain('双端删除');
  });
});
