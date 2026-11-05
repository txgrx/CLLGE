import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const fixtures = path.resolve(process.cwd(), 'tests', 'fixtures');

async function blankCanvas(page: Page, title?: string) {
  await page.goto('./');
  await page.getByRole('button', { name: 'Blank canvas' }).click();
  if (title) await page.getByRole('dialog').getByLabel('Title').fill(title);
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByTestId('stage')).toBeVisible();
}

async function exportAll(page: Page, expectPieces: number) {
  await expect(page.getByTestId('export-start')).toBeEnabled({ timeout: 15_000 });
  await page.getByTestId('export-start').click();
  await expect(page.getByTestId('export-done')).toContainText(`Files ready: ${expectPieces} pieces`, { timeout: 120_000 });
}

test('blank canvas → import photo + clip → autosave → reload → export mixed carousel', async ({ page }) => {
  await blankCanvas(page, 'E2E trip');
  await page.getByTestId('file-input').setInputFiles([path.join(fixtures, 'calle.jpg'), path.join(fixtures, 'plaza.mp4')]);

  const layers = page.getByRole('region', { name: 'Layers' });
  await expect(layers.getByText('calle.jpg')).toBeVisible();
  await expect(layers.getByText('plaza.mp4')).toBeVisible();
  await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 15_000 });

  await page.reload();
  await page.getByText('E2E trip').click();
  await expect(page.getByRole('region', { name: 'Layers' }).getByText('plaza.mp4')).toBeVisible();

  // The panorama spans slides 1–3; the clip goes after it, on the last slide.
  await page.getByTestId('open-export').click();
  await expect(page.getByTestId('export-summary')).toContainText('2 photos and 1 video (1 with audio)');
  await expect(page.getByTestId('plan-01')).toContainText('01.jpg');
  await expect(page.getByTestId('plan-03')).toContainText('03.mp4');
  await exportAll(page, 3);

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download ZIP' }).click();
  expect((await download).suggestedFilename()).toBe('e2e-trip.zip');
});

test('editing: add text, move with keys, undo and redo', async ({ page }) => {
  await blankCanvas(page);
  await page.getByTestId('tool-text').click();
  await page.getByRole('button', { name: 'Plain text' }).click();
  await page.getByTestId('tab-arrange').click();
  const x = page.getByRole('spinbutton', { name: 'X', exact: true });
  const before = Number(await x.inputValue());
  await page.getByRole('region', { name: 'Layers' }).locator('.layer__name').first().click();
  await page.keyboard.press('Shift+ArrowRight');
  await expect(x).toHaveValue(String(before + 10));
  await page.keyboard.press('Control+z');
  await expect(x).toHaveValue(String(before));
  await page.keyboard.press('Control+Shift+z');
  await expect(x).toHaveValue(String(before + 10));
});

test('panorama flow: suggests 3 slides, exports 3 photos in order', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Split a panorama' }).click();
  await page.getByTestId('pano-input').setInputFiles(path.join(fixtures, 'calle.jpg'));
  await expect(page.getByRole('group', { name: 'Slides' }).locator('output')).toHaveText('3');
  await expect(page.getByText('fits best')).toBeVisible();
  await expect(page.getByText('01 · 1200×1500 px')).toBeVisible();
  await page.getByTestId('pano-export').click();
  await expect(page.getByTestId('export-summary')).toContainText('3 photos');
  await exportAll(page, 3);
  for (const n of ['01', '02', '03']) await expect(page.getByTestId(`plan-${n}`)).toContainText(`${n}.jpg`);
});

test('template "Doorway": fill the clip slot → two MP4 slides across the seam', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('tpl-doorway').click();
  await expect(page.getByTestId('stage')).toBeVisible();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Add a clip to Your clip' }).click();
  await (await chooser).setFiles(path.join(fixtures, 'plaza.mp4'));
  await expect(page.getByRole('button', { name: 'Add a clip to Your clip' })).toHaveCount(0);
  await page.getByTestId('open-export').click();
  await expect(page.getByTestId('plan-01')).toContainText('01.mp4');
  await expect(page.getByTestId('plan-02')).toContainText('02.mp4');
  await expect(page.getByTestId('plan-03')).toContainText('03.jpg');
  await expect(page.getByText('1 slot still shows sample art')).toBeVisible();
  await exportAll(page, 3);
});

