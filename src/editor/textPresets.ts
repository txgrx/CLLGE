import type { TextLayer } from '../model/types';

const fam = (name: string, fallback = 'serif') => `"${name}", ${fallback}`;

export interface TextPreset {
  id: string;
  label: string;
  /** Sample shown on the preset chip. */
  sample: string;
  /** Changes applied to the text layer (effects not listed are cleared). */
  style: Partial<TextLayer>;
}

/** Fonts the ransom-note preset mixes, one per letter. */
export const RANSOM_FONTS = [
  fam('Bodoni Moda'),
  fam('Rubik Mono One', 'sans-serif'),
  fam('Special Elite', 'monospace'),
  fam('Climate Crisis', 'sans-serif'),
  fam('Fraunces'),
  fam('Permanent Marker', 'cursive'),
  fam('Syne', 'sans-serif'),
  fam('Gloock'),
];

const CLEAR: Partial<TextLayer> = {
  stroke: undefined,
  outlineOnly: undefined,
  shadow: undefined,
  highlight: undefined,
  ransom: undefined,
  curve: 0,
  letterSpacing: 0,
  italic: false,
  uppercase: false,
};

export const TEXT_PRESETS: TextPreset[] = [
  {
    id: 'masthead',
    label: 'Masthead',
    sample: 'Issue',
    style: { fontFamily: fam('Bodoni Moda'), fontWeight: 800, letterSpacing: -0.02, lineHeight: 0.9, italic: false },
  },
  {
    id: 'marker',
    label: 'Marker note',
    sample: 'note!',
    style: { fontFamily: fam('Permanent Marker', 'cursive'), fontWeight: 400, color: '#141414', highlight: { color: '#FFD84A', style: 'marker', pad: 0.12 }, lineHeight: 1.25 },
  },
  {
    id: 'dymo',
    label: 'Dymo label',
    sample: 'LABEL',
    style: { fontFamily: fam('Space Mono', 'monospace'), fontWeight: 700, uppercase: true, letterSpacing: 0.12, color: '#F4F1EA', highlight: { color: '#E2462C', style: 'dymo', pad: 0.4 }, lineHeight: 1.7 },
  },
  {
    id: 'typewriter',
    label: 'Typewriter',
    sample: 'dear you,',
    style: { fontFamily: fam('Special Elite', 'monospace'), fontWeight: 400, color: '#EDEBE6', lineHeight: 1.35 },
  },
  {
    id: 'neon',
    label: 'Neon',
    sample: 'OPEN',
    style: { fontFamily: fam('Monoton', 'sans-serif'), fontWeight: 400, color: '#FFE1F0', shadow: { color: '#FF3B8F', blur: 28, dx: 0, dy: 0 }, stroke: { color: '#FF3B8F', width: 3 }, uppercase: true },
  },
  {
    id: 'stamp',
    label: 'Rubber stamp',
    sample: 'APPROVED',
    style: { fontFamily: fam('Rubik Mono One', 'sans-serif'), fontWeight: 400, color: '#E2462C', outlineOnly: true, stroke: { color: '#E2462C', width: 4 }, uppercase: true, letterSpacing: 0.06, rotation: -6 },
  },
  {
    id: 'outline',
    label: 'Outline',
    sample: 'Bold',
    style: { fontFamily: fam('Unbounded', 'sans-serif'), fontWeight: 800, outlineOnly: true, stroke: { color: '#EDEBE6', width: 3 }, letterSpacing: -0.01 },
  },
  {
    id: 'curved',
    label: 'Curved',
    sample: 'around',
    style: { fontFamily: fam('Fraunces'), fontWeight: 400, italic: true, curve: 0.45 },
  },
  {
    id: 'ransom',
    label: 'Ransom',
    sample: 'Ransom',
    style: { fontFamily: fam('Bodoni Moda'), fontWeight: 400, ransom: { fonts: RANSOM_FONTS, seed: 7 }, letterSpacing: 0.06, lineHeight: 1.45 },
  },
  {
    id: 'bridge',
    label: 'Across the seam',
    sample: 'keep going',
    style: { fontFamily: fam('Instrument Serif'), fontWeight: 400, italic: true, bridge: true },
  },
];

/** The style to merge into a text layer for a preset (clears effects it doesn't set). */
export function applyPreset(layer: TextLayer, preset: TextPreset): Partial<TextLayer> {
  const style: Partial<TextLayer> = { ...CLEAR, ...preset.style, preset: preset.id };
  if (preset.id === 'ransom') style.ransom = { fonts: RANSOM_FONTS, seed: Math.floor(Math.random() * 1e6) };
  if (preset.style.rotation === undefined) delete style.rotation;
  // Neon/stroke widths scale with the text size.
  if (style.stroke) style.stroke = { ...style.stroke, width: Math.max(2, Math.round(layer.fontSize * (style.stroke.width / 100))) };
  if (style.shadow) style.shadow = { ...style.shadow, blur: Math.round(layer.fontSize * (style.shadow.blur / 100)) };
  return style;
}
