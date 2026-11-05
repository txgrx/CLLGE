/**
 * Vector shapes drawn by code: media masks, frames, the sticker library and
 * hand-drawn strokes. Everything is a pure function of its inputs (and a seed), so
 * the editor, the preview and the export draw exactly the same thing.
 */
import type { MaskKind, MediaFrame, StickerLayer, StrokeLayer } from '../model/types';

export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Pt = [number, number];

export function rand(seed: number): () => number {
  let a = (seed | 0) >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ */
/* Paths                                                               */
/* ------------------------------------------------------------------ */

export function roundRectPath(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
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

function polygonPath(ctx: Ctx, pts: Pt[]): void {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

/** Smooth open/closed curve through points (Catmull-Rom → cubic Bézier). */
export function smoothPath(ctx: Ctx, pts: Pt[], closed = false): void {
  ctx.beginPath();
  if (pts.length < 2) return;
  const n = pts.length;
  const at = (i: number): Pt => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  ctx.moveTo(pts[0][0], pts[0][1]);
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    ctx.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
  }
  if (closed) ctx.closePath();
}

/**
 * Walk the four edges of a rectangle clockwise, offsetting each sample inward by
 * `bite(edge, t, len)` px. Used for perforated, torn and notched masks.
 */
function edgeProfile(w: number, h: number, step: number, bite: (edge: number, t: number, len: number) => number): Pt[] {
  const out: Pt[] = [];
  const edges: [Pt, Pt, Pt][] = [
    [[0, 0], [w, 0], [0, 1]],
    [[w, 0], [w, h], [-1, 0]],
    [[w, h], [0, h], [0, -1]],
    [[0, h], [0, 0], [1, 0]],
  ];
  edges.forEach(([a, b, nrm], e) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(2, Math.ceil(len / step));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const d = bite(e, t * len, len);
      out.push([a[0] + (b[0] - a[0]) * t + nrm[0] * d, a[1] + (b[1] - a[1]) * t + nrm[1] * d]);
    }
  });
  return out;
}

/** Outline of a media mask in the layer's box. */
export function maskPath(ctx: Ctx, kind: MaskKind | undefined, w: number, h: number, radius: number, seed = 1): void {
  const m = Math.min(w, h);
  switch (kind ?? 'rect') {
    case 'circle':
      ctx.beginPath();
      ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      return;
    case 'arch': {
      const r = Math.min(w / 2, h);
      ctx.beginPath();
      ctx.moveTo(0, h);
      ctx.lineTo(0, r);
      ctx.arc(w / 2, r, w / 2, Math.PI, 0);
      ctx.lineTo(w, h);
      ctx.closePath();
      return;
    }
    case 'blob': {
      const r = rand(seed);
      const n = 9;
      const pts: Pt[] = [];
      const off = r() * Math.PI * 2;
      for (let i = 0; i < n; i++) {
        const a = off + (i / n) * Math.PI * 2;
        const k = 0.8 + r() * 0.2;
        pts.push([w / 2 + Math.cos(a) * (w / 2) * k, h / 2 + Math.sin(a) * (h / 2) * k]);
      }
      smoothPath(ctx, pts, true);
      return;
    }
    case 'torn': {
      const r = rand(seed);
      const amp = m * 0.035;
      polygonPath(ctx, edgeProfile(w, h, m * 0.018, () => amp * 0.3 + r() * amp));
      return;
    }
    case 'stamp': {
      const hr = m * 0.028;
      const gap = hr * 2.7;
      polygonPath(
        ctx,
        edgeProfile(w, h, hr / 3, (_e, s, len) => {
          const n = Math.max(1, Math.round(len / gap));
          const g = len / n;
          const d = Math.abs(((s + g / 2) % g) - g / 2);
          return d < hr ? Math.sqrt(hr * hr - d * d) : 0;
        }),
      );
      return;
    }
    case 'ticket': {
      const nr = m * 0.11;
      polygonPath(
        ctx,
        edgeProfile(w, h, nr / 6, (e, s, len) => {
          if (e !== 1 && e !== 3) return 0;
          const d = Math.abs(s - len / 2);
          return d < nr ? Math.sqrt(nr * nr - d * d) : 0;
        }),
      );
      return;
    }
    default:
      roundRectPath(ctx, 0, 0, w, h, radius);
  }
}

