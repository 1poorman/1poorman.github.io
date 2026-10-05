const { test, expect } = require('@playwright/test');

const chronos = 'Chronos-2: The best Time Series Forecasting model?';
const benchmark = '时序多模型基准：时序异常检测与预测对比';
const notes = page => page.locator('[data-article]:visible');
const noteTitles = page => notes(page).locator('h3');
const pageErrors = new WeakMap();

test.beforeEach(async ({ page }) => {
  const errors = [];
  pageErrors.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
});
test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page), 'Uncaught page errors').toEqual([]);
});

for (const width of [1280, 1440, 1920]) {
  test('desktop layout and navigation at ' + width + 'px', async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    for (const path of ['./', 'archive/', 'experiments/', 'topics/', 'projects/']) {
      const response = await page.goto(path);
      expect(response.status()).toBe(200);
      await expect(page.locator('main h1')).toBeVisible();
      await expect(page.getByRole('navigation', { name: '主导航' })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  });
}

test('catalogue, feed and legacy search corpus expose the same formal articles', async ({ page, request }) => {
  const corpus = await (await request.get('assets/data/searchcorpus.json')).json();
  await page.goto('archive/');
  await expect(notes(page)).toHaveCount(corpus.length);
  await expect(page.locator('[data-result-count]')).toHaveText('共 ' + corpus.length + ' 篇记录');
  const articleLinks = await notes(page).locator('h3 a').evaluateAll(links => links.map(link => link.getAttribute('href')).sort());
  expect(articleLinks).toEqual(corpus.map(post => post.url).sort());
  const feed = await (await request.get('feed.xml')).text();
  const sitemap = await (await request.get('sitemap.xml')).text();
  for (const sample of ['flake-it-till-you-make-it', 'sample-markdown']) {
    expect(JSON.stringify(corpus)).not.toContain(sample);
    expect(feed).not.toContain(sample);
    expect(sitemap).not.toContain(sample);
  }
  expect((feed.match(/<item>/g) || []).length).toBe(Math.min(corpus.length, 20));
  for (const link of articleLinks) expect((await request.get(link)).status()).toBe(200);
});

test('topic, type and query filters combine; empty state resets all criteria', async ({ page }) => {
  await page.goto('archive/');
  const total = await notes(page).count();
  await page.getByRole('button', { name: /^技术分析/ }).click();
  await page.getByLabel('主题', { exact: true }).selectOption('time-series');
  await expect(page.getByRole('heading', { name: chronos, exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: benchmark, exact: true })).toBeHidden();
  await page.getByRole('searchbox').fill('Ｃｈｒｏｎｏｓ　微调');
  await expect(noteTitles(page)).toHaveText([chronos]);
  await page.getByRole('searchbox').fill('没有这条记录__validation_8723');
  await expect(notes(page)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '没有找到匹配的记录' })).toBeVisible();
  await page.getByRole('button', { name: /查看全部记录/ }).click();
  await expect(notes(page)).toHaveCount(total);
  await expect(page.getByRole('searchbox')).toBeFocused();
  expect(new URL(page.url()).search).toBe('');
});

test('Chinese IME waits for composition; mixed Chinese and English terms work', async ({ page }) => {
  await page.goto('archive/');
  const total = await notes(page).count();
  const query = page.getByRole('searchbox');
  await query.dispatchEvent('compositionstart');
  await query.fill('Chronos 微调');
  await page.waitForTimeout(250);
  await expect(notes(page)).toHaveCount(total);
  await query.dispatchEvent('compositionend');
  await expect(noteTitles(page)).toHaveText([chronos]);
  await query.fill('gru 仿真');
  await expect(noteTitles(page)).toHaveText([benchmark]);
});

test('shared URL, reload, article return and browser history restore filters', async ({ page }) => {
  await page.goto('archive/?q=Chronos&topic=time-series&kind=analysis&sort=title');
  await expect(noteTitles(page)).toHaveText([chronos]);
  await page.reload();
  await expect(page.getByRole('searchbox')).toHaveValue('Chronos');
  await expect(page.getByLabel('排序', { exact: true })).toHaveValue('title');
  await page.getByRole('link', { name: chronos, exact: true }).click();
  await expect(page.locator('.blog-post')).toBeVisible();
  await page.goBack();
  await expect(noteTitles(page)).toHaveText([chronos]);
  await page.getByRole('button', { name: /清除筛选/ }).click();
  await page.getByRole('button', { name: /^技术分析/ }).click();
  await page.getByLabel('主题', { exact: true }).selectOption('time-series');
  await page.getByLabel('排序', { exact: true }).selectOption('title');
  await page.goBack();
  await expect(page.getByLabel('排序', { exact: true })).toHaveValue('published');
  await expect(page.getByLabel('主题', { exact: true })).toHaveValue('time-series');
  await page.goBack();
  await expect(page.getByLabel('主题', { exact: true })).toHaveValue('');
  await expect(page.getByRole('button', { name: /^技术分析/ })).toHaveAttribute('aria-pressed', 'true');
  await page.goForward();
  await expect(page.getByLabel('主题', { exact: true })).toHaveValue('time-series');
});

