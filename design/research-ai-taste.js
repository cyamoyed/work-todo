const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const QUERIES = [
  'UI设计 去AI味 要点',
  'AI生成UI设计 如何避免AI感 界面设计',
  'AI slop UI design how to avoid looking AI generated',
  'modern product UI design anti AI aesthetic principles',
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

  const out = [];
  for (const q of QUERIES) {
    const url = 'https://cn.bing.com/search?q=' + encodeURIComponent(q);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1500);
    const results = await page.evaluate(() => {
      const items = [];
      document.querySelectorAll('#b_results > li.b_algo').forEach((li) => {
        const a = li.querySelector('h2 a');
        const p = li.querySelector('.b_caption p, .b_caption .b_lineclamp2, p');
        if (a) {
          items.push({
            title: (a.innerText || '').trim(),
            href: a.href,
            snippet: (p ? p.innerText : '').trim().slice(0, 400),
          });
        }
      });
      return items.slice(0, 8);
    });
    out.push({ query: q, url, results });
    console.log('SERP', q, '->', results.length, 'results');
    for (const r of results.slice(0, 5)) {
      console.log(' -', r.title, '|', r.href);
    }
  }

  // Open top promising unique pages and extract main text
  const seen = new Set();
  const pages = [];
  const preferred = [];
  for (const block of out) {
    for (const r of block.results) {
      if (!r.href || seen.has(r.href)) continue;
      if (/bing\.com|microsoft\.com\/zh-cn\/bing/i.test(r.href)) continue;
      seen.add(r.href);
      preferred.push(r);
    }
  }

  // Prioritize likely craft articles
  const rank = (r) => {
    const s = (r.title + ' ' + r.snippet + ' ' + r.href).toLowerCase();
    let score = 0;
    if (/ai.slop|ai感|ai味|ai 生成|ai-generated|looks ai|slop/.test(s)) score += 5;
    if (/design|ui|ux|界面|设计/.test(s)) score += 3;
    if (/medium|zhihu|uisdc|uisdc|figma|linear|vercel|nielsen|nngroup|smashing|uxdesign/.test(s)) score += 2;
    return -score;
  };
  preferred.sort((a, b) => rank(a) - rank(b));

  const toRead = preferred.slice(0, 6);
  for (const r of toRead) {
    try {
      await page.goto(r.href, { waitUntil: 'domcontentloaded', timeout: 40000 });
      await page.waitForTimeout(1800);
      const text = await page.evaluate(() => {
        const root = document.querySelector('article, main, .post, .article, #content, body');
        const t = (root ? root.innerText : document.body.innerText) || '';
        return t.replace(/\n{3,}/g, '\n\n').slice(0, 6000);
      });
      pages.push({ title: r.title, url: r.href, text });
      console.log('READ', r.title, 'len', text.length);
    } catch (e) {
      console.log('FAIL', r.href, e.message);
    }
  }

  fs.writeFileSync(
    path.join(__dirname, 'research-raw.json'),
    JSON.stringify({ serp: out, pages }, null, 2),
    'utf8'
  );
  console.log('WROTE research-raw.json pages=', pages.length);
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
