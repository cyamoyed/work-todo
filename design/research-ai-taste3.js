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
    locale: 'zh-CN',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });

  const pages = [];
  const serp = [];

  async function readPage(url, titleHint) {
    const page = await ctx.newPage();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 50000 });
      await page.waitForTimeout(2500);
      const text = await page.evaluate(() => {
        const root = document.querySelector('article, main, .Post-RichText, .RichText, .post-content, .article-content, #content, body');
        const t = (root ? root.innerText : document.body.innerText) || '';
        return t.replace(/\n{3,}/g, '\n\n').slice(0, 9000);
      });
      const title = await page.title();
      pages.push({ title: title || titleHint, url, text });
      console.log('READ', title.slice(0, 80), 'len', text.length);
    } catch (e) {
      console.log('FAIL', url, e.message);
    } finally {
      await page.close();
    }
  }

  async function search(engine, q) {
    const page = await ctx.newPage();
    try {
      const url =
        engine === 'baidu'
          ? 'https://www.baidu.com/s?wd=' + encodeURIComponent(q)
          : 'https://cn.bing.com/search?q=' + encodeURIComponent(q);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 50000 });
      await page.waitForTimeout(2000);
      const results = await page.evaluate((eng) => {
        const items = [];
        const sel = eng === 'baidu' ? '.result h3 a, .c-container h3 a' : '#b_results > li.b_algo h2 a';
        document.querySelectorAll(sel).forEach((a) => {
          if (a && a.href) items.push({ title: a.innerText.trim(), href: a.href });
        });
        return items.slice(0, 10);
      }, engine);
      serp.push({ engine, q, results });
      console.log(engine.toUpperCase(), q, '->', results.length);
      results.slice(0, 6).forEach((r) => console.log(' -', r.title.slice(0, 60), '|', r.href.slice(0, 100)));
    } catch (e) {
      console.log('SERP FAIL', engine, q, e.message);
    } finally {
      await page.close();
    }
  }

  // Direct high-value targets
  await readPage('https://zhuanlan.zhihu.com/p/622086961', 'Linear 风设计');
  await readPage('https://zhuanlan.zhihu.com/p/701826175', 'Linear 工具');
  await readPage('https://linear.app/method', 'Linear method');
  await readPage('https://linear.app/', 'Linear');

  await search('baidu', 'AI生成的UI为什么很像 去AI感 设计');
  await search('baidu', '界面设计 AI感 紫色渐变 毛玻璃 同质化');
  await search('bing', 'site:zhihu.com AI感 界面设计');
  await search('bing', 'designing interfaces that do not look AI generated');

  // Read more from serp
  const seen = new Set(pages.map((p) => p.url));
  for (const block of serp) {
    for (const r of block.results) {
      if (seen.has(r.href)) continue;
      if (/baidu\.com\/link|bing\.com|microsoft\.com|translate\./i.test(r.href)) continue;
      // skip if not design-related
      if (!/设计|ui|ux|design|linear|interface|界面|ai感|slop/i.test(r.title + r.href)) continue;
      seen.add(r.href);
      if (pages.length >= 10) break;
      await readPage(r.href, r.title);
    }
  }

  fs.writeFileSync(path.join(__dirname, 'research-raw3.json'), JSON.stringify({ serp, pages }, null, 2), 'utf8');
  console.log('DONE', pages.length, 'pages');
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
