const { chromium } = require('playwright-core');
const path = require('path');

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  await page.goto('http://127.0.0.1:8765/design/prototype.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  await page.screenshot({ path: path.join(__dirname, 'shot-list.png') });
  console.log('list view title check:', await page.locator('.nav-item.active').innerText());

  await page.locator('.nav-item[data-view="dayline"]').click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(__dirname, 'shot-dayline.png') });
  console.log('dayline groups:', await page.locator('.day-group').count());

  await page.locator('#btn-new').click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(__dirname, 'shot-modal.png') });
  await page.keyboard.press('Escape');

  await page.locator('.nav-item[data-view="today"]').click();
  await page.waitForTimeout(150);
  await page.locator('.row-title').first().click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(__dirname, 'shot-peek.png') });

  await browser.close();
  console.log('OK');
})().catch((e) => { console.error(e); process.exit(1); });
