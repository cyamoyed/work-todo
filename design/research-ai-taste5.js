const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
  });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: 'en-US',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });

  const pages = [];

  async function grab(url, name) {
    const page = await ctx.newPage();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 50000 });
      await page.waitForTimeout(2500);
      const title = await page.title();
      const text = await page.evaluate(() => {
        const root = document.querySelector('article, main, .post, .article, .md, #content, body');
        return ((root && root.innerText) || document.body.innerText || '').replace(/\n{3,}/g, '\n\n').slice(0, 10000);
      });
      pages.push({ name, url: page.url(), title, text });
      console.log('READ', name, title.slice(0, 70), 'len', text.length);
    } catch (e) {
      console.log('FAIL', name, e.message);
    } finally {
      await page.close();
    }
  }

  // Google SERP
  const q = 'how to make UI design not look AI generated slop craft';
  const serpPage = await ctx.newPage();
  await serpPage.goto('https://www.google.com/search?q=' + encodeURIComponent(q) + '&hl=en', {
    waitUntil: 'domcontentloaded',
    timeout: 50000,
  });
  await serpPage.waitForTimeout(2500);
  const links = await serpPage.evaluate(() => {
    const out = [];
    document.querySelectorAll('a').forEach((a) => {
      const h = a.href || '';
      if (h.startsWith('http') && !/google\.|gstatic|accounts\./.test(h)) {
        const t = (a.innerText || '').trim();
        if (t.length > 15) out.push({ title: t.slice(0, 120), href: h });
      }
    });
    return out.slice(0, 12);
  });
  console.log('GOOGLE LINKS');
  links.forEach((l) => console.log(' -', l.title.slice(0, 70), '|', l.href.slice(0, 90)));

  // Known craft pages
  await grab('https://linear.app/method', 'linear-method');
  await grab('https://www.smashingmagazine.com/2024/03/investing-quality-web-design-ai-era/', 'smashing-ai-era');
  await grab('https://www.nngroup.com/articles/ai-first-ux/', 'nng-ai-ux');

  for (const l of links) {
    if (pages.length >= 8) break;
    if (/youtube|twitter|x\.com|facebook|linkedin\.com\/login/i.test(l.href)) continue;
    await grab(l.href, l.title.slice(0, 40));
  }

  fs.writeFileSync(path.join(__dirname, 'research-raw5.json'), JSON.stringify({ q, links, pages }, null, 2), 'utf8');
  console.log('DONE', pages.length);
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