const art = (names: string[]) => names.map((n) => path.resolve(process.cwd(), 'public', 'art', `${n}.webp`));
const slideCount = (page: Page) => page.locator('.filmstrip .film:not(.film--add)').count();

test('auto collage: lays out eight photos, another idea, apply, undo', async ({ page }) => {
  await blankCanvas(page);
  await page.getByTestId('file-input').setInputFiles(art(['polaroid-1', 'world-1', 'print-1', 'issue-tall', 'postcard-a', 'print-2', 'issue-detail', 'bench']));
  await expect(page.getByRole('region', { name: 'Layers' }).getByText('bench.webp')).toBeVisible();
  const before = await slideCount(page);
  await page.getByTestId('tool-auto').click();
  const dialog = page.getByTestId('auto-collage');
  await expect(dialog.getByRole('img', { name: 'Slide 1' })).toBeVisible();
  await expect(dialog.getByText('Cover')).toBeVisible();
  // The wide bench photo gets a panorama over several slides.
  await expect(dialog.getByText('Panorama')).toBeVisible();
  await page.getByTestId('auto-style-film').click();
  await page.getByTestId('auto-another').click();
  await page.getByTestId('auto-apply').click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => slideCount(page)).toBeGreaterThan(before);
  await expect(page.getByRole('region', { name: 'Layers' }).locator('.badge--sticker, .badge--text').first()).toBeVisible();
  await page.keyboard.press('Control+z');
  await expect.poll(() => slideCount(page)).toBe(before);
});

