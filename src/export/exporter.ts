import { zipSync } from 'fflate';
import { ALL_FORMATS, BlobSource, CanvasSink, Input } from 'mediabunny';
import { sourceTimeMs } from '../model/timing';
import { planPages, type PagePlan } from '../model/plan';
import type { Project } from '../model/types';
import { drawPage, type FrameSources } from '../render/drawWindow';
import type { Capabilities } from '../capabilities/probe';
import { renderVideoPage } from './videoPage';

export type StillFormat = 'jpeg' | 'png';

export interface ExportedPiece {
  name: string;
  blob: Blob;
  kind: 'image' | 'video';
  durationMs: number;
  hasAudio: boolean;
}

export interface ExportRequest {
  project: Project;
  blobs: (assetId: string) => Blob | undefined;
  images: FrameSources['image'];
  caps: Capabilities;
  stillFormat: StillFormat;
  /** User explicitly accepted exporting video pages as photos (no motion). */
  photosOnly?: boolean;
  /** User explicitly accepted silent videos when audio cannot be encoded. */
  allowSilent?: boolean;
  /** Pages already exported in a previous attempt (same revision) are reused. */
  previous?: Map<number, ExportedPiece>;
  signal?: AbortSignal;
  onProgress?: (state: { page: number; total: number; fraction: number; label: string }) => void;
}

export class ExportBlockedError extends Error {}

/** Check before starting whether the plan can be produced on this device. */
export function exportBlocker(plans: PagePlan[], req: Pick<ExportRequest, 'caps' | 'photosOnly' | 'allowSilent'>): string | null {
  const videos = plans.filter((p) => p.kind === 'video');
  if (!videos.length || req.photosOnly) return null;
  if (!req.caps.videoCodec) return 'This device cannot encode MP4. Choose "Export video pages as photos" or open the project on another device.';
  if (videos.some((p) => p.audioLayer) && !req.caps.audioCodec && !req.allowSilent) return 'Audio cannot be encoded here. Allow silent videos to continue.';
  return null;
}

export async function exportCarousel(req: ExportRequest): Promise<ExportedPiece[]> {
  const plans = planPages(req.project);
  const blocker = exportBlocker(plans, req);
  if (blocker) throw new ExportBlockedError(blocker);
  const { pageWidth: W, pageHeight: H } = req.project.canvas;
  const pieces: ExportedPiece[] = [];
  for (const plan of plans) {
    if (req.signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
    const prev = req.previous?.get(plan.index);
    if (prev) {
      pieces.push(prev);
      continue;
    }
    const report = (fraction: number, label: string) => req.onProgress?.({ page: plan.index, total: plans.length, fraction, label });
    let piece: ExportedPiece;
    if (plan.kind === 'video' && !req.photosOnly) {
      report(0, `Encoding ${plan.baseName}.mp4`);
      const blob = await renderVideoPage({
        project: req.project,
        plan,
        blobs: req.blobs,
        images: req.images,
        videoCodec: req.caps.videoCodec!,
        audioCodec: req.caps.audioCodec,
        signal: req.signal,
        onProgress: (f) => report(f, `Encoding ${plan.baseName}.mp4`),
      });
      piece = { name: `${plan.baseName}.mp4`, blob, kind: 'video', durationMs: plan.durationMs, hasAudio: !!plan.audioLayer && !!req.caps.audioCodec };
    } else {
      report(0, `Rendering ${plan.baseName}`);
      const frames = plan.videoLayers.length ? await firstFrames(plan, req.blobs) : new Map();
      const blob = await renderStill(req.project, plan.index, W, H, req.images, req.stillFormat, (l) => frames.get(l.id) ?? null);
      piece = { name: `${plan.baseName}.${req.stillFormat === 'png' ? 'png' : 'jpg'}`, blob, kind: 'image', durationMs: 0, hasAudio: false };
    }
    req.previous?.set(plan.index, piece);
    pieces.push(piece);
    report(1, `Done ${piece.name}`);
  }
  return pieces;
}

export async function renderStill(
  project: Project,
  index: number,
  W: number,
  H: number,
  images: FrameSources['image'],
  format: StillFormat,
  video: FrameSources['video'] = () => null,
): Promise<Blob> {
  const canvas = new OffscreenCanvas(W, H);
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('2D canvas is not available');
  // Clips appear as their frame at t = 0 only when the user chose "photos only".
  drawPage(ctx, project, index, 0, { image: images, video });
  return canvas.convertToBlob(format === 'png' ? { type: 'image/png' } : { type: 'image/jpeg', quality: 0.92 });
}

async function firstFrames(plan: PagePlan, blobs: (id: string) => Blob | undefined): Promise<Map<string, CanvasImageSource>> {
  const out = new Map<string, CanvasImageSource>();
  for (const layer of plan.videoLayers) {
    const blob = blobs(layer.assetId);
    const t = sourceTimeMs(layer.clip, 0);
    if (!blob || t === null) continue;
    const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
    try {
      const track = await input.getPrimaryVideoTrack();
      if (!track) continue;
      const frame = await new CanvasSink(track).getCanvas(t / 1000);
      if (frame) out.set(layer.id, frame.canvas);
    } finally {
      input.dispose();
    }
  }
  return out;
}

/** ZIP with the pieces in carousel order. Media is stored, not recompressed. */
export async function zipPieces(pieces: ExportedPiece[]): Promise<Blob> {
  const entries: Record<string, [Uint8Array, { level: 0 }]> = {};
  for (const p of pieces) entries[p.name] = [new Uint8Array(await p.blob.arrayBuffer()), { level: 0 }];
  const data = zipSync(entries);
  return new Blob([data as BlobPart], { type: 'application/zip' });
}

export function piecesAsFiles(pieces: ExportedPiece[]): File[] {
  return pieces.map((p) => new File([p.blob], p.name, { type: p.blob.type }));
}

export function canShareFiles(files: File[]): boolean {
  try {
    return !!navigator.canShare && navigator.canShare({ files });
  } catch {
    return false;
  }
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
