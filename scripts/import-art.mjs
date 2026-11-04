// Converts the generated cyanotype PNGs into the WebP files the app loads.
// Usage: node scripts/import-art.mjs <folder-with-pngs>
// Needs FFmpeg with libwebp. Writes public/art/<name>.webp and reports what is missing.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const EXPECTED = [
  'world-1', 'world-2', 'world-3', 'world-4',
  'postcard-a', 'postcard-b', 'stamp',
  'clouds-a', 'clouds-b', 'window-view',
  'doorway-view',
  'frame-1', 'frame-2', 'frame-3', 'frame-4', 'frame-5', 'frame-6',
  'print-1', 'print-2', 'print-3', 'print-4', 'print-5',
  'issue-lead', 'issue-detail', 'issue-tall', 'issue-closing',
  'polaroid-1', 'polaroid-2', 'polaroid-3', 'polaroid-4',
  'share',
];

const src = process.argv[2];
if (!src) {
  console.error('Usage: node scripts/import-art.mjs <folder-with-pngs>');
  process.exit(1);
}
const out = path.resolve('public/art');
fs.mkdirSync(out, { recursive: true });

// Index files by lower-case base name, whatever the extension and nesting.
const found = new Map();
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(png|jpe?g|webp)$/i.test(e.name)) found.set(path.parse(e.name).name.toLowerCase(), p);
  }
};
walk(src);

let total = 0;
const missing = [];
for (const name of EXPECTED) {
  const file = found.get(name);
  if (!file) {
    missing.push(name);
    continue;
  }
  if (name === 'share') {
    fs.copyFileSync(file, path.resolve('scripts', '.share-source' + path.extname(file)));
    console.log('share  → kept for scripts/make-share.mjs');
    continue;
  }
  // Panels and landscapes at 1536 px wide; portraits and squares at 1024 px wide.
  const dest = path.join(out, `${name}.webp`);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-vf', "scale='min(1536,iw)':-2:flags=lanczos", '-c:v', 'libwebp', '-quality', '80', '-compression_level', '6', dest]);
  const kb = Math.round(fs.statSync(dest).size / 1024);
  total += kb;
  console.log(`${name.padEnd(14)} → art/${name}.webp  ${kb} KB`);
}
const extra = [...found.keys()].filter((k) => !EXPECTED.includes(k));
console.log(`\n${EXPECTED.length - missing.length}/${EXPECTED.length} images, ${(total / 1024).toFixed(1)} MB in public/art`);
if (missing.length) console.log('Missing (the app keeps the code-drawn art for these):', missing.join(', '));
if (extra.length) console.log('Ignored (unexpected names):', extra.join(', '));
