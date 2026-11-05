import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    harnessReady?: boolean;
    runVejer(): Promise<any>;
    runSeams(pages: number): Promise<any>;
  }
}

test.beforeEach(async ({ page }) => {
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('[browser]', m.text());
  });
  await page.goto('tests/harness/harness.html');
  await page.waitForFunction(() => window.harnessReady === true);
});

test('Vejer scene exports JPG – MP4 – JPG with a moving clip and audio', async ({ page }) => {
  const r = await page.evaluate(() => window.runVejer());
  console.log(JSON.stringify({ names: r.names, ms: Math.round(r.ms), caps: r.caps, mp4: r.mp4 }));
  expect(r.names).toEqual(['01.jpg', '02.mp4', '03.jpg']);
  expect(r.stillSizes).toEqual([
    [1080, 1350],
    [1080, 1350],
  ]);
  expect(r.stillsDiffer).toBe(true);
  const m = r.mp4;
  expect(m.videoCodec).toBe('avc');
  expect([m.width, m.height]).toEqual([1080, 1350]);
  expect(m.frames).toBe(180);
  expect(m.duration).toBeGreaterThan(5.9);
  expect(m.duration).toBeLessThan(6.2);
  // Audio: AAC where the browser has it, Opus-in-MP4 otherwise (reported to the user).
  expect(['aac', 'opus']).toContain(m.audioCodec);
  expect(m.toneRms).toBeGreaterThan(0.1);
  expect(m.silenceRms).toBeLessThan(0.02);
  // The clip moves; the background stays still.
  expect(m.clipChange).toBeGreaterThan(10 * m.backgroundChange);
  expect(m.backgroundChange).toBeLessThan(1.5);
  // Frame-accurate trim: page time t shows source time in + t.
  expect(m.syncRight).toBeLessThan(m.syncWrong / 2);
});

for (const pages of [3, 20]) {
  test(`${pages} pages: every column exported exactly once`, async ({ page }) => {
    const r = await page.evaluate((n) => window.runSeams(n), pages);
    console.log(JSON.stringify(r));
    expect(r.pieces).toBe(pages);
    expect(r.names[0]).toBe('01.png');
    expect(r.names.at(-1)).toBe(`${String(pages).padStart(2, '0')}.png`);
    expect(r.checked).toBe(pages * 1080);
    expect(r.badColumns).toBe(0);
    expect(r.rotatedCornerPixelsOnPage2).toBeGreaterThan(100);
    // Same geometry as the strip drawn at once; only edge anti-aliasing may differ slightly.
    expect(r.rotatedCornerStrongDiffs).toBe(0);
    expect(r.rotatedCornerMaxDiff).toBeLessThanOrEqual(32);
  });
}

test('stickers, frames, masks, a pen line and effect text survive the seams', async ({ page }) => {
  const r = await page.evaluate(() => (window as any).runDecor());
  console.log(JSON.stringify(r));
  expect(r.names).toEqual(['01.png', '02.png', '03.png']);
  for (const p of r.perPage) {
    // Same pixels as the strip drawn at once (only edge anti-aliasing may differ).
    expect(p.strong).toBeLessThan(20);
  }
  // The pen line reaches the edges of every slide it crosses.
  expect(r.perPage[0].ink).toBeGreaterThan(0);
  expect(r.perPage[1].ink).toBeGreaterThan(0);
  expect(r.perPage[2].ink).toBeGreaterThan(0);
});

test('every template builds: slots, assets present, nothing off-canvas', async ({ page }) => {
  const r = await page.evaluate(() => (window as any).runTemplates(0.1));
  expect(r).toHaveLength(8);
  for (const t of r) {
    expect(t.missing, t.id).toBe(0);
    expect(t.outside, t.id).toEqual([]);
    expect(t.slots.length, t.id).toBeGreaterThan(0);
  }
  const doorway = r.find((t: any) => t.id === 'doorway');
  expect(doorway.slots).toContain('video');
});