/* ------------------------------------------------------------------ */
/* Frames                                                              */
/* ------------------------------------------------------------------ */

/** How far a frame draws outside the layer box (for culling), in px. */
export function frameMargin(frame: MediaFrame | undefined, w: number, h: number): number {
  if (!frame) return 0;
  const m = Math.min(w, h);
  switch (frame.kind) {
    case 'polaroid':
      return m * 0.34;
    case 'film':
      return m * 0.2;
    case 'stamp':
      return m * 0.1;
    case 'tape':
      return m * 0.16;
    case 'shadow':
      return m * 0.12;
  }
}

/** Parts of a frame drawn behind the media. */
export function drawFrameBack(ctx: Ctx, frame: MediaFrame | undefined, w: number, h: number, caption: (x: number, y: number, w: number, h: number) => void): void {
  if (!frame) return;
  const m = Math.min(w, h);
  ctx.save();
  switch (frame.kind) {
    case 'polaroid': {
      const p = m * 0.055;
      const bottom = m * 0.27;
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = m * 0.05;
      ctx.shadowOffsetY = m * 0.02;
      ctx.fillStyle = frame.color ?? '#F4F1EA';
      ctx.fillRect(-p, -p, w + 2 * p, h + p + bottom);
      ctx.shadowColor = 'transparent';
      if (frame.caption) caption(-p, h, w + 2 * p, bottom);
      break;
    }
    case 'film': {
      const side = m * 0.06;
      const band = m * 0.16;
      ctx.fillStyle = frame.color ?? '#0B0908';
      ctx.fillRect(-side, -band, w + 2 * side, h + 2 * band);
      ctx.fillStyle = 'rgba(240,233,220,0.92)';
      const hole = band * 0.42;
      const holeW = hole * 1.3;
      for (let x = -side + holeW * 0.4; x < w + side - holeW; x += holeW * 2.1) {
        roundRectPath(ctx, x, -band + (band - hole) / 2, holeW, hole, hole * 0.2);
        ctx.fill();
        roundRectPath(ctx, x, h + (band - hole) / 2, holeW, hole, hole * 0.2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,175,80,0.85)';
      ctx.font = `${Math.round(band * 0.28)}px "JetBrains Mono", monospace`;
      ctx.textBaseline = 'middle';
      ctx.fillText('KD 400  ▸  24A', side, h + band * 0.82);
      break;
    }
    case 'stamp': {
      const p = m * 0.07;
      ctx.translate(-p, -p);
      ctx.shadowColor = 'rgba(0,0,0,0.3)';
      ctx.shadowBlur = m * 0.03;
      ctx.fillStyle = frame.color ?? '#F7F2E8';
      maskPath(ctx, 'stamp', w + 2 * p, h + 2 * p, 0);
      ctx.fill();
      break;
    }
    case 'shadow': {
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = m * 0.08;
      ctx.shadowOffsetY = m * 0.03;
      ctx.fillStyle = '#000';
      ctx.fillRect(m * 0.01, m * 0.01, w - m * 0.02, h - m * 0.02);
      break;
    }
    case 'tape':
      break;
  }
  ctx.restore();
}

/** Parts of a frame drawn on top of the media (tape). */
export function drawFrameFront(ctx: Ctx, frame: MediaFrame | undefined, w: number, h: number, seed: number): void {
  if (frame?.kind !== 'tape') return;
  const m = Math.min(w, h);
  const tw = m * 0.42;
  const th = m * 0.11;
  const r = rand(seed);
  for (const [x, y, a] of [
    [0, 0, -0.65],
    [w, 0, 0.65],
  ] as const) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a + (r() - 0.5) * 0.2);
    drawTapeStrip(ctx, -tw / 2, -th / 2, tw, th, frame.color ?? 'rgba(236,226,196,0.82)', r);
    ctx.restore();
  }
}

function drawTapeStrip(ctx: Ctx, x: number, y: number, w: number, h: number, color: string, r: () => number): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  const teeth = 7;
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  for (let i = 1; i <= teeth; i++) ctx.lineTo(x + w - (i % 2 ? h * 0.08 * (0.5 + r()) : 0), y + (h * i) / teeth);
  ctx.lineTo(x, y + h);
  for (let i = teeth - 1; i >= 0; i--) ctx.lineTo(x + (i % 2 ? h * 0.08 * (0.5 + r()) : 0), y + (h * i) / teeth);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(x, y + h * 0.15, w, h * 0.12);
}

