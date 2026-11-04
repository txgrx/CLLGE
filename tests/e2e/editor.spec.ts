import path from 'node:path';
import { expect, test } from '@playwright/test';

const fixtures = path.resolve(process.cwd(), 'tests', 'fixtures');

test('create → import photo + clip → autosave → reload → export mixed carousel', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'New carousel' })).toBeVisible();
  await page.getByLabel('Title').fill('E2E trip');
  await page.getByRole('button', { name: 'Create' }).click();

  await expect(page.getByTestId('stage')).toBeVisible();
  await page.getByTestId('file-input').setInputFiles([path.join(fixtures, 'calle.jpg'), path.join(fixtures, 'plaza.mp4')]);

  // Both layers appear in the layers panel.
  const layers = page.getByRole('region', { name: 'Layers' });
  await expect(layers.getByText('calle.jpg')).toBeVisible();
  await expect(layers.getByText('plaza.mp4')).toBeVisible();

  // Autosave reaches "Saved".
  await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 15_000 });

  // Back home and reopen: the project and its media come back from IndexedDB.
  await page.reload();
  await expect(page.getByText('E2E trip')).toBeVisible();
  await page.getByText('E2E trip').click();
  await expect(page.getByRole('region', { name: 'Layers' }).getByText('plaza.mp4')).toBeVisible();

  await page.getByRole('button', { name: 'Back to projects' }).click();
  await page.getByText('E2E trip').click();

  // Export: the panorama spans pages 1–3; the clip goes after it, on the last page.
  await page.getByTestId('open-export').click();
  await expect(page.getByTestId('export-summary')).toContainText('2 photos and 1 video (1 with audio)');
  await expect(page.getByTestId('plan-01')).toContainText('01.jpg');
  await expect(page.getByTestId('plan-02')).toContainText('02.jpg');
  await expect(page.getByTestId('plan-03')).toContainText('03.mp4');
  await expect(page.getByTestId('export-start')).toBeEnabled({ timeout: 15_000 });
  await page.getByTestId('export-start').click();
  await expect(page.getByTestId('export-done')).toContainText('Files ready: 3 pieces', { timeout: 90_000 });

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download ZIP' }).click();
  expect((await download).suggestedFilename()).toBe('e2e-trip.zip');
});

test('editing: add text, move with keys, undo and redo', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByRole('button', { name: 'Text' }).click();
  const x = page.getByRole('spinbutton', { name: 'X', exact: true });
  const before = Number(await x.inputValue());
  await page.getByTestId('stage').click({ position: { x: 5, y: 5 } }); // focus stage, deselects
  await page.getByRole('region', { name: 'Layers' }).locator('.layer__name').first().click();
  await page.keyboard.press('Shift+ArrowRight');
  await expect(page.getByRole('spinbutton', { name: 'X', exact: true })).toHaveValue(String(before + 10));
  await page.keyboard.press('Control+z');
  await expect(page.getByRole('spinbutton', { name: 'X', exact: true })).toHaveValue(String(before));
  await page.keyboard.press('Control+Shift+z');
  await expect(page.getByRole('spinbutton', { name: 'X', exact: true })).toHaveValue(String(before + 10));
});
