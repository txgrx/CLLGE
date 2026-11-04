/**
 * Project document, schema v1.
 *
 * Units: design pixels, milliseconds, degrees (clockwise, around the layer centre).
 * The canvas spans [0, pages.length * pageWidth) × [0, pageHeight). Page i owns the
 * half-open column range [i * pageWidth, (i + 1) * pageWidth). Layers keep global
 * coordinates; a page is only a window onto the shared world.
 */

export const SCHEMA_VERSION = 1;
export const MAX_PAGES = 20;

export type Fit = 'cover' | 'contain';

export interface CanvasSpec {
  pageWidth: number;
  pageHeight: number;
  background: string;
}

export interface Page {
  id: string;
  /**
   * Audio policy for this page.
   * - undefined: automatic (first audible clip on the page, by `audioOrder`)
   * - null: silent
   * - layer id: that video layer's audio, even if it is not visible on this page
   */
  audioLayerId?: string | null;
}

export interface ImageAsset {
  id: string;
  type: 'image';
  name: string;
  mime: string;
  /** Oriented (EXIF-applied) dimensions. */
  width: number;
  height: number;
}

export interface VideoAsset {
  id: string;
  type: 'video';
  name: string;
  mime: string;
  /** Display dimensions (rotation applied). */
  width: number;
  height: number;
  durationMs: number;
  hasAudio: boolean;
}

export type Asset = ImageAsset | VideoAsset;

export interface Clip {
  /** Trim in the source, [inMs, outMs). */
  inMs: number;
  outMs: number;
  /** When the clip appears on the page-local clock. */
  startMs: number;
  /** Linear gain, 0 mutes. */
  gain: number;
  /** v1 supports holding the last frame before outMs. */
  endMode: 'hold';
}

interface LayerBase {
  id: string;
  name?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
}

/** Position of the content inside its frame: 0..1 focus point (0.5 = centred). */
export interface Crop {
  focusX: number;
  focusY: number;
  /** Extra zoom on top of the fit, >= 1. */
  zoom: number;
}

/**
 * A template slot: the layer still shows sample art and is waiting for the user's
 * photo or clip. Filling it keeps the frame and clears the flag.
 */
export type SlotKind = 'image' | 'video';

export interface ImageLayer extends LayerBase {
  type: 'image';
  assetId: string;
  fit: Fit;
  crop: Crop;
  radius: number;
  slot?: SlotKind;
}

export interface VideoLayer extends LayerBase {
  type: 'video';
  assetId: string;
  fit: Fit;
  crop: Crop;
  radius: number;
  clip: Clip;
  /** Insertion order among video layers; decides the default audio track. */
  audioOrder: number;
  slot?: SlotKind;
}

export interface TextLayer extends LayerBase {
  type: 'text';
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  align: 'left' | 'center' | 'right';
  lineHeight: number;
}

export interface ShapeLayer extends LayerBase {
  type: 'shape';
  fill: string;
  radius: number;
}

export type Layer = ImageLayer | VideoLayer | TextLayer | ShapeLayer;
export type MediaLayer = ImageLayer | VideoLayer;

export interface Project {
  schemaVersion: typeof SCHEMA_VERSION;
  id: string;
  revision: number;
  title: string;
  createdAt: number;
  updatedAt: number;
  canvas: CanvasSpec;
  pages: Page[];
  assets: Asset[];
  /** Back to front. */
  layers: Layer[];
}

export interface FormatPreset {
  key: string;
  label: string;
  width: number;
  height: number;
  note?: string;
}

export const FORMAT_PRESETS: FormatPreset[] = [
  { key: 'portrait', label: 'Portrait 4:5', width: 1080, height: 1350, note: 'Best for Instagram carousels' },
  { key: 'square', label: 'Square 1:1', width: 1080, height: 1080 },
  { key: 'tall', label: 'Tall 3:4', width: 1080, height: 1440, note: 'Check how your channel crops it' },
  { key: 'story', label: 'Story 9:16', width: 1080, height: 1920 },
  { key: 'landscape', label: 'Landscape 1.91:1', width: 1080, height: 566 },
];
