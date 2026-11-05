/**
 * Self-hosted fonts (SIL Open Font License), bundled so the app works offline and
 * never calls a font CDN. Each @fontsource file is split by unicode-range, so a face
 * only downloads once something uses it. Canvas text only uses a web font once it
 * is loaded, so callers await `ensureFonts()` before rendering or exporting text.
 */
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import '@fontsource-variable/schibsted-grotesk/wght.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/caveat/500.css';
// Editorial
import '@fontsource/fraunces/400.css';
import '@fontsource/fraunces/400-italic.css';
import '@fontsource/fraunces/800.css';
import '@fontsource/bodoni-moda/400.css';
import '@fontsource/bodoni-moda/400-italic.css';
import '@fontsource/bodoni-moda/800.css';
import '@fontsource/gloock/400.css';
import '@fontsource/young-serif/400.css';
import '@fontsource/italiana/400.css';
// Display
import '@fontsource/bricolage-grotesque/400.css';
import '@fontsource/bricolage-grotesque/800.css';
import '@fontsource/syne/400.css';
import '@fontsource/syne/800.css';
import '@fontsource/unbounded/400.css';
import '@fontsource/unbounded/800.css';
import '@fontsource/climate-crisis/400.css';
import '@fontsource/rubik-mono-one/400.css';
// Handwritten
import '@fontsource/permanent-marker/400.css';
import '@fontsource/reenie-beanie/400.css';
import '@fontsource/homemade-apple/400.css';
// Typewriter & retro
import '@fontsource/special-elite/400.css';
import '@fontsource/space-mono/400.css';
import '@fontsource/space-mono/700.css';
import '@fontsource/major-mono-display/400.css';
import '@fontsource/monoton/400.css';

export const FONT_UI = '"Schibsted Grotesk Variable", system-ui, sans-serif';
export const FONT_DISPLAY = '"Instrument Serif", Georgia, serif';
export const FONT_MONO = '"JetBrains Mono", ui-monospace, monospace';
export const FONT_HAND = 'Caveat, "Segoe Print", cursive';

export type FontGroup = 'editorial' | 'display' | 'hand' | 'retro';

export const FONT_GROUP_LABEL: Record<FontGroup, string> = {
  editorial: 'Editorial',
  display: 'Display',
  hand: 'Handwritten',
  retro: 'Typewriter & retro',
};

export interface FontDef {
  label: string;
  /** CSS font-family value used by text layers. */
  value: string;
  /** Family name as registered (for document.fonts.load). */
  family: string;
  group: FontGroup;
  /** Weights bundled; the picker snaps the layer's weight to the nearest. */
  weights: number[];
  italic?: boolean;
}

const f = (family: string, fallback: string, group: FontGroup, weights: number[], italic = false, label = family): FontDef => ({
  label,
  family,
  value: `"${family}", ${fallback}`,
  group,
  weights,
  italic,
});

/** All fonts offered for text layers (all bundled). */
export const FONTS: FontDef[] = [
  f('Instrument Serif', 'Georgia, serif', 'editorial', [400], true),
  f('Fraunces', 'Georgia, serif', 'editorial', [400, 800], true),
  f('Bodoni Moda', 'Didot, serif', 'editorial', [400, 800], true),
  f('Gloock', 'Georgia, serif', 'editorial', [400]),
  f('Young Serif', 'Georgia, serif', 'editorial', [400]),
  f('Italiana', 'Didot, serif', 'editorial', [400]),
  f('Schibsted Grotesk Variable', 'system-ui, sans-serif', 'display', [400, 700, 800], false, 'Schibsted Grotesk'),
  f('Bricolage Grotesque', 'system-ui, sans-serif', 'display', [400, 800]),
  f('Syne', 'system-ui, sans-serif', 'display', [400, 800]),
  f('Unbounded', 'system-ui, sans-serif', 'display', [400, 800]),
  f('Climate Crisis', 'Impact, sans-serif', 'display', [400]),
  f('Rubik Mono One', 'Impact, sans-serif', 'display', [400]),
  f('Caveat', '"Segoe Print", cursive', 'hand', [500]),
  f('Permanent Marker', '"Segoe Print", cursive', 'hand', [400]),
  f('Reenie Beanie', '"Segoe Print", cursive', 'hand', [400]),
  f('Homemade Apple', '"Segoe Script", cursive', 'hand', [400]),
  f('Special Elite', '"Courier New", monospace', 'retro', [400]),
  f('Space Mono', 'ui-monospace, monospace', 'retro', [400, 700]),
  f('JetBrains Mono', 'ui-monospace, monospace', 'retro', [400, 500]),
  f('Major Mono Display', 'ui-monospace, monospace', 'retro', [400]),
  f('Monoton', 'Impact, sans-serif', 'retro', [400]),
];

/** Kept for older callers: a flat list of { label, value }. */
export const TEXT_FONTS = FONTS.map((x) => ({ label: x.label, value: x.value }));

export function fontByValue(value: string): FontDef | undefined {
  const fam = familyOf(value);
  return FONTS.find((x) => x.family === fam);
}

/** First family name of a CSS font-family list, without quotes. */
export function familyOf(value: string): string {
  return value.split(',')[0].trim().replace(/^["']|["']$/g, '');
}

/** Closest bundled weight for a font. */
export function snapWeight(value: string, weight: number): number {
  const d = fontByValue(value);
  if (!d) return weight;
  return d.weights.reduce((best, w) => (Math.abs(w - weight) < Math.abs(best - weight) ? w : best), d.weights[0]);
}

const loaded = new Map<string, Promise<void>>();

function loadFace(family: string, weight: number, italic: boolean): Promise<void> {
  const key = `${family}|${weight}|${italic}`;
  let p = loaded.get(key);
  if (!p) {
    p = typeof document !== 'undefined' && document.fonts ? document.fonts.load(`${italic ? 'italic ' : ''}${weight} 48px "${family}"`, 'AaBb0123').then(() => undefined).catch(() => undefined) : Promise.resolve();
    loaded.set(key, p);
  }
  return p;
}

/** The UI faces plus the faces the built-in templates use. */
export function fontsReady(): Promise<void> {
  return Promise.all([
    loadFace('Instrument Serif', 400, false),
    loadFace('Schibsted Grotesk Variable', 400, false),
    loadFace('Schibsted Grotesk Variable', 700, false),
    loadFace('JetBrains Mono', 400, false),
    loadFace('Caveat', 500, false),
  ]).then(() => undefined);
}

interface TextLike {
  type: string;
  fontFamily?: string;
  fontWeight?: number;
  italic?: boolean;
  ransom?: { fonts: string[] };
}

/** Load exactly the faces a set of layers uses (before drawing or exporting). */
export function ensureFonts(layers: readonly TextLike[]): Promise<void> {
  const jobs: Promise<void>[] = [fontsReady()];
  if (layers.some((l) => l.type === 'sticker')) {
    // Labels on the ticket, date stamp and swipe tag.
    jobs.push(loadFace('Space Mono', 700, false), loadFace('Rubik Mono One', 400, false), loadFace('Special Elite', 400, false));
  }
  for (const l of layers) {
    if (l.type !== 'text' || !l.fontFamily) continue;
    const fams = l.ransom?.fonts.length ? l.ransom.fonts : [l.fontFamily];
    for (const v of fams) jobs.push(loadFace(familyOf(v), snapWeight(v, l.fontWeight ?? 400), !!l.italic));
  }
  return Promise.all(jobs).then(() => undefined);
}
