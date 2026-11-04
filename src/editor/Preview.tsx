import { useEffect, useMemo, useRef, useState } from 'react';
import { planPages } from '../model/plan';
import { clipEndMs, holdTimeMs, sourceTimeMs } from '../model/timing';
import type { VideoLayer } from '../model/types';
import { drawRegion, type FrameSources } from '../render/drawWindow';
import { library } from '../media/library';
import { useEditor } from './store';

/**
 * Carousel preview. "Swipe" shows one page at a time like the feed; each page has
 * its own clock that restarts when you land on it (as in Instagram). "Seams" shows
 * two neighbouring pages at 100 % around their shared edge, at the same instant.
 */
export function Preview({ onClose, startPage = 0 }: { onClose(): void; startPage?: number }) {
  const project = useEditor((s) => s.project)!;
  const plans = useMemo(() => planPages(project), [project]);
  const [page, setPage] = useState(Math.min(startPage, plans.length - 1));
  const [mode, setMode] = useState<'swipe' | 'seam'>('swipe');
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const t0 = useRef(performance.now());
  const [clock, setClock] = useState(0);
  const { pageWidth: W, pageHeight: H } = project.canvas;
  const seamIndex = Math.min(page, plans.length - 2);
  const plan = mode === 'seam' && seamIndex >= 0 ? (plans[seamIndex].durationMs >= plans[seamIndex + 1].durationMs ? plans[seamIndex] : plans[seamIndex + 1]) : plans[page];
  const audioPlan = mode === 'seam' && seamIndex >= 0 ? plans[seamIndex] : plans[page];
  const duration = plan.durationMs;

  // One <video> per layer, so two layers of the same file play independently.
  const videos = useMemo(() => {
    const m = new Map<string, HTMLVideoElement>();
    for (const l of project.layers) {
      if (l.type !== 'video') continue;
      const blob = library.blob(l.assetId);
      if (!blob) continue;
      const v = document.createElement('video');
      v.src = URL.createObjectURL(blob);
      v.playsInline = true;
      v.preload = 'auto';
      m.set(l.id, v);
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.layers.map((l) => (l.type === 'video' ? `${l.id}:${l.assetId}` : '')).join()]);

  useEffect(
    () => () => {
      for (const v of videos.values()) {
        v.pause();
        URL.revokeObjectURL(v.src);
        v.removeAttribute('src');
      }
    },
    [videos],
  );

  // Landing on a page restarts its clock.
  useEffect(() => {
    t0.current = performance.now();
    setClock(0);
  }, [page, mode]);

  useEffect(() => {
    let raf = 0;
    let pausedAt = clock;
    const loop = () => {
      let t = pausedAt;
      if (playing && duration > 0) {
        t = performance.now() - t0.current;
        if (t >= duration + 600) {
          t0.current = performance.now();
          t = 0;
        }
        t = Math.min(t, duration);
      } else {
        t0.current = performance.now() - pausedAt;
      }
      pausedAt = t;
      syncVideos(t);
      paint(t);
      raf = requestAnimationFrame(loop);
    };
    const syncVideos = (t: number) => {
      for (const l of project.layers) {
        if (l.type !== 'video') continue;
        const v = videos.get(l.id);
        if (!v) continue;
        const onPage = plan.videoLayers.includes(l) || (mode === 'seam' && seamIndex >= 0 && plans[seamIndex + 1].videoLayers.includes(l)) || audioPlan.audioLayer?.id === l.id;
        v.muted = muted || audioPlan.audioLayer?.id !== l.id;
        v.volume = Math.min(1, l.clip.gain);
        const s = sourceTimeMs(l.clip, t);
        const active = playing && onPage && s !== null && t < clipEndMs(l.clip);
        if (!active) {
          if (!v.paused) v.pause();
          const park = s ?? l.clip.inMs;
          const target = (t >= clipEndMs(l.clip) ? holdTimeMs(l.clip) : park) / 1000;
          if (!v.seeking && Math.abs(v.currentTime - target) > 0.05) v.currentTime = target;
          continue;
        }
        if (Math.abs(v.currentTime * 1000 - s!) > 250 && !v.seeking) v.currentTime = s! / 1000;
        if (v.paused) void v.play().catch(() => undefined);
      }
    };
    const sources: FrameSources = {
      image: (id) => library.imageBitmap(id),
      video: (layer: VideoLayer) => {
        const v = videos.get(layer.id);
        return v && v.readyState >= 2 ? v : null;
      },
    };
    const paint = (t: number) => {
      const cv = canvas.current;
      if (!cv) return;
      const ctx = cv.getContext('2d')!;
      if (mode === 'swipe') {
        if (cv.width !== W || cv.height !== H) {
          cv.width = W;
          cv.height = H;
        }
        drawRegion(ctx, project, { x: page * W, y: 0, width: W, height: H }, t, sources);
      } else {
        const half = Math.min(360, Math.round(W / 2));
        if (cv.width !== half * 2 || cv.height !== H) {
          cv.width = half * 2;
          cv.height = H;
        }
        drawRegion(ctx, project, { x: (seamIndex + 1) * W - half, y: 0, width: half * 2, height: H }, t, sources);
        // Small markers at the top and bottom edge show where the seam is, without covering it.
        ctx.fillStyle = '#e8573a';
        for (const y of [0, H]) {
          ctx.beginPath();
          ctx.moveTo(half - 10, y);
          ctx.lineTo(half + 10, y);
          ctx.lineTo(half, y === 0 ? 14 : H - 14);
          ctx.fill();
        }
      }
      setClock((c) => (Math.abs(c - t) > 90 ? t : c));
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, page, mode, playing, muted, videos, duration]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') setPage((p) => Math.min(plans.length - 1, p + 1));
      else if (e.key === 'ArrowLeft') setPage((p) => Math.max(0, p - 1));
      else if (e.key === ' ') {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, plans.length]);

  const swipeStart = useRef<number | null>(null);
  const maxPage = mode === 'seam' ? Math.max(0, plans.length - 2) : plans.length - 1;

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Preview">
      <div className="modal__panel preview">
        <header className="modal__head">
          <div className="seg" role="group" aria-label="Preview mode">
            <button className={mode === 'swipe' ? 'is-active' : ''} onClick={() => setMode('swipe')}>
              Swipe
            </button>
            <button className={mode === 'seam' ? 'is-active' : ''} disabled={plans.length < 2} onClick={() => setMode('seam')}>
              Seams at 100 %
            </button>
          </div>
          <button className="btn btn--ghost" onClick={onClose} aria-label="Close preview">
            Close
          </button>
        </header>
        <div
          className={`preview__stage preview__stage--${mode}`}
          onPointerDown={(e) => (swipeStart.current = e.clientX)}
          onPointerUp={(e) => {
            if (swipeStart.current === null) return;
            const dx = e.clientX - swipeStart.current;
            swipeStart.current = null;
            if (dx < -40) setPage((p) => Math.min(maxPage, p + 1));
            if (dx > 40) setPage((p) => Math.max(0, p - 1));
          }}
        >
          <canvas ref={canvas} className="preview__canvas" data-testid="preview-canvas" />
        </div>
        <footer className="preview__bar">
          <button className="btn" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} aria-label="Previous page">
            ‹
          </button>
          <span className="preview__count">{mode === 'swipe' ? `${page + 1} of ${plans.length}` : `Seam ${seamIndex + 1} | ${seamIndex + 2}`}</span>
          <button className="btn" onClick={() => setPage((p) => Math.min(maxPage, p + 1))} disabled={page >= maxPage} aria-label="Next page">
            ›
          </button>
          <span className={`badge badge--${plan.kind}`}>{plan.kind === 'video' ? 'Video' : 'Photo'}</span>
          {duration > 0 && (
            <>
              <button className="btn" onClick={() => setPlaying((p) => !p)}>
                {playing ? 'Pause' : 'Play'}
              </button>
              <button className="btn" onClick={() => setMuted((m) => !m)} aria-pressed={muted}>
                {muted ? 'Unmute' : 'Mute'}
              </button>
              <span className="preview__time">
                {(clock / 1000).toFixed(1)} / {(duration / 1000).toFixed(1)} s
              </span>
            </>
          )}
        </footer>
        {mode === 'seam' && <p className="hint">The two pages around a seam, side by side at full resolution and at the same instant. Lines should continue without a jump.</p>}
      </div>
    </div>
  );
}
