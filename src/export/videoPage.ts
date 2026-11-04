import {
  ALL_FORMATS,
  AudioBufferSink,
  AudioBufferSource,
  BlobSource,
  BufferTarget,
  CanvasSink,
  CanvasSource,
  Input,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  type AudioCodec,
  type VideoCodec,
} from 'mediabunny';
import { fitMedia } from '../model/geometry';
import type { PagePlan } from '../model/plan';
import { EXPORT_FPS, clipEndMs, frameCount, frameTimeMs, sourceTimeMs } from '../model/timing';
import type { Project, VideoLayer } from '../model/types';
import { drawPage, type FrameSources } from '../render/drawWindow';

export const AUDIO_SAMPLE_RATE = 48000;

export interface VideoPageOptions {
  project: Project;
  plan: PagePlan;
  blobs: (assetId: string) => Blob | undefined;
  images: FrameSources['image'];
  videoCodec: VideoCodec;
  /** null = export without audio (only after the user agreed). */
  audioCodec: AudioCodec | null;
  signal?: AbortSignal;
  onProgress?: (fraction: number) => void;
}

interface LayerReader {
  layer: VideoLayer;
  input: Input;
  frames: AsyncGenerator<{ canvas: HTMLCanvasElement | OffscreenCanvas } | null, void, unknown>;
  current: CanvasImageSource | null;
}

/**
 * Render one page as an MP4: the whole collage (background, photos, text) composited
 * every frame at 30 fps, with the clips sampled by presentation timestamp
 * (tSource = in + (t − start)) so variable-frame-rate phone clips stay in sync.
 */
export async function renderVideoPage(opts: VideoPageOptions): Promise<Blob> {
  const { project, plan, signal } = opts;
  const { pageWidth: W, pageHeight: H } = project.canvas;
  const total = frameCount(plan.durationMs);

  const canvas = new OffscreenCanvas(W, H);
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('2D canvas is not available');

  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
  const videoSource = new CanvasSource(canvas, { codec: opts.videoCodec, quality: QUALITY_HIGH, keyFrameInterval: 1 });
  output.addVideoTrack(videoSource, { frameRate: EXPORT_FPS });

  let audioSource: AudioBufferSource | null = null;
  let audioBuffer: AudioBuffer | null = null;
  if (plan.audioLayer && opts.audioCodec) {
    audioBuffer = await renderPageAudio(plan, opts.blobs);
    if (audioBuffer) {
      audioSource = new AudioBufferSource({ codec: opts.audioCodec, quality: QUALITY_HIGH });
      output.addAudioTrack(audioSource);
    }
  }

  const readers: LayerReader[] = [];
  try {
    for (const layer of plan.videoLayers) readers.push(await openReader(project, layer, total, opts.blobs));
    await output.start();

    const sources: FrameSources = {
      image: opts.images,
      video: (layer) => readers.find((r) => r.layer.id === layer.id)?.current ?? null,
    };

    for (let k = 0; k < total; k++) {
      if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
      for (const r of readers) {
        const next = await r.frames.next();
        if (!next.done && next.value) r.current = next.value.canvas;
      }
      drawPage(ctx, project, plan.index, frameTimeMs(k), sources);
      await videoSource.add(k / EXPORT_FPS, 1 / EXPORT_FPS);
      opts.onProgress?.((k + 1) / total);
    }
    videoSource.close();
    if (audioSource && audioBuffer) {
      await audioSource.add(audioBuffer);
      audioSource.close();
    }
    await output.finalize();
  } catch (e) {
    if (output.state === 'started') await output.cancel().catch(() => undefined);
    throw e;
  } finally {
    for (const r of readers) {
      await r.frames.return(undefined).catch(() => undefined);
      r.input.dispose();
    }
  }
  const buffer = (output.target as BufferTarget).buffer;
  if (!buffer) throw new Error('Encoder produced no data');
  return new Blob([buffer], { type: 'video/mp4' });
}

async function openReader(project: Project, layer: VideoLayer, total: number, blobs: (id: string) => Blob | undefined): Promise<LayerReader> {
  const blob = blobs(layer.assetId);
  if (!blob) throw new Error(`Missing original for "${layer.name ?? layer.assetId}"`);
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error(`"${layer.name ?? layer.assetId}" has no video track`);
  // Decode at the size it is drawn (never above native), to keep memory down.
  const asset = project.assets.find((a) => a.id === layer.assetId);
  const r = fitMedia(asset?.width ?? track.displayWidth, asset?.height ?? track.displayHeight, layer.width, layer.height, layer.fit, layer.crop);
  const width = Math.max(2, Math.min(track.displayWidth, Math.ceil(r.width)));
  const sink = new CanvasSink(track, { width, poolSize: 2 });
  const timestamps = function* () {
    for (let k = 0; k < total; k++) {
      const s = sourceTimeMs(layer.clip, frameTimeMs(k));
      // Before the clip starts nothing is drawn; still advance with the first frame of the trim.
      yield (s ?? layer.clip.inMs) / 1000;
    }
  };
  return { layer, input, frames: sink.canvasesAtTimestamps(timestamps()), current: null };
}

/**
 * Build the page's audio as one buffer covering the page duration: the chosen clip's
 * trim [in, out) placed at startMs, scaled by its gain, silence elsewhere.
 * No multitrack mixing in v1 (guide §9).
 */
export async function renderPageAudio(plan: PagePlan, blobs: (id: string) => Blob | undefined): Promise<AudioBuffer | null> {
  const layer = plan.audioLayer;
  if (!layer) return null;
  const blob = blobs(layer.assetId);
  if (!blob) return null;
  const length = Math.max(1, Math.round((plan.durationMs / 1000) * AUDIO_SAMPLE_RATE));
  const ctx = new OfflineAudioContext(2, length, AUDIO_SAMPLE_RATE);
  const gain = ctx.createGain();
  gain.gain.value = layer.clip.gain;
  gain.connect(ctx.destination);

  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track || !(await track.canDecode())) return null;
    const sink = new AudioBufferSink(track);
    const inS = layer.clip.inMs / 1000;
    const outS = layer.clip.outMs / 1000;
    const startS = layer.clip.startMs / 1000;
    const endS = Math.min(clipEndMs(layer.clip), plan.durationMs) / 1000;
    for await (const { buffer, timestamp } of sink.buffers(inS, outS)) {
      const node = ctx.createBufferSource();
      node.buffer = buffer;
      node.connect(gain);
      const skip = Math.max(0, inS - timestamp); // part of the buffer before the in-point
      const when = startS + Math.max(0, timestamp - inS);
      const remaining = Math.min(buffer.duration - skip, endS - when, outS - Math.max(timestamp, inS));
      if (remaining <= 0) continue;
      node.start(when, skip, remaining);
    }
  } finally {
    input.dispose();
  }
  return ctx.startRendering();
}
