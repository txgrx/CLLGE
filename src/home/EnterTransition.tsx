import { AnimatePresence, motion } from 'motion/react';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

export type EnterFrom = { kind: 'circle'; x: number; y: number } | { kind: 'frame'; rect: DOMRect; image?: string };

type Enter = (from: EnterFrom, run: () => Promise<void> | void) => Promise<void>;

const Ctx = createContext<Enter>(async (_f, run) => {
  await run();
});

export const useEnter = () => useContext(Ctx);

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Entrance transitions between the home page and the tools: a lens that opens from
 * the button, or the clicked template frame growing to fill the screen with a
 * safelight flash. The overlay never takes pointer events.
 */
export function EnterTransitionProvider({ children }: { children: ReactNode }) {
  const [from, setFrom] = useState<EnterFrom | null>(null);
  const busy = useRef(false);

  const enter = useCallback<Enter>(async (f, run) => {
    if (busy.current) return;
    if (reduced()) {
      await run();
      return;
    }
    busy.current = true;
    setFrom(f);
    try {
      // Let the cover grow while the work (e.g. building a template) happens.
      await Promise.all([new Promise((r) => setTimeout(r, 560)), Promise.resolve(run())]);
    } finally {
      setTimeout(() => {
        setFrom(null);
        busy.current = false;
      }, 120);
    }
  }, []);

  return (
    <Ctx.Provider value={enter}>
      {children}
      <AnimatePresence>
        {from && (
          <motion.div className="enter" key="enter" initial={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.35, delay: 0.05 } }} aria-hidden>
            {from.kind === 'circle' ? (
              <motion.div
                className="enter__lens"
                initial={{ clipPath: `circle(0px at ${from.x}px ${from.y}px)` }}
                animate={{ clipPath: `circle(150vmax at ${from.x}px ${from.y}px)` }}
                transition={{ duration: 0.6, ease: [0.7, 0, 0.2, 1] }}
              >
                <motion.span className="enter__ring" style={{ left: from.x, top: from.y }} initial={{ scale: 0, opacity: 1 }} animate={{ scale: 30, opacity: 0 }} transition={{ duration: 0.7, ease: 'easeOut' }} />
              </motion.div>
            ) : (
              <>
                <motion.div
                  className="enter__frame"
                  initial={{ left: from.rect.left, top: from.rect.top, width: from.rect.width, height: from.rect.height, borderRadius: 6 }}
                  animate={{ left: 0, top: 0, width: window.innerWidth, height: window.innerHeight, borderRadius: 0 }}
                  transition={{ type: 'spring', stiffness: 170, damping: 26 }}
                >
                  {from.image && <img src={from.image} alt="" />}
                </motion.div>
                <motion.div className="enter__flash" initial={{ opacity: 0 }} animate={{ opacity: [0, 0.55, 0] }} transition={{ duration: 0.6, times: [0, 0.35, 1] }} />
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </Ctx.Provider>
  );
}
