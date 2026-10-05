const { chromium } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');

(async () => {
  const output = path.resolve(__dirname, '../docs/previews');
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      baseURL: process.env.LAB_BASE_URL || 'http://127.0.0.1:4173/',
      viewport: { width: 1440, height: 1000 },
      colorScheme: 'light',
      deviceScaleFactor: 1
    });
    for (const [name, route, theme] of [
      ['home-light', './', 'light'],
      ['home-dark', './', 'dark'],
      ['archive-light', 'archive/', 'light']
    ]) {
      await page.emulateMedia({ colorScheme: theme });
      const response = await page.goto(route);
      if (response.status() !== 200) throw new Error(route + ': HTTP ' + response.status());
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: path.join(output, name + '.png'), fullPage: true, animations: 'disabled' });
      console.log('Saved ' + name + '.png');
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
