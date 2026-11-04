/**
 * Browser-side test harness used by the Playwright e2e tests. It drives the real
 * model, renderer and exporter (no UI) and reports measurable facts back.
 */
import { ALL_FORMATS, BlobSource, CanvasSink, EncodedPacketSink, Input } from 'mediabunny';
import { probeCapabilities } from '../../src/capabilities/probe';
import { exportCarousel } from '../../src/export/exporter';
import { importImage, importVideo } from '../../src/media/importMedia';
import { normalizeProject } from '../../src/model/project';
import type { Project } from '../../src/model/types';
import { drawRegion } from '../../src/render/drawWindow';
import { TEMPLATES } from '../../src/templates/catalog';
import { fontsReady } from '../../src/ui/fonts';
import { planPages } from '../../src/model/plan';
import { unfilledSlots } from '../../src/model/project';

async function fetchBlob(url: string): Promise<Blob> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch ${url}: ${r.status}`);
  return r.blob();
}

async function bitmapsFor(blobs: Map<string, Blob>): Promise<Map<string, ImageBitmap>> {
  const m = new Map<string, ImageBitmap>();
  for (const [id, b] of blobs) if (b.type.startsWith('image/')) m.set(id, await createImageBitmap(b, { imageOrientation: 'from-image' }));
  return m;
}

export async function pixelAt(source: CanvasImageSource, w: number, h: number, x: number, y: number): Promise<number[]> {
  const c = new OffscreenCanvas(w, h);
  const ctx = c.getContext('2d')!;
  ctx.drawImage(source, 0, 0, w, h);
  return [...ctx.getImageData(x, y, 1, 1).data];
}

function regionDiff(a: CanvasImageSource, b: CanvasImageSource, x: number, y: number, w: number, h: number): number {
  const read = (src: CanvasImageSource) => {
    const c = new OffscreenCanvas(1080, 1350);
    const ctx = c.getContext('2d')!;
    ctx.drawImage(src, 0, 0, 1080, 1350);
    return ctx.getImageData(x, y, w, h).data;
  };
  const da = read(a);
  const db = read(b);
  let sum = 0;
  for (let i = 0; i < da.length; i += 4) sum += Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
  return sum / ((da.length / 4) * 3);
}

/** Mean abs difference between the exported clip region and a source frame scaled into it. */
async function syncError(exported: CanvasImageSource, source: Blob, sourceSeconds: number): Promise<number> {
  const input = new Input({ source: new BlobSource(source), formats: ALL_FORMATS });
  const frame = await new CanvasSink((await input.getPrimaryVideoTrack())!).getCanvas(sourceSeconds);
  const ref = new OffscreenCanvas(1080, 1350);
  const rctx = ref.getContext('2d')!;
  rctx.drawImage(exported, 0, 0, 1080, 1350);
  rctx.drawImage(frame!.canvas, 170, 430, 720, 405);
  input.dispose();
  return regionDiff(exported, ref, 170, 430, 720, 405);
}

async function describeMp4(blob: Blob, sourceVideo?: Blob) {
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  const video = await input.getPrimaryVideoTrack();
  const audio = await input.getPrimaryAudioTrack();
  let frames = 0;
  const sink = new EncodedPacketSink(video!);
  for await (const _ of sink.packets()) frames++;
  const duration = await input.computeDuration();
  const canvasSink = new CanvasSink(video!);
  const early = await canvasSink.getCanvas(0.4);
  const late = await canvasSink.getCanvas(4.4);
  // Audio energy in a tone second (0–1 s of the source → page 0–0 s since in=1 s: source 1–2 s is silence, 2–3 s tone).
  let toneRms = 0;
  let silenceRms = 0;
  if (audio) {
    const { AudioBufferSink } = await import('mediabunny');
    const as = new AudioBufferSink(audio);
    const rms = async (a: number, b: number) => {
      let sum = 0;
      let n = 0;
      for await (const { buffer } of as.buffers(a, b)) {
        const d = buffer.getChannelData(0);
        for (let i = 0; i < d.length; i++) sum += d[i] * d[i];
        n += d.length;
      }
      return n ? Math.sqrt(sum / n) : 0;
    };
    silenceRms = await rms(0.2, 0.8); // page 0–1 s ↔ source 1–2 s: silent second
    toneRms = await rms(1.2, 1.8); // page 1–2 s ↔ source 2–3 s: tone second
  }
  const result = {
    videoCodec: video!.codec,
    width: video!.displayWidth,
    height: video!.displayHeight,
    frames,
    duration,
    audioCodec: audio?.codec ?? null,
    toneRms,
    silenceRms,
    // Mean absolute difference between t = 0.4 s and t = 4.4 s, inside the clip and in the background.
    clipChange: early && late ? regionDiff(early.canvas, late.canvas, 170, 430, 720, 405) : null,
    backgroundChange: early && late ? regionDiff(early.canvas, late.canvas, 0, 0, 160, 1350) : null,
    // Page t = 4.4 s must show source 5.4 s (in = 1 s), not source 4.4 s.
    syncRight: late && sourceVideo ? await syncError(late.canvas, sourceVideo, 5.4) : null,
    syncWrong: late && sourceVideo ? await syncError(late.canvas, sourceVideo, 4.4) : null,
  };
  input.dispose();
  return result;
}

/** The guide's "Vejer" scene: photo – video – photo. */
async function runVejer() {
  const base = `${import.meta.env.BASE_URL}tests/fixtures/`;
  const calle = await importImage(Object.assign(await fetchBlob(base + 'calle.jpg'), { name: 'calle.jpg' }));
  const plaza = await importVideo(Object.assign(await fetchBlob(base + 'plaza.mp4'), { name: 'plaza.mp4' }));
  const project = normalizeProject({
    schemaVersion: 1,
    id: 'vejer',
    revision: 1,
    title: 'Vejer',
    canvas: { pageWidth: 1080, pageHeight: 1350, background: '#F5F1E8' },
    pages: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }],
    assets: [calle.asset, plaza.asset],
    layers: [
      { id: 'fondo', type: 'image', assetId: calle.asset.id, x: 0, y: 0, width: 3240, height: 1350, fit: 'cover' },
      {
        id: 'clip',
        type: 'video',
        assetId: plaza.asset.id,
        x: 1250,
        y: 430,
        width: 720,
        height: 405,
        fit: 'cover',
        clip: { inMs: 1000, outMs: 7000, startMs: 0, gain: 1, endMode: 'hold' },
      },
    ],
  });
  const blobs = new Map([
    [calle.asset.id, calle.blob],
    [plaza.asset.id, plaza.blob],
  ]);
  const bitmaps = await bitmapsFor(blobs);
  const caps = await probeCapabilities(1080, 1350);
  const t0 = performance.now();
  const pieces = await exportCarousel({
    project,
    blobs: (id) => blobs.get(id),
    images: (id) => bitmaps.get(id),
    caps,
    stillFormat: 'jpeg',
  });
  const ms = performance.now() - t0;
  const out: Record<string, unknown> = { caps, ms, names: pieces.map((p) => p.name), types: pieces.map((p) => p.blob.type) };
  const mp4 = pieces.find((p) => p.name.endsWith('.mp4'));
  if (mp4) out.mp4 = await describeMp4(mp4.blob, plaza.blob);
  // Stills must be different crops of the same photo: compare with the reference drawn directly.
  const p1 = await createImageBitmap(pieces[0].blob);
  const p3 = await createImageBitmap(pieces[2].blob);
  out.stillSizes = [
    [p1.width, p1.height],
    [p3.width, p3.height],
  ];
  out.stillsDiffer = JSON.stringify(await pixelAt(p1, 1080, 1350, 500, 500)) !== JSON.stringify(await pixelAt(p3, 1080, 1350, 500, 500));
  return out;
}

/**
 * Exact seams: an image whose pixels encode their own column (R,G) is laid 1:1 over
 * N pages; every exported PNG column must decode to i·W + x. No omitted or repeated column.
 */
async function runSeams(pages: number) {
  const W = 1080;
  const H = 1350;
  const total = W * pages;
  const src = new OffscreenCanvas(total, H);
  const sctx = src.getContext('2d')!;
  const img = sctx.createImageData(total, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < total; x++) {
      const i = (y * total + x) * 4;
      img.data[i] = x & 255;
      img.data[i + 1] = x >> 8;
      img.data[i + 2] = y & 255;
      img.data[i + 3] = 255;
    }
  sctx.putImageData(img, 0, 0);
  const blob = await src.convertToBlob({ type: 'image/png' });
  const bmp = await createImageBitmap(blob);
  const project: Project = normalizeProject({
    schemaVersion: 1,
    id: 'seams',
    revision: 1,
    title: 'Seams',
    canvas: { pageWidth: W, pageHeight: H, background: '#000000' },
    pages: Array.from({ length: pages }, (_, i) => ({ id: `p${i}` })),
    assets: [{ id: 'cols', type: 'image', name: 'cols.png', mime: 'image/png', width: total, height: H }],
    layers: [
      { id: 'cols', type: 'image', assetId: 'cols', x: 0, y: 0, width: total, height: H, fit: 'cover' },
      // A rotated tile whose centre is on page 1 but whose corner reaches page 2 (guide "rotation" case).
      { id: 'tile', type: 'shape', x: 700, y: 500, width: 360, height: 360, rotation: 30, fill: '#ff00ff', radius: 0 },
    ],
  });
  const caps = await probeCapabilities(W, H);
  const pieces = await exportCarousel({ project, blobs: () => blob, images: () => bmp, caps, stillFormat: 'png' });
  let badColumns = 0;
  let checked = 0;
  for (let i = 0; i < pieces.length; i++) {
    const pb = await createImageBitmap(pieces[i].blob);
    const c = new OffscreenCanvas(W, H);
    const ctx = c.getContext('2d')!;
    ctx.drawImage(pb, 0, 0);
    const row = ctx.getImageData(0, 1300, W, 1).data; // a row below the tile
    for (let x = 0; x < W; x++) {
      const col = row[x * 4] + (row[x * 4 + 1] << 8);
      checked++;
      if (col !== i * W + x) badColumns++;
    }
  }
  // Rotated tile: the strip drawn at once vs the two pages side by side must match around the seam.
  const strip = new OffscreenCanvas(W * 2, H);
  drawRegion(strip.getContext('2d')!, project, { x: 0, y: 0, width: W * 2, height: H }, 0, { image: () => bmp, video: () => null });
  const sctx2 = strip.getContext('2d')!;
  const p2 = await createImageBitmap(pieces[1].blob);
  const c2 = new OffscreenCanvas(W, H);
  c2.getContext('2d')!.drawImage(p2, 0, 0);
  const a = sctx2.getImageData(W, 400, 120, 500).data;
  const b = c2.getContext('2d')!.getImageData(0, 400, 120, 500).data;
  let maxDiff = 0;
  let strongDiffs = 0;
  let magenta = 0;
  for (let k = 0; k < a.length; k += 4) {
    const d = Math.max(Math.abs(a[k] - b[k]), Math.abs(a[k + 1] - b[k + 1]), Math.abs(a[k + 2] - b[k + 2]));
    maxDiff = Math.max(maxDiff, d);
    if (d > 32) strongDiffs++; // more than anti-aliasing noise on an edge
    if (b[k] > 200 && b[k + 1] < 60 && b[k + 2] > 200) magenta++;
  }
  return { pieces: pieces.length, names: pieces.map((p) => p.name), badColumns, checked, rotatedCornerMaxDiff: maxDiff, rotatedCornerStrongDiffs: strongDiffs, rotatedCornerPixelsOnPage2: magenta };
}

/** Build every template, check it, and render its strip at a small scale. */
async function runTemplates(scale = 0.25) {
  await fontsReady();
  const out = [];
  for (const t of TEMPLATES) {
    const { project, blobs } = await t.build();
    const bitmaps = await bitmapsFor(blobs);
    const { pageWidth: W, pageHeight: H } = project.canvas;
    const N = project.pages.length;
    const c = new OffscreenCanvas(Math.round(N * W * scale), Math.round(H * scale));
    drawRegion(c.getContext('2d')!, project, { x: 0, y: 0, width: N * W, height: H }, 0, { image: (id) => bitmaps.get(id), video: () => null }, { scale });
    const blob = await c.convertToBlob({ type: 'image/png' });
    const dataUrl = await new Promise<string>((res) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result));
      fr.readAsDataURL(blob);
    });
    const outside = project.layers.filter((l) => l.x + l.width <= 0 || l.x >= N * W || l.y + l.height <= 0 || l.y >= H).map((l) => l.name);
    const missing = project.assets.filter((a) => !blobs.has(a.id)).length;
    out.push({ id: t.id, pages: N, slots: unfilledSlots(project).map((s) => s.slot), kinds: planPages(project).map((p) => p.kind), outside, missing, dataUrl });
  }
  return out;
}

import { filmAssets } from './filmAssets';

Object.assign(window, { runVejer, runSeams, runTemplates, filmAssets, harnessReady: true });
