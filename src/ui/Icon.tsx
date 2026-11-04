/** Hand-drawn 24px stroke icons. currentColor, 1.6 stroke, round joins. */
const PATHS: Record<string, string> = {
  plus: 'M12 5v14M5 12h14',
  media: 'M4 6.5h16v11H4zM4 15l4.5-4 3.5 3 3-2.5L20 15M9 9.6h.01',
  clip: 'M4 6.5h12v11H4zM16 10.5l4-2.5v8l-4-2.5',
  text: 'M6 6h12M12 6v13M9 19h6',
  shape: 'M5 5h9v9H5zM14 10a5 5 0 1 1-4 4',
  copy: 'M8 8h11v11H8zM5 15V5h10',
  crop: 'M7 3v14h14M3 7h14v14',
  trash: 'M5 7h14M10 7V4.5h4V7M7 7l1 12.5h8L17 7',
  undo: 'M9 7 4.5 11.5 9 16M5 11.5h9a5 5 0 0 1 0 10h-2',
  redo: 'M15 7l4.5 4.5L15 16M19 11.5h-9a5 5 0 0 0 0 10h2',
  back: 'M14.5 6 8.5 12l6 6',
  next: 'M9.5 6l6 6-6 6',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 14.6a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2',
  eyeOff: 'M3 3l18 18M10.6 5.6A9.5 9.5 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3 3.6M6.6 6.6C4 8.3 2.5 12 2.5 12S6 18.5 12 18.5c1.6 0 3-.4 4.2-1',
  lock: 'M6.5 11h11v8.5h-11zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  unlock: 'M6.5 11h11v8.5h-11zM8.5 11V8a3.5 3.5 0 0 1 6.8-1.2',
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  play: 'M8 5.5v13l10.5-6.5z',
  pause: 'M8 5.5v13M16 5.5v13',
  sound: 'M4 9.5h3.5L12 6v12l-4.5-3.5H4zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11',
  mute: 'M4 9.5h3.5L12 6v12l-4.5-3.5H4zM16 9.5l5 5M21 9.5l-5 5',
  export: 'M12 4v11M7.5 8.5 12 4l4.5 4.5M5 14v5.5h14V14',
  share: 'M12 4v11M7.5 8.5 12 4l4.5 4.5M7 11H5v8.5h14V11h-2',
  close: 'M6 6l12 12M18 6 6 18',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  pano: 'M3 8c3-1.5 15-1.5 18 0v8c-3-1.5-15-1.5-18 0zM9 7v10M15 7v10',
  layers: 'M12 4 3 9l9 5 9-5zM3 14l9 5 9-5',
  pages: 'M4 5h5v14H4zM10 5h5v14h-5zM16 5h4v14h-4',
  sliders: 'M5 7h9M18 7h1M5 17h3M12 17h7M16 5v4M10 15v4',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  swipe: 'M8 12h10M14.5 8.5 18 12l-3.5 3.5M5 7v10',
  zoomIn: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.5 15.5 20 20M10.5 8v5M8 10.5h5',
  zoomOut: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.5 15.5 20 20M8 10.5h5',
  fill: 'M4 4h16v16H4zM4 15l5-5 4 4 3-2 4 3',
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, title }: { name: IconName; size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      <path d={PATHS[name]} />
    </svg>
  );
}
