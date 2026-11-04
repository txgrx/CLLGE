import { newId } from './ids';
import { fitMedia } from './geometry';
import {
  MAX_PAGES,
  SCHEMA_VERSION,
  type Asset,
  type ImageLayer,
  type Layer,
  type MediaLayer,
  type Project,
  type ShapeLayer,
  type TextLayer,
  type VideoLayer,
} from './types';

export function createProject(opts: { title?: string; pageWidth?: number; pageHeight?: number; pages?: number; background?: string } = {}): Project {
  const now = Date.now();
  const count = clampPages(opts.pages ?? 3);
  return {
    schemaVersion: SCHEMA_VERSION,
    id: newId('prj_'),
    revision: 0,
    title: opts.title ?? 'Untitled carousel',
    createdAt: now,
    updatedAt: now,
    canvas: { pageWidth: opts.pageWidth ?? 1080, pageHeight: opts.pageHeight ?? 1350, background: opts.background ?? '#F5F1E8' },
    pages: Array.from({ length: count }, () => ({ id: newId('p_') })),
    assets: [],
    layers: [],
  };
}

export function clampPages(n: number): number {
  return Math.min(MAX_PAGES, Math.max(1, Math.round(n)));
}

const LAYER_DEFAULTS = { rotation: 0, opacity: 1, visible: true, locked: false };
const CROP_DEFAULT = { focusX: 0.5, focusY: 0.5, zoom: 1 };

/** Fill in defaults so documents written by hand (guide §8 example) load. */
export function normalizeProject(input: unknown): Project {
  if (!input || typeof input !== 'object') throw new Error('Not a project document');
  const raw = input as Record<string, unknown> & Partial<Project>;
  if (raw.schemaVersion !== SCHEMA_VERSION) throw new Error(`Unsupported schema version ${String(raw.schemaVersion)}`);
  if (!raw.canvas || !Array.isArray(raw.pages) || !Array.isArray(raw.layers)) throw new Error('Project is missing canvas, pages or layers');
  const now = Date.now();
  let order = 0;
  const layers: Layer[] = (raw.layers as Layer[]).map((l) => {
    const base = { ...LAYER_DEFAULTS, ...l } as Layer;
    if (base.type === 'image' || base.type === 'video') {
      const m = base as ImageLayer | VideoLayer;
      m.fit = m.fit ?? 'cover';
      m.crop = { ...CROP_DEFAULT, ...(m.crop ?? {}) };
      m.radius = m.radius ?? 0;
    }
    if (base.type === 'video') {
      const v = base as VideoLayer;
      v.clip = Object.assign({ inMs: 0, outMs: 0, startMs: 0, gain: 1, endMode: 'hold' as const }, v.clip);
      v.audioOrder = v.audioOrder ?? order;
      order = Math.max(order, v.audioOrder) + 1;
    }
    return base;
  });
  return {
    schemaVersion: SCHEMA_VERSION,
    id: String(raw.id ?? newId('prj_')),
    revision: Number(raw.revision ?? 0),
    title: String(raw.title ?? 'Untitled carousel'),
    createdAt: Number(raw.createdAt ?? now),
    updatedAt: Number(raw.updatedAt ?? now),
    canvas: Object.assign({ background: '#FFFFFF' }, raw.canvas),
    pages: raw.pages.map((p) => ({ ...p })),
    assets: (raw.assets ?? []).map((a) => Object.assign({ name: a.id, mime: '' }, a) as Asset),
    layers,
  };
}

export function serializeProject(p: Project): string {
  return JSON.stringify(p, null, 2);
}

export function parseProject(json: string): Project {
  return normalizeProject(JSON.parse(json));
}

/* ---------- pure edit operations (return a new project) ---------- */

export function touch(p: Project): Project {
  return { ...p, revision: p.revision + 1, updatedAt: Date.now() };
}

export function addLayer(p: Project, layer: Layer): Project {
  return { ...p, layers: [...p.layers, layer] };
}

export function updateLayer<T extends Layer>(p: Project, id: string, patch: Partial<T>): Project {
  return { ...p, layers: p.layers.map((l) => (l.id === id ? ({ ...l, ...patch } as Layer) : l)) };
}

export function removeLayers(p: Project, ids: string[]): Project {
  const set = new Set(ids);
  const layers = p.layers.filter((l) => !set.has(l.id));
  const used = new Set(layers.flatMap((l) => ('assetId' in l ? [l.assetId] : [])));
  return {
    ...p,
    layers,
    assets: p.assets.filter((a) => used.has(a.id)),
    pages: p.pages.map((pg) => (pg.audioLayerId && set.has(pg.audioLayerId) ? { ...pg, audioLayerId: undefined } : pg)),
  };
}

export function duplicateLayer(p: Project, id: string, offset = 40): { project: Project; newId: string | null } {
  const src = p.layers.find((l) => l.id === id);
  if (!src) return { project: p, newId: null };
  const copy = { ...structuredClone(src), id: newId('l_'), x: src.x + offset, y: src.y + offset } as Layer;
  if (copy.type === 'video') copy.audioOrder = nextAudioOrder(p);
  const idx = p.layers.indexOf(src);
  const layers = [...p.layers.slice(0, idx + 1), copy, ...p.layers.slice(idx + 1)];
  return { project: { ...p, layers }, newId: copy.id };
}

