// Builds public/og.jpg (1200×630) from the generated share image, adding the title in
// the app's own font. Usage (after import-art): node scripts/make-share.mjs
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const srcFile = ['.share-source.png', '.share-source.jpg', '.share-source.jpeg', '.share-source.webp'].map((f) => path.resolve('scripts', f)).find((f) => fs.existsSync(f));
if (!srcFile) {
  console.error('No share image found. Run scripts/import-art.mjs with share.png first.');
  process.exit(1);
}
const img = `data:image/${path.extname(srcFile).slice(1)};base64,${fs.readFileSync(srcFile).toString('base64')}`;
const font = (f) => `data:font/woff2;base64,${fs.readFileSync(path.resolve('node_modules', f)).toString('base64')}`;
const serif = font('@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff2');
const serifItalic = font('@fontsource/instrument-serif/files/instrument-serif-latin-400-italic.woff2');
const mono = font('@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2');

const html = `<!doctype html><html><head><style>
@font-face{font-family:S;src:url(${serif})}
@font-face{font-family:S;font-style:italic;src:url(${serifItalic})}
@font-face{font-family:M;src:url(${mono})}
html,body{margin:0;width:1200px;height:630px;background:#0e0e0f;overflow:hidden}
.bg{position:absolute;inset:0;background:url(${img}) center/cover}
.shade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(14,14,15,.92) 0%,rgba(14,14,15,.55) 42%,rgba(14,14,15,0) 70%)}
.t{position:absolute;left:72px;bottom:92px;color:#edebe6;font:400 104px/0.9 S}
.t em{color:#ff3b2f}
.k{position:absolute;left:74px;top:70px;font:400 20px M;letter-spacing:.3em;color:#edebe6;display:flex;align-items:center;gap:14px}
.k i{width:12px;height:12px;border-radius:50%;background:#ff3b2f;box-shadow:0 0 18px 3px rgba(255,59,47,.6)}
.f{position:absolute;left:74px;bottom:50px;font:400 16px M;letter-spacing:.12em;color:#b7b3aa}
</style></head><body><div class="bg"></div><div class="shade"></div>
<div class="k"><i></i>CLLGE</div><div class="t">Slides that<br><em>keep going.</em></div>
<div class="f">FREE · OPEN SOURCE · PHOTOS + VIDEO</div></body></html>`;

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
await p.setContent(html);
await p.evaluate(() => document.fonts.ready);
await p.screenshot({ path: path.resolve('public/og.jpg'), type: 'jpeg', quality: 88 });
await b.close();
console.log('wrote public/og.jpg');
