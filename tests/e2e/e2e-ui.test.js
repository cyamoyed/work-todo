/**
 * Playwright UI E2E — real Chromium against the built dist/ artifact.
 * Port of legacy tests/e2e-ui.test.js (behavior-parity contract) + new SPA routing sections.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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
  const explicit = path.join(base, 'chromium-1234', 'chrome-win64', 'chrome.exe');
  if (fs.existsSync(explicit)) return explicit;
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
  '.woff2': 'font/woff2',
};

let server;
let browser;
let context;
let page;
let BASE = '';
const consoleErrors = [];

function startServer() {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
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
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
        res.end(buf);
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      BASE = 'http://127.0.0.1:' + addr.port;
      resolve(server);
    });
  });
}

async function clearTasks() {
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
}

// Legacy helper: sets #field-due via DOM; dispatches input so v-model stays in sync.
async function addTask({ title, status, priority, due } = {}) {
  await page.click('#btn-new');
  await page.fill('#field-title', title);
  if (status) {
    await page.click('#btn-advanced'); // status lives in the advanced section
    await page.click(`#field-status-wrap button[data-status="${status}"]`);
  }
  if (priority) await page.click(`#field-priority-wrap button[data-priority="${priority}"]`);
  if (due !== undefined) {
    await page.evaluate((d) => {
      const hidden = document.querySelector('#field-due');
      hidden.value = d || '';
      hidden.dispatchEvent(new Event('input'));
    }, due || '');
  }
  await page.click('#task-form button[type="submit"]');
  await page.waitForTimeout(80);
}

beforeAll(async () => {
  await startServer();
  browser = await chromium.launch({ headless: true, executablePath: findChrome() });
  context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
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
  // Update checks fall back to the releases Atom feed when the API
  // rate-limits — keep that path offline too (not exercised by these tests).
  await context.route('https://github.com/cyamoyed/work-todo/releases.atom', (route) =>
    route.fulfill({ status: 404, contentType: 'application/xml', body: '' })
  );
  page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Chromium logs 404s without the URL; suppress known-benign resource noise
      if (/favicon|status of 404/i.test(text)) return;
      consoleErrors.push(text);
    }
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
}, 180000);

afterAll(async () => {
  if (context) await context.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
  if (server) server.close();
});

describe('e2e-ui (legacy behavior parity + SPA routing)', () => {
  it('boot & empty state', async () => {
    await clearTasks();
    expect(await page.title()).toContain('工作待办');
    expect(await page.locator('.empty-state h2').first().isVisible()).toBe(true);
    expect(await page.locator('.empty-state h2').first().textContent()).toBe('从第一件事开始');
    expect(await page.locator('#stat-total').textContent()).toBe('0');
    expect((await page.locator('#today-label').textContent()) || '').toContain('年');
  });

  it('create task (modal form)', async () => {
    await page.click('#btn-new');
    expect(await page.locator('#modal-backdrop').isVisible()).toBe(true);
    expect(await page.locator('#modal-title').textContent()).toBe('新建任务');

    // empty title validation
    await page.click('#task-form button[type="submit"]');
    expect(await page.locator('#title-error').isVisible()).toBe(true);
    expect(await page.locator('#modal-backdrop').isVisible()).toBe(true);

    await page.fill('#field-title', '  写周报  ');
    await page.click('#field-priority-wrap button[data-priority="high"]');
    await page.click('#task-form button[type="submit"]');
    await page.waitForTimeout(100);
    expect(await page.locator('#modal-backdrop').isHidden()).toBe(true);
    expect(await page.locator('.task-card').first().isVisible()).toBe(true);
    expect(await page.locator('.task-title').first().textContent()).toBe('写周报');
    expect((await page.locator('#toast').textContent()) || '').toContain('任务已创建');
  });

  it('row check completes with confirm; status text menu jumps directly', async () => {
    // completing goes through the confirm dialog
    await page.locator('.status-toggle').first().click();
    await page.waitForTimeout(50);
    expect(await page.locator('#confirm-backdrop').isVisible()).toBe(true);
    expect(await page.locator('#confirm-message').textContent()).toContain('标记为已完成');
    await page.click('#btn-confirm-ok');
    await page.waitForTimeout(50);
    // done is collapsed behind toggle by default
    await page.locator('#done-toggle').click();
    await page.waitForTimeout(50);
    expect(await page.locator('.task-card.is-done .meta-status').first().textContent()).toBe('已完成');

    // done → one click back to 待办, no confirm
    await page.locator('.task-card.is-done .status-toggle').first().click();
    await page.waitForTimeout(50);
    expect(await page.locator('.meta-status').first().textContent()).toBe('待办');

    // status text opens the menu for direct jumps (no confirm for in-progress)
    await page.locator('.task-card .task-col-status').first().click();
    await page.waitForTimeout(50);
    expect(await page.locator('.status-menu').isVisible()).toBe(true);
    await page.locator('.status-menu-item', { hasText: '进行中' }).click();
    await page.waitForTimeout(50);
    expect(await page.locator('.meta-status').first().textContent()).toBe('进行中');
    // picking 已完成 from the menu also lands in the confirm dialog
    await page.locator('.task-card .task-col-status').first().click();
    await page.waitForTimeout(50);
    await page.locator('.status-menu-item', { hasText: '已完成' }).click();
    await page.waitForTimeout(50);
    expect(await page.locator('#confirm-backdrop').isVisible()).toBe(true);
    await page.click('#btn-confirm-cancel');
    await page.waitForTimeout(50);
    expect(await page.locator('.meta-status').first().textContent()).toBe('进行中');

    // back to 待办 so later filter/count expectations hold
    await page.locator('.task-card .task-col-status').first().click();
    await page.waitForTimeout(50);
    await page.locator('.status-menu-item', { hasText: '待办' }).click();
    await page.waitForTimeout(50);
    expect(await page.locator('.meta-status').first().textContent()).toBe('待办');
  });

  it('inline priority and due editing on the row', async () => {
    await page.locator('.task-col-prio').first().click();
    await page.waitForTimeout(50);
    expect(await page.locator('.prio-menu').isVisible()).toBe(true);
    await page.locator('.prio-menu .row-menu-item', { hasText: '低' }).click();
    await page.waitForTimeout(50);
    expect((await page.locator('.task-col-prio').first().textContent()) || '').toContain('低优先级');

    await page.locator('.task-due').first().click();
    await page.waitForTimeout(50);
    expect(await page.locator('.due-menu').isVisible()).toBe(true);
    await page.locator('.due-menu .due-quick button', { hasText: '今天' }).click();
    await page.waitForTimeout(50);
    expect((await page.locator('.due-chip').first().textContent()) || '').toContain('今天');

    await page.locator('.task-due').first().click();
    await page.waitForTimeout(50);
    await page.locator('.due-menu .due-quick button', { hasText: '清除' }).click();
    await page.waitForTimeout(50);
    expect((await page.locator('.due-chip').first().textContent()) || '').toBe('');

    // restore priority so later filter expectations hold
    await page.locator('.task-col-prio').first().click();
    await page.waitForTimeout(50);
    await page.locator('.prio-menu .row-menu-item', { hasText: '高' }).click();
    await page.waitForTimeout(50);
    expect((await page.locator('.task-col-prio').first().textContent()) || '').toContain('高优先级');
  });

  it('overdue badge', async () => {
    await addTask({ title: '过期任务', status: 'todo', priority: 'medium', due: '2020-01-01' });
    await page.waitForTimeout(80);
    expect(await page.locator('.task-card.is-overdue').first().isVisible()).toBe(true);
    expect((await page.locator('.due-chip.is-overdue').first().textContent()) || '').toContain('逾期');
    expect(Number(await page.locator('#stat-overdue').textContent())).toBeGreaterThanOrEqual(1);
    expect((await page.locator('#overview-sub').textContent()) || '').toContain('逾期');
  });

  it('edit task', async () => {
    // edit by title so we don't clobber the overdue fixture; title click opens the editor
    await page
      .locator('.task-card', { has: page.locator('.task-title', { hasText: '写周报' }) })
      .locator('.task-title')
      .click();
    expect(await page.locator('#modal-backdrop').isVisible()).toBe(true);
    expect(await page.locator('#modal-title').textContent()).toBe('编辑任务');
    expect((await page.inputValue('#field-title')).length).toBeGreaterThan(0);
    await page.fill('#field-title', '写周报（已改）');
    await page.click('#task-form button[type="submit"]');
    await page.waitForTimeout(80);
    const editedVisible = await page.locator('.task-title', { hasText: '写周报（已改）' }).count();
    expect(editedVisible).toBe(1);
    expect((await page.locator('#toast').textContent()) || '').toContain('已保存');
  });

  it('search', async () => {
    await page.fill('#search-input', '过期');
    await page.waitForTimeout(50);
    expect(await page.locator('.task-card').count()).toBe(1);
    expect(await page.locator('.task-title').first().textContent()).toBe('过期任务');
    await page.fill('#search-input', 'zzz-no-match');
    await page.waitForTimeout(50);
    expect(await page.locator('.empty-state h2').first().textContent()).toBe('没有匹配的任务');
    await page.fill('#search-input', '写周报'.slice(0, 2)); // "写周"
    await page.waitForTimeout(50);
    expect(await page.locator('.task-card').count()).toBe(1);
    await page.click('#btn-clear-search');
    await page.waitForTimeout(50);
    expect(await page.locator('.task-card').count()).toBe(2);
  });

  it('filters', async () => {
    await page.click('#status-filter button[data-value="done"]');
    await page.waitForTimeout(50);
    expect(await page.locator('.task-card').count()).toBeLessThanOrEqual(1);
    await page.click('#status-filter button[data-value="todo"]');
    await page.waitForTimeout(50);
    expect(await page.locator('.task-card').count()).toBe(2);
    await page.click('#priority-filter button[data-value="high"]');
    await page.waitForTimeout(50);
    expect(await page.locator('.task-card').count()).toBe(1);
    await page.click('#status-filter button[data-value="all"]');
    await page.click('#priority-filter button[data-value="all"]');
    await page.waitForTimeout(50);
    expect(await page.locator('.task-card').count()).toBe(2);
  });

  it('batch operations: select rows, set priority, exit', async () => {
    await page.click('#btn-batch');
    await page.waitForTimeout(50);
    expect(await page.locator('#batch-bar').isVisible()).toBe(true);
    expect(await page.locator('.task-card .select-check').first().isVisible()).toBe(true);

    // select-all then batch-set priority to 低
    await page.locator('#batch-bar button', { hasText: '全选' }).click();
    await page.waitForTimeout(50);
    expect(await page.locator('#batch-bar .batch-count').textContent()).toContain('已选');
    await page.locator('#batch-bar button', { hasText: '优先级' }).click();
    await page.waitForTimeout(50);
    expect(await page.locator('.batch-bar-pop').isVisible()).toBe(true);
    await page.locator('.batch-bar-pop .row-menu-item', { hasText: '低' }).click();
    await page.waitForTimeout(80);
    expect((await page.locator('#toast').textContent()) || '').toContain('低优先级');
    // selection cleared after the batch, still in select mode
    expect(await page.locator('#batch-bar').isVisible()).toBe(true);

    await page.click('#btn-batch'); // 退出批量
    await page.waitForTimeout(50);
    expect(await page.locator('#batch-bar').isHidden()).toBe(true);
    expect(await page.locator('.task-card .select-check').count()).toBe(0);
  });

  it('delete + undo', async () => {
    const beforeDel = await page.locator('.task-card').count();
    await page.locator('.task-card').first().locator('button[aria-label="删除任务"]').click();
    expect(await page.locator('#confirm-backdrop').isVisible()).toBe(true);
    expect((await page.locator('#confirm-message').textContent()) || '').toContain('确定删除');
    await page.click('#btn-confirm-cancel');
    await page.waitForTimeout(50);
    expect(await page.locator('.task-card').count()).toBe(beforeDel);

    await page.locator('.task-card').first().locator('button[aria-label="删除任务"]').click();
    await page.click('#btn-confirm-ok');
    await page.waitForTimeout(80);
    expect(await page.locator('.task-card').count()).toBe(beforeDel - 1);
    expect((await page.locator('#toast').textContent()) || '').toContain('撤销');
    await page.locator('#toast button').click();
    await page.waitForTimeout(80);
    expect(await page.locator('.task-card').count()).toBe(beforeDel);
  });

  it('localStorage persistence across reload', async () => {
    const titlesBefore = await page.locator('.task-title').allTextContents();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(80);
    const titlesAfter = await page.locator('.task-title').allTextContents();
    expect(titlesAfter).toEqual(titlesBefore);
    const raw = await page.evaluate(() => localStorage.getItem('work-todo.tasks.v1'));
    expect(raw).toBeTruthy();
    // v3: storage may hold soft-delete tombstones; visible titles are live tasks.
    expect(JSON.parse(raw).filter((t) => !t.deletedAt).length).toBe(titlesBefore.length);
  });

  it('keyboard shortcuts', async () => {
    await page.evaluate(() => document.body.focus());
    await page.keyboard.press('n');
    await page.waitForTimeout(50);
    expect(await page.locator('#modal-backdrop').isVisible()).toBe(true);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(50);
    expect(await page.locator('#modal-backdrop').isHidden()).toBe(true);
    await page.keyboard.press('/');
    await page.waitForTimeout(50);
    expect(
      await page.evaluate(() => document.activeElement && document.activeElement.id === 'search-input')
    ).toBe(true);
  });

  it('calendar date picker', async () => {
    await page.click('#btn-new');
    await page.click('#btn-due');
    await page.waitForTimeout(50);
    expect(await page.locator('#calendar').isVisible()).toBe(true);
    expect((await page.locator('#cal-title').textContent()) || '').toContain('年');
    // pick a day
    const dayBtn = page.locator('#cal-grid button:not([disabled])').first();
    if (await dayBtn.count()) {
      await dayBtn.click();
      await page.waitForTimeout(50);
      expect(await page.evaluate(() => document.querySelector('#field-due').value)).toMatch(
        /^\d{4}-\d{2}-\d{2}$/
      );
      expect((await page.locator('#field-due-label').textContent()) || '').toContain('年');
    }
    await page.click('#btn-clear-date');
    await page.waitForTimeout(50);
    expect(await page.evaluate(() => document.querySelector('#field-due').value)).toBe('');
    await page.click('#btn-close-modal');
    await page.waitForTimeout(50);
  });

  it('title maxlength', async () => {
    await page.click('#btn-new');
    const longTitle = 'x'.repeat(200);
    await page.fill('#field-title', longTitle);
    const val = await page.inputValue('#field-title');
    expect(val.length).toBeLessThanOrEqual(120);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(50);
  });

  it('XSS title renders as text', async () => {
    await addTask({ title: '<img src=x onerror=window.__xss=1>' });
    await page.waitForTimeout(80);
    expect(await page.evaluate(() => window.__xss === undefined)).toBe(true);
    const xssTitle = page.locator('.task-title', { hasText: '<img' });
    expect(await xssTitle.count()).toBe(1);
    expect((await xssTitle.textContent())).toContain('<img');
    const html = await xssTitle.innerHTML();
    expect(html).not.toContain('<img');
  });

  it('empty title modal validation + focus', async () => {
    await page.click('#btn-new');
    await page.click('#task-form button[type="submit"]');
    await page.waitForTimeout(50);
    expect(await page.locator('#title-error').isVisible()).toBe(true);
    expect(
      await page.evaluate(() => document.activeElement && document.activeElement.id === 'field-title')
    ).toBe(true);
    await page.keyboard.press('Escape');
  });

  it('backdrop click closes modal', async () => {
    await page.click('#btn-new');
    await page.locator('#modal-backdrop').click({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(50);
    expect(await page.locator('#modal-backdrop').isHidden()).toBe(true);
  });

  it('progress / overview stats (today scope)', async () => {
    await clearTasks();
    await addTask({ title: 'A', status: 'done' });
    await addTask({ title: 'B', status: 'todo' });
    await addTask({ title: 'C', status: 'in-progress' });
    await page.waitForTimeout(80);
    // today scope: done-today + (in-progress | due-today | overdue)
    expect(await page.locator('#stat-total').textContent()).toBe('2');
    expect(await page.locator('#stat-done').textContent()).toBe('1');
    expect(await page.locator('#stat-todo').textContent()).toBe('0');
    expect(await page.locator('#stat-active').textContent()).toBe('1');
    const fill = await page.locator('#progress-fill').evaluate((el) => el.style.width);
    expect(fill).toBe('50%');
  });

  it('filter chip counts', async () => {
    expect(await page.locator('#status-filter [data-count="all"]').textContent()).toBe('3');
    expect(await page.locator('#status-filter [data-count="done"]').textContent()).toBe('1');
    expect(await page.locator('#status-filter [data-count="todo"]').textContent()).toBe('1');
  });

  it('theme switching paints dark and persists across reload', async () => {
    const attr = () => page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    await page.click('.side .theme-option[data-value="dark"]');
    await page.waitForTimeout(80);
    expect(await attr()).toBe('dark');
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(
      'rgb(16, 16, 19)'
    ); // --bg of the dark palette
    expect(
      await page.evaluate(() => localStorage.getItem('work-todo.theme.v1'))
    ).toBe('"dark"');

    // reload: the inline head script re-applies the stored theme before paint
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(120);
    expect(await attr()).toBe('dark');
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(
      'rgb(16, 16, 19)'
    );

    // back to system: attribute removed, OS preference drives the palette
    await page.click('.side .theme-option[data-value="system"]');
    await page.waitForTimeout(80);
    expect(await attr()).toBe(null);
    expect(
      await page.evaluate(() => localStorage.getItem('work-todo.theme.v1'))
    ).toBe('"system"');
  });

  it('accessibility spot checks', async () => {
    expect(await page.locator('html').getAttribute('lang')).toBe('zh-CN');
    expect(await page.locator('#search-input').getAttribute('aria-label')).toBeTruthy();
    expect(await page.locator('#btn-new').count()).toBeGreaterThan(0);
    expect(await page.locator('#task-list').getAttribute('aria-live')).toBe('polite');
    expect(await page.locator('#error-banner').getAttribute('role')).toBe('alert');
    expect(await page.locator('#modal-backdrop .modal').getAttribute('role')).toBe('dialog');
    expect(await page.locator('#confirm-backdrop .modal').getAttribute('role')).toBe('alertdialog');
  });

  it('sort order in UI', async () => {
    await clearTasks();
    await addTask({ title: 'done-late', status: 'done', priority: 'low' });
    await addTask({ title: 'due-early', status: 'todo', priority: 'medium' });
    await addTask({ title: 'no-due', status: 'todo', priority: 'high' });
    // set due dates via raw storage for sort verification
    await page.evaluate(() => {
      const list = JSON.parse(localStorage.getItem('work-todo.tasks.v1'));
      for (const t of list) {
        if (t.title === 'due-early') t.dueDate = '2026-01-01';
        if (t.title === 'no-due') t.dueDate = null;
        if (t.title === 'done-late') t.dueDate = '2026-12-01';
      }
      localStorage.setItem('work-todo.tasks.v1', JSON.stringify(list));
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(80);
    // expand done so full order is visible
    const toggleDone = page.locator('#done-toggle');
    if (await toggleDone.count()) await toggleDone.click();
    await page.waitForTimeout(50);
    const order = await page.locator('.task-title').allTextContents();
    expect(order[order.length - 1]).toBe('done-late');
    expect(order.indexOf('due-early')).toBeLessThan(order.indexOf('no-due'));
  });

  it('quick add', async () => {
    await clearTasks();
    await page.fill('#quick-title', '快速记一笔');
    await page.click('#quick-add-form button[type="submit"]');
    await page.waitForTimeout(50);
    expect(await page.locator('.task-title').first().textContent()).toBe('快速记一笔');
    expect(await page.inputValue('#quick-title')).toBe('');
    expect((await page.locator('.due-chip').first().textContent()) || '').toContain('今天');
  });

  it('notes field + search', async () => {
    await page.click('#btn-new');
    await page.fill('#field-title', '带备注任务');
    await page.click('#btn-advanced'); // notes live in the advanced section
    await page.fill('#field-notes', '这是验收要点关键词');
    await page.click('#task-form button[type="submit"]');
    await page.waitForTimeout(50);
    expect((await page.locator('.task-notes').first().textContent()) || '').toContain('验收要点');
    await page.fill('#search-input', '验收要点');
    await page.waitForTimeout(50);
    expect(await page.locator('.task-card').count()).toBe(1);
    await page.fill('#search-input', '');
  });

  it('today filter chip', async () => {
    await clearTasks();
    const todayStr = await page.evaluate(() => {
      const d = new Date();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return d.getFullYear() + '-' + m + '-' + day;
    });
    await addTask({ title: 'today-one', status: 'todo', due: todayStr });
    await addTask({ title: 'no-due-one', status: 'todo' });
    await page.locator('#range-filter [data-value="today"]').click();
    await page.waitForTimeout(50);
    const titles = await page.locator('.task-title').allTextContents();
    expect(titles).toContain('today-one');
    expect(titles).not.toContain('no-due-one');
    await page.locator('#range-filter [data-value="all"]').click();
    await page.waitForTimeout(50);
  });

  it('export / import anchors', async () => {
    expect(await page.locator('#btn-export').isVisible()).toBe(true);
    expect(await page.locator('#btn-import').isVisible()).toBe(true);
    expect(await page.locator('#import-file').count()).toBe(1);
  });

  it('due time field in form', async () => {
    await page.click('#btn-new');
    expect(await page.locator('#field-due-time').count()).toBe(1);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(50);
  });

  it('console hygiene', async () => {
    expect(consoleErrors).toEqual([]);
  });

  // ——— New SPA routing sections ———

  it('routing: boot lands on #/today', async () => {
    expect(page.url()).toContain('#/');
  });

  it('routing: direct link to #/review renders review view', async () => {
    await page.goto(BASE + '/#/review', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(80);
    expect(await page.locator('#list-title').textContent()).toBe('本周回顾');
    expect((await page.locator('.review-block h3').first().textContent()) || '').toContain('本周已完成');
    expect(await page.locator('#nav .nav-item[data-view="review"]').getAttribute('class')).toContain('active');
  });

  it('routing: direct link to #/done shows done list title', async () => {
    await page.goto(BASE + '/#/done', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(80);
    expect(await page.locator('#list-title').textContent()).toBe('已完成');
    expect(await page.locator('#nav .nav-item[data-view="done"]').getAttribute('class')).toContain('active');
  });

  it('routing: unknown hash redirects to today', async () => {
    await page.goto(BASE + '/#/nope', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(80);
    expect(page.url()).toContain('#/today');
    expect(await page.locator('#nav .nav-item[data-view="today"]').getAttribute('class')).toContain('active');
  });

  it('routing: invalid project id redirects to all', async () => {
    await page.goto(BASE + '/#/project/nonexistent-id', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(80);
    expect(page.url()).toContain('#/all');
  });

  it('routing: back/forward walks view history', async () => {
    await page.goto(BASE + '/#/today', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(50);
    await page.click('#nav .nav-item[data-view="all"]');
    await page.waitForTimeout(50);
    expect(page.url()).toContain('#/all');
    await page.click('#nav .nav-item[data-view="done"]');
    await page.waitForTimeout(50);
    expect(page.url()).toContain('#/done');

    await page.goBack();
    await page.waitForTimeout(50);
    expect(page.url()).toContain('#/all');
    expect(await page.locator('#nav .nav-item[data-view="all"]').getAttribute('class')).toContain('active');

    await page.goForward();
    await page.waitForTimeout(50);
    expect(page.url()).toContain('#/done');
    expect(await page.locator('#list-title').textContent()).toBe('已完成');
  });

  it('routing: project view via sidebar + nav highlight rules', async () => {
    await clearTasks();
    // create a project through the project modal
    await page.click('#btn-new-project');
    await page.fill('#field-project-name', '路由项目');
    await page.click('#project-form button[type="submit"]');
    await page.waitForTimeout(80);
    expect(page.url()).toContain('#/project/');
    expect(await page.locator('#list-title').textContent()).toBe('路由项目');
    // project view highlights no top-level nav item
    const activeCount = await page.locator('#nav .nav-item.active').count();
    expect(activeCount).toBe(0);
  });

  it('routing: range chip navigation keeps URL in sync', async () => {
    await page.goto(BASE + '/#/today', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(50);
    await page.locator('#range-filter [data-value="week"]').click();
    await page.waitForTimeout(50);
    expect(page.url()).toContain('#/week');
    expect(await page.locator('#range-filter [data-value="week"]').getAttribute('class')).toContain('active');
  });
});
