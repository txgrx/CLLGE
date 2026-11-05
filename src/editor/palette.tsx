import { useEffect, useState } from 'react';
import { library } from '../media/library';
import type { Project } from '../model/types';

/** Always-available inks, then colours sampled from the photos. */
export const BASE_INKS = ['#FF3B2F', '#141414', '#F4F1EA', '#FFD84A', '#2F6BFF'];

const cache = new Map<string, string[]>();

/** A few dominant colours of an image (k-means on a 32×32 thumbnail, on device). */
export function dominantColors(src: CanvasImageSource, k = 3): string[] {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(src, 0, 0, 32, 32);
  const d = ctx.getImageData(0, 0, 32, 32).data;
  const px: [number, number, number][] = [];
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) px.push([d[i], d[i + 1], d[i + 2]]);
  if (px.length < k) return [];
  // Seed centroids spread along brightness so results are stable.
  const sorted = [...px].sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]));
  let cents = Array.from({ length: k }, (_, i) => sorted[Math.floor(((i + 0.5) / k) * sorted.length)]);
  for (let it = 0; it < 8; it++) {
    const sums = cents.map(() => [0, 0, 0, 0]);
    for (const p of px) {
      let best = 0;
      let bd = Infinity;
      cents.forEach((c2, j) => {
        const dd = (p[0] - c2[0]) ** 2 + (p[1] - c2[1]) ** 2 + (p[2] - c2[2]) ** 2;
        if (dd < bd) {
          bd = dd;
          best = j;
        }
      });
      const s = sums[best];
      s[0] += p[0];
      s[1] += p[1];
      s[2] += p[2];
      s[3]++;
    }
    cents = sums.map((s, j) => (s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : cents[j])) as [number, number, number][];
  }
  // Prefer colourful clusters: boost saturation a touch so swatches read as inks.
  return cents
    .map((c2) => {
      const max = Math.max(...c2);
      const min = Math.min(...c2);
      const sat = max ? (max - min) / max : 0;
      return { c: c2, sat };
    })
    .sort((a, b) => b.sat - a.sat)
    .map(({ c: c2 }) => '#' + c2.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join(''));
}

/** Swatches for the current project: base inks + up to 5 sampled from its photos. */
export function usePalette(project: Project): string[] {
  const [colors, setColors] = useState<string[]>(BASE_INKS);
  const ids = project.assets.filter((a) => a.type === 'image').map((a) => a.id).slice(0, 6).join(',');
  useEffect(() => {
    const compute = () => {
      const out: string[] = [];
      for (const id of ids ? ids.split(',') : []) {
        let c = cache.get(id);
        if (!c) {
          const bmp = library.imageBitmap(id);
          if (!bmp) continue;
          c = dominantColors(bmp, 3);
          cache.set(id, c);
        }
        for (const x of c) if (!out.includes(x) && out.length < 5) out.push(x);
      }
      setColors([...BASE_INKS, ...out]);
    };
    compute();
    return library.onChange(compute);
  }, [ids]);
  return colors;
}

export function Swatches({ colors, value, onChange, label = 'Colour' }: { colors: string[]; value: string; onChange(c: string): void; label?: string }) {
  return (
    <div className="swatches" role="radiogroup" aria-label={label}>
      {colors.map((c) => (
        <button key={c} type="button" role="radio" aria-checked={c.toLowerCase() === value.toLowerCase()} aria-label={c} className="swatch" style={{ background: c }} onClick={() => onChange(c)} />
      ))}
      <label className="swatch swatch--custom" title="Custom colour">
        <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#ff3b2f'} onChange={(e) => onChange(e.target.value)} aria-label={`Custom ${label.toLowerCase()}`} />
      </label>
    </div>
  );
}
