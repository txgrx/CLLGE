import type { Clip } from './types';

export function clipLengthMs(clip: Clip): number {
  return Math.max(0, clip.outMs - clip.inMs);
}

/** Page-local time at which the clip stops advancing. */
export function clipEndMs(clip: Clip): number {
  return clip.startMs + clipLengthMs(clip);
}

/**
 * Source timestamp to show at page-local time t.
 * - before startMs: null (the clip is not shown; the background shows through)
 * - inside [startMs, end): inMs + (t − startMs)
 * - after the end (endMode "hold"): the last frame *before* outMs
 */
export function sourceTimeMs(clip: Clip, t: number): number | null {
  if (clipLengthMs(clip) <= 0) return null;
  if (t < clip.startMs) return null;
  const end = clipEndMs(clip);
  if (t >= end) return holdTimeMs(clip);
  return clip.inMs + (t - clip.startMs);
}

/** A timestamp strictly before outMs, so a "frame at or before" lookup picks the last frame of the trim. */
export function holdTimeMs(clip: Clip): number {
  return Math.max(clip.inMs, clip.outMs - 0.5);
}

/** Whether the clip's audio is audible at page-local time t. */
export function audioActiveAt(clip: Clip, t: number): boolean {
  return clip.gain > 0 && t >= clip.startMs && t < clipEndMs(clip);
}

export const EXPORT_FPS = 30;

/** Number of output frames for a page of the given duration. */
export function frameCount(durationMs: number, fps = EXPORT_FPS): number {
  return Math.max(1, Math.round((durationMs * fps) / 1000));
}

export function frameTimeMs(index: number, fps = EXPORT_FPS): number {
  return (index * 1000) / fps;
}
