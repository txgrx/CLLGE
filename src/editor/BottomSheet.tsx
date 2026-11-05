import { animate, AnimatePresence, motion, useDragControls, useMotionValue, type PanInfo } from 'motion/react';
import { useEffect, useState, type ReactNode } from 'react';
import { Icon } from '../ui/Icon';
import { blurSwap, spring } from '../ui/motion';

export type Snap = 'peek' | 'half' | 'full';

const FRACTION: Record<Snap, number> = { peek: 0.33, half: 0.56, full: 0.9 };

/**
 * Phone bottom sheet with three resting heights. Drag the grab bar (or the title
 * row); release decides the nearest height, helped by the flick velocity. Dragging
 * below the lowest height closes it.
 */
export function BottomSheet({ open, title, sheetKey, onClose, children, initial = 'half', bottom = 0 }: { open: boolean; title: string; sheetKey: string; onClose(): void; children: ReactNode; initial?: Snap; bottom?: number }) {
  const [vh, setVh] = useState(() => window.innerHeight);
  const [snap, setSnap] = useState<Snap>(initial);
  const controls = useDragControls();
  const full = Math.round(vh * FRACTION.full) - bottom;
  const offset = (s: Snap) => full - (Math.round(vh * FRACTION[s]) - bottom);
  const y = useMotionValue(offset(initial));

  useEffect(() => {
    const on = () => setVh(window.innerHeight);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);

  useEffect(() => {
    if (open) {
      setSnap(initial);
      void animate(y, offset(initial), spring);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sheetKey]);

  useEffect(() => {
    void animate(y, offset(snap), spring);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap, vh]);

  const onEnd = (_: unknown, info: PanInfo) => {
    const projected = y.get() + info.velocity.y * 0.2;
    if (projected > offset('peek') + 60) {
      onClose();
      return;
    }
    const order: Snap[] = ['full', 'half', 'peek'];
    const best = order.reduce((a, b) => (Math.abs(offset(b) - projected) < Math.abs(offset(a) - projected) ? b : a));
    setSnap(best);
    void animate(y, offset(best), spring);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.section
          key="sheet"
          className="bsheet"
          role="dialog"
          aria-label={title}
          style={{ height: full, bottom, y }}
          initial={{ opacity: 0, translateY: 60 }}
          animate={{ opacity: 1, translateY: 0 }}
          exit={{ opacity: 0, translateY: 80, transition: { duration: 0.18 } }}
          transition={spring}
          drag="y"
          dragListener={false}
          dragControls={controls}
          dragConstraints={{ top: 0, bottom: offset('peek') + 140 }}
          dragElastic={0.08}
          dragMomentum={false}
          onDragEnd={onEnd}
          data-snap={snap}
          data-testid="bottom-sheet"
        >
          <header className="bsheet__head" onPointerDown={(e) => controls.start(e)}>
            <span className="bsheet__grab" aria-hidden />
            <h2>{title}</h2>
            <button className="icon" onClick={() => setSnap(snap === 'full' ? 'half' : 'full')} aria-label={snap === 'full' ? 'Make the panel smaller' : 'Make the panel bigger'}>
              <Icon name={snap === 'full' ? 'down' : 'up'} size={17} />
            </button>
            <button className="icon" onClick={onClose} aria-label="Close panel">
              <Icon name="close" size={17} />
            </button>
          </header>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={sheetKey} className="bsheet__body" variants={blurSwap} initial="initial" animate="animate" exit="exit" style={{ maxHeight: full - offset(snap) - 56 }}>
              {children}
            </motion.div>
          </AnimatePresence>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