test('stickers, text styles, frames and masks from the panels', async ({ page }) => {
  await blankCanvas(page);
  await page.getByTestId('file-input').setInputFiles(art(['print-1']));
  await page.getByTestId('tab-frame').click();
  await page.getByTestId('frame-polaroid').click();
  await expect(page.getByTestId('frame-polaroid')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('tab-mask').click();
  await page.getByTestId('mask-arch').click();
  await expect(page.getByTestId('mask-arch')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('tool-stickers').click();
  await page.getByTestId('sticker-date-stamp').click();
  await expect(page.getByRole('region', { name: 'Layers' }).getByText('date stamp')).toBeVisible();
  await page.getByTestId('tool-text').click();
  await page.getByTestId('preset-dymo').click();
  await expect(page.getByTestId('text-content')).toHaveValue('LABEL');
  await page.getByTestId('tab-font').click();
  await page.getByTestId('font-picker').getByRole('radio', { name: 'Gloock' }).click();
  await expect(page.getByTestId('font-picker').getByRole('radio', { name: 'Gloock' })).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('open-export').click();
  await exportAll(page, 3);
});

test('seam guard: words cut by a seam → warning → nudge clears it; bridges cross on purpose', async ({ page }) => {
  await blankCanvas(page);
  await page.getByTestId('tool-text').click();
  await page.getByTestId('preset-masthead').click();
  await page.getByTestId('tab-arrange').click();
  await page.getByRole('spinbutton', { name: 'X', exact: true }).fill('620');
  await expect(page.getByTestId('seam-warning')).toContainText('cut in two');
  await page.getByTestId('nudge').click();
  await expect(page.getByTestId('seam-warning')).toHaveCount(0);
  // A bridge from the seam chip is meant to cross: no warning.
  await page.getByTestId('seam-chip-2').click();
  await page.getByTestId('bridge-text').click();
  await page.waitForTimeout(600);
  await expect(page.getByTestId('seam-warning')).toHaveCount(0);
  await page.getByTestId('tool-draw').click();
  await page.getByTestId('continuous-line').click();
  // "Another one" redraws the generated line; Escape leaves draw mode.
  await page.getByRole('button', { name: 'Another one' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('region', { name: 'Layers' }).getByText('Continuous line')).toBeVisible();
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });

  test('dock, sheets, stickers and swiping between slides', async ({ page }) => {
    await blankCanvas(page);
    await expect(page.getByTestId('dock-add')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Tools' })).toHaveCount(0);
    await page.getByTestId('dock-add').tap();
    await expect(page.getByTestId('bottom-sheet')).toBeVisible();
    await page.getByTestId('add-stickers').tap();
    await page.getByTestId('sticker-heart').tap();
    // Adding hands over to the Edit sheet for the new sticker.
    await expect(page.getByTestId('bottom-sheet')).toContainText('Edit');
    await expect(page.getByTestId('tab-style')).toBeVisible();
    await page.getByTestId('bottom-sheet').getByRole('button', { name: 'Close panel' }).tap();
    await expect(page.getByTestId('bottom-sheet')).toHaveCount(0);
    // One slide fills the screen; a swipe on empty canvas snaps to the next slide.
    await expect(page.getByTestId('live-phone-chip')).toContainText('01/03');
    const stage = await page.getByTestId('stage').boundingBox();
    await page.touchscreen.tap(stage!.x + 20, stage!.y + stage!.height - 30);
    const sc = page.locator('.stage__scroller');
    await sc.evaluate((el) => el.scrollBy({ left: el.clientWidth * 0.7 }));
    await sc.dispatchEvent('scroll');
    await expect(page.getByTestId('live-phone-chip')).toContainText('02/03');
    await page.getByTestId('dock-slides').tap();
    await expect(page.getByTestId('bottom-sheet')).toContainText('3 slides');
  });
});

test('iPhone .MOV (rotated): shows its frames even when the browser never loads the <video>', async ({ page }) => {
  // iOS Safari does not load frames for a <video> that is not playing: emulate that.
  await page.addInitScript(() => {
    Object.defineProperty(HTMLMediaElement.prototype, 'readyState', { get: () => 0 });
  });
  await blankCanvas(page);
  await page.getByTestId('file-input').setInputFiles(path.join(fixtures, 'plaza.mov'));
  await expect(page.getByRole('region', { name: 'Layers' }).getByText('plaza.mov')).toBeVisible();
  // Display rotation is applied: a portrait clip.
  await page.getByTestId('tab-arrange').click();
  const w = Number(await page.getByRole('spinbutton', { name: 'W', exact: true }).inputValue());
  const h = Number(await page.getByRole('spinbutton', { name: 'H', exact: true }).inputValue());
  expect(h).toBeGreaterThan(w);

  /** Spread of colours over a grid of points inside `box` on `canvas` (the grey placeholder is flat). */
  const spread = (selector: string, box: { x: number; y: number; width: number; height: number }) =>
    page.evaluate(
      ({ selector, box }) => {
        const cv = document.querySelector(selector) as HTMLCanvasElement;
        const r = cv.getBoundingClientRect();
        const ctx = cv.getContext('2d')!;
        const kx = cv.width / r.width;
        const ky = cv.height / r.height;
        const vals: number[] = [];
        for (let i = 1; i < 6; i++)
          for (let j = 1; j < 6; j++) {
            const x = (box.x + (box.width * i) / 6 - r.left) * kx;
            const y = (box.y + (box.height * j) / 6 - r.top) * ky;
            const d = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
            vals.push(d[0], d[1], d[2]);
          }
        return Math.max(...vals) - Math.min(...vals);
      },
      { selector, box },
    );

  const stageBox = (await page.getByTestId('stage').boundingBox())!;
  const sel = (await page.locator('.ov-sel').first().boundingBox())!;
  const clip = { x: sel.x, y: Math.max(sel.y, stageBox.y), width: sel.width, height: Math.min(sel.height, stageBox.height - 40) };
  await expect.poll(() => spread('.stage__canvas', clip), { timeout: 15_000 }).toBeGreaterThan(40);
  // The clip went onto slide 1: bring it to the live phone and the preview.
  await page.locator('.filmstrip').getByRole('button', { name: /^Slide 1\b/ }).click();
  await expect(page.getByTestId('live-phone-canvas')).toHaveAttribute('aria-label', /Slide 1 of 3/);
  const phone = (await page.getByTestId('live-phone-canvas').boundingBox())!;
  await expect.poll(() => spread('[data-testid="live-phone-canvas"]', { x: phone.x + phone.width * 0.25, y: phone.y + phone.height * 0.25, width: phone.width * 0.5, height: phone.height * 0.5 }), { timeout: 15_000 }).toBeGreaterThan(40);

  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  const prev = (await page.locator('.preview__canvas').boundingBox())!;
  await expect.poll(() => spread('.preview__canvas', { x: prev.x + prev.width * 0.25, y: prev.y + prev.height * 0.25, width: prev.width * 0.5, height: prev.height * 0.5 }), { timeout: 15_000 }).toBeGreaterThan(40);
  await page.keyboard.press('Escape');

  await page.getByTestId('open-export').click();
  await expect(page.getByTestId('plan-01')).toContainText('01.mp4');
  await exportAll(page, 3);
});
