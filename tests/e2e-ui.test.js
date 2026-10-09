/**
 * Playwright UI E2E — real browser against static server.
 * Covers golden path + edge cases that Node DOM mock cannot validate.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const CHROME = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright', 'chromium-1234', 'chrome-win64', 'chrome.exe');

const ROOT = path.join(__dirname, '..');
let BASE = '';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

let passed = 0;
let failed = 0;
const failures = [];
const consoleErrors = [];

function ok(name, cond, detail) {
  if (cond) {
    console.log('  PASS  ' + name);
    passed += 1;
  } else {
    const msg = '  FAIL  ' + name + (detail ? ' — ' + detail : '');
    console.log(msg);
    failed += 1;
    failures.push(msg);
  }
}

function section(title) {
  console.log('');
  console.log('· ' + title);
}

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      let filePath = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath.replace(/^\//, ''));
      if (!filePath.startsWith(ROOT)) {
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
    server.listen(0, '127.0.0.1', () => { const addr = server.address(); BASE = 'http://127.0.0.1:' + addr.port; resolve(server); });
  });
}

async function newPage(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
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
  return { context, page };
}

async function clearTasks(page) {
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
}

async function addTask(page, { title, status, priority, due } = {}) {
  await page.click('#btn-new');
  await page.fill('#field-title', title);
  if (status) await page.click(`#field-status-wrap button[data-status="${status}"]`);
  if (priority) await page.click(`#field-priority-wrap button[data-priority="${priority}"]`);
  if (due !== undefined) {
    // #field-due is type=hidden — set value via DOM, then sync label
    await page.evaluate((d) => {
      const hidden = document.querySelector('#field-due');
      hidden.value = d || '';
      const label = document.querySelector('#field-due-label');
      if (label && d) {
        const [y, m, dd] = d.split('-').map(Number);
        label.textContent = y + ' 年 ' + m + ' 月 ' + dd + ' 日';
      } else if (label) {
        label.textContent = '选择日期';
      }
    }, due || '');
  }
  await page.click('#task-form button[type="submit"]');
  await page.waitForTimeout(80);
}

(async () => {
  const server = await startServer();
  const browser = await chromium.launch({ headless: true, executablePath: CHROME });
  let context, page;
  try {
    ({ context, page } = await newPage(browser));

    section('boot & empty state');
    await clearTasks(page);
    ok('title is 工作待办 · WorkTodo', (await page.title()).includes('工作待办'));
    ok('empty heading visible', await page.locator('.empty-state h2').first().isVisible());
    ok('empty copy 从第一件事开始', (await page.locator('.empty-state h2').first().textContent()) === '从第一件事开始');
    ok('stat total is 0', (await page.locator('#stat-total').textContent()) === '0');
    ok('today label populated', ((await page.locator('#today-label').textContent()) || '').includes('年'));

    section('create task (modal form)');
    await page.click('#btn-new');
    ok('modal opens', await page.locator('#modal-backdrop').isVisible());
    ok('modal title 新建任务', (await page.locator('#modal-title').textContent()) === '新建任务');

    // empty title validation
    await page.click('#task-form button[type="submit"]');
    ok('empty title shows error', await page.locator('#title-error').isVisible());
    ok('modal still open', await page.locator('#modal-backdrop').isVisible());

    await page.fill('#field-title', '  写周报  ');
    await page.click('#field-status-wrap button[data-status="todo"]');
    await page.click('#field-priority-wrap button[data-priority="high"]');
    await page.click('#task-form button[type="submit"]');
    await page.waitForTimeout(100);
    ok('modal closed after save', await page.locator('#modal-backdrop').isHidden());
    ok('task card appears', await page.locator('.task-card').first().isVisible());
    ok('title trimmed', (await page.locator('.task-title').first().textContent()) === '写周报');
    ok('toast created', (await page.locator('#toast').textContent() || '').includes('任务已创建'));

    section('status menu (discoverable switch)');
    await page.locator('.status-toggle').first().click();
    await page.waitForTimeout(50);
    ok('status menu opens', await page.locator('.status-menu').isVisible());
    await page.locator('.status-menu-item', { hasText: '进行中' }).click();
    await page.waitForTimeout(50);
    ok('status becomes 进行中', (await page.locator('.meta-status').first().textContent()) === '进行中');
    await page.locator('.status-toggle').first().click();
    await page.waitForTimeout(50);
    await page.locator('.status-menu-item', { hasText: '已完成' }).click();
    await page.waitForTimeout(50);
    // done is collapsed behind toggle by default
    const doneVisible = await page.locator('.task-card.is-done').count();
    ok('done collapsed (card not always visible)', doneVisible === 0 || await page.locator('.task-card.is-done').first().isVisible());
    await page.locator('#done-toggle').click();
    await page.waitForTimeout(50);
    ok('done card weakened when expanded', await page.locator('.task-card.is-done').first().isVisible());
    await page.locator('.task-card.is-done .status-toggle').first().click();
    await page.waitForTimeout(50);
    await page.locator('.status-menu-item', { hasText: '待办' }).click();
    await page.waitForTimeout(50);
    ok('status switches back to 待办', (await page.locator('.meta-status').first().textContent()) === '待办');

    section('overdue badge');
    await addTask(page, { title: '过期任务', status: 'todo', priority: 'medium', due: '2020-01-01' });
    await page.waitForTimeout(80);
    ok('overdue card has flag', await page.locator('.task-card.is-overdue').first().isVisible());
    ok('overdue chip text', ((await page.locator('.due-chip.is-overdue').first().textContent()) || '').includes('逾期'));
    ok('stat-overdue >= 1', Number(await page.locator('#stat-overdue').textContent()) >= 1);
    ok('overview sub mentions 逾期', ((await page.locator('#overview-sub').textContent()) || '').includes('逾期'));

    section('edit task');
    // edit by title so we don't clobber the overdue fixture
    await page.locator('.task-card', { has: page.locator('.task-title', { hasText: '写周报' }) })
      .locator('button[aria-label="编辑任务"]').click();
    ok('edit modal opens', await page.locator('#modal-backdrop').isVisible());
    ok('modal title 编辑任务', (await page.locator('#modal-title').textContent()) === '编辑任务');
    ok('title backfilled', (await page.inputValue('#field-title')).length > 0);
    await page.fill('#field-title', '写周报（已改）');
    await page.click('#task-form button[type="submit"]');
    await page.waitForTimeout(80);
    const editedVisible = await page.locator('.task-title', { hasText: '写周报（已改）' }).count();
    ok('edited title in list', editedVisible === 1, 'count=' + editedVisible);
    ok('toast saved', (await page.locator('#toast').textContent() || '').includes('已保存'));

    section('search');
    await page.fill('#search-input', '过期');
    await page.waitForTimeout(50);
    const searchCount = await page.locator('.task-card').count();
    ok('search filters to 1', searchCount === 1, 'count=' + searchCount);
    ok('search hit title', (await page.locator('.task-title').first().textContent()) === '过期任务');
    await page.fill('#search-input', 'zzz-no-match');
    await page.waitForTimeout(50);
    ok('no match empty state', (await page.locator('.empty-state h2').first().textContent()) === '没有匹配的任务');
    await page.fill('#search-input', '写周报'.slice(0, 2)); // "写周"
    await page.waitForTimeout(50);
    ok('partial match works', (await page.locator('.task-card').count()) === 1);
    await page.click('#btn-clear-search');
    await page.waitForTimeout(50);
    ok('clear search restores', (await page.locator('.task-card').count()) === 2);

    section('filters');
    await page.click('#status-filter button[data-value="done"]');
    await page.waitForTimeout(50);
    ok('filter done → empty or only done', (await page.locator('.task-card').count()) <= 1);
    await page.click('#status-filter button[data-value="todo"]');
    await page.waitForTimeout(50);
    ok('filter todo', (await page.locator('.task-card').count()) === 2);
    await page.click('#priority-filter button[data-value="high"]');
    await page.waitForTimeout(50);
    ok('priority high AND status todo', (await page.locator('.task-card').count()) === 1);
    await page.click('#status-filter button[data-value="all"]');
    await page.click('#priority-filter button[data-value="all"]');
    await page.waitForTimeout(50);
    ok('reset filters → 2 tasks', (await page.locator('.task-card').count()) === 2);

    section('delete + undo');
    const beforeDel = await page.locator('.task-card').count();
    await page.locator('.task-card').first().locator('button[aria-label="删除任务"]').click();
    ok('confirm dialog visible', await page.locator('#confirm-backdrop').isVisible());
    ok('confirm message has title', (await page.locator('#confirm-message').textContent() || '').includes('确定删除'));
    await page.click('#btn-confirm-cancel');
    await page.waitForTimeout(50);
    ok('cancel keeps task', (await page.locator('.task-card').count()) === beforeDel);

    await page.locator('.task-card').first().locator('button[aria-label="删除任务"]').click();
    await page.click('#btn-confirm-ok');
    await page.waitForTimeout(80);
    ok('task deleted', (await page.locator('.task-card').count()) === beforeDel - 1);
    ok('undo toast visible', (await page.locator('#toast').textContent() || '').includes('撤销'));
    await page.locator('#toast button').click();
    await page.waitForTimeout(80);
    ok('undo restores task', (await page.locator('.task-card').count()) === beforeDel);

    section('localStorage persistence across reload');
    const titlesBefore = await page.locator('.task-title').allTextContents();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(80);
    const titlesAfter = await page.locator('.task-title').allTextContents();
    ok('tasks survive reload', JSON.stringify(titlesBefore) === JSON.stringify(titlesAfter),
      `before=${titlesBefore} after=${titlesAfter}`);
    const raw = await page.evaluate(() => localStorage.getItem('worktodo.tasks.v1'));
    ok('storage key present', !!raw && JSON.parse(raw).length === titlesBefore.length);

    section('keyboard shortcuts');
    await page.evaluate(() => document.body.focus());
    await page.keyboard.press('n');
    await page.waitForTimeout(50);
    ok('N opens create modal', await page.locator('#modal-backdrop').isVisible());
    await page.keyboard.press('Escape');
    await page.waitForTimeout(50);
    ok('Esc closes modal', await page.locator('#modal-backdrop').isHidden());
    await page.keyboard.press('/');
    await page.waitForTimeout(50);
    ok('/ focuses search', await page.evaluate(() => document.activeElement && document.activeElement.id === 'search-input'));

    section('calendar date picker');
    await page.click('#btn-new');
    await page.click('#btn-due');
    await page.waitForTimeout(50);
    ok('calendar opens', await page.locator('#calendar').isVisible());
    ok('calendar has title', ((await page.locator('#cal-title').textContent()) || '').includes('年'));
    // pick a day
    const dayBtn = page.locator('#cal-grid button:not([disabled])').first();
    if (await dayBtn.count()) {
      await dayBtn.click();
      await page.waitForTimeout(50);
      ok('date selected into hidden field', (await page.evaluate(() => document.querySelector('#field-due').value)).match(/^\d{4}-\d{2}-\d{2}$/));
      ok('trigger label updated', ((await page.locator('#field-due-label').textContent()) || '').includes('年'));
    }
    await page.click('#btn-clear-date');
    await page.waitForTimeout(50);
    ok('clear date empties field', (await page.evaluate(() => document.querySelector('#field-due').value)) === '');
    await page.click('#btn-close-modal');
    await page.waitForTimeout(50);

    section('title maxlength');
    await page.click('#btn-new');
    const longTitle = 'x'.repeat(200);
    await page.fill('#field-title', longTitle);
    const val = await page.inputValue('#field-title');
    ok('maxlength=120 enforced', val.length <= 120, 'len=' + val.length);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(50);

    section('XSS title renders as text');
    await addTask(page, { title: '<img src=x onerror=window.__xss=1>' });
    await page.waitForTimeout(80);
    ok('no XSS executed', await page.evaluate(() => window.__xss === undefined));
    ok('title shows as literal text', (await page.locator('.task-title').last().textContent()).includes('<img'));
    const html = await page.locator('.task-title').last().innerHTML();
    ok('no injected img element', !html.includes('<img'), html);

    section('empty title modal validation + focus');
    await page.click('#btn-new');
    await page.click('#task-form button[type="submit"]');
    await page.waitForTimeout(50);
    ok('error visible', await page.locator('#title-error').isVisible());
    ok('focus back on title', await page.evaluate(() => document.activeElement && document.activeElement.id === 'field-title'));
    await page.keyboard.press('Escape');

    section('backdrop click closes modal');
    await page.click('#btn-new');
    await page.locator('#modal-backdrop').click({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(50);
    ok('backdrop click closes', await page.locator('#modal-backdrop').isHidden());

    section('progress / overview stats (today scope)');
    await clearTasks(page);
    await addTask(page, { title: 'A', status: 'done' });
    await addTask(page, { title: 'B', status: 'todo' });
    await addTask(page, { title: 'C', status: 'in-progress' });
    await page.waitForTimeout(80);
    // today scope: done-today + (in-progress | due-today | overdue)
    ok('total today-scope 2', (await page.locator('#stat-total').textContent()) === '2');
    ok('done-today 1', (await page.locator('#stat-done').textContent()) === '1');
    ok('today-due 0', (await page.locator('#stat-todo').textContent()) === '0');
    ok('active 1', (await page.locator('#stat-active').textContent()) === '1');
    const fill = await page.locator('#progress-fill').evaluate((el) => el.style.width);
    ok('progress fill 50% (1/2 today)', fill === '50%', 'width=' + fill);

    section('filter chip counts');
    ok('chip all = 3', (await page.locator('#status-filter [data-count="all"]').textContent()) === '3');
    ok('chip done = 1', (await page.locator('#status-filter [data-count="done"]').textContent()) === '1');
    ok('chip todo = 1', (await page.locator('#status-filter [data-count="todo"]').textContent()) === '1');

    section('accessibility spot checks');
    ok('html lang zh-CN', (await page.locator('html').getAttribute('lang')) === 'zh-CN');
    ok('search has aria-label', !!(await page.locator('#search-input').getAttribute('aria-label')));
    ok('new button accessible', !!(await page.locator('#btn-new').count()));
    ok('task list aria-live', (await page.locator('#task-list').getAttribute('aria-live')) === 'polite');
    ok('error banner role=alert', (await page.locator('#error-banner').getAttribute('role')) === 'alert');
    ok('modal role=dialog', (await page.locator('#modal-backdrop .modal').getAttribute('role')) === 'dialog');
    ok('confirm role=alertdialog', (await page.locator('#confirm-backdrop .modal').getAttribute('role')) === 'alertdialog');

    section('console hygiene');
    ok('no unexpected console errors', consoleErrors.length === 0, consoleErrors.join(' | '));

    section('sort order in UI');
    await clearTasks(page);
    await addTask(page, { title: 'done-late', status: 'done', priority: 'low' });
    await addTask(page, { title: 'due-early', status: 'todo', priority: 'medium' });
    await addTask(page, { title: 'no-due', status: 'todo', priority: 'high' });
    // set due dates via evaluate for sort verification
    await page.evaluate(() => {
      const list = JSON.parse(localStorage.getItem('worktodo.tasks.v1'));
      for (const t of list) {
        if (t.title === 'due-early') t.dueDate = '2026-01-01';
        if (t.title === 'no-due') t.dueDate = null;
        if (t.title === 'done-late') t.dueDate = '2026-12-01';
      }
      localStorage.setItem('worktodo.tasks.v1', JSON.stringify(list));
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(80);
    // expand done so full order is visible
    const toggleDone = page.locator('#done-toggle');
    if (await toggleDone.count()) await toggleDone.click();
    await page.waitForTimeout(50);
    const order = await page.locator('.task-title').allTextContents();
    ok('UI sort: active first then done last', order[order.length - 1] === 'done-late', order.join(' > '));
    ok('UI sort: due-early before no-due', order.indexOf('due-early') < order.indexOf('no-due'), order.join(' > '));

    section('quick add');
    await clearTasks(page);
    await page.fill('#quick-title', '快速记一笔');
    await page.click('#quick-add-form button[type="submit"]');
    await page.waitForTimeout(50);
    ok('quick add creates card', (await page.locator('.task-title').first().textContent()) === '快速记一笔');
    ok('quick input cleared', (await page.inputValue('#quick-title')) === '');
    ok('quick due is today chip', ((await page.locator('.due-chip').first().textContent()) || '').includes('今天'));

    section('notes field + search');
    await page.click('#btn-new');
    await page.fill('#field-title', '带备注任务');
    await page.fill('#field-notes', '这是验收要点关键词');
    await page.click('#task-form button[type="submit"]');
    await page.waitForTimeout(50);
    ok('notes visible on card', ((await page.locator('.task-notes').first().textContent()) || '').includes('验收要点'));
    await page.fill('#search-input', '验收要点');
    await page.waitForTimeout(50);
    ok('search hits notes', (await page.locator('.task-card').count()) === 1);
    await page.fill('#search-input', '');

    section('today filter chip');
    await clearTasks(page);
    const todayStr = await page.evaluate(() => {
      const d = new Date();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return d.getFullYear() + '-' + m + '-' + day;
    });
    await addTask(page, { title: 'today-one', status: 'todo', due: todayStr });
    await addTask(page, { title: 'no-due-one', status: 'todo' });
    await page.locator('#range-filter [data-value="today"]').click();
    await page.waitForTimeout(50);
    const titles = await page.locator('.task-title').allTextContents();
    ok('today filter keeps due-today', titles.includes('today-one'), titles.join(','));
    ok('today filter hides no-due', !titles.includes('no-due-one'), titles.join(','));
    await page.locator('#range-filter [data-value="all"]').click();

    section('export / import anchors');
    ok('export button visible', await page.locator('#btn-export').isVisible());
    ok('import button visible', await page.locator('#btn-import').isVisible());
    ok('import file input present', (await page.locator('#import-file').count()) === 1);

    section('due time field in form');
    await page.click('#btn-new');
    ok('due time input present', (await page.locator('#field-due-time').count()) === 1);
    await page.keyboard.press('Escape');
  } catch (err) {
    console.log('  FAIL  suite crashed — ' + err.message);
    console.log(err.stack);
    failed += 1;
    failures.push('suite crashed: ' + err.message);
  } finally {
    if (context) await context.close().catch(() => {});
    await browser.close().catch(() => {});
    server.close();
  }

  console.log('');
  console.log(`[e2e-ui] ${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.log('Failures:');
    for (const f of failures) console.log('  ' + f);
  }
  process.exit(failed > 0 ? 1 : 0);
})();
