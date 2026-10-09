const { chromium } = require('playwright-core');
const path = require('path');

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push('console: ' + msg.text());
  });

  await page.goto('http://127.0.0.1:8765/design/prototype.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  // Screenshot 1: default today list
  await page.screenshot({ path: path.join(__dirname, 'proto-01-today.png'), fullPage: true });

  // Check strip + rows
  const strip = await page.locator('#strip').innerText();
  const rowCount = await page.locator('.row').count();
  console.log('strip:', strip.replace(/\n/g, ' | '));
  console.log('rows:', rowCount);

  // Quick add
  await page.fill('#quick-title', '原型冒烟：快速记一笔');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  const afterQuick = await page.locator('.row-title', { hasText: '原型冒烟' }).count();
  console.log('quick add ok:', afterQuick === 1);

  // Open status menu
  await page.locator('.row .check').first().click();
  await page.waitForTimeout(150);
  const menuVisible = await page.locator('#status-menu').isVisible();
  console.log('status menu visible:', menuVisible);
  if (menuVisible) {
    await page.locator('#status-menu button[data-status="in-progress"]').click();
  }
  await page.waitForTimeout(150);

  // Open peek
  await page.locator('.row-title').first().click();
  await page.waitForTimeout(150);
  console.log('peek visible:', await page.locator('#peek').isVisible());
  await page.screenshot({ path: path.join(__dirname, 'proto-02-peek.png') });
  await page.locator('#btn-close-peek').click();

  // Dayline view
  await page.locator('.nav-item[data-view="dayline"]').click();
  await page.waitForTimeout(200);
  const dayGroups = await page.locator('.day-group').count();
  console.log('dayline groups:', dayGroups);
  await page.screenshot({ path: path.join(__dirname, 'proto-03-dayline.png'), fullPage: true });

  // Modal
  await page.locator('#btn-new').click();
  await page.waitForTimeout(150);
  await page.fill('#f-title', '原型冒烟：新建任务');
  await page.fill('#f-notes', '备注可搜索');
  await page.locator('#f-prio button[data-value="high"]').click();
  await page.screenshot({ path: path.join(__dirname, 'proto-04-modal.png') });
  await page.locator('#task-form button[type="submit"]').click();
  await page.waitForTimeout(150);

  // Search
  await page.fill('#search-input', '备注可搜索');
  await page.waitForTimeout(150);
  const searchHits = await page.locator('.row-title').count();
  console.log('search hits:', searchHits);

  // Delete + undo toast
  await page.fill('#search-input', '');
  await page.locator('.nav-item[data-view="today"]').click();
  await page.waitForTimeout(150);
  await page.locator('.row-title', { hasText: '原型冒烟：快速记一笔' }).click();
  await page.waitForTimeout(150);
  await page.locator('#btn-peek-delete').click();
  await page.waitForTimeout(150);
  // focus should be cancel
  const focused = await page.evaluate(() => document.activeElement && document.activeElement.id);
  console.log('confirm focus (expect btn-cancel-confirm):', focused);
  await page.locator('#btn-do-delete').click();
  await page.waitForTimeout(150);
  const toastText = await page.locator('.toast').first().innerText();
  console.log('toast:', toastText.replace(/\n/g, ' | '));
  await page.screenshot({ path: path.join(__dirname, 'proto-05-toast.png') });

  // Keyboard N
  await page.keyboard.press('Escape');
  await page.locator('body').click({ position: { x: 10, y: 10 } });
  await page.keyboard.press('n');
  await page.waitForTimeout(150);
  console.log('modal via N:', await page.locator('#modal-backdrop').isVisible());
  await page.keyboard.press('Escape');

  // Empty search state
  await page.fill('#search-input', 'zzzz-not-found');
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(__dirname, 'proto-06-empty.png') });

  console.log('page errors:', errors.length ? errors : 'none');
  await browser.close();
  console.log('OK');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
