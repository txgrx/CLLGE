/**
 * Edits shared by the desktop toolbar, the mobile Add sheet and the bridge menu.
 * Each one is a single undo step and selects what it created.
 */
import { addLayer, shapeLayer, stickerLayer, strokeLayer, textLayer } from '../model/project';
import type { Layer, Project, StickerLayer, TextLayer } from '../model/types';
import { continuousLine, stickerById, todayStamp } from '../render/shapes';
import { snapWeight } from '../ui/fonts';
import { useEditor } from './store';
import { applyPreset, TEXT_PRESETS, type TextPreset } from './textPresets';
import { useUi } from './ui';

const project = () => useEditor.getState().project!;
const page = () => Math.min(useUi.getState().page, project().pages.length - 1);

function add(l: Layer): string {
  useEditor.getState().apply((p) => addLayer(p, l));
  useEditor.getState().select([l.id]);
  return l.id;
}

/** New text on the visible slide, optionally in a preset's style. */
export function addText(preset?: TextPreset, text?: string): string {
  const p = project();
  const base = textLayer(p, page());
  const t: TextLayer = { ...base, fontFamily: '"Instrument Serif", Georgia, serif', fontWeight: 400, color: '#EDEBE6', fontSize: 110, text: text ?? preset?.sample ?? 'Your text' };
  const styled = preset ? ({ ...t, ...applyPreset(t, preset) } as TextLayer) : t;
  styled.fontWeight = snapWeight(styled.fontFamily, styled.fontWeight);
  if (preset?.id === 'dymo' || preset?.id === 'marker' || preset?.id === 'stamp') {
    styled.width = p.canvas.pageWidth * 0.62;
    styled.x = page() * p.canvas.pageWidth + p.canvas.pageWidth * 0.19;
  }
  return add(styled);
}

export function addShape(): string {
  return add({ ...shapeLayer(project(), page()), fill: '#FF3B2F' });
}

/** Sticker centred on the visible slide (or at a world point). */
export function addSticker(id: string, color?: string, at?: { x: number; y: number; h?: number; rotation?: number }): string | null {
  const def = stickerById(id);
  if (!def) return null;
  const p = project();
  const { pageWidth: W, pageHeight: H } = p.canvas;
  const h = at?.h ?? Math.min(W / def.aspect, H) * (def.aspect > 2.5 ? 0.42 : 0.3);
  const cx = at?.x ?? page() * W + W / 2;
  const cy = at?.y ?? H / 2;
  const s: StickerLayer = { ...stickerLayer(id, def.aspect, color ?? def.defaultColor, cx, cy, h, id === 'date-stamp' ? todayStamp() : def.defaultLabel), rotation: at?.rotation ?? 0 };
  return add(s);
}

/** A hand-drawn line through every slide. */
export function addContinuousLine(seed = Math.floor(Math.random() * 1e6)): string {
  const p = project();
  const { pageWidth: W, pageHeight: H } = p.canvas;
  const pen = useUi.getState().pen;
  const pts = continuousLine(p.pages.length * W, H, seed);
  const l = { ...strokeLayer(pts, pen.color, pen.width, pen.style, 'Continuous line'), generated: { seed } };
  return add(l);
}

/** Redraw a generated continuous line with a new seed, keeping its colour and style. */
export function regenerateLine(id: string): void {
  const p = project();
  const old = p.layers.find((l) => l.id === id);
  if (!old || old.type !== 'stroke') return;
  const seed = Math.floor(Math.random() * 1e6);
  const pts = continuousLine(p.pages.length * p.canvas.pageWidth, p.canvas.pageHeight, seed);
  const fresh = strokeLayer(pts, old.color, old.lineWidth, old.style, old.name);
  useEditor.getState().apply((pp) => ({ ...pp, layers: pp.layers.map((l) => (l.id === id ? { ...fresh, id, generated: { seed }, opacity: old.opacity } : l)) }));
}

export type BridgeKind = 'tape' | 'text' | 'arrow' | 'swipe' | 'photo' | 'line';

export const BRIDGES: { kind: BridgeKind; label: string; hint: string }[] = [
  { kind: 'photo', label: 'Photo across', hint: 'One photo split over both slides' },
  { kind: 'tape', label: 'Tape', hint: 'A strip of tape over the cut' },
  { kind: 'text', label: 'Split words', hint: 'Text that continues on the next slide' },
  { kind: 'arrow', label: 'Arrow', hint: 'Points into the next slide' },
  { kind: 'swipe', label: 'Swipe tag', hint: '“swipe →” at the edge' },
  { kind: 'line', label: 'Continuous line', hint: 'One pen line through every slide' },
];

/**
 * Add a bridge over seam `k` (the cut at x = k·W). "photo" is handled by the editor
 * (it needs a file) and returns null here.
 */
export function addBridge(kind: BridgeKind, k: number): string | null {
  const p: Project = project();
  const { pageWidth: W, pageHeight: H } = p.canvas;
  const sx = k * W;
  const jitter = (n: number) => (Math.random() * 2 - 1) * n;
  switch (kind) {
    case 'tape':
      return addSticker('tape', undefined, { x: sx, y: H * (0.16 + Math.random() * 0.1), h: W * 0.1, rotation: Math.round(jitter(9)) });
    case 'arrow':
      return addSticker('arrow-swoosh', useUi.getState().pen.color, { x: sx, y: H * 0.62, h: W * 0.18, rotation: Math.round(jitter(6)) });
    case 'swipe':
      return addSticker('swipe-tag', '#141414', { x: sx - W * 0.2, y: H * 0.9, h: W * 0.09 });
    case 'line':
      return addContinuousLine();
    case 'text': {
      const preset = TEXT_PRESETS.find((x) => x.id === 'bridge')!;
      const t = textLayer(p, k - 1);
      const width = W * 1.1;
      const layer: TextLayer = { ...t, ...applyPreset({ ...t, fontSize: 150 }, preset), text: 'keep going', fontSize: 150, align: 'center', color: '#EDEBE6', x: Math.round(sx - width / 2), y: Math.round(H * 0.44), width: Math.round(width), height: Math.round(H * 0.14), name: 'Across the seam' } as TextLayer;
      return add(layer);
    }
    case 'photo':
      return null;
  }
}

/** Place a media layer so it straddles seam k, with the cut at a third of the photo. */
export function straddleBox(p: Project, k: number, aspect: number): { x: number; y: number; width: number; height: number } {
  const { pageWidth: W, pageHeight: H } = p.canvas;
  const width = Math.round(W * 1.2);
  const height = Math.round(Math.min(H * 0.7, width / Math.max(0.3, aspect)));
  return { x: Math.round(k * W - width / 3), y: Math.round((H - height) / 2), width, height };
}
