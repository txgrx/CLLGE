/**
 * Sample art drawn by code. Every picture is a deterministic function of its seed,
 * so templates look the same on every device and nothing is downloaded.
 * These are placeholders that invite the user's own photos and clips.
 */

type Ctx = OffscreenCanvasRenderingContext2D;

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w: number, h: number): { c: OffscreenCanvas; ctx: Ctx } {
  const c = new OffscreenCanvas(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  const ctx = c.getContext('2d')!;
  return { c, ctx };
}

function grain(ctx: Ctx, w: number, h: number, amount: number, r: () => number): void {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * amount;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

function vgrad(ctx: Ctx, h: number, stops: [number, string][]): CanvasGradient {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

/** A ridge line made of a few sines; continuous across the whole width. */
function ridge(ctx: Ctx, w: number, base: number, amp: number, r: () => number, fill: string | CanvasGradient, bottom: number): void {
  const f1 = 200 + r() * 300;
  const f2 = 60 + r() * 80;
  const p1 = r() * 10;
  const p2 = r() * 10;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(0, bottom);
  for (let x = 0; x <= w; x += 8) ctx.lineTo(x, base - Math.sin(x / f1 + p1) * amp - Math.sin(x / f2 + p2) * amp * 0.18);
  ctx.lineTo(w, bottom);
  ctx.closePath();
  ctx.fill();
}

const jpeg = (c: OffscreenCanvas) => c.convertToBlob({ type: 'image/jpeg', quality: 0.86 });
const png = (c: OffscreenCanvas) => c.convertToBlob({ type: 'image/png' });

/* ---------------- scenes (JPEG) ---------------- */

export async function coast(w: number, h: number, seed: number): Promise<Blob> {
  const r = rng(seed);
  const { c, ctx } = canvas(w, h);
  ctx.fillStyle = vgrad(ctx, h, [
    [0, '#2b1d2e'],
    [0.38, '#c9624a'],
    [0.56, '#f2b26b'],
  ]);
  ctx.fillRect(0, 0, w, h * 0.58);
  const sx = w * (0.35 + r() * 0.3);
  const sun = ctx.createRadialGradient(sx, h * 0.5, 0, sx, h * 0.5, h * 0.5);
  sun.addColorStop(0, 'rgba(255,226,170,0.95)');
  sun.addColorStop(0.12, 'rgba(255,214,150,0.8)');
  sun.addColorStop(0.13, 'rgba(255,200,140,0.25)');
  sun.addColorStop(1, 'rgba(255,200,140,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, w, h * 0.58);
  ridge(ctx, w, h * 0.5, h * 0.05, r, '#8a4a49', h * 0.58);
  ridge(ctx, w, h * 0.55, h * 0.025, r, '#4b2c3a', h * 0.58);
  ctx.fillStyle = vgrad(ctx, h, [
    [0.58, '#3a2a3c'],
    [1, '#120d16'],
  ]);
  ctx.fillRect(0, h * 0.58, w, h * 0.42);
  // Glints on the water under the sun.
  for (let i = 0; i < 260; i++) {
    const y = h * 0.6 + r() ** 1.6 * h * 0.38;
    const spread = (y - h * 0.58) * 1.4 + 20;
    const x = sx + (r() - 0.5) * spread;
    ctx.fillStyle = `rgba(255,${190 + r() * 50},${130 + r() * 60},${0.15 + r() * 0.5})`;
    ctx.fillRect(x, y, 6 + r() * 40, 1.5 + r() * 2);
  }
  grain(ctx, w, h, 14, r);
  return jpeg(c);
}

export async function dunes(w: number, h: number, seed: number): Promise<Blob> {
  const r = rng(seed);
  const { c, ctx } = canvas(w, h);
  ctx.fillStyle = vgrad(ctx, h, [
    [0, '#d9c8b4'],
    [0.5, '#f0dcc2'],
  ]);
  ctx.fillRect(0, 0, w, h);
  const cols = ['#d69a6a', '#c27e52', '#a9633f', '#8a4c31', '#6d3a26'];
  cols.forEach((col, i) => {
    const base = h * (0.42 + i * 0.12);
    const g = ctx.createLinearGradient(0, base - h * 0.1, 0, h);
    g.addColorStop(0, col);
    g.addColorStop(1, '#3d1f14');
    ridge(ctx, w, base, h * (0.06 - i * 0.006), r, g, h);
  });
  ctx.strokeStyle = 'rgba(255,240,220,0.18)';
  ctx.lineWidth = 2;
  for (let k = 0; k < 40; k++) {
    const y0 = h * (0.5 + r() * 0.45);
    ctx.beginPath();
    for (let x = 0; x <= w; x += 12) ctx.lineTo(x, y0 + Math.sin(x / (40 + r() * 3) + k) * 4);
    ctx.stroke();
  }
  grain(ctx, w, h, 16, r);
  return jpeg(c);
}

export async function nightSky(w: number, h: number, seed: number): Promise<Blob> {
  const r = rng(seed);
  const { c, ctx } = canvas(w, h);
  ctx.fillStyle = vgrad(ctx, h, [
    [0, '#05060c'],
    [0.7, '#141a2e'],
    [1, '#2a2440'],
  ]);
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < (w * h) / 900; i++) {
    const s = r() ** 3 * 2.6 + 0.4;
    ctx.fillStyle = `rgba(240,236,225,${0.25 + r() * 0.75})`;
    ctx.beginPath();
    ctx.arc(r() * w, r() ** 1.3 * h * 0.85, s, 0, Math.PI * 2);
    ctx.fill();
  }
  // A faint band of light across the whole width.
  const band = ctx.createLinearGradient(0, h * 0.1, w, h * 0.6);
  band.addColorStop(0, 'rgba(160,150,200,0)');
  band.addColorStop(0.5, 'rgba(190,180,220,0.12)');
  band.addColorStop(1, 'rgba(160,150,200,0)');
  ctx.fillStyle = band;
  ctx.fillRect(0, 0, w, h);
  // Crescent: cut the bite out on its own canvas so the sky shows through.
  const mx = w * (0.6 + r() * 0.3);
  const R = h * 0.06;
  const moon = new OffscreenCanvas(Math.ceil(R * 2 + 4), Math.ceil(R * 2 + 4));
  const m = moon.getContext('2d')!;
  m.fillStyle = '#efe8d6';
  m.beginPath();
  m.arc(R + 2, R + 2, R, 0, Math.PI * 2);
  m.fill();
  m.globalCompositeOperation = 'destination-out';
  m.beginPath();
  m.arc(R + 2 + R * 0.42, R + 2 - R * 0.25, R * 0.92, 0, Math.PI * 2);
  m.fill();
  ctx.drawImage(moon, mx - R - 2, h * 0.22 - R - 2);
  ridge(ctx, w, h * 0.82, h * 0.07, r, '#07080d', h);
  return jpeg(c);
}

export async function roofline(w: number, h: number, seed: number): Promise<Blob> {
  const r = rng(seed);
  const { c, ctx } = canvas(w, h);
  ctx.fillStyle = vgrad(ctx, h, [
    [0, '#1b2140'],
    [0.6, '#b25a52'],
    [0.8, '#f0a06a'],
  ]);
  ctx.fillRect(0, 0, w, h);
  let x = 0;
  while (x < w) {
    const bw = 60 + r() * 160;
    const bh = h * (0.18 + r() * 0.42);
    ctx.fillStyle = r() > 0.5 ? '#14121c' : '#1d1824';
    ctx.fillRect(x, h - bh, bw, bh);
    if (r() > 0.6) {
      ctx.beginPath();
      ctx.moveTo(x, h - bh);
      ctx.lineTo(x + bw / 2, h - bh - bw * 0.4);
      ctx.lineTo(x + bw, h - bh);
      ctx.fill();
    }
    for (let wy = h - bh + 20; wy < h - 20; wy += 34)
      for (let wx = x + 12; wx < x + bw - 16; wx += 26)
        if (r() > 0.72) {
          ctx.fillStyle = `rgba(255,${190 + r() * 40},${110 + r() * 50},${0.6 + r() * 0.4})`;
          ctx.fillRect(wx, wy, 10, 14);
        }
    x += bw + r() * 8;
  }
  grain(ctx, w, h, 12, r);
  return jpeg(c);
}

/** Paper-cut still life: overlapping flat shapes in one of a few palettes. */
export async function still(w: number, h: number, seed: number): Promise<Blob> {
  const r = rng(seed);
  const palettes = [
    ['#e9e2d3', '#e2462c', '#1f3a5f', '#f2b134', '#2f6b4f'],
    ['#1d1b1a', '#d9a441', '#c44536', '#efe6d8', '#5b7f6a'],
    ['#f1d9c7', '#264653', '#e76f51', '#2a9d8f', '#e9c46a'],
    ['#2b2d42', '#ef233c', '#edf2f4', '#8d99ae', '#f4a261'],
  ];
  const pal = palettes[Math.floor(r() * palettes.length)];
  const { c, ctx } = canvas(w, h);
  ctx.fillStyle = pal[0];
  ctx.fillRect(0, 0, w, h);
  const n = 5 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = pal[1 + Math.floor(r() * (pal.length - 1))];
    ctx.save();
    ctx.translate(r() * w, r() * h);
    ctx.rotate(r() * Math.PI);
    const s = (0.18 + r() * 0.45) * Math.min(w, h);
    const kind = Math.floor(r() * 4);
    ctx.beginPath();
    if (kind === 0) ctx.arc(0, 0, s / 2, 0, Math.PI * 2);
    else if (kind === 1) ctx.rect(-s / 2, -s / 4, s, s / 2);
    else if (kind === 2) {
      ctx.moveTo(-s / 2, s / 2);
      ctx.quadraticCurveTo(0, -s, s / 2, s / 2);
    } else ctx.arc(0, 0, s / 2, 0, Math.PI);
    ctx.fill();
    ctx.restore();
  }
  grain(ctx, w, h, 18, r);
  return jpeg(c);
}

/** Leaves on coloured ground. */
export async function botanical(w: number, h: number, seed: number): Promise<Blob> {
  const r = rng(seed);
  const { c, ctx } = canvas(w, h);
  ctx.fillStyle = ['#e8d9c0', '#203a2e', '#c86a4a'][Math.floor(r() * 3)];
  ctx.fillRect(0, 0, w, h);
  const greens = ['#2f6b4f', '#4d8a5f', '#1c4434', '#86a96b', '#d8c07a'];
  for (let i = 0; i < 14; i++) {
    const x = r() * w;
    const y = r() * h;
    const len = (0.25 + r() * 0.5) * Math.max(w, h);
    const a = r() * Math.PI * 2;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.fillStyle = greens[Math.floor(r() * greens.length)];
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(len * 0.5, -len * 0.22, len, 0);
    ctx.quadraticCurveTo(len * 0.5, len * 0.22, 0, 0);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(len * 0.95, 0);
    ctx.stroke();
    ctx.restore();
  }
  grain(ctx, w, h, 14, r);
  return jpeg(c);
}

/* ---------------- decorations (PNG with alpha) ---------------- */

/** A 35 mm strip: black base, sprocket holes, edge print and frame numbers. */
export async function filmStrip(w: number, h: number, frames: number, roll: number): Promise<Blob> {
  const { c, ctx } = canvas(w, h);
  ctx.fillStyle = '#0a0908';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,170,60,0.08)';
  ctx.fillRect(0, 0, w, h);
  const hole = h * 0.07;
  for (let x = 14; x < w; x += hole * 2.1) {
    for (const y of [h * 0.045, h - h * 0.045 - hole * 0.75]) {
      ctx.fillStyle = '#e9e3d6';
      roundRect(ctx, x, y, hole * 1.15, hole * 0.75, 3);
      ctx.fill();
    }
  }
  ctx.fillStyle = 'rgba(255,190,90,0.85)';
  ctx.font = `${Math.round(h * 0.045)}px ui-monospace, Menlo, monospace`;
  const cell = w / frames;
  for (let i = 0; i < frames; i++) {
    const n = roll + i;
    ctx.fillText(`${n}  ▸  ${n}A`, i * cell + cell * 0.32, h - h * 0.15);
    ctx.fillText('KD 400', i * cell + cell * 0.05, h * 0.19);
  }
  return png(c);
}

/** A string sagging across the width, with wooden pegs at the given x positions. */
export async function dryingLine(w: number, h: number, pegs: number[], sag: number): Promise<Blob> {
  const { c, ctx } = canvas(w, h);
  const y = (x: number) => h * 0.15 + sag * (1 - ((x - w / 2) / (w / 2)) ** 2);
  ctx.strokeStyle = '#d8cfc0';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let x = 0; x <= w; x += 6) ctx.lineTo(x, y(x));
  ctx.stroke();
  for (const px of pegs) {
    const py = y(px);
    ctx.save();
    ctx.translate(px, py);
    ctx.fillStyle = '#b98c5a';
    roundRect(ctx, -9, -26, 18, 64, 4);
    ctx.fill();
    ctx.fillStyle = '#8a6440';
    ctx.fillRect(-9, 4, 18, 4);
    ctx.restore();
  }
  return png(c);
}

