/**
 * Auto-collage: turns a list of photos/clips into a carousel layout. Pure and
 * deterministic for a given seed. `plan()` decides which recipe each slide uses and
 * which media goes where (keeping the order the user chose); `build()` turns a plan
 * into ordinary, editable layers in the chosen style.
 */
import { newId } from '../model/ids';
import { createProject, nextAudioOrder, stickerLayer } from '../model/project';
import { MAX_PAGES, type Asset, type ImageLayer, type Layer, type MediaFrame, type MaskKind, type Project, type ShapeLayer, type StickerLayer, type TextLayer, type VideoLayer } from '../model/types';
import { rand, stickerById, todayStamp } from '../render/shapes';

export type ComposeStyle = 'editorial' | 'grid' | 'film' | 'scrapbook';

export const STYLE_LABEL: Record<ComposeStyle, string> = {
  editorial: 'Editorial',
  grid: 'Clean grid',
  film: 'Film roll',
  scrapbook: 'Scrapbook',
};

export type RecipeId = 'cover' | 'full' | 'two' | 'three' | 'four' | 'straddle' | 'pano' | 'closing';

export const RECIPE_LABEL: Record<RecipeId, string> = {
  cover: 'Cover',
  full: 'Full bleed',
  two: 'Two up',
  three: 'Three',
  four: 'Details',
  straddle: 'Across the seam',
  pano: 'Panorama',
  closing: 'Closing',
};

/** One step of a plan: a recipe that uses `count` media from `start`, over `pages` slides. */
export interface Group {
  key: string;
  recipe: RecipeId;
  start: number;
  count: number;
  pages: number;
  /** Variant picked by the seed (mirroring, which photo is big…). */
  variant: number;
}

export interface Plan {
  groups: Group[];
  pages: number;
  /** Media left out because the carousel would exceed MAX_PAGES. */
  dropped: number;
}

export interface ComposeInput {
  assets: Asset[];
  pageWidth: number;
  pageHeight: number;
  style: ComposeStyle;
  seed: number;
  /** Groups to keep as they are (by key) when asking for another idea. */
  locked?: Group[];
  title?: string;
}

interface Slot {
  /** Width / height of the slot. */
  aspect: number;
}

/** Slot aspect ratios each recipe offers (to score how well the media fits). */
function recipeSlots(r: RecipeId, pa: number, variant: number): Slot[] {
  switch (r) {
    case 'cover':
    case 'full':
    case 'closing':
      return [{ aspect: pa }];
    case 'two':
      // Stacked (two landscapes) or side by side (two portraits).
      return variant % 2 === 0 ? [{ aspect: pa * 2 }, { aspect: pa * 2 }] : [{ aspect: pa / 2 }, { aspect: pa / 2 }];
    case 'three':
      return [{ aspect: pa * 1.4 }, { aspect: pa * 0.7 }, { aspect: pa * 0.7 }];
    case 'four':
      return [{ aspect: pa }, { aspect: pa }, { aspect: pa }, { aspect: pa }];
    case 'straddle':
      return [{ aspect: pa * 1.3 }, { aspect: pa * 0.8 }];
    case 'pano':
      return [{ aspect: pa * 3 }];
  }
}

const COUNT: Record<RecipeId, number> = { cover: 1, full: 1, two: 2, three: 3, four: 4, straddle: 2, pano: 1, closing: 1 };
const PAGES: Record<RecipeId, number> = { cover: 1, full: 1, two: 1, three: 1, four: 1, straddle: 2, pano: 2, closing: 1 };

/** How much each style likes each recipe (lower = preferred). */
const STYLE_BIAS: Record<ComposeStyle, Partial<Record<RecipeId, number>>> = {
  editorial: { full: 0.05, two: 0.15, three: 0.1, four: 0.35, straddle: 0 },
  grid: { full: 0.3, two: 0, three: 0.15, four: 0, straddle: 0.25 },
  film: { full: 0, two: 0.1, three: 0.3, four: 0.25, straddle: 0.05 },
  scrapbook: { full: 0.25, two: 0.05, three: 0, four: 0.15, straddle: 0.05 },
};

const aspectOf = (a: Asset) => a.width / Math.max(1, a.height);

function fitCost(assets: Asset[], slots: Slot[]): number {
  let c = 0;
  for (let i = 0; i < slots.length; i++) c += Math.abs(Math.log(aspectOf(assets[i]) / slots[i].aspect));
  return c / slots.length;
}

