import type { CanvasSpec, Crop, Fit, Layer } from './types';

const FRAME_K: Record<string, number> = { polaroid: 0.34, film: 0.2, stamp: 0.1, tape: 0.16, shadow: 0.12 };

/**
 * How far a layer paints outside its box (frames, shadows, stroke width, text
 * effects), so culling never drops pixels that cross into a neighbouring page.
 */
export function paintMargin(layer: Layer): number {
  const m = Math.min(layer.width, layer.height);
  switch (layer.type) {
    case 'image':
    case 'video':
      return layer.frame ? m * (FRAME_K[layer.frame.kind] ?? 0.2) : 0;
    case 'stroke':
      return layer.lineWidth;
    case 'sticker':
      return m * 0.08;
    case 'text': {
      const fx = (layer.stroke?.width ?? 0) + (layer.shadow ? layer.shadow.blur + Math.max(Math.abs(layer.shadow.dx), Math.abs(layer.shadow.dy)) : 0);
      const hl = layer.highlight ? layer.fontSize * (0.3 + layer.highlight.pad) : 0;
      const arc = layer.curve ? layer.fontSize * 2 : 0;
      return fx + hl + arc + (layer.ransom ? layer.fontSize * 0.3 : 0);
    }
    default:
      return 0;
  }
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/** World-space rectangle covered by page `index`: [i·W, (i+1)·W) × [0, H). */
export function pageRect(canvas: CanvasSpec, index: number): Rect {
  return { x: index * canvas.pageWidth, y: 0, width: canvas.pageWidth, height: canvas.pageHeight };
}

export function layerCenter(layer: Pick<Layer, 'x' | 'y' | 'width' | 'height'>): Point {
  return { x: layer.x + layer.width / 2, y: layer.y + layer.height / 2 };
}

/** Corners of the layer box after rotation about its centre, in world space. */
export function layerCorners(layer: Pick<Layer, 'x' | 'y' | 'width' | 'height' | 'rotation'>): Point[] {
  const c = layerCenter(layer);
  const a = (layer.rotation * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const hw = layer.width / 2;
  const hh = layer.height / 2;
  return [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ].map(([dx, dy]) => ({ x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos }));
}

/** Axis-aligned bounds of the transformed layer box. */
export function layerBounds(layer: Pick<Layer, 'x' | 'y' | 'width' | 'height' | 'rotation'>): Rect {
  if (layer.rotation % 360 === 0) return { x: layer.x, y: layer.y, width: layer.width, height: layer.height };
  const pts = layerCorners(layer);
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
}

/** True when the two rectangles share an area > 0 (touching edges do not count). */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/**
 * Whether the layer's real coverage reaches the page. Uses the separating-axis test
 * on the rotated box, so a rotated layer whose bounding box grazes a page but whose
 * pixels do not is excluded. Touching with zero area does not count.
 */
export function layerTouchesRect(layer: Pick<Layer, 'x' | 'y' | 'width' | 'height' | 'rotation'>, rect: Rect): boolean {
  if (layer.width <= 0 || layer.height <= 0) return false;
  if (!rectsOverlap(layerBounds(layer), rect)) return false;
  if (layer.rotation % 90 === 0) return true;
  const poly = layerCorners(layer);
  const box: Point[] = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];
  const axes: Point[] = [];
  for (const shape of [poly, box]) {
    for (let i = 0; i < shape.length; i++) {
      const p = shape[i];
      const q = shape[(i + 1) % shape.length];
      axes.push({ x: -(q.y - p.y), y: q.x - p.x });
    }
  }
  for (const axis of axes) {
    const proj = (pts: Point[]) => pts.map((p) => p.x * axis.x + p.y * axis.y);
    const pa = proj(poly);
    const pb = proj(box);
    const eps = 1e-9 * (Math.abs(axis.x) + Math.abs(axis.y)) * (rect.width + rect.height + layer.width + layer.height);
    if (Math.max(...pa) <= Math.min(...pb) + eps || Math.max(...pb) <= Math.min(...pa) + eps) return false;
  }
  return true;
}

/** Inverse-transform a world point into the layer's local frame (origin at top-left of the box). */
export function worldToLayer(layer: Pick<Layer, 'x' | 'y' | 'width' | 'height' | 'rotation'>, p: Point): Point {
  const c = layerCenter(layer);
  const a = (-layer.rotation * Math.PI) / 180;
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return {
    x: dx * Math.cos(a) - dy * Math.sin(a) + layer.width / 2,
    y: dx * Math.sin(a) + dy * Math.cos(a) + layer.height / 2,
  };
}

export function layerContainsPoint(layer: Pick<Layer, 'x' | 'y' | 'width' | 'height' | 'rotation'>, p: Point): boolean {
  const l = worldToLayer(layer, p);
  return l.x >= 0 && l.y >= 0 && l.x <= layer.width && l.y <= layer.height;
}

/**
 * Where the media is drawn inside its frame (frame-local coordinates).
 * cover: scale up until the frame is filled, crop the overflow around the focus point.
 * contain: scale down until the whole media is visible.
 * The result is computed once in the layer's own space, so a layer that crosses a
 * seam is never re-fitted per page.
 */
export function fitMedia(mediaW: number, mediaH: number, frameW: number, frameH: number, fit: Fit, crop: Crop): Rect {
  if (mediaW <= 0 || mediaH <= 0) return { x: 0, y: 0, width: frameW, height: frameH };
  const base = fit === 'cover' ? Math.max(frameW / mediaW, frameH / mediaH) : Math.min(frameW / mediaW, frameH / mediaH);
  const s = base * Math.max(1, crop.zoom);
  const w = mediaW * s;
  const h = mediaH * s;
  const fx = clamp01(crop.focusX);
  const fy = clamp01(crop.focusY);
  return { x: (frameW - w) * fx, y: (frameH - h) * fy, width: w, height: h };
}

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5;
}

/** Index of the page that owns world column x (half-open ranges). */
export function pageIndexAt(canvas: CanvasSpec, x: number, pageCount: number): number {
  return Math.min(pageCount - 1, Math.max(0, Math.floor(x / canvas.pageWidth)));
}