export function dryingLineY(x: number, w: number, h: number, sag: number): number {
  return h * 0.15 + sag * (1 - ((x - w / 2) / (w / 2)) ** 2);
}

/** Paper scrap with a torn, irregular edge. */
export async function tornPaper(w: number, h: number, color: string, seed: number): Promise<Blob> {
  const r = rng(seed);
  const { c, ctx } = canvas(w, h);
  ctx.fillStyle = color;
  ctx.beginPath();
  const m = Math.min(w, h) * 0.04;
  const edge = (x0: number, y0: number, x1: number, y1: number) => {
    const n = 40;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      ctx.lineTo(x0 + (x1 - x0) * t + (r() - 0.5) * m, y0 + (y1 - y0) * t + (r() - 0.5) * m);
    }
  };
  ctx.moveTo(m, m);
  edge(m, m, w - m, m);
  edge(w - m, m, w - m, h - m);
  edge(w - m, h - m, m, h - m);
  edge(m, h - m, m, m);
  ctx.closePath();
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  // Faint ruled lines.
  ctx.strokeStyle = 'rgba(60,90,140,0.18)';
  ctx.lineWidth = 2;
  for (let y = h * 0.2; y < h - m * 2; y += h * 0.12) {
    ctx.beginPath();
    ctx.moveTo(m * 2, y);
    ctx.lineTo(w - m * 2, y);
    ctx.stroke();
  }
  return png(c);
}

