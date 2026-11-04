import type { FrameSources } from '../render/drawWindow';
import type { Asset, VideoLayer } from '../model/types';

/**
 * Runtime pixel sources for the editor and the preview.
 * Images: one decoded ImageBitmap per asset (EXIF orientation applied).
 * Videos: one <video> element per asset, seeked on demand; the exporter does
 * not use these (it decodes frame-accurately with Mediabunny instead).
 */
export class MediaLibrary {
  private blobs = new Map<string, Blob>();
  private urls = new Map<string, string>();
  private bitmaps = new Map<string, ImageBitmap>();
  private pending = new Map<string, Promise<void>>();
  private videos = new Map<string, HTMLVideoElement>();
  private listeners = new Set<() => void>();

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
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
      v.src = url;
      v.muted = true;
      v.playsInline = true;
      v.preload = 'auto';
      v.crossOrigin = 'anonymous';
      v.addEventListener('seeked', () => this.emit());
      v.addEventListener('loadeddata', () => this.emit());
      this.videos.set(asset.id, v);
    }
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
        if (!v || v.readyState < 2) return null;
        if (v.paused && Math.abs(v.currentTime * 1000 - sourceMs) > 40 && !v.seeking) v.currentTime = sourceMs / 1000;
        return v;
      },
    };
  }

  clear(): void {
    for (const b of this.bitmaps.values()) b.close();
    for (const u of this.urls.values()) URL.revokeObjectURL(u);
    for (const v of this.videos.values()) v.removeAttribute('src');
    this.blobs.clear();
    this.urls.clear();
    this.bitmaps.clear();
    this.videos.clear();
    this.pending.clear();
  }
}

export const library = new MediaLibrary();
