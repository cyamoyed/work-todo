// 渲染 design/app-icon.html 的 canvas，导出 PNG 源图。
// 用法：node design/export-icon.js [尺寸]  （默认 1024；可用 WORK_TODO_CHROME_PATH 指定浏览器）
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

function findChrome() {
  if (process.env.WORK_TODO_CHROME_PATH) return process.env.WORK_TODO_CHROME_PATH;
  const base = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright');
  try {
    for (const entry of fs.readdirSync(base)) {
      if (entry.startsWith('chromium-') && !entry.includes('headless')) {
        const candidate = path.join(base, entry, 'chrome-win64', 'chrome.exe');
        if (fs.existsSync(candidate)) return candidate;
      }
    }
  } catch (_) {
    /* fall through */
  }
  return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
}

const size = Number(process.argv[2]) || 1024;
const browser = await chromium.launch({ executablePath: findChrome(), headless: true });
const page = await browser.newPage();
await page.goto(pathToFileURL(path.join(import.meta.dirname, 'app-icon.html')).href, { timeout: 30000 });
const dataUrl = await page.evaluate((px) => window.renderToDataURL(px), size);
await browser.close();

const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
const out = path.join(import.meta.dirname, `app-icon-${size}.png`);
fs.writeFileSync(out, buf);
console.log('written', out, `(${buf.length} bytes)`);
