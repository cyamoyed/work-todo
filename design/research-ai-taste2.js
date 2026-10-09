const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const QUERIES = [
  '为什么AI生成的界面都很像 如何避免AI感',
  '"AI slop" UI design avoid',
  'AI generated UI looks the same purple gradient glassmorphism',
  '界面设计 去掉AI感 排版 色彩 克制',
  'Linear Notion Vercel design principles craft typography density',
];

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
  });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    locale: 'zh-CN',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });

  const serpOut = [];
  for (const q of QUERIES) {
    // Try Bing first
    let url = 'https://cn.bing.com/search?q=' + encodeURIComponent(q) + '&setlang=en';
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1200);
    let results = await page.evaluate(() => {
      const items = [];
      document.querySelectorAll('#b_results > li.b_algo').forEach((li) => {
        const a = li.querySelector('h2 a');
        const p = li.querySelector('.b_caption p, p');
        if (a) items.push({ title: a.innerText.trim(), href: a.href, snippet: (p ? p.innerText : '').trim().slice(0, 500) });
      });
      return items.slice(0, 8);
    });
    console.log('BING', q, '->', results.length);
    for (const r of results.slice(0, 6)) console.log(' -', r.title, '|', r.href);
    serpOut.push({ engine: 'bing', query: q, results });
  }

  // Also try DuckDuckGo html
  for (const q of QUERIES) {
    const url = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(1000);
      const results = await page.evaluate(() => {
        const items = [];
        document.querySelectorAll('.result').forEach((li) => {
          const a = li.querySelector('.result__a');
          const s = li.querySelector('.result__snippet');
          if (a) items.push({ title: a.innerText.trim(), href: a.href, snippet: (s ? s.innerText : '').trim().slice(0, 500) });
        });
        return items.slice(0, 8);
      });
      console.log('DDG', q, '->', results.length);
      for (const r of results.slice(0, 6)) console.log(' -', r.title, '|', r.href);
      serpOut.push({ engine: 'ddg', query: q, results });
    } catch (e) {
      console.log('DDG FAIL', q, e.message);
    }
  }

  // Rank and read best pages
  const seen = new Set();
  const candidates = [];
  for (const block of serpOut) {
    for (const r of block.results || []) {
      if (!r.href || seen.has(r.href)) continue;
      if (/bing\.com|duckduckgo\.com|microsoft\.com|baike\.baidu|dictionary\.|cambridge|iciba|bilibili\.com\/video/i.test(r.href)) continue;
      seen.add(r.href);
      candidates.push(r);
    }
  }
  const rank = (r) => {
    const s = (r.title + ' ' + r.snippet + ' ' + r.href).toLowerCase();
    let score = 0;
    if (/slop|ai感|ai味|ai-generated|looks ai|purple gradient|glassmorph|same-y|cookie.cutter/.test(s)) score += 6;
    if (/typography|spacing|restraint|craft|design system|hierarchy|human/.test(s)) score += 3;
    if (/ui|ux|interface|界面|设计/.test(s)) score += 2;
    if (/medium\.com|substack|smashingmagazine|nngroup|linear\.app|vercel|figma|uxdesign|toptal|nielsen/.test(s)) score += 3;
    if (/zhihu|sspai|uisdc|uisdc|juejin|infoq/.test(s)) score += 2;
    return -score;
  };
  candidates.sort((a, b) => rank(a) - rank(b));
  console.log('CANDIDATES', candidates.length);
  candidates.slice(0, 10).forEach((r, i) => console.log(i, r.title, r.href));

  const pages = [];
  for (const r of candidates.slice(0, 8)) {
    try {
      await page.goto(r.href, { waitUntil: 'domcontentloaded', timeout: 40000 });
      await page.waitForTimeout(2000);
      const text = await page.evaluate(() => {
        const root = document.querySelector('article, main, .post-content, .article-content, .markdown-body, #content, body');
        const t = (root ? root.innerText : document.body.innerText) || '';
        return t.replace(/\n{3,}/g, '\n\n').slice(0, 8000);
      });
      pages.push({ title: r.title, url: r.href, text });
      console.log('READ', r.title, 'len', text.length);
    } catch (e) {
      console.log('FAIL', r.href, e.message);
    }
  }

  fs.writeFileSync(path.join(__dirname, 'research-raw2.json'), JSON.stringify({ serp: serpOut, pages }, null, 2), 'utf8');
  console.log('DONE pages', pages.length);
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
