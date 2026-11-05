import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo } from 'react';
import { nudge, seamWarnings, type TextMeasure } from '../model/seams';
import { measureTextLines } from '../render/drawWindow';
import { Icon } from '../ui/Icon';
import { spring } from '../ui/motion';
import { useEditor } from './store';
import { useUi } from './ui';

let measureCtx: CanvasRenderingContext2D | null = null;
const measure: TextMeasure = (layer) => {
  measureCtx ??= document.createElement('canvas').getContext('2d');
  return measureCtx ? measureTextLines(measureCtx, layer) : [];
};

/**
 * Watches the carousel for things a seam will spoil (a face on the cut, words split
 * in two, a sliver of a photo) and offers to nudge them clear.
 */
export function SeamGuard() {
  const project = useEditor((s) => s.project)!;
  const gesture = useEditor((s) => !!s.history.gestureStart);
  const ignored = useUi((s) => s.ignored);
  const warnings = useUi((s) => s.warnings);
  const set = useUi((s) => s.set);

  useEffect(() => {
    if (gesture) return; // wait until the drag ends
    const t = setTimeout(() => set({ warnings: seamWarnings(project, measure) }), 260);
    return () => clearTimeout(t);
  }, [project, gesture, set]);

  const shown = useMemo(() => warnings.filter((w) => !ignored.includes(w.key)), [warnings, ignored]);
  const w = shown[0];

  return (
    <div className="seamguard" aria-live="polite">
      <AnimatePresence>
        {w && (
          <motion.div key={w.key} className="seamguard__card" initial={{ opacity: 0, y: 14, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.98 }} transition={spring} data-testid="seam-warning">
            <span className="seamguard__icon">
              <Icon name="warn" size={18} />
            </span>
            <span className="seamguard__text">
              <strong className="mono">
                Seam {String(w.seam).padStart(2, '0')}─{String(w.seam + 1).padStart(2, '0')}
              </strong>
              {w.message}
              {shown.length > 1 && <em> +{shown.length - 1} more</em>}
            </span>
            <button
              className="btn btn--sm btn--primary"
              data-testid="nudge"
              onClick={() => {
                useEditor.getState().apply((p) => nudge(p, w));
                useEditor.getState().select([w.layerId]);
              }}
            >
              Nudge
            </button>
            <button className="btn btn--sm btn--ghost" onClick={() => set({ ignored: [...ignored, w.key] })}>
              Leave it
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
