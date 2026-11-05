import { AnimatePresence, motion, type PanInfo } from 'motion/react';
import { useEffect, useRef } from 'react';
import { library } from '../media/library';
import { drawPage } from '../render/drawWindow';
import { Icon } from '../ui/Icon';
import { spring } from '../ui/motion';
import { useEditor } from './store';
import { useUi } from './ui';

/**
 * A small phone that shows the slide in view exactly as it will post, redrawn a
 * moment after each edit. Swipe it (or tap a dot) to move the stage to another slide.
 */
export function LivePhone({ onPick }: { onPick(i: number): void }) {
  const project = useEditor((s) => s.project)!;
  const page = useUi((s) => s.page);
  const open = useUi((s) => s.phone);
  const set = useUi((s) => s.set);
  const cv = useRef<HTMLCanvasElement>(null);
  const N = project.pages.length;
  const i = Math.min(page, N - 1);
  const W = 168;
  const H = Math.round((W * project.canvas.pageHeight) / project.canvas.pageWidth);

  useEffect(() => {
    if (!open) return;
    let t = 0;
    const paint = () => {
      clearTimeout(t);
      t = window.setTimeout(() => {
        const c = cv.current;
        const p = useEditor.getState().project;
        if (!c || !p) return;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const scale = (W * dpr) / p.canvas.pageWidth;
        c.width = Math.round(W * dpr);
        c.height = Math.round(p.canvas.pageHeight * scale);
        drawPage(c.getContext('2d')!, p, Math.min(i, p.pages.length - 1), 0, library.sources(), { scale, showAllClips: true });
      }, 120);
    };
    paint();
    const off = library.onChange(paint);
    return () => {
      clearTimeout(t);
      off();
    };
  }, [project, i, open, W]);

  const onEnd = (_: unknown, info: PanInfo) => {
    const d = info.offset.x + info.velocity.x * 0.15;
    if (d < -30 && i < N - 1) onPick(i + 1);
    else if (d > 30 && i > 0) onPick(i - 1);
  };

  return (
    <div className="livephone" data-open={open}>
      <AnimatePresence initial={false} mode="popLayout">
        {open ? (
          <motion.div key="phone" className="livephone__body" initial={{ opacity: 0, scale: 0.85, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.85, y: 12 }} transition={spring} data-testid="live-phone">
            <div className="livephone__bar">
              <span className="phone__avatar" />
              <span>your.handle</span>
              <button className="icon icon--sm" onClick={() => set({ phone: false })} aria-label="Hide the phone preview">
                <Icon name="close" size={14} />
              </button>
            </div>
            <motion.div className="livephone__post" style={{ height: H }} drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.25} onDragEnd={onEnd}>
              <canvas ref={cv} style={{ width: W, height: H }} aria-label={`Slide ${i + 1} of ${N} as posted`} role="img" data-testid="live-phone-canvas" />
            </motion.div>
            <div className="dots" role="tablist" aria-label="Slides">
              {project.pages.map((pg, k) => (
                <button key={pg.id} role="tab" aria-selected={k === i} aria-label={`Slide ${k + 1}`} className={k === i ? 'is-on' : ''} onClick={() => onPick(k)} />
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.button key="chip" className="livephone__chip" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={spring} onClick={() => set({ phone: true })} aria-label="Show the phone preview" data-testid="live-phone-chip">
            <Icon name="phone" size={18} />
            <span className="mono">
              {String(i + 1).padStart(2, '0')}/{String(N).padStart(2, '0')}
            </span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
