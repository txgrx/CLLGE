import { ALL_FORMATS, BlobSource, CanvasSink, Input } from 'mediabunny';
import type { FrameSources } from '../render/drawWindow';
import type { Asset, VideoLayer } from '../model/types';

/** Decoded still frames of one clip (WebCodecs via Mediabunny), keyed by time in 100 ms steps. */
interface FrameDecoder {
  input: Input;
  ready: Promise<{ sink: CanvasSink; first: number } | null>;
  cache: Map<number, CanvasImageSource>;
  queue: number | null;
  busy: boolean;
}

const FRAME_STEP_MS = 100;
const FRAME_CACHE = 12;
const FRAME_MAX_WIDTH = 1280;

/**
 * Runtime pixel sources for the editor and the preview.
 * Images: one decoded ImageBitmap per asset (EXIF orientation applied).
 * Videos: one <video> element per asset, seeked on demand. When the element has no
 * frame to show — iOS Safari never loads one for a video that is not playing — the
 * frame is decoded with WebCodecs instead, like the exporter does.
 */
export class MediaLibrary {
  private blobs = new Map<string, Blob>();
  private urls = new Map<string, string>();
  private bitmaps = new Map<string, ImageBitmap>();
  private pending = new Map<string, Promise<void>>();
  private videos = new Map<string, HTMLVideoElement>();
  private decoders = new Map<string, FrameDecoder>();
  private listeners = new Set<() => void>();

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  /** Ask views to redraw (e.g. once web fonts have loaded). */
  touch(): void {
    this.emit();
  }

  has(assetId: string): boolean {
    return this.blobs.has(assetId);
  }

  blob(assetId: string): Blob | undefined {
    return this.blobs.get(assetId);
  }

  add(asset: Asset, blob: Blob): void {
    if (this.blobs.get(asset.id) === blob) return;
    this.blobs.set(asset.id, blob);
    if (asset.type === 'image') {
      const p = createImageBitmap(blob, { imageOrientation: 'from-image' })
        .then((bmp) => {
          this.bitmaps.set(asset.id, bmp);
          this.emit();
        })
        .catch(() => undefined)
        .finally(() => this.pending.delete(asset.id));
      this.pending.set(asset.id, p);
    } else {
      const url = URL.createObjectURL(blob);
      this.urls.set(asset.id, url);
      const v = document.createElement('video');
      // iOS: inline, muted and an explicit load(), or it will not even fetch metadata.
      v.muted = true;
      v.defaultMuted = true;
      v.playsInline = true;
      v.setAttribute('playsinline', '');
      v.setAttribute('muted', '');
      v.preload = 'auto';
      v.crossOrigin = 'anonymous';
      v.addEventListener('seeked', () => this.emit());
      v.addEventListener('loadeddata', () => this.emit());
      v.src = url;
      v.load();
      this.videos.set(asset.id, v);
      this.decoders.set(asset.id, this.makeDecoder(blob));
      this.decodedFrame(asset.id, 0);
    }
  }

  private makeDecoder(blob: Blob): FrameDecoder {
    const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
    const ready = (async () => {
      const track = await input.getPrimaryVideoTrack();
      if (!track || !(await track.canDecode())) return null;
      const sink = new CanvasSink(track, { width: Math.min(FRAME_MAX_WIDTH, track.displayWidth) });
      return { sink, first: await track.getFirstTimestamp() };
    })().catch(() => null);
    return { input, ready, cache: new Map(), queue: null, busy: false };
  }

  /**
   * A decoded frame of the clip near `sourceMs`: the exact one when it is cached,
   * otherwise the nearest cached one while the exact one is decoded (views redraw
   * when it lands).
   */
  decodedFrame(assetId: string, sourceMs: number): CanvasImageSource | null {
    const d = this.decoders.get(assetId);
    if (!d) return null;
    const key = Math.max(0, Math.round(sourceMs / FRAME_STEP_MS) * FRAME_STEP_MS);
    const hit = d.cache.get(key);
    if (hit) return hit;
    d.queue = key;
    void this.pump(d);
    let best: CanvasImageSource | null = null;
    let dist = Infinity;
    for (const [k, c] of d.cache) {
      if (Math.abs(k - key) < dist) {
        dist = Math.abs(k - key);
        best = c;
      }
    }
    return best;
  }

  private async pump(d: FrameDecoder): Promise<void> {
    if (d.busy) return;
    d.busy = true;
    try {
      const r = await d.ready;
      while (r && d.queue !== null) {
        const key = d.queue;
        d.queue = null;
        if (d.cache.has(key)) continue;
        // Before the first frame's timestamp there is no frame: use the first one.
        const t = Math.max(key / 1000, r.first);
        const wc = await r.sink.getCanvas(t).catch(() => null);
        if (!wc || !this.isLive(d)) continue;
        d.cache.set(key, wc.canvas);
        if (d.cache.size > FRAME_CACHE) d.cache.delete(d.cache.keys().next().value!);
        this.emit();
      }
    } finally {
      d.busy = false;
    }
  }

  private isLive(d: FrameDecoder): boolean {
    for (const x of this.decoders.values()) if (x === d) return true;
    return false;
  }

  async ready(): Promise<void> {
    await Promise.all(this.pending.values());
  }

  videoElement(assetId: string): HTMLVideoElement | undefined {
    return this.videos.get(assetId);
  }

  imageBitmap(assetId: string): ImageBitmap | undefined {
    return this.bitmaps.get(assetId);
  }

  /** Sources for still display: videos show the frame they are currently parked on. */
  sources(): FrameSources {
    return {
      image: (id) => this.bitmaps.get(id),
      video: (layer: VideoLayer, sourceMs: number) => {
        const v = this.videos.get(layer.assetId);
        if (!v || v.readyState < 2) return this.decodedFrame(layer.assetId, sourceMs);
        if (v.paused && Math.abs(v.currentTime * 1000 - sourceMs) > 40 && !v.seeking) v.currentTime = sourceMs / 1000;
        return v;
      },
    };
  }

  clear(): void {
    for (const b of this.bitmaps.values()) b.close();
    for (const u of this.urls.values()) URL.revokeObjectURL(u);
    for (const v of this.videos.values()) v.removeAttribute('src');
    for (const d of this.decoders.values()) d.input.dispose();
    this.decoders.clear();
    this.blobs.clear();
    this.urls.clear();
    this.bitmaps.clear();
    this.videos.clear();
    this.pending.clear();
  }
}

export const library = new MediaLibrary();
