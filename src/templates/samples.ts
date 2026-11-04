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
 * render it to a JPEG of the requested width. `trim` crops each panel's left and
 * right edge (generated prints have a lighter paper border); neighbouring panels
 * are cross-faded over `blend` of a panel's width so tone changes stay gradual.
 * Returns null if any panel is missing.
 */
export async function sampleBlob(keys: string | string[], targetWidth: number, blend = 0.03, trim = 0): Promise<{ blob: Blob; width: number; height: number } | null> {
  const list = Array.isArray(keys) ? keys : [keys];
  const bitmaps = await Promise.all(list.map(loadSampleBitmap));
  if (bitmaps.some((b) => !b)) return null;
  const bms = bitmaps as ImageBitmap[];
  const t = list.length > 1 ? trim : 0;
  const src = bms.map((b) => ({ sx: b.width * t, sw: b.width * (1 - 2 * t), h: b.height }));
  const h0 = src[0].h;
  // Scale every panel to the first panel's height, then overlap by `blend`.
  const widths = src.map((r) => (r.sw * h0) / r.h);
  const overlap = Math.round(widths[0] * blend);
  const fullW = Math.round(widths.reduce((sum, w) => sum + w, 0) - overlap * (bms.length - 1));
  const scale = Math.min(1, targetWidth / fullW);
  const W = Math.max(8, Math.round(fullW * scale));
  const H = Math.max(8, Math.round(h0 * scale));
  const c = new OffscreenCanvas(W, H);
  const ctx = c.getContext('2d')!;
  let x = 0;
  bms.forEach((b, i) => {
    const w = widths[i] * scale;
    const r = src[i];
    if (i === 0) {
      ctx.drawImage(b, r.sx, 0, r.sw, r.h, 0, 0, w, H);
    } else {
      // Draw the panel into its own canvas with a fading left edge, then composite.
      const o = overlap * scale;
      const tmp = new OffscreenCanvas(Math.ceil(w), H);
      const tc = tmp.getContext('2d')!;
      tc.drawImage(b, r.sx, 0, r.sw, r.h, 0, 0, w, H);
      tc.globalCompositeOperation = 'destination-in';
      const g = tc.createLinearGradient(0, 0, o, 0);
      // Smoothstep-like ramp: no visible start or end of the blend.
      for (let k = 0; k <= 8; k++) {
        const u = k / 8;
        g.addColorStop(u, `rgba(0,0,0,${u * u * (3 - 2 * u)})`);
      }
      tc.fillStyle = g;
      tc.fillRect(0, 0, Math.ceil(w), H);
      ctx.drawImage(tmp, x - o, 0);
      x -= o;
    }
    x += w;
  });
  const blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.88 });
  return { blob, width: W, height: H };
}