/** Wide enough to span slides (a 3:2 photo is not; a 2:1 one is). */
export function isPano(a: Asset, pa: number): boolean {
  return aspectOf(a) >= Math.max(1.95, pa * 2.4);
}

/** Pages a very wide photo should span. */
export function panoPages(a: Asset, pa: number): number {
  return Math.max(2, Math.min(5, Math.round(aspectOf(a) / pa)));
}

function planSegment(assets: Asset[], offset: number, pa: number, style: ComposeStyle, r: () => number, pageBudget: number, first: boolean, last: boolean, prevRecipe: RecipeId | null, used: { pages: number }): Group[] {
  const out: Group[] = [];
  let i = 0;
  let prev = prevRecipe;
  let sinceStraddle = 9;
  while (i < assets.length) {
    const remaining = assets.length - i;
    const pagesLeft = Math.max(1, pageBudget - used.pages);
    const density = remaining / pagesLeft; // media per page still needed
    const candidates: { g: Group; cost: number }[] = [];
    const isFirst = first && i === 0;
    const a = assets[i];
    if (!isFirst && isPano(a, pa)) {
      const pages = Math.min(panoPages(a, pa), pagesLeft);
      if (pages >= 2) candidates.push({ g: mk('pano', offset + i, 1, pages, 0), cost: -1 });
    }
    const options: RecipeId[] = isFirst ? ['cover'] : ['full', 'two', 'three', 'four', 'straddle'];
    if (last && remaining === 1 && !isFirst && assets.length + offset > 4) options.push('closing');
    for (const rec of options) {
      const n = COUNT[rec];
      if (n > remaining) continue;
      if (rec === 'straddle' && (sinceStraddle < 3 || pagesLeft < 2)) continue;
      const slice = assets.slice(i, i + n);
      if (slice.some((x) => isPano(x, pa)) && rec !== 'cover') continue;
      const variant = Math.floor(r() * 4);
      // Pick the better orientation of "two" for these media.
      let v = variant;
      if (rec === 'two') v = fitCost(slice, recipeSlots('two', pa, 0)) <= fitCost(slice, recipeSlots('two', pa, 1)) ? 0 : 1;
      let cost = fitCost(slice, recipeSlots(rec, pa, v));
      cost += STYLE_BIAS[style][rec] ?? 0;
      if (rec === prev) cost += 0.6; // rhythm: no two in a row
      const pagesPerMedia = PAGES[rec] / n;
      // Too many media for the pages left → prefer denser recipes.
      if (density > 1) cost += Math.max(0, pagesPerMedia - 1 / Math.min(4, density)) * 2.5;
      // Plenty of room → reward breathing space a little.
      if (density < 0.8) cost -= (pagesPerMedia - 0.5) * 0.3;
      if (rec === 'closing') cost -= 0.4;
      cost += r() * 0.9; // the seed's say: "another idea" must really differ
      candidates.push({ g: mk(rec, offset + i, n, PAGES[rec], v), cost });
    }
    if (!candidates.length) candidates.push({ g: mk('full', offset + i, 1, 1, 0), cost: 0 });
    candidates.sort((x, y) => x.cost - y.cost);
    const g = candidates[0].g;
    if (used.pages + g.pages > pageBudget) break;
    out.push(g);
    used.pages += g.pages;
    i += g.count;
    prev = g.recipe;
    sinceStraddle = g.recipe === 'straddle' ? 0 : sinceStraddle + g.pages;
  }
  return out;
}

function mk(recipe: RecipeId, start: number, count: number, pages: number, variant: number): Group {
  return { key: `${recipe}:${start}:${count}:${variant}`, recipe, start, count, pages, variant };
}

