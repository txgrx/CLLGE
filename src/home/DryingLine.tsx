import { motion, useScroll, useSpring, useTransform, useVelocity } from 'motion/react';
import type { ProjectSummary } from '../storage/db';
import { Icon } from '../ui/Icon';
import { spring } from '../ui/motion';

/** Saved projects hang like prints on a line that sways with the scroll speed. */
export function DryingLine({ projects, onOpen, onDelete }: { projects: ProjectSummary[] | null; onOpen(id: string): void; onDelete(p: ProjectSummary): void }) {
  const { scrollY } = useScroll();
  const vel = useVelocity(scrollY);
  const sway = useSpring(useTransform(vel, [-3000, 0, 3000], [-1, 0, 1], { clamp: true }), { stiffness: 90, damping: 9, mass: 0.6 });
  const sag = useTransform(sway, (s) => 60 + Math.abs(s) * 26);
  const d = useTransform(sag, (v) => `M0 20 Q 600 ${20 + v * 2} 1200 20`);

  return (
    <section className="line" aria-labelledby="mine-h">
      <motion.h2 id="mine-h" className="line__title" initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={spring}>
        <small className="mono">Saved in this browser</small>
        Your projects
      </motion.h2>
      {projects === null ? (
        <p className="hint">Loading…</p>
      ) : projects.length === 0 ? (
        <p className="hint line__empty">Nothing hanging yet. Projects save themselves while you edit — they'll dry here.</p>
      ) : (
        <div className="line__wrap">
          <svg className="line__string" viewBox="0 0 1200 200" preserveAspectRatio="none" aria-hidden>
            <motion.path d={d} />
          </svg>
          <ul className="line__prints">
            {projects.slice(0, 8).map((p, i) => (
              <Print key={p.id} p={p} i={i} n={Math.min(8, projects.length)} sway={sway} onOpen={onOpen} onDelete={onDelete} />
            ))}
          </ul>
          {projects.length > 8 && <p className="hint">+ {projects.length - 8} more</p>}
        </div>
      )}
    </section>
  );
}

function Print({ p, i, n, sway, onOpen, onDelete }: { p: ProjectSummary; i: number; n: number; sway: ReturnType<typeof useSpring>; onOpen(id: string): void; onDelete(p: ProjectSummary): void }) {
  // Follow the quadratic curve of the string so each peg sits on it.
  const t = (i + 0.5) / n;
  const yOnLine = useTransform(sway, (s) => {
    const sag = 60 + Math.abs(s) * 26;
    return 4 * t * (1 - t) * sag; // quadratic Bézier with its control point at the middle
  });
  const rotate = useTransform(sway, (s) => s * (6 + (i % 3) * 3) * (i % 2 ? -1 : 1) + (i % 2 ? 2 : -2));
  return (
    <motion.li className="print" style={{ left: `${t * 100}%`, y: yOnLine, rotate }} initial={{ opacity: 0, y: -30 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}>
      <span className="print__peg" aria-hidden />
      <button className="print__open" onClick={() => onOpen(p.id)} data-cursor="Open">
        <span className="print__strip" aria-hidden>
          {Array.from({ length: Math.min(p.pages, 4) }, (_, k) => (
            <span key={k} style={{ aspectRatio: `${p.pageWidth} / ${p.pageHeight}` }} />
          ))}
        </span>
        <span className="print__title">{p.title}</span>
        <span className="mono">
          {p.pages} slide{p.pages === 1 ? '' : 's'} · {new Date(p.updatedAt).toLocaleDateString()}
        </span>
      </button>
      <button className="icon print__del" onClick={() => onDelete(p)} aria-label={`Delete ${p.title}`} title="Delete">
        <Icon name="trash" size={16} />
      </button>
    </motion.li>
  );
}