/* ------------------------------------------------------------------ */
/* Stickers                                                            */
/* ------------------------------------------------------------------ */

export interface StickerDef {
  id: string;
  label: string;
  /** Natural aspect ratio (width / height) of the sticker's box. */
  aspect: number;
  defaultColor: string;
  defaultLabel?: string;
  draw(ctx: Ctx, w: number, h: number, s: Pick<StickerLayer, 'color' | 'weight' | 'seed' | 'label'>): void;
}

/** Wobbly line through points, like a quick pen stroke. */
function pen(ctx: Ctx, pts: Pt[], width: number, color: string, r: () => number, wobble: number): void {
  const j = pts.map(([x, y]) => [x + (r() - 0.5) * wobble, y + (r() - 0.5) * wobble] as Pt);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  smoothPath(ctx, j);
  ctx.stroke();
}

function arrowHead(ctx: Ctx, tip: Pt, from: Pt, size: number, width: number, color: string): void {
  const a = Math.atan2(tip[1] - from[1], tip[0] - from[0]);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(tip[0] - Math.cos(a - 0.5) * size, tip[1] - Math.sin(a - 0.5) * size);
  ctx.lineTo(tip[0], tip[1]);
  ctx.lineTo(tip[0] - Math.cos(a + 0.5) * size, tip[1] - Math.sin(a + 0.5) * size);
  ctx.stroke();
}

/** "05 NOV 2026": what a fresh date stamp says (stored on the sticker when it is added). */
export function todayStamp(d = new Date()): string {
  return `${String(d.getDate()).padStart(2, '0')} ${d.toLocaleString('en', { month: 'short' }).toUpperCase()} ${d.getFullYear()}`;
}

