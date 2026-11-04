import { fitMedia, layerTouchesRect, type Rect } from '../model/geometry';
import { sourceTimeMs } from '../model/timing';
import type { Layer, MediaLayer, Project, TextLayer, VideoLayer } from '../model/types';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Pixel sources resolved by the caller (editor, preview or exporter). */
export interface FrameSources {
  image(assetId: string): CanvasImageSource | null | undefined;
  /** Frame of the given video layer at the given *source* timestamp (ms). */
  video(layer: VideoLayer, sourceMs: number): CanvasImageSource | null | undefined;
}

export interface DrawOptions {
  /** Output pixels per design pixel. */
  scale?: number;
  /** Layer ids to skip (e.g. while editing text in place). */
  hidden?: Set<string>;
  /** Device-pixel position of the region's top-left corner in the target (default 0,0). */
  originX?: number;
  originY?: number;
  /** Editor only: show clips that have not started yet at their in-point. */
  showAllClips?: boolean;
}

/**
 * Draw the world rectangle `region` at page-local time `timeMs` into `ctx`, whose
 * backing store is region.width·scale × region.height·scale. The same function feeds
 * the editor (region = whole strip), the preview and the exporter (region = one page),
 * so all three produce the same pixels at the same scale. No guides or handles here.
 */
export function drawRegion(ctx: Ctx, project: Project, region: Rect, timeMs: number, sources: FrameSources, opts: DrawOptions = {}): void {
  const scale = opts.scale ?? 1;
  const ox = opts.originX ?? 0;
  const oy = opts.originY ?? 0;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(ox, oy, region.width * scale, region.height * scale);
  ctx.setTransform(scale, 0, 0, scale, ox - region.x * scale, oy - region.y * scale);
  ctx.beginPath();
  ctx.rect(region.x, region.y, region.width, region.height);
  ctx.clip();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Background in global coordinates.
  ctx.fillStyle = project.canvas.background;
  ctx.fillRect(region.x, region.y, region.width, region.height);

  for (const layer of project.layers) {
    if (!layer.visible || layer.opacity <= 0 || opts.hidden?.has(layer.id)) continue;
    if (!layerTouchesRect(layer, region)) continue;
    drawLayer(ctx, project, layer, timeMs, sources, !!opts.showAllClips);
  }
  ctx.restore();
}

/** Convenience: draw page `index` (origin i·W) at full size. */
export function drawPage(ctx: Ctx, project: Project, index: number, timeMs: number, sources: FrameSources, opts: DrawOptions = {}): void {
  const { pageWidth: W, pageHeight: H } = project.canvas;
  drawRegion(ctx, project, { x: index * W, y: 0, width: W, height: H }, timeMs, sources, opts);
}

function drawLayer(ctx: Ctx, project: Project, layer: Layer, timeMs: number, sources: FrameSources, showAllClips: boolean): void {
  ctx.save();
  ctx.globalAlpha = layer.opacity;
  ctx.translate(layer.x + layer.width / 2, layer.y + layer.height / 2);
  if (layer.rotation) ctx.rotate((layer.rotation * Math.PI) / 180);
  ctx.translate(-layer.width / 2, -layer.height / 2);

  switch (layer.type) {
    case 'shape':
      ctx.fillStyle = layer.fill;
      roundRectPath(ctx, 0, 0, layer.width, layer.height, layer.radius);
      ctx.fill();
      break;
    case 'text':
      drawText(ctx, layer);
      break;
    case 'image':
    case 'video':
      drawMedia(ctx, project, layer, timeMs, sources, showAllClips);
      break;
  }
  ctx.restore();
}

function drawMedia(ctx: Ctx, project: Project, layer: MediaLayer, timeMs: number, sources: FrameSources, showAllClips: boolean): void {
  const asset = project.assets.find((a) => a.id === layer.assetId);
  if (!asset) return;
  let src: CanvasImageSource | null | undefined;
  if (layer.type === 'video') {
    const s = sourceTimeMs(layer.clip, timeMs) ?? (showAllClips ? layer.clip.inMs : null);
    if (s === null) return; // before the clip starts: background shows through
    src = sources.video(layer, s);
  } else {
    src = sources.image(layer.assetId);
  }
  roundRectPath(ctx, 0, 0, layer.width, layer.height, layer.radius);
  ctx.clip();
  const r = fitMedia(asset.width, asset.height, layer.width, layer.height, layer.fit, layer.crop);
  if (src) {
    ctx.drawImage(src, r.x, r.y, r.width, r.height);
  } else {
    // Missing pixels (still loading, unreadable file): neutral placeholder, never silently empty.
    ctx.fillStyle = 'rgba(120,120,120,0.35)';
    ctx.fillRect(0, 0, layer.width, layer.height);
  }
}

function drawText(ctx: Ctx, layer: TextLayer): void {
  ctx.fillStyle = layer.color;
  ctx.textBaseline = 'top';
  ctx.font = `${layer.fontWeight} ${layer.fontSize}px ${layer.fontFamily}`;
  const lines = wrapText(ctx, layer.text, layer.width);
  const lh = layer.fontSize * layer.lineHeight;
  ctx.textAlign = layer.align;
  const x = layer.align === 'left' ? 0 : layer.align === 'center' ? layer.width / 2 : layer.width;
  lines.forEach((line, i) => ctx.fillText(line, x, i * lh + (lh - layer.fontSize) / 2));
}

export function wrapText(ctx: Pick<Ctx, 'measureText'>, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(/(\s+)/);
    let line = '';
    for (const w of words) {
      const next = line + w;
      if (line && ctx.measureText(next.trimEnd()).width > maxWidth) {
        out.push(line.trimEnd());
        line = w.trimStart();
      } else {
        line = next;
      }
    }
    out.push(line.trimEnd());
  }
  return out;
}

function roundRectPath(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  if (rr === 0) {
    ctx.rect(x, y, w, h);
    return;
  }
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
