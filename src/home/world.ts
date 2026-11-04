import { useEffect, useState } from 'react';
import { journey } from '../templates/art';
import { sampleBlob } from '../templates/samples';

export const SLIDES = 5;
const H = 1000;

/** The four cyanotype panels of the home panorama and where their red accent sits (panel px). */
const PANELS = ['world-1', 'world-2', 'world-3', 'world-4'];
const PANEL_W = 1536;
const BLEND = 0.16;
const TRIM = 0.02;
const PANEL_ACCENTS = [
  { x: 849, y: 672, label: 'sun' },
  { x: 1135, y: 568, label: 'lighthouse' },
  { x: 892, y: 595, label: 'window' },
  { x: 596, y: 666, label: 'lantern' },
];

export interface Accent {
  /** Position in world-image pixels. */
  x: number;
  y: number;
  label: string;
}

export interface World {
  url: string;
  width: number;
  height: number;
  /** First part of the world, small enough for any GPU texture (Act I). */
  print: ImageBitmap;
  printAspect: number;
  /** Where the sun is, as a fraction of the print's width. */
  sunInPrint: number;
  /** The red accents (sun, lighthouse lamp, lit window, lantern) in world pixels. */
  accents: Accent[];
  /** True when the cyanotype panels were found (false: code-drawn fallback). */
  photo: boolean;
}

const cache = new Map<number, Promise<World>>();

/** The home page's single panorama: the cyanotype panels joined, or a drawn fallback. */
export function loadWorld(screenAspect: number): Promise<World> {
  // Bucket the aspect so resizing a window does not regenerate constantly.
  const bucket = Math.max(0.4, Math.min(2.6, Math.round(screenAspect * 5) / 5));
  let p = cache.get(bucket);
  if (!p) {
    p = (async () => {
      const photo = await sampleBlob(PANELS, 6144, BLEND, TRIM);
      const width = photo ? photo.width : Math.round(H * bucket * SLIDES);
      const height = photo ? photo.height : H;
      const blob = photo ? photo.blob : await journey(width, H, 7);
      let accents: Accent[];
      if (photo) {
        // Same geometry as sampleBlob: trimmed panels overlapping by BLEND of their width.
        const pw = PANEL_W * (1 - 2 * TRIM);
        const trimX = PANEL_W * TRIM;
        const overlap = Math.round(pw * BLEND);
        const natural = Math.round(PANELS.length * pw - overlap * (PANELS.length - 1));
        const k = width / natural;
        accents = PANEL_ACCENTS.map((a, i) => ({ x: (i * (pw - overlap) + a.x - trimX) * k, y: a.y * k, label: a.label }));
      } else {
        accents = [{ x: width * 0.17, y: height * 0.56, label: 'sun' }];
      }
      const full = await createImageBitmap(blob);
      const pw = Math.min(width, Math.round(height * 2.2));
      const print = await createImageBitmap(full, 0, 0, pw, height);
      full.close();
      return { url: URL.createObjectURL(blob), width, height, print, printAspect: pw / height, sunInPrint: accents[0].x / pw, accents, photo: !!photo };
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

/** Size of an element, kept up to date. */
export function useElementSize<T extends HTMLElement>(ref: React.RefObject<T | null>): { w: number; h: number } {
  const [s, setS] = useState({ w: typeof window !== 'undefined' ? window.innerWidth : 1280, h: typeof window !== 'undefined' ? window.innerHeight : 800 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setS({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return s;
}
