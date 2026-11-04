import { layerTouchesRect, pageRect } from './geometry';
import { clipEndMs } from './timing';
import type { Asset, Layer, Project, VideoLayer } from './types';

export type PieceKind = 'image' | 'video';

export interface PagePlan {
  index: number;
  pageId: string;
  kind: PieceKind;
  /** File name without extension, two digits: "01", "02"… */
  baseName: string;
  /** Visible layers that reach this page, back to front. */
  layers: Layer[];
  /** Video layers that reach this page and add motion. */
  videoLayers: VideoLayer[];
  /** Layer whose audio is used, if any. */
  audioLayer: VideoLayer | null;
  durationMs: number;
}

export function assetById(project: Project, id: string): Asset | undefined {
  return project.assets.find((a) => a.id === id);
}

export function layerHasAudio(project: Project, layer: VideoLayer): boolean {
  const asset = assetById(project, layer.assetId);
  return !!asset && asset.type === 'video' && asset.hasAudio && layer.clip.gain > 0 && layer.clip.outMs > layer.clip.inMs;
}

export function layersOnPage(project: Project, index: number): Layer[] {
  const rect = pageRect(project.canvas, index);
  return project.layers.filter((l) => l.visible && l.opacity > 0 && layerTouchesRect(l, rect));
}

/**
 * Decide what each page becomes on export (guide §9):
 * - a page becomes MP4 when a visible clip reaches it or when it has an active audio track;
 * - otherwise it is a still image;
 * - duration = max(startMs + outMs − inMs) over the clips that reach it (plus the chosen audio clip).
 */
export function planPages(project: Project): PagePlan[] {
  return project.pages.map((page, index) => {
    const layers = layersOnPage(project, index);
    const videoLayers = layers.filter((l): l is VideoLayer => l.type === 'video' && l.clip.outMs > l.clip.inMs);
    let audioLayer: VideoLayer | null = null;
    if (page.audioLayerId === undefined) {
      const audible = videoLayers.filter((l) => layerHasAudio(project, l)).sort((a, b) => a.audioOrder - b.audioOrder);
      audioLayer = audible[0] ?? null;
    } else if (page.audioLayerId !== null) {
      const chosen = project.layers.find((l) => l.id === page.audioLayerId);
      if (chosen && chosen.type === 'video' && layerHasAudio(project, chosen)) audioLayer = chosen;
    }
    const clips = videoLayers.map((l) => l.clip);
    if (audioLayer && !videoLayers.includes(audioLayer)) clips.push(audioLayer.clip);
    const durationMs = clips.reduce((m, c) => Math.max(m, clipEndMs(c)), 0);
    const kind: PieceKind = videoLayers.length > 0 || audioLayer ? 'video' : 'image';
    return {
      index,
      pageId: page.id,
      kind,
      baseName: String(index + 1).padStart(2, '0'),
      layers,
      videoLayers,
      audioLayer,
      durationMs: kind === 'video' ? Math.max(durationMs, 1) : 0,
    };
  });
}

export function summarizePlan(plans: PagePlan[]): string {
  const stills = plans.filter((p) => p.kind === 'image').length;
  const videos = plans.filter((p) => p.kind === 'video');
  const withAudio = videos.filter((p) => p.audioLayer).length;
  const parts: string[] = [];
  if (stills) parts.push(`${stills} photo${stills === 1 ? '' : 's'}`);
  if (videos.length) {
    parts.push(`${videos.length} video${videos.length === 1 ? '' : 's'}` + (withAudio ? ` (${withAudio} with audio)` : ''));
  }
  return parts.join(' and ') || 'nothing';
}
