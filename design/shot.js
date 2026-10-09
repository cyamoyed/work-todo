const path = require('path');
const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
  await page.goto('http://127.0.0.1:8765/design/directions.html', { waitUntil: 'networkidle', timeout: 30000 });

  for (const id of ['dir-a', 'dir-b', 'dir-c']) {
    const title = await page.locator(`#${id} .dir-title`).innerText();
    const text = await page.locator(`#${id} .frame-wrap`).innerText();
    const marker =
      text.includes('导出数据') ? 'precision' :
      text.includes('先处理最紧的那件') ? 'quiet-desk' :
      text.includes('今日节奏') ? 'dayline' : 'unknown';
    const file = path.join(__dirname, `preview-${id}-${marker}.png`);
    await page.locator(`#${id} .frame-wrap`).screenshot({ path: file });
    console.log(id, '=>', title, '=>', marker, '=>', path.basename(file));
  }

  await page.screenshot({ path: path.join(__dirname, 'preview-full.png'), fullPage: true });
  await browser.close();
  console.log('OK');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
