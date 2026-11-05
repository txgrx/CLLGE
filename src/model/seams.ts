import { fitMedia, layerBounds } from './geometry';
import type { Layer, MediaLayer, Project, TextLayer } from './types';

/**
 * Seam guard: things that will look wrong when the carousel is cut into slides.
 * Pure — the editor passes a text measurer; without one, text width is estimated.
 */
export type SeamWarningKind = 'poi' | 'text' | 'sliver';

export interface SeamWarning {
  key: string;
  layerId: string;
  /** Seam index k: the cut at x = k · pageWidth (1 … pages − 1). */
  seam: number;
  kind: SeamWarningKind;
  message: string;
  /** Horizontal move (world px) that clears the problem. */
  dx: number;
}

export type TextMeasure = (layer: TextLayer) => { x: number; y: number; w: number }[];

/** Distance from a seam (fraction of the page width) a point of interest must keep. */
export const POI_CLEARANCE = 0.04;
/** Smallest share of a photo that may sit on one side of a seam. */
export const SLIVER = 0.08;

/** World position of a media layer's point of interest. */
export function poiWorld(p: Project, l: MediaLayer): { x: number; y: number } | null {
  if (!l.poi) return null;
  const a = p.assets.find((x) => x.id === l.assetId);
  if (!a) return null;
  const r = fitMedia(a.width, a.height, l.width, l.height, l.fit, l.crop);
  const lx = r.x + l.poi.x * r.width - l.width / 2;
  const ly = r.y + l.poi.y * r.height - l.height / 2;
  const t = (l.rotation * Math.PI) / 180;
  return { x: l.x + l.width / 2 + lx * Math.cos(t) - ly * Math.sin(t), y: l.y + l.height / 2 + lx * Math.sin(t) + ly * Math.cos(t) };
}

function estimate(layer: TextLayer): { x: number; y: number; w: number }[] {
  const lines = (layer.uppercase ? layer.text.toUpperCase() : layer.text).split('\n');
  return lines.map((s, i) => {
    const w = Math.min(layer.width, s.length * layer.fontSize * (0.5 + (layer.letterSpacing ?? 0)));
    const x = layer.align === 'left' ? 0 : layer.align === 'center' ? (layer.width - w) / 2 : layer.width - w;
    return { x, y: i * layer.fontSize * layer.lineHeight, w };
  });
}

export function seamWarnings(p: Project, measure: TextMeasure = estimate): SeamWarning[] {
  const W = p.canvas.pageWidth;
  const N = p.pages.length;
  const out: SeamWarning[] = [];
  const seams = Array.from({ length: N - 1 }, (_, i) => i + 1);
  for (const l of p.layers) {
    if (!l.visible || l.locked) continue;
    if (l.type === 'image' || l.type === 'video') {
      const pt = poiWorld(p, l);
      if (pt) {
        for (const k of seams) {
          const d = pt.x - k * W;
          if (Math.abs(d) < POI_CLEARANCE * W) {
            const side = d >= 0 ? 1 : -1;
            out.push({ key: `poi:${l.id}:${k}`, layerId: l.id, seam: k, kind: 'poi', message: `A cut falls on the important part of “${l.name ?? 'this photo'}”.`, dx: side * POI_CLEARANCE * 1.6 * W - d });
          }
        }
      }
      if (l.rotation % 360 === 0 && l.width < W * 1.5) {
        for (const k of seams) {
          const s = k * W;
          const left = s - l.x;
          const right = l.x + l.width - s;
          if (left > 0 && right > 0) {
            const small = Math.min(left, right);
            if (small < SLIVER * l.width) {
              out.push({ key: `sliver:${l.id}:${k}`, layerId: l.id, seam: k, kind: 'sliver', message: `Only a sliver of “${l.name ?? 'this photo'}” shows on the next slide.`, dx: left < right ? left : -right });
            }
          }
        }
      }
    }
    if (l.type === 'text' && !l.bridge && l.rotation % 360 === 0 && l.text.trim()) {
      for (const line of measure(l)) {
        const a = l.x + line.x;
        const b = a + line.w;
        const hit = seams.find((k) => a < k * W - 2 && b > k * W + 2);
        if (hit) {
          const s = hit * W;
          const gap = W * 0.03;
          out.push({
            key: `text:${l.id}:${hit}`,
            layerId: l.id,
            seam: hit,
            kind: 'text',
            message: `“${l.text.slice(0, 24)}” is cut in two by a seam.`,
            dx: s - a > b - s ? s - b - gap : s - a + gap,
          });
          break;
        }
      }
    }
  }
  return out;
}

/** Apply a warning's fix: move the layer horizontally. */
export function nudge(p: Project, w: SeamWarning): Project {
  return { ...p, layers: p.layers.map((l): Layer => (l.id === w.layerId ? { ...l, x: Math.round(l.x + w.dx) } : l)) };
}

/** Seams a layer's bounding box crosses (for UI highlights). */
export function seamsCrossed(p: Project, l: Layer): number[] {
  const b = layerBounds(l);
  const W = p.canvas.pageWidth;
  const out: number[] = [];
  for (let k = 1; k < p.pages.length; k++) if (b.x < k * W && b.x + b.width > k * W) out.push(k);
  return out;
}
