import { motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Seg } from '../ui/controls';
import { Icon } from '../ui/Icon';
import { spring } from '../ui/motion';
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
  // iOS refuses to start sound outside a tap: then clips play muted until the sound button is pressed.
  const [soundBlocked, setSoundBlocked] = useState(false);
  const blocked = useRef(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const dir = useRef(1);
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
      // iOS: inline + muted to be allowed to play without a tap; sound is unlocked by the sound button.
      v.muted = true;
      v.playsInline = true;
      v.setAttribute('playsinline', '');
      v.preload = 'auto';
      v.src = URL.createObjectURL(blob);
      v.load();
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
        v.muted = muted || blocked.current || audioPlan.audioLayer?.id !== l.id;
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
        if (v.paused)
          void v.play().catch(() => {
            if (v.muted) return;
            blocked.current = true;
            setSoundBlocked(true);
            v.muted = true;
            void v.play().catch(() => undefined);
          });
      }
    };
    const sources: FrameSources = {
      image: (id) => library.imageBitmap(id),
      video: (layer: VideoLayer, sourceMs: number) => {
        const v = videos.get(layer.id);
        // Not ready yet (iOS loads nothing until it plays): show the decoded frame meanwhile.
        return v && v.readyState >= 2 ? v : library.decodedFrame(layer.assetId, sourceMs);
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
      else if (e.key === 'ArrowRight') {
        dir.current = 1;
        setPage((p) => Math.min(plans.length - 1, p + 1));
      } else if (e.key === 'ArrowLeft') {
        dir.current = -1;
        setPage((p) => Math.max(0, p - 1));
      }
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
  const go = (d: 1 | -1) => {
    dir.current = d;
    setPage((p) => Math.min(maxPage, Math.max(0, p + d)));
  };

  return (
    <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div
        className="sheet preview"
        role="dialog"
        aria-modal="true"
        aria-label="Preview"
        initial={{ y: 40, opacity: 0, scale: 0.98 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 20, opacity: 0, scale: 0.98 }}
        transition={spring}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sheet__head">
          <Seg<'swipe' | 'seam'>
            label="Preview mode"
            value={mode}
            onChange={setMode}
            disabled={(v) => v === 'seam' && plans.length < 2}
            options={[
              { value: 'swipe', label: 'Swipe' },
              { value: 'seam', label: 'Seams at 100%' },
            ]}
          />
          <button className="btn btn--icon btn--ghost" onClick={onClose} aria-label="Close preview">
            <Icon name="close" />
          </button>
        </header>
        <div
          className={`preview__stage preview__stage--${mode}`}
          onPointerDown={(e) => (swipeStart.current = e.clientX)}
          onPointerUp={(e) => {
            if (swipeStart.current === null) return;
            const dx = e.clientX - swipeStart.current;
            swipeStart.current = null;
            if (dx < -40) go(1);
            if (dx > 40) go(-1);
          }}
        >
          {mode === 'swipe' ? (
            <div className="phone preview__phone">
              <div className="phone__screen">
                <div className="phone__bar">
                  <span className="phone__avatar" />
                  <span>your.handle</span>
                </div>
                <div className="phone__post">
                  <motion.div key={page} initial={{ x: dir.current * 80, opacity: 0.4 }} animate={{ x: 0, opacity: 1 }} transition={spring}>
                    <canvas ref={canvas} className="preview__canvas" data-testid="preview-canvas" />
                  </motion.div>
                </div>
                <div className="dots" aria-hidden>
                  {plans.map((_, k) => (
                    <span key={k} className={k === page ? 'is-on' : ''} />
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <canvas ref={canvas} className="preview__canvas" data-testid="preview-canvas" />
          )}
        </div>
        <footer className="preview__bar">
          <button className="btn btn--icon" onClick={() => go(-1)} disabled={page === 0} aria-label="Previous slide">
            <Icon name="back" />
          </button>
          <span className="mono">{mode === 'swipe' ? `${String(page + 1).padStart(2, '0')} / ${String(plans.length).padStart(2, '0')}` : `Seam ${seamIndex + 1} | ${seamIndex + 2}`}</span>
          <button className="btn btn--icon" onClick={() => go(1)} disabled={page >= maxPage} aria-label="Next slide">
            <Icon name="next" />
          </button>
          <span className={`badge badge--${plan.kind}`}>{plan.kind === 'video' ? 'Video' : 'Photo'}</span>
          {duration > 0 && (
            <>
              <button className="btn btn--icon" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause' : 'Play'}>
                <Icon name={playing ? 'pause' : 'play'} />
              </button>
              <button
                className="btn btn--icon"
                onClick={() => {
                  if (soundBlocked) {
                    // A tap is allowed to start sound: unmute the audible clip right here.
                    blocked.current = false;
                    setSoundBlocked(false);
                    setMuted(false);
                    const v = audioPlan.audioLayer ? videos.get(audioPlan.audioLayer.id) : undefined;
                    if (v) {
                      v.muted = false;
                      void v.play().catch(() => undefined);
                    }
                    return;
                  }
                  setMuted((m) => !m);
                }}
                aria-pressed={muted || soundBlocked}
                aria-label={muted || soundBlocked ? 'Unmute' : 'Mute'}
              >
                <Icon name={muted || soundBlocked ? 'mute' : 'sound'} />
              </button>
              <span className="mono">
                {(clock / 1000).toFixed(1)} / {(duration / 1000).toFixed(1)} s
              </span>
            </>
          )}
        </footer>
        {mode === 'seam' && <p className="hint" style={{ marginTop: 10 }}>Two neighbouring slides at full resolution, at the same instant. Lines should carry on without a jump.</p>}
      </motion.div>
    </motion.div>
  );
}
