// Renders the film's stills with the app's own code (via the dev test harness).
// Usage (from repo root, dev server running on :5175):  node video/scripts/make-assets.mjs
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const out = path.resolve('video/public/img');
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch();
const p = await b.newPage();
await p.goto(process.env.HARNESS ?? 'http://localhost:5175/CLLGE/tests/harness/harness.html');
await p.waitForFunction(() => window.harnessReady);
const files = await p.evaluate(() => window.filmAssets());
for (const [name, url] of Object.entries(files)) {
  fs.writeFileSync(path.join(out, name), Buffer.from(url.split(',')[1], 'base64'));
  console.log('wrote', name);
}
await b.close();
