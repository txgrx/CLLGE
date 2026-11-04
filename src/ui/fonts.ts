/**
 * Self-hosted fonts (SIL Open Font License), bundled so the app works offline and
 * never calls a font CDN. Canvas text only uses a web font once it is loaded, so
 * `fontsReady()` must resolve before rendering or exporting text.
 */
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import '@fontsource-variable/schibsted-grotesk/wght.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/caveat/500.css';

export const FONT_UI = '"Schibsted Grotesk Variable", system-ui, sans-serif';
export const FONT_DISPLAY = '"Instrument Serif", Georgia, serif';
export const FONT_MONO = '"JetBrains Mono", ui-monospace, monospace';
export const FONT_HAND = 'Caveat, "Segoe Print", cursive';

/** Fonts offered for text layers (all bundled). */
export const TEXT_FONTS = [
  { label: 'Serif', value: FONT_DISPLAY },
  { label: 'Grotesk', value: FONT_UI },
  { label: 'Mono', value: FONT_MONO },
  { label: 'Hand', value: FONT_HAND },
];

let ready: Promise<void> | null = null;

export function fontsReady(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return Promise.resolve();
  ready ??= Promise.all([
    document.fonts.load('400 64px "Instrument Serif"'),
    document.fonts.load('400 64px "Schibsted Grotesk Variable"'),
    document.fonts.load('700 64px "Schibsted Grotesk Variable"'),
    document.fonts.load('400 32px "JetBrains Mono"'),
    document.fonts.load('500 32px Caveat'),
  ])
    .then(() => undefined)
    .catch(() => undefined);
  return ready;
}