/** Move a layer one step (or to an end) in the back-to-front order. */
export function reorderLayer(p: Project, id: string, to: 'up' | 'down' | 'top' | 'bottom'): Project {
  const idx = p.layers.findIndex((l) => l.id === id);
  if (idx < 0) return p;
  const layers = [...p.layers];
  const [l] = layers.splice(idx, 1);
  const target = to === 'up' ? Math.min(layers.length, idx + 1) : to === 'down' ? Math.max(0, idx - 1) : to === 'top' ? layers.length : 0;
  layers.splice(target, 0, l);
  return { ...p, layers };
}

export function addPageAtEnd(p: Project): Project {
  if (p.pages.length >= MAX_PAGES) return p;
  return { ...p, pages: [...p.pages, { id: newId('p_') }] };
}

/** Remove the last page. Layers stay in world space; content beyond the end is simply not exported. */
export function removeLastPage(p: Project): Project {
  if (p.pages.length <= 1) return p;
  return { ...p, pages: p.pages.slice(0, -1) };
}

export function nextAudioOrder(p: Project): number {
  return p.layers.reduce((m, l) => (l.type === 'video' ? Math.max(m, l.audioOrder + 1) : m), 0);
}

export function addAsset(p: Project, asset: Asset): Project {
  if (p.assets.some((a) => a.id === asset.id)) return p;
  return { ...p, assets: [...p.assets, asset] };
}

/** Layer for a freshly imported asset, placed on page `pageIndex`. Images fill the page height; videos sit centred. */
export function layerForAsset(p: Project, asset: Asset, pageIndex: number): ImageLayer | VideoLayer {
  const { pageWidth: W, pageHeight: H } = p.canvas;
  const originX = pageIndex * W;
  const aspect = asset.width / Math.max(1, asset.height);
  const common = { ...LAYER_DEFAULTS, id: newId('l_'), name: asset.name, assetId: asset.id, fit: 'cover' as const, crop: { ...CROP_DEFAULT }, radius: 0 };
  if (asset.type === 'image') {
    // A panorama spans as many pages as its aspect ratio asks for (up to the last page);
    // a normal photo fills one page. "cover" crops whatever does not fit, once, globally.
    const natural = Math.round(H * aspect);
    const remaining = (p.pages.length - pageIndex) * W;
    const width = aspect > W / H ? Math.max(W, Math.min(natural, remaining)) : W;
    return { ...common, type: 'image', x: originX, y: 0, width, height: H };
  }
  const width = Math.round(W * 0.8);
  const height = Math.round(width / aspect);
  return {
    ...common,
    type: 'video',
    x: originX + Math.round((W - width) / 2),
    y: Math.round((H - height) / 2),
    width,
    height,
    clip: { inMs: 0, outMs: asset.durationMs, startMs: 0, gain: asset.hasAudio ? 1 : 0, endMode: 'hold' },
    audioOrder: nextAudioOrder(p),
  };
}

export function textLayer(p: Project, pageIndex: number): TextLayer {
  const { pageWidth: W, pageHeight: H } = p.canvas;
  return {
    ...LAYER_DEFAULTS,
    id: newId('l_'),
    type: 'text',
    name: 'Text',
    text: 'Your text',
    x: pageIndex * W + W * 0.1,
    y: H * 0.42,
    width: W * 0.8,
    height: H * 0.16,
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 96,
    fontWeight: 700,
    color: '#111111',
    align: 'center',
    lineHeight: 1.15,
  };
}

export function shapeLayer(p: Project, pageIndex: number): ShapeLayer {
  const { pageWidth: W, pageHeight: H } = p.canvas;
  return {
    ...LAYER_DEFAULTS,
    id: newId('l_'),
    type: 'shape',
    name: 'Shape',
    x: pageIndex * W + W * 0.25,
    y: H * 0.3,
    width: W * 0.5,
    height: H * 0.4,
    fill: '#E07A5F',
    radius: 24,
  };
}

/** Slots that still show sample art, back to front. */
export function unfilledSlots(p: Project): MediaLayer[] {
  return p.layers.filter((l): l is MediaLayer => (l.type === 'image' || l.type === 'video') && !!l.slot);
}

/**
 * Put the user's photo or clip into an existing media layer (a template slot or any
 * photo/video). The frame — position, size, rotation, corners, opacity, name order —
 * is kept; the content is re-fitted around the centre. A photo slot accepts a clip
 * and becomes a video layer (and vice versa). The previous asset is dropped if unused.
 */
export function fillSlot(p: Project, layerId: string, asset: Asset): Project {
  const target = p.layers.find((l) => l.id === layerId);
  if (!target || (target.type !== 'image' && target.type !== 'video')) return p;
  const frame = {
    id: target.id,
    name: asset.name,
    x: target.x,
    y: target.y,
    width: target.width,
    height: target.height,
    rotation: target.rotation,
    opacity: target.opacity,
    visible: target.visible,
    locked: target.locked,
    assetId: asset.id,
    fit: target.fit,
    crop: { focusX: 0.5, focusY: 0.5, zoom: 1 },
    radius: target.radius,
  };
  let next: Layer;
  if (asset.type === 'image') {
    next = { ...frame, type: 'image' };
  } else {
    const prev = target.type === 'video' ? target : null;
    next = {
      ...frame,
      type: 'video',
      clip: { inMs: 0, outMs: asset.durationMs, startMs: prev?.clip.startMs ?? 0, gain: asset.hasAudio ? (prev?.clip.gain || 1) : 0, endMode: 'hold' },
      audioOrder: prev?.audioOrder ?? nextAudioOrder(p),
    };
  }
  const withAsset = addAsset(p, asset);
  return removeLayers({ ...withAsset, layers: withAsset.layers.map((l) => (l.id === layerId ? next : l)) }, []);
}

/** Exact media rectangle for a media layer, re-exported for the inspector. */
export { fitMedia };
