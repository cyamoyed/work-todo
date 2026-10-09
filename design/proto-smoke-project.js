const { chromium } = require('playwright-core');
const path = require('path');

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('http://127.0.0.1:8765/design/prototype.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(300);

  const projCount = await page.locator('.proj-item').count();
  console.log('projects in sidebar:', projCount);

  // Click first project
  await page.locator('.proj-item').first().click();
  await page.waitForTimeout(200);
  const strip = await page.locator('#strip').innerText();
  console.log('project strip:', strip.replace(/\n/g, ' | ').slice(0, 120));
  const progressVisible = await page.locator('#project-progress').isVisible();
  console.log('project progress bar:', progressVisible);
  await page.screenshot({ path: path.join(__dirname, 'shot-project.png') });

  // Quick add into project
  await page.fill('#quick-title', '项目内速记');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  const inProject = await page.locator('.row-title', { hasText: '项目内速记' }).count();
  console.log('quick add into project:', inProject === 1);

  // Create new project
  await page.locator('#btn-new-project').click();
  await page.waitForTimeout(150);
  await page.fill('#f-proj-name', '新项目试验');
  await page.locator('#f-proj-color button[data-value="amber"]').click();
  await page.locator('#project-form button[type="submit"]').click();
  await page.waitForTimeout(200);
  const names = await page.locator('.proj-item .name').allInnerTexts();
  console.log('project names:', names.join(' / '));

  // Task modal has project select
  await page.locator('#btn-new').click();
  await page.waitForTimeout(150);
  const opts = await page.locator('#f-project option').count();
  console.log('project options in form:', opts);
  await page.fill('#f-title', '带项目的任务');
  await page.locator('#task-form button[type="submit"]').click();
  await page.waitForTimeout(150);

  // Peek shows project
  await page.locator('.row-title', { hasText: '带项目的任务' }).click();
  await page.waitForTimeout(150);
  const peekProj = await page.locator('#peek-project').inputValue();
  console.log('peek project set:', !!peekProj);
  await page.screenshot({ path: path.join(__dirname, 'shot-peek-project.png') });
  await page.locator('#btn-close-peek').click();

  // Project menu rename/delete
  await page.locator('.proj-item').first().hover();
  await page.locator('.proj-item').first().locator('.more').click();
  await page.waitForTimeout(150);
  console.log('project menu visible:', await page.locator('#project-menu').isVisible());
  await page.locator('#project-menu button[data-act="delete"]').click();
  await page.waitForTimeout(150);
  console.log('after delete projects:', await page.locator('.proj-item').count());

  // dayline still works with project chips
  await page.locator('.nav-item[data-view="dayline"]').click();
  await page.waitForTimeout(150);
  console.log('dayline groups:', await page.locator('.day-group').count());
  await page.screenshot({ path: path.join(__dirname, 'shot-dayline-project.png') });

  console.log('page errors:', errors.length ? errors : 'none');
  await browser.close();
  console.log('OK');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
