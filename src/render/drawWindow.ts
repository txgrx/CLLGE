import { fitMedia, layerTouchesRect, paintMargin, type Rect } from '../model/geometry';
import { sourceTimeMs } from '../model/timing';
import type { Layer, MediaLayer, Project, TextLayer, VideoLayer } from '../model/types';
import { drawFrameBack, drawFrameFront, drawSticker, drawStroke, maskPath, rand, roundRectPath, type Ctx } from './shapes';

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
    // Frames, shadows and strokes paint outside the box: cull with the painted extent.
    const m = paintMargin(layer);
    const grown = m ? { x: region.x - m, y: region.y - m, width: region.width + 2 * m, height: region.height + 2 * m } : region;
    if (!layerTouchesRect(layer, grown)) continue;
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
    case 'sticker':
      drawSticker(ctx, layer);
      break;
    case 'stroke':
      drawStroke(ctx, layer);
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
  const { width: w, height: h } = layer;
  drawFrameBack(ctx, layer.frame, w, h, (x, y, cw, ch) => {
    ctx.fillStyle = '#2A2724';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `500 ${Math.round(ch * 0.36)}px Caveat, "Segoe Print", cursive`;
    ctx.fillText(layer.frame?.caption ?? '', x + cw / 2, y + ch * 0.52, cw * 0.9);
  });
  ctx.save();
  maskPath(ctx, layer.mask, w, h, layer.radius, layer.seed ?? 1);
  ctx.clip();
  const r = fitMedia(asset.width, asset.height, w, h, layer.fit, layer.crop);
  if (src) {
    ctx.drawImage(src, r.x, r.y, r.width, r.height);
  } else {
    // Missing pixels (still loading, unreadable file): neutral placeholder, never silently empty.
    ctx.fillStyle = 'rgba(120,120,120,0.35)';
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
  drawFrameFront(ctx, layer.frame, w, h, layer.seed ?? 1);
}

/* ------------------------------------------------------------------ */
/* Text                                                                */
/* ------------------------------------------------------------------ */

interface Glyph {
  ch: string;
  font: string;
  w: number;
  /** Ransom chip colours. */
  bg?: string;
  fg?: string;
  rot?: number;
}

const RANSOM_PAPER: [string, string][] = [
  ['#F4F1EA', '#141414'],
  ['#141414', '#F4F1EA'],
  ['#E2462C', '#F4F1EA'],
  ['#1E4F8C', '#F4F1EA'],
  ['#F2B134', '#141414'],
  ['#EDEBE6', '#E2462C'],
];

function fontString(layer: TextLayer, family: string, size = layer.fontSize): string {
  return `${layer.italic ? 'italic ' : ''}${layer.fontWeight} ${size}px ${family}`;
}

/** Lay out text into lines of glyphs (supports letter spacing and per-letter fonts). */
function layoutText(ctx: Pick<Ctx, 'measureText' | 'font'>, layer: TextLayer): Glyph[][] {
  const text = layer.uppercase ? layer.text.toUpperCase() : layer.text;
  const spacing = (layer.letterSpacing ?? 0) * layer.fontSize;
  const r = layer.ransom ? rand(layer.ransom.seed) : null;
  const fonts = layer.ransom?.fonts.length ? layer.ransom.fonts : null;
  const glyph = (ch: string): Glyph => {
    let font = fontString(layer, layer.fontFamily);
    let bg: string | undefined;
    let fg: string | undefined;
    let rot: number | undefined;
    if (r && fonts && ch.trim()) {
      const size = layer.fontSize * (0.85 + r() * 0.3);
      font = fontString(layer, fonts[Math.floor(r() * fonts.length)], size);
      [bg, fg] = RANSOM_PAPER[Math.floor(r() * RANSOM_PAPER.length)];
      rot = (r() - 0.5) * 0.18;
    }
    (ctx as Ctx).font = font;
    const pad = bg ? layer.fontSize * 0.14 : 0;
    return { ch, font, w: ctx.measureText(ch).width + spacing + pad * 2, bg, fg, rot };
  };
  const lines: Glyph[][] = [];
  for (const para of text.split('\n')) {
    const words = para.split(/(\s+)/).filter((x) => x.length);
    let line: Glyph[] = [];
    let lw = 0;
    for (const word of words) {
      const gs = [...word].map(glyph);
      const ww = gs.reduce((s, g) => s + g.w, 0);
      const isSpace = !word.trim();
      if (line.length && !isSpace && lw + ww > layer.width) {
        while (line.length && !line[line.length - 1].ch.trim()) line.pop();
        lines.push(line);
        line = [];
        lw = 0;
      }
      if (isSpace && !line.length) continue;
      line.push(...gs);
      lw += ww;
    }
    while (line.length && !line[line.length - 1].ch.trim()) line.pop();
    lines.push(line);
  }
  return lines;
}

function lineWidth(line: Glyph[]): number {
  return line.reduce((s, g) => s + g.w, 0);
}

