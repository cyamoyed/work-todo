const { chromium } = require("playwright-core");
const path = require("path");
(async () => {
  const browser = await chromium.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto("http://127.0.0.1:5177/proto-quick-capture.html?v=" + Date.now(), { waitUntil: "networkidle" });
  await page.waitForTimeout(150);
  const out = (n) => path.join("design", "output", n);

  await page.screenshot({ path: out("qc-order-default.png") });

  await page.click("#capture-input");
  await page.waitForTimeout(120);
  await page.screenshot({ path: out("qc-order-focus.png") });

  await page.fill("#capture-input", "约产品对一下下周的优先级");
  await page.click('[data-due="tomorrow"]');
  await page.click('[data-prio="high"]');
  await page.keyboard.press("Enter");
  await page.waitForTimeout(450);
  await page.screenshot({ path: out("qc-order-landed.png") });

  await browser.close();
  console.log("ok");
})().catch((e) => { console.error(e); process.exit(1); });