/** Decide the slides. Locked groups keep their recipe and media; the rest is re-planned around them. */
export function plan(input: ComposeInput): Plan {
  const pa = input.pageWidth / input.pageHeight;
  const r = rand(input.seed * 7919 + input.assets.length);
  const locked = [...(input.locked ?? [])].filter((g) => g.start + g.count <= input.assets.length).sort((a, b) => a.start - b.start);
  // Drop overlapping locks (keep the earliest).
  const locks: Group[] = [];
  for (const g of locked) if (!locks.length || g.start >= locks[locks.length - 1].start + locks[locks.length - 1].count) locks.push(g);
  const used = { pages: locks.reduce((s, g) => s + g.pages, 0) };
  const groups: Group[] = [];
  let cursor = 0;
  let prev: RecipeId | null = null;
  const segments: [number, number, Group | null][] = [];
  for (const g of locks) {
    segments.push([cursor, g.start, g]);
    cursor = g.start + g.count;
  }
  segments.push([cursor, input.assets.length, null]);
  for (const [from, to, lock] of segments) {
    if (to > from) {
      const seg = planSegment(input.assets.slice(from, to), from, pa, input.style, r, MAX_PAGES, from === 0, to === input.assets.length && !lock, prev, used);
      groups.push(...seg);
      if (seg.length) prev = seg[seg.length - 1].recipe;
    }
    if (lock) {
      groups.push(lock);
      prev = lock.recipe;
    }
  }
  const pages = groups.reduce((s, g) => s + g.pages, 0);
  const placed = groups.reduce((s, g) => s + g.count, 0);
  return { groups, pages, dropped: input.assets.length - placed };
}

/* ------------------------------------------------------------------ */
/* Build                                                               */
/* ------------------------------------------------------------------ */

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
}

const FONTS = {
  bodoni: '"Bodoni Moda", Didot, serif',
  instrument: '"Instrument Serif", Georgia, serif',
  mono: '"JetBrains Mono", ui-monospace, monospace',
  spaceMono: '"Space Mono", ui-monospace, monospace',
  marker: '"Permanent Marker", "Segoe Print", cursive',
  caveat: 'Caveat, "Segoe Print", cursive',
  grotesk: '"Schibsted Grotesk Variable", system-ui, sans-serif',
};

interface Theme {
  background: string;
  ink: string;
  accent: string;
  muted: string;
  gutter: number;
  margin: number;
}

const THEMES: Record<ComposeStyle, Theme> = {
  editorial: { background: '#F2EEE6', ink: '#161513', accent: '#C8361F', muted: '#8C867B', gutter: 28, margin: 84 },
  grid: { background: '#101010', ink: '#EDEBE6', accent: '#FF3B2F', muted: '#77736B', gutter: 18, margin: 18 },
  film: { background: '#131210', ink: '#EDE6D6', accent: '#FF8A2A', muted: '#6F685C', gutter: 40, margin: 70 },
  scrapbook: { background: '#E7DCC6', ink: '#1E1B16', accent: '#D7402B', muted: '#8A7C63', gutter: 36, margin: 70 },
};

class Builder {
  layers: Layer[] = [];
  project: Project;
  r: () => number;
  constructor(
    public input: ComposeInput,
    pages: number,
    public theme: Theme,
  ) {
    this.project = createProject({ title: input.title ?? 'Auto collage', pages, pageWidth: input.pageWidth, pageHeight: input.pageHeight, background: theme.background });
    this.project.assets = [...input.assets];
    this.r = rand(input.seed * 104729 + 17);
  }
  get W() {
    return this.input.pageWidth;
  }
  get H() {
    return this.input.pageHeight;
  }
  media(asset: Asset, box: Box, extra: { radius?: number; mask?: MaskKind; frame?: MediaFrame; focusX?: number } = {}): ImageLayer | VideoLayer {
    const common = {
      id: newId('l_'),
      name: asset.name,
      x: Math.round(box.x),
      y: Math.round(box.y),
      width: Math.round(box.width),
      height: Math.round(box.height),
      rotation: box.rotation ?? 0,
      opacity: 1,
      visible: true,
      locked: false,
      assetId: asset.id,
      fit: 'cover' as const,
      crop: { focusX: extra.focusX ?? 0.5, focusY: 0.5, zoom: 1 },
      radius: extra.radius ?? 0,
      ...(extra.mask ? { mask: extra.mask, seed: Math.floor(this.r() * 1e6) } : {}),
      ...(extra.frame ? { frame: extra.frame } : {}),
    };
    let l: ImageLayer | VideoLayer;
    if (asset.type === 'image') l = { ...common, type: 'image' };
    else {
      l = { ...common, type: 'video', clip: { inMs: 0, outMs: asset.durationMs, startMs: 0, gain: asset.hasAudio ? 1 : 0, endMode: 'hold' }, audioOrder: nextAudioOrder({ ...this.project, layers: this.layers }) };
    }
    this.layers.push(l);
    return l;
  }
  text(box: Box, text: string, style: Partial<TextLayer>): TextLayer {
    const t: TextLayer = {
      id: newId('l_'),
      type: 'text',
      name: text.split('\n')[0].slice(0, 24) || 'Text',
      x: Math.round(box.x),
      y: Math.round(box.y),
      width: Math.round(box.width),
      height: Math.round(box.height),
      rotation: box.rotation ?? 0,
      opacity: 1,
      visible: true,
      locked: false,
      text,
      fontFamily: FONTS.instrument,
      fontSize: 64,
      fontWeight: 400,
      color: this.theme.ink,
      align: 'left',
      lineHeight: 1.05,
      ...style,
    };
    this.layers.push(t);
    return t;
  }
  shape(box: Box, fill: string, radius = 0): ShapeLayer {
    const s: ShapeLayer = { id: newId('l_'), type: 'shape', name: 'Rule', x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height), rotation: box.rotation ?? 0, opacity: 1, visible: true, locked: false, fill, radius };
    this.layers.push(s);
    return s;
  }
  sticker(id: string, cx: number, cy: number, h: number, color: string, rotation = 0, label?: string): StickerLayer | null {
    const def = stickerById(id);
    if (!def) return null;
    const s = { ...stickerLayer(id, def.aspect, color, cx, cy, h, label ?? (id === 'date-stamp' ? todayStamp() : def.defaultLabel)), rotation, seed: Math.floor(this.r() * 1e6) };
    this.layers.push(s);
    return s;
  }
  jitter(max: number) {
    return (this.r() * 2 - 1) * max;
  }
}