function drawText(ctx: Ctx, layer: TextLayer): void {
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  const lines = layoutText(ctx, layer);
  const lh = layer.fontSize * layer.lineHeight;
  const spacing = (layer.letterSpacing ?? 0) * layer.fontSize;
  const curve = Math.max(-1, Math.min(1, layer.curve ?? 0));

  const startX = (line: Glyph[]) => {
    const w = lineWidth(line) - spacing;
    return layer.align === 'left' ? 0 : layer.align === 'center' ? (layer.width - w) / 2 : layer.width - w;
  };

  // Highlights behind each line.
  if (layer.highlight) {
    lines.forEach((line, i) => {
      if (!line.length) return;
      const x = startX(line);
      const w = lineWidth(line) - spacing;
      const y = i * lh + (lh - layer.fontSize) / 2;
      drawHighlight(ctx, layer, x, y, w, layer.fontSize, i);
    });
  }

  ctx.save();
  if (layer.shadow) {
    ctx.shadowColor = layer.shadow.color;
    ctx.shadowBlur = layer.shadow.blur;
    ctx.shadowOffsetX = layer.shadow.dx;
    ctx.shadowOffsetY = layer.shadow.dy;
  }
  const paint = (g: Glyph, x: number, y: number) => {
    ctx.font = g.font;
    if (g.bg) {
      ctx.save();
      ctx.translate(x + g.w / 2, y + layer.fontSize / 2);
      ctx.rotate(g.rot ?? 0);
      ctx.fillStyle = g.bg;
      ctx.fillRect(-g.w / 2 + spacing / 2, -layer.fontSize * 0.58, g.w - spacing, layer.fontSize * 1.16);
      ctx.fillStyle = g.fg ?? layer.color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(g.ch, 0, layer.fontSize * 0.04);
      ctx.restore();
      return;
    }
    const dymo = layer.highlight?.style === 'dymo';
    if (layer.stroke && layer.stroke.width > 0) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = layer.stroke.width;
      ctx.strokeStyle = layer.stroke.color;
      ctx.strokeText(g.ch, x, y);
      if (layer.outlineOnly) return;
      // The fill shouldn't cast a second shadow over the stroke.
      ctx.shadowColor = 'transparent';
    }
    if (dymo) {
      // Embossed: a dark offset underneath, then the light letter.
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillText(g.ch, x + layer.fontSize * 0.03, y + layer.fontSize * 0.04);
    }
    ctx.fillStyle = layer.color;
    ctx.fillText(g.ch, x, y);
    if (layer.shadow) ctx.shadowColor = layer.shadow.color;
  };

  lines.forEach((line, i) => {
    const y = i * lh + (lh - layer.fontSize) / 2;
    if (i === 0 && curve !== 0 && line.length) {
      drawArc(ctx, layer, line, curve, y, paint);
      return;
    }
    let x = startX(line);
    for (const g of line) {
      paint(g, x, y);
      x += g.w;
    }
  });
  ctx.restore();
}

/** First line along an arc: curve > 0 bends like a rainbow, < 0 like a smile. */
function drawArc(ctx: Ctx, layer: TextLayer, line: Glyph[], curve: number, y: number, paint: (g: Glyph, x: number, y: number) => void): void {
  const total = lineWidth(line);
  const span = Math.abs(curve) * Math.PI * 0.95;
  const R = total / span;
  const cx = layer.width / 2;
  const up = curve > 0;
  const cy = up ? y + R : y + layer.fontSize - R;
  let s = -total / 2;
  for (const g of line) {
    const a = (s + g.w / 2) / R;
    ctx.save();
    if (up) {
      ctx.translate(cx + Math.sin(a) * R, cy - Math.cos(a) * R);
      ctx.rotate(a);
    } else {
      ctx.translate(cx + Math.sin(a) * R, cy + Math.cos(a) * R);
      ctx.rotate(-a);
    }
    paint(g, -g.w / 2, up ? 0 : -layer.fontSize);
    ctx.restore();
    s += g.w;
  }
}

function drawHighlight(ctx: Ctx, layer: TextLayer, x: number, y: number, w: number, size: number, i: number): void {
  const hl = layer.highlight!;
  const pad = hl.pad * size;
  ctx.save();
  ctx.fillStyle = hl.color;
  if (hl.style === 'marker') {
    // A quick marker swipe over the lower part of the letters, slightly uneven.
    const r = rand(17 + i * 7);
    const top = y + size * 0.42;
    const bot = y + size * 1.02;
    ctx.globalAlpha *= 0.85;
    ctx.beginPath();
    ctx.moveTo(x - pad, top + (r() - 0.5) * size * 0.08);
    ctx.lineTo(x + w + pad, top - size * 0.04 + (r() - 0.5) * size * 0.08);
    ctx.lineTo(x + w + pad * 0.6, bot + (r() - 0.5) * size * 0.06);
    ctx.lineTo(x - pad * 0.8, bot + size * 0.03);
    ctx.closePath();
    ctx.fill();
  } else if (hl.style === 'dymo') {
    roundRectPath(ctx, x - pad, y - size * 0.18, w + 2 * pad, size * 1.36, size * 0.16);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x - pad, y - size * 0.12, w + 2 * pad, size * 0.1);
  } else {
    ctx.fillRect(x - pad, y - size * 0.12, w + 2 * pad, size * 1.24);
  }
  ctx.restore();
}

/** Text lines with widths, for callers that need text geometry (seam guard). */
export function measureTextLines(ctx: Pick<Ctx, 'measureText' | 'font'>, layer: TextLayer): { y: number; x: number; w: number }[] {
  const lines = layoutText(ctx, layer);
  const lh = layer.fontSize * layer.lineHeight;
  const spacing = (layer.letterSpacing ?? 0) * layer.fontSize;
  return lines.map((line, i) => {
    const w = Math.max(0, lineWidth(line) - spacing);
    const x = layer.align === 'left' ? 0 : layer.align === 'center' ? (layer.width - w) / 2 : layer.width - w;
    return { x, y: i * lh, w };
  });
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
