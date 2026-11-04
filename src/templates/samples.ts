/**
 * Optional sample images in `public/art/<key>.webp` (cyanotype series generated with
 * GPT Image 2). Every caller falls back to the code-drawn art when a file is missing,
 * so the app works with or without them.
 */

const cache = new Map<string, Promise<ImageBitmap | null>>();

function artUrl(key: string): string {
  const base = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.BASE_URL : '/';
  return `${base}art/${key}.webp`;
}

export function loadSampleBitmap(key: string): Promise<ImageBitmap | null> {
  let p = cache.get(key);
  if (!p) {
    p = fetch(artUrl(key))
      .then((r) => (r.ok && (r.headers.get('content-type') ?? '').startsWith('image/') ? r.blob() : null))
      .then((b) => (b ? createImageBitmap(b) : null))
      .catch(() => null);
    cache.set(key, p);
  }
  return p;
}

/**
 * Load one image, or several joined side by side (a panorama made of panels), and
 * render it to a JPEG of the requested width. Neighbouring panels are cross-faded
 * over `blend` of a panel's width to hide small mismatches at the joins.
 * Returns null if any panel is missing.
 */
export async function sampleBlob(keys: string | string[], targetWidth: number, blend = 0.03): Promise<{ blob: Blob; width: number; height: number } | null> {
  const list = Array.isArray(keys) ? keys : [keys];
  const bitmaps = await Promise.all(list.map(loadSampleBitmap));
  if (bitmaps.some((b) => !b)) return null;
  const bms = bitmaps as ImageBitmap[];
  const h0 = bms[0].height;
  // Scale every panel to the first panel's height, then overlap by `blend`.
  const widths = bms.map((b) => (b.width * h0) / b.height);
  const overlap = Math.round(widths[0] * blend);
  const fullW = Math.round(widths.reduce((s, w) => s + w, 0) - overlap * (bms.length - 1));
  const scale = Math.min(1, targetWidth / fullW);
  const W = Math.max(8, Math.round(fullW * scale));
  const H = Math.max(8, Math.round(h0 * scale));
  const c = new OffscreenCanvas(W, H);
  const ctx = c.getContext('2d')!;
  let x = 0;
  bms.forEach((b, i) => {
    const w = widths[i] * scale;
    if (i === 0) {
      ctx.drawImage(b, 0, 0, w, H);
    } else {
      // Draw the panel into its own canvas with a fading left edge, then composite.
      const o = overlap * scale;
      const tmp = new OffscreenCanvas(Math.ceil(w), H);
      const t = tmp.getContext('2d')!;
      t.drawImage(b, 0, 0, w, H);
      t.globalCompositeOperation = 'destination-in';
      const g = t.createLinearGradient(0, 0, o, 0);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,1)');
      t.fillStyle = g;
      t.fillRect(0, 0, Math.ceil(w), H);
      ctx.drawImage(tmp, x - o, 0);
      x -= o;
    }
    x += w;
  });
  const blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.88 });
  return { blob, width: W, height: H };
}
