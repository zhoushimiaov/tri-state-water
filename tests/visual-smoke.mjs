// Automated browser smoke test: WebGL shader compilation, input state, and desktop/mobile screenshots.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

mkdirSync('screenshots', { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const errors = [];
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
page.on('pageerror', error => errors.push(error.message));

async function checkScene(state, screenshot) {
  await page.goto('http://127.0.0.1:4173/?state=' + state, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__frames > 12, null, { timeout: 30000 });
  await page.waitForTimeout(700);
  const diagnostics = await page.evaluate(() => ({
    frames: window.__frames, error: window.__lastError || '',
    gl: Boolean(document.querySelector('#gl')?.getContext('webgl2')),
    width: document.querySelector('#gl')?.width
  }));
  assert.ok(diagnostics.gl, 'WebGL2 unavailable');
  assert.ok(diagnostics.frames > 12, 'Animation loop stopped');
  assert.equal(diagnostics.error, '', 'Runtime error: ' + diagnostics.error);
  assert.ok(diagnostics.width >= 720, 'Canvas failed to resize');
  await page.screenshot({ path: 'screenshots/' + screenshot, animations: 'disabled' });
  console.log(state, diagnostics);
}

try {
  await checkScene('water', 'water-desktop.png');
  await checkScene('ice', 'ice-desktop.png');
  await checkScene('steam', 'steam-desktop.png');

  await page.setViewportSize({ width: 390, height: 844 });
  await checkScene('water', 'water-mobile.png');
  const layout = await page.evaluate(() => {
    const rect = document.querySelector('#panel').getBoundingClientRect();
    return { left: rect.left, right: rect.right, width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth };
  });
  assert.ok(layout.left >= 0 && layout.right <= layout.width, 'Mobile panel exceeds viewport');
  assert.ok(layout.scrollWidth <= layout.width + 1, 'Unexpected horizontal overflow');

  await page.locator('#slider').evaluate(element => {
    element.value = '68';
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  assert.equal(await page.locator('#targetReading').textContent(), '68°C');
  assert.ok(page.url().includes('temp=68'), 'Custom temperature missing from shareable URL');
  await page.reload({ waitUntil: 'domcontentloaded' });
  assert.equal(await page.locator('#slider').inputValue(), '68');
  await page.locator('.preset[data-t="130"]').click();
  assert.equal(await page.locator('#slider').inputValue(), '130');
  assert.equal(await page.locator('.preset[data-t="130"]').getAttribute('aria-pressed'), 'true');

  await page.setViewportSize({ width: 350, height: 740 });
  await page.screenshot({ path: 'screenshots/water-small-mobile.png' });
  const narrowPanel = await page.locator('#panel').boundingBox();
  assert.ok(narrowPanel.x >= 0 && narrowPanel.x + narrowPanel.width <= 350);
  assert.deepEqual(errors, [], 'Unexpected page errors');
  console.log('WebGL/browser smoke tests passed.');
} finally {
  await browser.close();
}