const FILM_CODES = ['KD 400', 'PORTRA 160', 'HP5+', 'ILFORD', 'FUJI C200'];

/** The media box that, with its frame drawn around it, fills `box` (see render/shapes drawFrameBack). */
export function insetForFrame(box: Box, frame: MediaFrame | undefined): Box {
  if (!frame || frame.kind === 'tape' || frame.kind === 'shadow') return box;
  let w = box.width;
  let h = box.height;
  let l = 0;
  let t = 0;
  for (let it = 0; it < 4; it++) {
    const m = Math.min(w, h);
    let r = 0;
    let bt = 0;
    if (frame.kind === 'polaroid') {
      l = r = t = m * 0.055;
      bt = m * 0.055 + m * 0.27;
    } else if (frame.kind === 'film') {
      l = r = m * 0.06;
      t = bt = m * 0.16;
    } else {
      l = r = t = bt = m * 0.07;
    }
    w = box.width - l - r;
    h = box.height - t - bt;
  }
  return { ...box, x: Math.round(box.x + l), y: Math.round(box.y + t), width: Math.round(w), height: Math.round(h) };
}

/** Turn a plan into a full project (assets are the caller's; blobs stay where they are). */
export function build(input: ComposeInput, p: Plan): Project {
  const theme = THEMES[input.style];
  const b = new Builder(input, Math.max(1, p.pages), theme);
  const { W, H } = b;
  const style = input.style;
  const total = p.pages;
  let page = 0;
  let frameNo = 1;

  /**
   * Give a photo the style's frame (or `frame`), then shrink it so photo + frame fit
   * the box it was laid out in — frames never spill onto neighbours or titles.
   */
  const decorate = (l: ImageLayer | VideoLayer, i: number, frame?: MediaFrame | null): void => {
    if (frame !== undefined) l.frame = frame ?? undefined;
    else if (style === 'film') l.frame = { kind: 'film' };
    else if (style === 'scrapbook' && !l.mask) {
      const k = (i + Math.floor(b.r() * 3)) % 3;
      l.frame = k === 0 ? { kind: 'polaroid', caption: '' } : k === 1 ? { kind: 'tape' } : { kind: 'shadow' };
    }
    if (style === 'scrapbook' && l.rotation === 0) l.rotation = Math.round(b.jitter(4) * 10) / 10;
    Object.assign(l, insetForFrame(l, l.frame));
  };

  const folio = (pg: number) => {
    if (style === 'grid') return;
    const n = String(pg + 1).padStart(2, '0');
    const of = String(total).padStart(2, '0');
    if (style === 'film') {
      b.text({ x: pg * W + theme.margin, y: H - 64, width: W - theme.margin * 2, height: 36 }, `${FILM_CODES[input.seed % FILM_CODES.length]}   ▸ ${frameNo++}A`, { fontFamily: FONTS.mono, fontSize: 22, color: theme.accent, align: 'left', letterSpacing: 0.12 });
      return;
    }
    if (style === 'editorial') b.text({ x: pg * W + theme.margin, y: H - 70, width: W - theme.margin * 2, height: 32 }, `${n} / ${of}`, { fontFamily: FONTS.mono, fontSize: 20, color: theme.muted, align: 'right', letterSpacing: 0.08 });
  };

  for (const g of p.groups) {
    const media = input.assets.slice(g.start, g.start + g.count);
    const x0 = page * W;
    const M = theme.margin;
    const G = theme.gutter;
    const inner = { x: x0 + M, y: M, width: W - 2 * M, height: H - 2 * M };
    const flip = g.variant % 2 === 1;
    switch (g.recipe) {
      case 'cover': {
        const title = input.title?.trim() || 'Notes from somewhere';
        if (style === 'editorial') {
          b.text({ x: x0 + M, y: M - 6, width: W - 2 * M, height: 150 }, title, { fontFamily: FONTS.bodoni, fontSize: 132, fontWeight: 800, lineHeight: 0.9, letterSpacing: -0.02, preset: 'masthead' });
          b.shape({ x: x0 + M, y: M + 168, width: W - 2 * M, height: 3 }, theme.ink);
          const l = b.media(media[0], { x: x0 + M, y: M + 196, width: W - 2 * M, height: H - M * 2 - 196 - 60 });
          decorate(l, 0);
          b.text({ x: x0 + M, y: H - M - 44, width: W - 2 * M, height: 40 }, 'Issue nº 1 — swipe for more', { fontFamily: FONTS.instrument, fontSize: 34, italic: true, color: theme.ink });
        } else if (style === 'grid') {
          b.media(media[0], { x: x0, y: 0, width: W, height: H });
          b.text({ x: x0 + 56, y: H - 210, width: W - 112, height: 160 }, title, { fontFamily: FONTS.grotesk, fontSize: 92, fontWeight: 800, color: '#FFFFFF', lineHeight: 0.95, letterSpacing: -0.03, shadow: { color: 'rgba(0,0,0,0.45)', blur: 30, dx: 0, dy: 4 } });
        } else if (style === 'film') {
          const l = b.media(media[0], { x: x0 + M, y: M + 120, width: W - 2 * M, height: H - 2 * M - 240 });
          decorate(l, 0);
          b.text({ x: x0 + M, y: M, width: W - 2 * M, height: 100 }, title.toUpperCase(), { fontFamily: FONTS.spaceMono, fontSize: 58, fontWeight: 700, color: theme.ink, letterSpacing: 0.06 });
          b.sticker('date-stamp', x0 + W - M - 140, H - M - 50, 72, theme.accent, -4);
        } else {
          const l = b.media(media[0], { x: x0 + M + 30, y: M + 60, width: W - 2 * M - 60, height: H - 2 * M - 300, rotation: -2.5 });
          decorate(l, 0, { kind: 'polaroid', caption: title });
          b.sticker('tape', x0 + W / 2, M + 92, 70, '#F3E7B9', 4);
          b.text({ x: x0 + M, y: H - M - 170, width: W - 2 * M, height: 120, rotation: -3 }, 'the good bits →', { fontFamily: FONTS.marker, fontSize: 70, color: theme.ink, align: 'center', highlight: { color: '#FFD84A', style: 'marker', pad: 0.12 }, preset: 'marker' });
        }
        if (total > 1 && style !== 'grid') b.sticker('swipe-tag', x0 + W - 150, H / 2, 64, theme.accent, 0);
        break;
      }
      case 'full': {
        if (style === 'grid') b.media(media[0], { x: x0 + G, y: G, width: W - 2 * G, height: H - 2 * G });
        else if (style === 'editorial') {
          b.media(media[0], { x: x0, y: 0, width: W, height: H - 150 });
          b.text({ x: x0 + M, y: H - 120, width: W - 2 * M, height: 60 }, media[0].name.replace(/\.[a-z0-9]+$/i, ''), { fontFamily: FONTS.instrument, fontSize: 44, italic: true });
        } else {
          const l = b.media(media[0], { x: inner.x, y: inner.y + 40, width: inner.width, height: inner.height - 120 });
          decorate(l, 1);
          if (style === 'scrapbook') b.sticker(flip ? 'star' : 'sparkle', x0 + W - M - 40, M + 30, 110, theme.accent, b.jitter(12));
        }
        break;
      }
      case 'two': {
        const stacked = g.variant === 0;
        const boxes: Box[] = stacked
          ? [
              { x: inner.x, y: inner.y, width: inner.width, height: (inner.height - G) / 2 },
              { x: inner.x, y: inner.y + (inner.height + G) / 2, width: inner.width, height: (inner.height - G) / 2 },
            ]
          : [
              { x: inner.x, y: inner.y + inner.height * 0.08, width: (inner.width - G) / 2, height: inner.height * 0.84 },
              { x: inner.x + (inner.width + G) / 2, y: inner.y + inner.height * 0.08, width: (inner.width - G) / 2, height: inner.height * 0.84 },
            ];
        if (style === 'scrapbook') {
          boxes[0] = { ...boxes[0], width: boxes[0].width * 0.94, height: boxes[0].height * 0.94, rotation: -3 };
          boxes[1] = { ...boxes[1], x: boxes[1].x + boxes[1].width * 0.06, y: boxes[1].y + boxes[1].height * 0.04, width: boxes[1].width * 0.94, height: boxes[1].height * 0.94, rotation: 2.5 };
        }
        media.forEach((m, k) => {
          const l = b.media(m, boxes[k]);
          decorate(l, k);
          if (boxes[k].rotation) l.rotation = boxes[k].rotation!;
        });
        if (style === 'scrapbook') b.sticker('arrow-curly', x0 + W * 0.55, stacked ? H / 2 : H * 0.92, 90, theme.accent, flip ? 160 : 10);
        break;
      }
      case 'three': {
        const bigTop = !flip;
        const bigH = (inner.height - G) * 0.58;
        const smallH = inner.height - G - bigH;
        const smallW = (inner.width - G) / 2;
        const big: Box = { x: inner.x, y: bigTop ? inner.y : inner.y + smallH + G, width: inner.width, height: bigH };
        const sy = bigTop ? inner.y + bigH + G : inner.y;
        const boxes: Box[] = [big, { x: inner.x, y: sy, width: smallW, height: smallH }, { x: inner.x + smallW + G, y: sy, width: smallW, height: smallH }];
        media.forEach((m, k) => {
          const bx = style === 'scrapbook' ? { ...boxes[k], rotation: b.jitter(3) } : boxes[k];
          const mask: MaskKind | undefined = style === 'editorial' && k === 2 ? 'arch' : style === 'scrapbook' && k === 1 ? 'torn' : undefined;
          const l = b.media(m, bx, { mask });
          decorate(l, k);
          if (bx.rotation) l.rotation = Math.round(bx.rotation * 10) / 10;
        });
        if (style === 'editorial') b.text({ x: x0 + M, y: 18, width: W - 2 * M, height: 50 }, '—  three small things', { fontFamily: FONTS.instrument, fontSize: 36, italic: true, color: theme.muted });
        break;
      }
      case 'four': {
        const cw = (inner.width - G) / 2;
        const ch = (inner.height - G) / 2;
        media.forEach((m, k) => {
          const bx: Box = { x: inner.x + (k % 2) * (cw + G), y: inner.y + Math.floor(k / 2) * (ch + G), width: cw, height: ch };
          if (style === 'scrapbook') bx.rotation = b.jitter(4);
          const mask: MaskKind | undefined = style === 'editorial' && k === 3 ? 'circle' : style === 'scrapbook' && k === 0 ? 'stamp' : undefined;
          const l = b.media(m, bx, { mask });
          decorate(l, k);
          if (bx.rotation) l.rotation = Math.round(bx.rotation * 10) / 10;
        });
        if (style === 'scrapbook') b.sticker('circle-scribble', inner.x + cw * 1.5 + G, inner.y + ch * 0.5, ch * 0.5, theme.accent, b.jitter(10));
        break;
      }
      case 'straddle': {
        // One photo across the cut, with the seam at its third (so a centred subject stays whole),
        // and a second photo on the far side.
        const seam = x0 + W;
        const bigW = W * 1.25;
        const thirds = flip ? 2 / 3 : 1 / 3;
        const big: Box = { x: seam - bigW * thirds, y: style === 'grid' ? G : M + H * 0.06, width: bigW, height: style === 'grid' ? H * 0.62 : H * 0.56 };
        const l = b.media(media[0], big, { focusX: flip ? 0.4 : 0.6 });
        decorate(l, 0, style === 'scrapbook' ? { kind: 'tape' } : undefined);
        l.rotation = 0;
        const otherOnRight = !flip;
        const sx = otherOnRight ? x0 + W + M + W * 0.22 : x0 + M;
        const small: Box = { x: sx, y: big.y + big.height + G, width: W - 2 * M - W * 0.22, height: H - (big.y + big.height + G) - M };
        const l2 = b.media(media[1], small);
        decorate(l2, 1);
        const tx = otherOnRight ? x0 + M : x0 + W + M;
        b.text({ x: tx, y: big.y + big.height + G + 10, width: W - 2 * M, height: 200 }, style === 'scrapbook' ? 'keep\nswiping' : 'Keep\nswiping', {
          fontFamily: style === 'editorial' ? FONTS.bodoni : style === 'scrapbook' ? FONTS.marker : style === 'film' ? FONTS.spaceMono : FONTS.grotesk,
          fontSize: 88,
          fontWeight: style === 'editorial' ? 400 : 700,
          italic: style === 'editorial',
          color: theme.ink,
          lineHeight: 0.95,
          align: 'left',
        });
        break;
      }
      case 'pano': {
        const span = g.pages * W;
        if (style === 'grid' || style === 'editorial') b.media(media[0], { x: x0, y: style === 'grid' ? G : 0, width: span, height: style === 'grid' ? H - 2 * G : H });
        else {
          const l = b.media(media[0], { x: x0 + M, y: H * 0.18, width: span - 2 * M, height: H * 0.64 });
          decorate(l, 0, style === 'scrapbook' ? { kind: 'shadow' } : undefined);
          l.rotation = 0;
        }
        if (style === 'editorial') b.text({ x: x0 + M, y: H - 120, width: W - 2 * M, height: 60 }, 'The long view →', { fontFamily: FONTS.instrument, fontSize: 48, italic: true, color: '#FFFFFF', shadow: { color: 'rgba(0,0,0,0.4)', blur: 18, dx: 0, dy: 2 } });
        break;
      }
      case 'closing': {
        const l = b.media(media[0], { x: x0 + W * 0.18, y: H * 0.14, width: W * 0.64, height: H * 0.5, rotation: style === 'scrapbook' ? 2 : 0 }, { mask: style === 'editorial' ? 'arch' : undefined });
        decorate(l, 0, style === 'scrapbook' ? { kind: 'polaroid', caption: 'until next time' } : undefined);
        b.text({ x: x0 + M, y: H * 0.7, width: W - 2 * M, height: 160 }, style === 'film' ? 'END OF ROLL' : style === 'grid' ? 'That’s all.' : 'Fin.', {
          fontFamily: style === 'editorial' ? FONTS.bodoni : style === 'film' ? FONTS.spaceMono : style === 'scrapbook' ? FONTS.marker : FONTS.grotesk,
          fontSize: style === 'film' ? 64 : 120,
          fontWeight: style === 'film' || style === 'grid' ? 700 : 400,
          italic: style === 'editorial',
          align: 'center',
          letterSpacing: style === 'film' ? 0.1 : 0,
        });
        if (style !== 'grid') b.sticker(style === 'film' ? 'x-mark' : 'heart', x0 + W / 2, H * 0.88, 70, theme.accent, b.jitter(8));
        break;
      }
    }
    for (let k = 0; k < g.pages; k++) folio(page + k);
    page += g.pages;
  }

  // Scrapbook: a continuous doodle thread that ties the slides together.
  if (style === 'scrapbook' && total > 1) {
    b.sticker('squiggle', W - 10, H - 90, 46, theme.accent, -6);
  }

  b.project.layers = b.layers;
  b.project.assets = input.assets.filter((a) => b.layers.some((l) => 'assetId' in l && l.assetId === a.id));
  return b.project;
}

/** One-shot helper: plan + build. */
export function compose(input: ComposeInput): { project: Project; plan: Plan } {
  const p = plan(input);
  return { project: build(input, p), plan: p };
}