test('sorting retains records and can promote an older article with a new revision date', async ({ page }) => {
  await page.route('**/archive/', async route => {
    const response = await route.fetch();
    let body = await response.text();
    body = body.replace(/(<article\b[^>]*data-title="deepseek-ocr-2试用"[^>]*data-updated=")\d+(")/,
      (_, prefix, suffix) => prefix + '2147483647' + suffix);
    await route.fulfill({ response, body });
  });
  await page.goto('archive/');
  await expect(noteTitles(page).first()).toHaveText(benchmark);
  const original = (await noteTitles(page).allTextContents()).map(title => title.trim());
  await page.getByLabel('排序', { exact: true }).selectOption('updated');
  await expect(noteTitles(page).first()).toHaveText('deepseek-ocr-2试用');
  await page.getByLabel('排序', { exact: true }).selectOption('title');
  const sorted = (await noteTitles(page).allTextContents()).map(title => title.trim());
  expect(sorted).not.toEqual(original);
  expect(sorted.slice().sort()).toEqual(original.slice().sort());
  expect(sorted.indexOf('Build un custom MCP')).toBeLessThan(sorted.indexOf(chronos));
  await page.getByLabel('排序', { exact: true }).selectOption('published');
  await expect(noteTitles(page)).toHaveText(original);
});

test('home topic links and header search lead to the correct working controls', async ({ page }) => {
  await page.goto('./');
  await page.locator('.lab-research-index').getByRole('link', { name: /时序建模/ }).click();
  await expect(page.getByLabel('主题', { exact: true })).toHaveValue('time-series');
  await expect(page.getByRole('heading', { name: chronos, exact: true })).toBeVisible();
  await page.getByRole('link', { name: '查找文章', exact: true }).click();
  await expect(page.getByRole('searchbox')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('主题', { exact: true })).toBeFocused();
});

test('experiments stay scoped to experiment records even with a conflicting URL', async ({ page }) => {
  await page.goto('experiments/?kind=analysis');
  await expect(page.getByRole('heading', { name: benchmark, exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: chronos, exact: true })).toHaveCount(0);
  await page.getByLabel('主题', { exact: true }).selectOption('models-vision');
  await expect(noteTitles(page)).toHaveText(['deepseek-ocr-2试用']);
  await page.getByRole('searchbox').fill('validation_no_such_experiment');
  await expect(notes(page)).toHaveCount(0);
  await page.getByRole('button', { name: /查看全部记录/ }).click();
  await expect(page.getByRole('heading', { name: benchmark, exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: chronos, exact: true })).toHaveCount(0);
});

test('theme follows system preference, persists a choice and works from the keyboard', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const toggle = page.getByRole('button', { name: '切换到浅色模式' });
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('link', { name: '文章', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('content and navigation remain available without JavaScript', async ({ browser, request, baseURL }) => {
  const corpus = await (await request.get('assets/data/searchcorpus.json')).json();
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL, viewport: { width: 1440, height: 1000 } });
  try {
    const page = await context.newPage();
    await page.goto('archive/');
    await expect(notes(page)).toHaveCount(corpus.length);
    await expect(page.locator('[data-index-controls]')).toBeHidden();
    await expect(page.locator('[data-theme-toggle]')).toBeHidden();
    await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '专题', exact: true }).click();
    await expect(page.getByRole('heading', { name: '时序建模', exact: true })).toBeVisible();
    await page.getByRole('link', { name: chronos, exact: true }).click();
    await expect(page.locator('.blog-post')).toBeVisible();
  } finally {
    await context.close();
  }
});

test('legacy articles, about, tags and pagination retain working navigation', async ({ page }) => {
  for (const path of ['aboutme/', 'tags/', 'page2/', 'page3/', 'page4/', '2026-03-05-deepseek-ocr-2/', '2026-09-23-timeseries-anomaly-model-benchmark/']) {
    const response = await page.goto(path, { waitUntil: 'domcontentloaded' });
    expect(response.status()).toBe(200);
    await expect(page.getByRole('navigation', { name: '主导航' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.locator('a[href*="sample-markdown"], a[href*="flake-it-till-you-make-it"]').count()).toBe(0);
  }
  await page.goto('2026-03-05-deepseek-ocr-2/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.blog-pager .previous')).toHaveCount(0);
  const topic = page.getByRole('button', { name: '模型与视觉', exact: true });
  await topic.focus();
  await page.keyboard.press('Enter');
  await expect(topic).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Enter');
  await expect(topic).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('button', { name: '切换到深色模式' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('malformed legacy Chronos URLs recover without losing query or section', async ({ page, baseURL }) => {
  for (const date of ['2026-07-01', '2026-10-05']) {
    await page.goto(date + '-2026-06-25-chronos-2-learning/?from=old#chronos', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(new URL('2026-06-25-chronos-2-learning/?from=old#chronos', baseURL).href);
    await expect(page.locator('.blog-post')).toBeVisible();
  }
  const response = await page.goto('no-such-note-validation/');
  expect(response.status()).toBe(404);
  await expect(page.getByRole('heading', { name: /暂时没有找到/ })).toBeVisible();
  await expect(page).toHaveURL(new URL('no-such-note-validation/', baseURL).href);
});
