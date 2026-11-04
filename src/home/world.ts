import { useEffect, useState } from 'react';
import { journey } from '../templates/art';
import { sampleBlob } from '../templates/samples';

export const SLIDES = 5;
const H = 1000;

export interface World {
  url: string;
  width: number;
  height: number;
  /** First part of the world, small enough for any GPU texture (Act I). */
  print: ImageBitmap;
  printAspect: number;
  /** Where the sun is, as a fraction of the print's width. */
  sunInPrint: number;
}

const cache = new Map<number, Promise<World>>();

/** The home page's single panorama, generated for the current screen shape. */
export function loadWorld(screenAspect: number): Promise<World> {
  // Bucket the aspect so resizing a window does not regenerate constantly.
  const bucket = Math.max(0.4, Math.min(2.6, Math.round(screenAspect * 5) / 5));
  let p = cache.get(bucket);
  if (!p) {
    p = (async () => {
      // Prefer the cyanotype panorama (4 panels in public/art); otherwise draw one.
      const photo = await sampleBlob(['world-1', 'world-2', 'world-3', 'world-4'], 6144);
      const width = photo ? photo.width : Math.round(H * bucket * SLIDES);
      const height = photo ? photo.height : H;
      const blob = photo ? photo.blob : await journey(width, H, 7);
      const full = await createImageBitmap(blob);
      const pw = Math.min(width, Math.round(height * 2.2));
      const print = await createImageBitmap(full, 0, 0, pw, height);
      full.close();
      // The sun sits near 17 % of the drawn world; in the cyanotype it is in the middle of panel 1.
      const sunX = photo ? width * 0.13 : width * 0.17;
      return { url: URL.createObjectURL(blob), width, height, print, printAspect: pw / height, sunInPrint: sunX / pw };
    })();
    cache.set(bucket, p);
  }
  return p;
}

export function useWorld(): World | null {
  const [w, setW] = useState<World | null>(null);
  useEffect(() => {
    let alive = true;
    void loadWorld(window.innerWidth / Math.max(1, window.innerHeight)).then((x) => alive && setW(x));
    return () => {
      alive = false;
    };
  }, []);
  return w;
}

export function prefersReducedMotion(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
