import { loadFont } from '@remotion/fonts';
import { staticFile } from 'remotion';

export const C = {
  bg: '#0E0E0F',
  surface: '#161618',
  surface3: '#2A2A2E',
  line: 'rgba(255,255,255,0.10)',
  ink: '#EDEBE6',
  muted: '#8C8981',
  red: '#FF3B2F',
  ok: '#7FD1A1',
  video: '#8FB3FF',
};

export const SERIF = '"Instrument Serif", Georgia, serif';
export const UI = '"Schibsted Grotesk", system-ui, sans-serif';
export const MONO = '"JetBrains Mono", ui-monospace, monospace';

// Same bundled OFL fonts as the app.
loadFont({ family: 'Instrument Serif', url: staticFile('fonts/instrument-serif-latin-400-normal.woff2'), weight: '400', style: 'normal' });
loadFont({ family: 'Instrument Serif', url: staticFile('fonts/instrument-serif-latin-400-italic.woff2'), weight: '400', style: 'italic' });
loadFont({ family: 'Schibsted Grotesk', url: staticFile('fonts/schibsted-grotesk-latin-wght-normal.woff2'), weight: '400 800' });
loadFont({ family: 'JetBrains Mono', url: staticFile('fonts/jetbrains-mono-latin-400-normal.woff2'), weight: '400' });
