const { chromium } = require('playwright-core');
const path = require('path');

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const out = (n) => path.join(__dirname, 'output', n);

  await page.goto('http://127.0.0.1:8765/index.html?fresh=' + Date.now(), {
    waitUntil: 'networkidle',
  });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  await page.screenshot({ path: out('v03-01-empty.png') });

  await page.click('#btn-new');
  await page.waitForTimeout(150);
  await page.screenshot({ path: out('v03-02-modal.png') });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);

  await page.fill('#quick-title', '走查任务 A');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(120);

  await page.click('#btn-new');
  await page.fill('#field-title', '走查任务 B');
  await page.click('#field-status-wrap button[data-status="in-progress"]');
  await page.click('#task-form button[type="submit"]');
  await page.waitForTimeout(150);
  await page.screenshot({ path: out('v03-03-list.png') });

  await page.click('#btn-new');
  await page.waitForTimeout(100);
  await page.click('#btn-due');
  await page.waitForTimeout(200);
  await page.screenshot({ path: out('v03-04-calendar.png') });
  await page.keyboard.press('Escape');

  // custom time picker
  await page.click('#btn-new');
  await page.waitForTimeout(100);
  await page.click('#btn-due-time');
  await page.waitForTimeout(150);
  await page.screenshot({ path: out('v03-05-time.png') });
  await page.keyboard.press('Escape');

  // project select
  await page.click('#btn-new-project');
  await page.waitForTimeout(100);
  await page.screenshot({ path: out('v03-06-project.png') });

  console.log('OK');
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
