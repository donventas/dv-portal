import { chromium } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const [, , source, destination] = process.argv;
if (!source || !destination) {
  console.error('Uso: node scripts/render-social-card.mjs <fuente.html> <salida.png>');
  process.exit(1);
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(path.resolve(source)).href, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => [...document.images].every((image) => image.complete && image.naturalWidth > 0));
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.resolve(destination), type: 'png', fullPage: false });
} finally {
  await browser.close();
}
