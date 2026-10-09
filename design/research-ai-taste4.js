const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const TARGETS = [
  {
    name: 'baidu-blue-purple',
    url: 'http://www.baidu.com/link?url=M4CzONlkCwV9scQEIpAgO3x5PR34m8uQKnDR0TaEIAGl6-WGx-1_Rq4RDHp7XS5stRy2Tw',
  },
  {
    name: 'baidu-aesthetic-rules',
    url: 'http://www.baidu.com/link?url=_AtEGsjDiEXWVoZT-HmFRoQRmi5qtgKDlemBOyMTWCwGbk9bJ5Rc95R-ixpxzxliVjnLeN',
  },
  {
    name: 'baidu-remove-ai-taste',
    url: 'http://www.baidu.com/link?url=MKej9zJ6O4YxsE4VasGj_heBtdG7_NFpe75qAYTxPMwkUo89jY9CeCZpy25BiD-eSQCl3w',
  },
  {
    name: 'baidu-ui-drift',
    url: 'http://www.baidu.com/link?url=MKej9zJ6O4YxsE4VasGj_heBtdG7_NFpe75qAYTxPMuJsuDccKaGEukl7FfODdNN44R3_t',
  },
];

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
  });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: 'zh-CN',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    extraHTTPHeaders: { 'Referer': 'https://www.baidu.com/' },
  });

  const pages = [];
  for (const t of TARGETS) {
    const page = await ctx.newPage();
    try {
      await page.goto(t.url, { waitUntil: 'domcontentloaded', timeout: 50000 });
      await page.waitForTimeout(3000);
      // follow meta refresh if any
      const finalUrl = page.url();
      const title = await page.title();
      const text = await page.evaluate(() => {
        const root = document.querySelector('article, main, #content, .article, .post, .content, body');
        const t = (root ? root.innerText : document.body.innerText) || '';
        return t.replace(/\n{3,}/g, '\n\n').slice(0, 12000);
      });
      pages.push({ name: t.name, finalUrl, title, text });
      console.log('READ', t.name, '=>', finalUrl.slice(0, 90), 'title:', title.slice(0, 60), 'len', text.length);
    } catch (e) {
      console.log('FAIL', t.name, e.message);
    } finally {
      await page.close();
    }
  }

  fs.writeFileSync(path.join(__dirname, 'research-raw4.json'), JSON.stringify(pages, null, 2), 'utf8');
  console.log('DONE');
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
