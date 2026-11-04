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
  await page.getByRole('navigation', { name: 'Tools' }).getByRole('button', { name: 'Text', exact: true }).click();
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