function labelFont(ctx: Ctx, size: number, family = '"Space Mono", "JetBrains Mono", monospace', weight = 700): void {
  ctx.font = `${weight} ${Math.round(size)}px ${family}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
}

export const STICKERS: StickerDef[] = [
  {
    id: 'arrow-curly',
    label: 'Loop arrow',
    aspect: 2,
    defaultColor: '#FF3B2F',
    draw(ctx, w, h, s) {
      const r = rand(s.seed);
      const lw = h * 0.06 * s.weight;
      const pts: Pt[] = [
        [w * 0.04, h * 0.7],
        [w * 0.25, h * 0.52],
        [w * 0.42, h * 0.22],
        [w * 0.34, h * 0.12],
        [w * 0.26, h * 0.3],
        [w * 0.4, h * 0.6],
        [w * 0.66, h * 0.66],
        [w * 0.92, h * 0.46],
      ];
      pen(ctx, pts, lw, s.color, r, h * 0.02);
      arrowHead(ctx, pts[pts.length - 1], pts[pts.length - 2], h * 0.2, lw, s.color);
    },
  },
  {
    id: 'arrow-swoosh',
    label: 'Swoosh arrow',
    aspect: 2.4,
    defaultColor: '#EDEBE6',
    draw(ctx, w, h, s) {
      const r = rand(s.seed);
      const lw = h * 0.07 * s.weight;
      const pts: Pt[] = [
        [w * 0.04, h * 0.8],
        [w * 0.35, h * 0.35],
        [w * 0.7, h * 0.22],
        [w * 0.94, h * 0.3],
      ];
      pen(ctx, pts, lw, s.color, r, h * 0.015);
      arrowHead(ctx, pts[3], pts[2], h * 0.24, lw, s.color);
    },
  },
  {
    id: 'circle-scribble',
    label: 'Marker circle',
    aspect: 1.4,
    defaultColor: '#FF3B2F',
    draw(ctx, w, h, s) {
      const r = rand(s.seed);
      const pts: Pt[] = [];
      const turns = 1.18;
      const n = 40;
      for (let i = 0; i <= n; i++) {
        const t = (i / n) * turns * Math.PI * 2 - 0.8;
        const k = 0.9 + 0.08 * Math.sin(i * 0.7) + (i / n) * 0.05;
        pts.push([w / 2 + Math.cos(t) * w * 0.45 * k, h / 2 + Math.sin(t) * h * 0.42 * k]);
      }
      pen(ctx, pts, Math.min(w, h) * 0.05 * s.weight, s.color, r, Math.min(w, h) * 0.01);
    },
  },
  {
    id: 'underline',
    label: 'Underline',
    aspect: 5,
    defaultColor: '#FF3B2F',
    draw(ctx, w, h, s) {
      const r = rand(s.seed);
      const lw = h * 0.16 * s.weight;
      pen(ctx, [[w * 0.03, h * 0.45], [w * 0.4, h * 0.32], [w * 0.75, h * 0.4], [w * 0.97, h * 0.3]], lw, s.color, r, h * 0.05);
      pen(ctx, [[w * 0.12, h * 0.75], [w * 0.5, h * 0.62], [w * 0.88, h * 0.7]], lw * 0.8, s.color, r, h * 0.05);
    },
  },
  {
    id: 'star',
    label: 'Star',
    aspect: 1,
    defaultColor: '#FFB547',
    draw(ctx, w, h, s) {
      const r = rand(s.seed);
      const pts: Pt[] = [];
      for (let i = 0; i <= 10; i++) {
        const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
        const k = i % 2 ? 0.42 : 1;
        pts.push([w / 2 + Math.cos(a) * w * 0.46 * k + (r() - 0.5) * w * 0.03, h / 2 + Math.sin(a) * h * 0.46 * k + (r() - 0.5) * h * 0.03]);
      }
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fillStyle = s.color;
      ctx.fill();
    },
  },
  {
    id: 'sparkle',
    label: 'Sparkle',
    aspect: 1,
    defaultColor: '#EDEBE6',
    draw(ctx, w, h, s) {
      const sparkle = (cx: number, cy: number, rr: number) => {
        ctx.beginPath();
        ctx.moveTo(cx, cy - rr);
        ctx.quadraticCurveTo(cx, cy, cx + rr, cy);
        ctx.quadraticCurveTo(cx, cy, cx, cy + rr);
        ctx.quadraticCurveTo(cx, cy, cx - rr, cy);
        ctx.quadraticCurveTo(cx, cy, cx, cy - rr);
        ctx.fill();
      };
      ctx.fillStyle = s.color;
      sparkle(w * 0.45, h * 0.52, Math.min(w, h) * 0.42);
      sparkle(w * 0.82, h * 0.2, Math.min(w, h) * 0.14);
      sparkle(w * 0.84, h * 0.82, Math.min(w, h) * 0.09);
    },
  },
  {
    id: 'heart',
    label: 'Heart',
    aspect: 1.1,
    defaultColor: '#FF3B2F',
    draw(ctx, w, h, s) {
      const r = rand(s.seed);
      const pts: Pt[] = [];
      for (let i = 0; i <= 36; i++) {
        const t = (i / 36) * Math.PI * 2;
        const x = 16 * Math.sin(t) ** 3;
        const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
        pts.push([w / 2 + (x / 34) * w, h * 0.48 + (y / 34) * h]);
      }
      pen(ctx, pts, Math.min(w, h) * 0.06 * s.weight, s.color, r, Math.min(w, h) * 0.015);
    },
  },
  {
    id: 'asterisk',
    label: 'Asterisk',
    aspect: 1,
    defaultColor: '#FF3B2F',
    draw(ctx, w, h, s) {
      const r = rand(s.seed);
      const lw = Math.min(w, h) * 0.1 * s.weight;
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI + (r() - 0.5) * 0.15;
        pen(ctx, [[w / 2 - Math.cos(a) * w * 0.42, h / 2 - Math.sin(a) * h * 0.42], [w / 2 + Math.cos(a) * w * 0.42, h / 2 + Math.sin(a) * h * 0.42]], lw, s.color, r, 0);
      }
    },
  },
  {
    id: 'squiggle',
    label: 'Squiggle',
    aspect: 4,
    defaultColor: '#8FB3FF',
    draw(ctx, w, h, s) {
      const r = rand(s.seed);
      const pts: Pt[] = [];
      for (let i = 0; i <= 9; i++) pts.push([w * (0.04 + i * 0.102), h * (i % 2 ? 0.2 : 0.8)]);
      pen(ctx, pts, h * 0.14 * s.weight, s.color, r, h * 0.05);
    },
  },
  {
    id: 'x-mark',
    label: 'Cross',
    aspect: 1,
    defaultColor: '#FF3B2F',
    draw(ctx, w, h, s) {
      const r = rand(s.seed);
      const lw = Math.min(w, h) * 0.11 * s.weight;
      pen(ctx, [[w * 0.12, h * 0.15], [w * 0.5, h * 0.52], [w * 0.88, h * 0.86]], lw, s.color, r, w * 0.02);
      pen(ctx, [[w * 0.86, h * 0.12], [w * 0.5, h * 0.5], [w * 0.14, h * 0.88]], lw, s.color, r, w * 0.02);
    },
  },
  {
    id: 'bracket',
    label: 'Brackets',
    aspect: 1.6,
    defaultColor: '#EDEBE6',
    draw(ctx, w, h, s) {
      const r = rand(s.seed);
      const lw = h * 0.05 * s.weight;
      pen(ctx, [[w * 0.18, h * 0.06], [w * 0.06, h * 0.12], [w * 0.05, h * 0.5], [w * 0.06, h * 0.88], [w * 0.18, h * 0.94]], lw, s.color, r, h * 0.01);
      pen(ctx, [[w * 0.82, h * 0.06], [w * 0.94, h * 0.12], [w * 0.95, h * 0.5], [w * 0.94, h * 0.88], [w * 0.82, h * 0.94]], lw, s.color, r, h * 0.01);
    },
  },
  {
    id: 'burst',
    label: 'Burst',
    aspect: 1,
    defaultColor: '#FFB547',
    defaultLabel: 'NEW',
    draw(ctx, w, h, s) {
      const pts: Pt[] = [];
      const n = 22;
      for (let i = 0; i < n * 2; i++) {
        const a = (i / (n * 2)) * Math.PI * 2;
        const k = i % 2 ? 0.8 : 1;
        pts.push([w / 2 + Math.cos(a) * w * 0.48 * k, h / 2 + Math.sin(a) * h * 0.48 * k]);
      }
      polygonPath(ctx, pts);
      ctx.fillStyle = s.color;
      ctx.fill();
      ctx.fillStyle = '#141414';
      labelFont(ctx, h * 0.2, '"Rubik Mono One", Impact, sans-serif', 400);
      ctx.fillText(s.label ?? 'NEW', w / 2, h / 2);
    },
  },
  {
    id: 'ticket',
    label: 'Ticket',
    aspect: 2.4,
    defaultColor: '#F2B134',
    defaultLabel: 'ADMIT ONE',
    draw(ctx, w, h, s) {
      ctx.fillStyle = s.color;
      maskPath(ctx, 'ticket', w, h, 0);
      ctx.fill();
      ctx.strokeStyle = 'rgba(20,20,20,0.55)';
      ctx.setLineDash([h * 0.05, h * 0.05]);
      ctx.lineWidth = h * 0.02;
      ctx.strokeRect(w * 0.08, h * 0.14, w * 0.84, h * 0.72);
      ctx.setLineDash([]);
      ctx.fillStyle = '#141414';
      labelFont(ctx, h * 0.2);
      ctx.fillText(s.label ?? 'ADMIT ONE', w / 2, h / 2);
    },
  },
  {
    id: 'date-stamp',
    label: 'Date stamp',
    aspect: 2.2,
    defaultColor: '#E2462C',
    defaultLabel: '',
    draw(ctx, w, h, s) {
      const r = rand(s.seed);
      ctx.save();
      // Ink gaps, like a real rubber stamp: holes cut from a clip (even-odd), so only
      // the stamp gets them — never whatever lies underneath.
      ctx.beginPath();
      ctx.rect(-w, -h, w * 3, h * 3);
      for (let i = 0; i < 60; i++) {
        const cx = r() * w;
        const cy = r() * h;
        const rr = h * (0.005 + r() * 0.025);
        ctx.moveTo(cx + rr, cy);
        ctx.arc(cx, cy, rr, 0, Math.PI * 2);
      }
      ctx.clip('evenodd');
      ctx.globalAlpha = 0.86;
      ctx.strokeStyle = s.color;
      ctx.fillStyle = s.color;
      ctx.lineWidth = h * 0.06;
      roundRectPath(ctx, h * 0.06, h * 0.08, w - h * 0.12, h * 0.84, h * 0.12);
      ctx.stroke();
      labelFont(ctx, h * 0.34, '"Special Elite", "Courier New", monospace', 400);
      ctx.fillText(s.label || todayStamp(), w / 2, h / 2 + h * 0.02);
      ctx.restore();
    },
  },
  {
    id: 'swipe-tag',
    label: 'Swipe tag',
    aspect: 3,
    defaultColor: '#EDEBE6',
    defaultLabel: 'swipe →',
    draw(ctx, w, h, s) {
      roundRectPath(ctx, 0, 0, w, h, h / 2);
      ctx.fillStyle = s.color;
      ctx.fill();
      ctx.fillStyle = '#141414';
      labelFont(ctx, h * 0.38, '"Schibsted Grotesk Variable", system-ui, sans-serif', 700);
      ctx.fillText(s.label ?? 'swipe →', w / 2, h / 2 + h * 0.02);
    },
  },
  {
    id: 'tape',
    label: 'Tape',
    aspect: 3.2,
    defaultColor: 'rgba(236,226,196,0.82)',
    draw(ctx, w, h, s) {
      drawTapeStrip(ctx, 0, 0, w, h, s.color, rand(s.seed));
    },
  },
];

export function stickerById(id: string): StickerDef | undefined {
  return STICKERS.find((x) => x.id === id);
}

export function drawSticker(ctx: Ctx, layer: StickerLayer): void {
  stickerById(layer.sticker)?.draw(ctx, layer.width, layer.height, layer);
}

/* ------------------------------------------------------------------ */
/* Strokes                                                             */
/* ------------------------------------------------------------------ */

export function drawStroke(ctx: Ctx, layer: StrokeLayer): void {
  const pts = layer.points.map(([u, v]) => [u * layer.width, v * layer.height] as Pt);
  if (pts.length < 2) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = layer.color;
  const r = rand(pts.length * 31 + Math.round(pts[0][0]));
  switch (layer.style) {
    case 'pencil':
      ctx.globalAlpha = 0.55;
      for (let k = 0; k < 3; k++) {
        ctx.lineWidth = layer.lineWidth * (0.35 + r() * 0.25);
        smoothPath(
          ctx,
          pts.map(([x, y]) => [x + (r() - 0.5) * layer.lineWidth * 0.6, y + (r() - 0.5) * layer.lineWidth * 0.6] as Pt),
        );
        ctx.stroke();
      }
      break;
    case 'dashed':
      ctx.lineWidth = layer.lineWidth;
      ctx.setLineDash([layer.lineWidth * 2.4, layer.lineWidth * 2]);
      smoothPath(ctx, pts);
      ctx.stroke();
      break;
    case 'scribble':
      ctx.lineWidth = layer.lineWidth * 0.6;
      smoothPath(ctx, pts);
      ctx.stroke();
      smoothPath(
        ctx,
        pts.map(([x, y], i) => [x + Math.sin(i * 1.7) * layer.lineWidth * 0.9, y + Math.cos(i * 1.3) * layer.lineWidth * 0.9] as Pt),
      );
      ctx.stroke();
      break;
    default:
      ctx.lineWidth = layer.lineWidth;
      smoothPath(ctx, pts);
      ctx.stroke();
  }
  ctx.restore();
}

/**
 * A hand-drawn line that runs through every slide: a gentle wave with a loop or
 * two, from the left edge of the first slide to the right edge of the last.
 */
export function continuousLine(totalW: number, h: number, seed: number): Pt[] {
  const r = rand(seed);
  const pts: Pt[] = [];
  const base = h * (0.55 + r() * 0.2);
  const amp = h * (0.05 + r() * 0.06);
  const freq = 1.2 + r() * 2.2;
  const phase = r() * Math.PI * 2;
  // Two small loops somewhere along the line, like a pen that doubled back.
  const loops = [0.15 + r() * 0.3, 0.55 + r() * 0.3].map((u) => u * totalW);
  const step = Math.max(20, totalW / 160);
  const y = (x: number) => base + Math.sin((x / totalW) * Math.PI * 2 * freq + phase) * amp;
  for (let x = 0; x <= totalW + 0.1; x += step) {
    pts.push([x, y(x)]);
    for (const lx of loops) {
      if (lx >= x && lx < x + step) {
        const rr = h * (0.035 + r() * 0.025);
        const cy = y(lx) - rr;
        for (let k = 1; k <= 10; k++) {
          const a = Math.PI / 2 - (k / 10) * Math.PI * 2;
          pts.push([lx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
        }
      }
    }
  }
  return pts;
}