/** Semi-transparent masking tape with ragged ends. */
export async function tape(w: number, h: number, seed: number): Promise<Blob> {
  const r = rng(seed);
  const { c, ctx } = canvas(w, h);
  ctx.fillStyle = 'rgba(236,226,196,0.78)';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  for (let x = 0; x <= w; x += w / 10) ctx.lineTo(x, (r() - 0.5) * 3);
  for (let y = 0; y <= h; y += h / 6) ctx.lineTo(w - r() * 8, y);
  for (let x = w; x >= 0; x -= w / 10) ctx.lineTo(x, h + (r() - 0.5) * 3);
  for (let y = h; y >= 0; y -= h / 6) ctx.lineTo(r() * 8, y);
  ctx.closePath();
  ctx.fill();
  return png(c);
}

/** Stamp with a perforated edge and an empty window (the window becomes a slot). */
export async function stampFrame(w: number, h: number): Promise<Blob> {
  const { c, ctx } = canvas(w, h);
  ctx.fillStyle = '#f7f2e8';
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'destination-out';
  const rr = Math.min(w, h) * 0.028;
  for (let x = rr; x < w; x += rr * 2.6) {
    ctx.beginPath();
    ctx.arc(x, 0, rr, 0, Math.PI * 2);
    ctx.arc(x, h, rr, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let y = rr; y < h; y += rr * 2.6) {
    ctx.beginPath();
    ctx.arc(0, y, rr, 0, Math.PI * 2);
    ctx.arc(w, y, rr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  return png(c);
}

/** Postmark: a ring with lettering and wavy cancel lines running off to the right. */
export async function postmark(w: number, h: number, text: string): Promise<Blob> {
  const { c, ctx } = canvas(w, h);
  ctx.strokeStyle = 'rgba(30,30,40,0.7)';
  ctx.fillStyle = 'rgba(30,30,40,0.7)';
  ctx.lineWidth = 5;
  const R = h * 0.42;
  const cx = R + 10;
  const cy = h / 2;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.72, 0, Math.PI * 2);
  ctx.stroke();
  ctx.font = `${Math.round(R * 0.22)}px ui-monospace, Menlo, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy);
  for (let k = 0; k < 5; k++) {
    ctx.beginPath();
    const y0 = cy - R * 0.6 + k * R * 0.3;
    for (let x = cx + R * 0.9; x <= w; x += 6) ctx.lineTo(x, y0 + Math.sin(x / 26) * 9);
    ctx.stroke();
  }
  return png(c);
}

/** Door frame with an arched top; transparent inside. */
export async function archFrame(w: number, h: number, thickness: number, color: string): Promise<Blob> {
  const { c, ctx } = canvas(w, h);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'destination-out';
  const iw = w - thickness * 2;
  const top = thickness + iw / 2;
  ctx.beginPath();
  ctx.moveTo(thickness, h);
  ctx.lineTo(thickness, top);
  ctx.arc(w / 2, top, iw / 2, Math.PI, 0);
  ctx.lineTo(w - thickness, h);
  ctx.closePath();
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  return png(c);
}

/** A grease-pencil circle, as drawn on a contact sheet to pick the frame. */
export async function greaseCircle(w: number, h: number, seed: number): Promise<Blob> {
  const r = rng(seed);
  const { c, ctx } = canvas(w, h);
  ctx.strokeStyle = 'rgba(255,59,47,0.9)';
  ctx.lineWidth = 9;
  ctx.lineCap = 'round';
  ctx.beginPath();
  const turns = 1.15;
  for (let t = 0; t <= turns; t += 0.01) {
    const a = t * Math.PI * 2 - 0.6;
    const k = 1 + (r() - 0.5) * 0.02 + t * 0.03;
    ctx.lineTo(w / 2 + Math.cos(a) * (w / 2 - 12) * k * 0.96, h / 2 + Math.sin(a) * (h / 2 - 12) * k * 0.96);
  }
  ctx.stroke();
  return png(c);
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * One continuous world for the home page: sunset on the left, a city at dusk in the
 * middle, a starry night on the right, all on a single unbroken horizon.
 */
export async function journey(w: number, h: number, seed: number): Promise<Blob> {
  const r = rng(seed);
  const { c, ctx } = canvas(w, h);
  const horizon = h * 0.6;
  // Sky palettes keyed along x: [x, top, middle, horizon].
  const keys: [number, number[], number[], number[]][] = [
    [0, [43, 29, 46], [201, 98, 74], [242, 178, 107]],
    [0.32, [38, 28, 52], [176, 84, 82], [236, 150, 98]],
    [0.58, [27, 33, 64], [106, 59, 90], [196, 111, 91]],
    [0.8, [10, 12, 26], [30, 34, 62], [70, 52, 80]],
    [1, [5, 6, 12], [20, 26, 46], [42, 36, 64]],
  ];
  const lerp = (a: number[], b: number[], t: number) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const at = (x: number) => {
    const u = x / w;
    let k = 0;
    while (k < keys.length - 2 && u > keys[k + 1][0]) k++;
    const [x0, t0, m0, h0] = keys[k];
    const [x1, t1, m1, h1] = keys[k + 1];
    const t = Math.min(1, Math.max(0, (u - x0) / (x1 - x0)));
    return [lerp(t0, t1, t), lerp(m0, m1, t), lerp(h0, h1, t)];
  };
  const rgb = (v: number[]) => `rgb(${v[0]},${v[1]},${v[2]})`;
  for (let x = 0; x < w; x += 4) {
    const [top, mid, hor] = at(x);
    const g = ctx.createLinearGradient(0, 0, 0, horizon);
    g.addColorStop(0, rgb(top));
    g.addColorStop(0.62, rgb(mid));
    g.addColorStop(1, rgb(hor));
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, 5, horizon + 2);
  }
  // Stars, denser towards the night.
  for (let i = 0; i < (w * h) / 700; i++) {
    const x = r() * w;
    const night = Math.max(0, (x / w - 0.5) / 0.5);
    if (r() > night * night) continue;
    ctx.fillStyle = `rgba(240,236,225,${(0.3 + r() * 0.7) * night})`;
    ctx.beginPath();
    ctx.arc(x, r() ** 1.4 * horizon * 0.9, r() ** 3 * 2.4 + 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  // Sun low on the left, moon high on the right.
  const sx = w * 0.17;
  const sun = ctx.createRadialGradient(sx, horizon - h * 0.04, 0, sx, horizon - h * 0.04, h * 0.5);
  sun.addColorStop(0, 'rgba(255,228,170,1)');
  sun.addColorStop(0.1, 'rgba(255,214,150,0.9)');
  sun.addColorStop(0.11, 'rgba(255,200,140,0.3)');
  sun.addColorStop(1, 'rgba(255,200,140,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, w * 0.5, horizon);
  const mx = w * 0.86;
  const R = h * 0.05;
  const moon = new OffscreenCanvas(Math.ceil(R * 2 + 4), Math.ceil(R * 2 + 4));
  const m = moon.getContext('2d')!;
  m.fillStyle = '#efe8d6';
  m.beginPath();
  m.arc(R + 2, R + 2, R, 0, Math.PI * 2);
  m.fill();
  m.globalCompositeOperation = 'destination-out';
  m.beginPath();
  m.arc(R + 2 + R * 0.45, R + 2 - R * 0.2, R * 0.9, 0, Math.PI * 2);
  m.fill();
  ctx.drawImage(moon, mx - R, h * 0.18 - R);
  // Continuous hills; their colour cools along the way.
  const hill = (cA: string, cB: string) => {
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, cA);
    g.addColorStop(1, cB);
    return g;
  };
  ridge(ctx, w, horizon - h * 0.02, h * 0.05, r, hill('#8a4a49', '#151829'), horizon + 2);
  ridge(ctx, w, horizon + h * 0.005, h * 0.02, r, hill('#4b2c3a', '#0a0b14'), horizon + 2);
  // A small town at dusk on the horizon.
  let x = w * 0.44;
  while (x < w * 0.66) {
    const bw = 30 + r() * 70;
    const bh = h * (0.03 + r() * 0.09);
    ctx.fillStyle = '#100f18';
    ctx.fillRect(x, horizon - bh, bw, bh + 2);
    for (let wy = horizon - bh + 8; wy < horizon - 6; wy += 16)
      for (let wx = x + 6; wx < x + bw - 8; wx += 13)
        if (r() > 0.68) {
          ctx.fillStyle = `rgba(255,${190 + r() * 40},${110 + r() * 50},${0.55 + r() * 0.45})`;
          ctx.fillRect(wx, wy, 5, 7);
        }
    x += bw + r() * 6;
  }
  // Water with reflections under the sun and the moon.
  const sea = ctx.createLinearGradient(0, 0, w, 0);
  sea.addColorStop(0, '#3a2a3c');
  sea.addColorStop(0.6, '#1c1a2c');
  sea.addColorStop(1, '#07080f');
  ctx.fillStyle = sea;
  ctx.fillRect(0, horizon, w, h - horizon);
  const shade = ctx.createLinearGradient(0, horizon, 0, h);
  shade.addColorStop(0, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, horizon, w, h - horizon);
  const glints = (cx: number, color: (a: number) => string, n: number) => {
    for (let i = 0; i < n; i++) {
      const y = horizon + 6 + r() ** 1.6 * (h - horizon - 10);
      const spread = (y - horizon) * 1.3 + 20;
      ctx.fillStyle = color(0.15 + r() * 0.55);
      ctx.fillRect(cx + (r() - 0.5) * spread, y, 6 + r() * 36, 1.5 + r() * 2);
    }
  };
  glints(sx, (a) => `rgba(255,${190 + r() * 50},${130 + r() * 60},${a})`, 420);
  glints(mx, (a) => `rgba(230,230,240,${a * 0.6})`, 220);
  grain(ctx, w, h, 12, r);
  return jpeg(c);
}
