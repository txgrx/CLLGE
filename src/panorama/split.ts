import { fitMedia, type Rect } from '../model/geometry';
import { newId } from '../model/ids';
import { addAsset, addLayer, createProject } from '../model/project';
import type { Crop, ImageAsset, Project, TextLayer } from '../model/types';

export const MIN_SLIDES = 2;
export const MAX_SLIDES = 10;

/**
 * How many slides a panorama naturally fills: its aspect ratio divided by the page's,
 * rounded and clamped. A 3600×1500 photo on 4:5 pages → 2.4 / 0.8 = 3 slides.
 */
export function suggestSlides(imgW: number, imgH: number, pageW: number, pageH: number): number {
  if (imgW <= 0 || imgH <= 0) return MIN_SLIDES;
  const ratio = imgW / imgH / (pageW / pageH);
  return Math.min(MAX_SLIDES, Math.max(MIN_SLIDES, Math.round(ratio)));
}

export interface SliceInfo {
  index: number;
  /** Source pixels shown by this slide. */
  source: Rect;
  /** Output pixels per source pixel; > 1 means the photo is enlarged. */
  upscale: number;
}

/** The part of the original photo that each slide shows, with the same crop as the export. */
export function sliceInfo(asset: Pick<ImageAsset, 'width' | 'height'>, slides: number, pageW: number, pageH: number, crop: Crop): SliceInfo[] {
  const r = fitMedia(asset.width, asset.height, slides * pageW, pageH, 'cover', crop);
  const s = r.width / asset.width;
  return Array.from({ length: slides }, (_, i) => ({
    index: i,
    source: { x: (i * pageW - r.x) / s, y: -r.y / s, width: pageW / s, height: pageH / s },
    upscale: s,
  }));
}

export interface PanoramaOptions {
  asset: ImageAsset;
  slides: number;
  pageWidth: number;
  pageHeight: number;
  crop: Crop;
  title?: string;
  /** Title page before the panorama. */
  cover?: { title: string; kicker?: string } | null;
  /** Closing page after the panorama. */
  closing?: { text: string } | null;
  background?: string;
}

/**
 * Build a carousel where one photo is placed (and cropped) once across `slides`
 * pages, optionally framed by a cover and a closing page. Pure: no I/O.
 */
export function buildPanoramaProject(o: PanoramaOptions): Project {
  const W = o.pageWidth;
  const H = o.pageHeight;
  const lead = o.cover ? 1 : 0;
  const pages = lead + o.slides + (o.closing ? 1 : 0);
  let p = createProject({ title: o.title ?? 'Panorama', pageWidth: W, pageHeight: H, pages, background: o.background ?? '#0E0E0F' });
  p = addAsset(p, o.asset);
  p = addLayer(p, {
    id: newId('l_'),
    type: 'image',
    name: o.asset.name,
    assetId: o.asset.id,
    x: lead * W,
    y: 0,
    width: o.slides * W,
    height: H,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    fit: 'cover',
    crop: { ...o.crop },
    radius: 0,
  });
  if (o.cover) {
    if (o.cover.kicker) p = addLayer(p, label(W * 0.1, H * 0.12, W * 0.8, o.cover.kicker, H));
    p = addLayer(p, title(0, H * 0.36, W, o.cover.title, H));
    p = addLayer(p, label(W * 0.1, H * 0.86, W * 0.8, 'swipe  →', H));
  }
  if (o.closing) {
    const x0 = (lead + o.slides) * W;
    p = addLayer(p, title(x0, H * 0.4, W, o.closing.text, H, 0.07));
  }
  return p;
}

function title(x: number, y: number, W: number, text: string, H: number, size = 0.1): TextLayer {
  return {
    id: newId('l_'),
    type: 'text',
    name: 'Title',
    text,
    x: x + W * 0.08,
    y,
    width: W * 0.84,
    height: H * 0.28,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    fontFamily: '"Instrument Serif", Georgia, serif',
    fontSize: Math.round(H * size),
    fontWeight: 400,
    color: '#EDEBE6',
    align: 'center',
    lineHeight: 1.02,
  };
}

function label(x: number, y: number, w: number, text: string, H: number): TextLayer {
  return {
    id: newId('l_'),
    type: 'text',
    name: 'Label',
    text,
    x,
    y,
    width: w,
    height: H * 0.04,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
    fontSize: Math.round(H * 0.022),
    fontWeight: 400,
    color: '#8C8981',
    align: 'center',
    lineHeight: 1.2,
  };
}
