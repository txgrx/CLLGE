import { motion } from 'motion/react';
import { useEffect, useMemo, useRef } from 'react';
import { library } from '../media/library';
import { planPages } from '../model/plan';
import { addPageAtEnd } from '../model/project';
import { MAX_PAGES } from '../model/types';
import { drawPage } from '../render/drawWindow';
import { Icon } from '../ui/Icon';
import { listItem, listParent } from '../ui/motion';
import { useEditor } from './store';

/** Pages as a strip of negatives: tap to jump, see which ones become video. */
export function Filmstrip({ current, onPick }: { current: number; onPick(i: number): void }) {
  const project = useEditor((s) => s.project)!;
  const apply = useEditor((s) => s.apply);
  const plans = useMemo(() => planPages(project), [project]);
  return (
    <motion.nav className="filmstrip" aria-label="Slides" initial="initial" animate="animate" variants={listParent}>
      {plans.map((p) => (
        <motion.button key={p.pageId} variants={listItem} className={`film ${p.index === current ? 'is-current' : ''}`} onClick={() => onPick(p.index)} aria-label={`Slide ${p.index + 1}${p.kind === 'video' ? ', video' : ''}`} aria-current={p.index === current}>
          <Thumb index={p.index} />
          <span className="film__meta">
            <span className="mono">{p.baseName}</span>
            {p.kind === 'video' && <span className="badge badge--video">{(p.durationMs / 1000).toFixed(1)}s</span>}
          </span>
        </motion.button>
      ))}
      {project.pages.length < MAX_PAGES && (
        <button className="film film--add" onClick={() => apply(addPageAtEnd)} aria-label="Add a slide at the end" title="Add slide">
          <Icon name="plus" />
        </button>
      )}
    </motion.nav>
  );
}

function Thumb({ index }: { index: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const project = useEditor((s) => s.project)!;
  useEffect(() => {
    let t = 0;
    const paint = () => {
      clearTimeout(t);
      t = window.setTimeout(() => {
        const cv = ref.current;
        const p = useEditor.getState().project;
        if (!cv || !p || index >= p.pages.length) return;
        const scale = 128 / p.canvas.pageHeight;
        cv.width = Math.round(p.canvas.pageWidth * scale);
        cv.height = 128;
        drawPage(cv.getContext('2d')!, p, index, 0, library.sources(), { scale, showAllClips: true });
      }, 180);
    };
    paint();
    const off = library.onChange(paint);
    return () => {
      clearTimeout(t);
      off();
    };
  }, [project, index]);
  return <canvas ref={ref} />;
}
