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
const page = await browser.newPage({ viewport: { width: 1024, height: 640 }, deviceScaleFactor: 1 });
page.on('pageerror', error => errors.push(error.message));

async function checkScene(state, screenshot) {
  await page.goto('http://127.0.0.1:4173/?quality=low&state=' + state, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__frames > 10, null, { timeout: 60000 });
  await page.waitForTimeout(250);
  const diagnostics = await page.evaluate(() => ({
    frames: window.__frames, error: window.__lastError || '',
    gl: Boolean(document.querySelector('#gl')?.getContext('webgl2')),
    width: document.querySelector('#gl')?.width,
    glError: document.querySelector('#gl').getContext('webgl2').getError(),
    initialRippleCount: rippleHead
  }));
  assert.ok(diagnostics.gl, 'WebGL2 unavailable');
  assert.equal(diagnostics.glError, 0, 'WebGL error after drawing');
  assert.equal(diagnostics.initialRippleCount, 0, 'Preset URLs should not create a startup shock ripple');
  assert.ok(diagnostics.frames > 10, 'Animation loop stopped');
  assert.equal(diagnostics.error, '', 'Runtime error: ' + diagnostics.error);
  assert.ok(diagnostics.width >= 300, 'Canvas failed to resize');
  // Stop continuous GPU drawing while Playwright captures the last complete frame.
  await page.evaluate(() => { window.__suspendRendering = true; });
  await page.waitForTimeout(180);
  await page.screenshot({ path: 'screenshots/' + screenshot, animations: 'disabled', timeout: 90000 });
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

  await page.locator('.preset[data-t="24"]').click();
  await page.waitForTimeout(350);
  await page.setViewportSize({ width: 350, height: 740 });
  await page.screenshot({ path: 'screenshots/water-small-mobile.png', animations: 'disabled', timeout: 90000 });
  const narrowPanel = await page.locator('#panel').boundingBox();
  assert.ok(narrowPanel.x >= 0 && narrowPanel.x + narrowPanel.width <= 350);
  // ?ui=0 should be reversible from the keyboard; hidden controls must be inert.
  await page.goto('http://127.0.0.1:4173/?quality=low&ui=0&state=water', { waitUntil:'domcontentloaded' });
  assert.equal(await page.locator('#panel').evaluate(el => el.inert), true);
  assert.equal(await page.locator('#panel').evaluate(el => getComputedStyle(el).opacity), '0');
  await page.keyboard.press('h');
  assert.equal(await page.locator('#panel').evaluate(el => el.inert), false);
  assert.ok(!new URL(page.url()).searchParams.has('ui'), 'UI show state not reflected in URL');
  await page.keyboard.press('h');
  assert.equal(await page.locator('#panel').evaluate(el => el.inert), true);
  assert.equal(new URL(page.url()).searchParams.get('ui'), '0');

  // Full-quality shaders and 300x300 mesh must also compile and draw in headless WebGL.
  await page.setViewportSize({ width: 640, height: 400 });
  await page.goto('http://127.0.0.1:4173/?quality=high&state=water', { waitUntil:'domcontentloaded' });
  await page.waitForFunction(() => window.__frames > 4, null, { timeout: 90000 });
  assert.equal(await page.evaluate(() => window.__lastError || ''), '');
  await page.evaluate(() => { window.__suspendRendering = true; });
  await page.waitForTimeout(120);
  await page.screenshot({ path: 'screenshots/water-high-quality.png', timeout: 90000, animations: 'disabled' });
  assert.deepEqual(errors, [], 'Unexpected page errors');
  console.log('WebGL/browser smoke tests passed.');
} finally {
  await browser.close();
}
