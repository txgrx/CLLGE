import { motion, useScroll, useSpring, useTransform, useVelocity, type MotionValue } from 'motion/react';
import { useEffect, useState } from 'react';
import { drawPage } from '../render/drawWindow';
import { loadProject, type ProjectSummary } from '../storage/db';
import { fontsReady } from '../ui/fonts';
import { Icon } from '../ui/Icon';
import { spring } from '../ui/motion';

const art = (key: string) => `${import.meta.env.BASE_URL}art/${key}.webp`;

/** Botanical photograms hung while there is nothing of yours to dry yet. */
const SAMPLE_PRINTS = [
  { key: 'print-1', title: 'Fern', meta: 'photogram · 01' },
  { key: 'print-2', title: 'Poppy', meta: 'photogram · 02' },
  { key: 'print-3', title: 'Dandelion', meta: 'photogram · 03' },
  { key: 'print-4', title: 'Olive', meta: 'photogram · 04' },
  { key: 'print-5', title: 'Lace & key', meta: 'photogram · 05' },
];

interface Props {
  projects: ProjectSummary[] | null;
  onOpen(id: string): void;
  onDelete(p: ProjectSummary): void;
  /** Opens the "Drying line" template (from the sample prints). */
  onSample(): void;
}

/** Saved projects hang like prints on a line that sways with the scroll speed. */
export function DryingLine({ projects, onOpen, onDelete, onSample }: Props) {
  const { scrollY } = useScroll();
  const vel = useVelocity(scrollY);
  const sway = useSpring(useTransform(vel, [-3000, 0, 3000], [-1, 0, 1], { clamp: true }), { stiffness: 90, damping: 9, mass: 0.6 });
  const sag = useTransform(sway, (s) => 60 + Math.abs(s) * 26);
  const d = useTransform(sag, (v) => `M0 20 Q 600 ${20 + v * 2} 1200 20`);
  const mine = projects ?? [];
  const empty = projects !== null && projects.length === 0;
  const n = empty ? SAMPLE_PRINTS.length : Math.min(8, mine.length);

  return (
    <section className="line" aria-labelledby="mine-h">
      <motion.h2 id="mine-h" className="line__title" initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={spring}>
        <small className="mono">{empty ? 'Nothing of yours yet' : 'Saved in this browser'}</small>
        {empty ? 'Prints drying' : 'Your projects'}
      </motion.h2>
      {empty && <p className="hint line__empty">Your carousels will hang here while they dry. These are sample photograms — tap one to start from them.</p>}
      {projects === null ? (
        <p className="hint">Loading…</p>
      ) : (
        <div className="line__wrap">
          <svg className="line__string" viewBox="0 0 1200 200" preserveAspectRatio="none" aria-hidden>
            <motion.path d={d} />
          </svg>
          <ul className="line__prints">
            {empty
              ? SAMPLE_PRINTS.map((s, i) => (
                  <Hanger key={s.key} i={i} n={n} sway={sway}>
                    <button className="print__open print__open--sample" onClick={onSample} data-cursor="Open" aria-label={`${s.title} — open the Drying line template`}>
                      <img className="print__photo" src={art(s.key)} alt="" loading="lazy" draggable={false} />
                      <span className="print__title">{s.title}</span>
                      <span className="mono">{s.meta}</span>
                    </button>
                  </Hanger>
                ))
              : mine.slice(0, 8).map((p, i) => (
                  <Hanger key={p.id} i={i} n={n} sway={sway}>
                    <button className="print__open" onClick={() => onOpen(p.id)} data-cursor="Open">
                      <ProjectThumb p={p} />
                      <span className="print__title">{p.title}</span>
                      <span className="mono">
                        {p.pages} slide{p.pages === 1 ? '' : 's'} · {new Date(p.updatedAt).toLocaleDateString()}
                      </span>
                    </button>
                    <button className="icon print__del" onClick={() => onDelete(p)} aria-label={`Delete ${p.title}`} title="Delete">
                      <Icon name="trash" size={16} />
                    </button>
                  </Hanger>
                ))}
          </ul>
          {mine.length > 8 && <p className="hint">+ {mine.length - 8} more</p>}
        </div>
      )}
    </section>
  );
}

function Hanger({ i, n, sway, children }: { i: number; n: number; sway: MotionValue<number>; children: React.ReactNode }) {
  // Follow the quadratic curve of the string so each peg sits on it.
  const t = (i + 0.5) / n;
  const yOnLine = useTransform(sway, (s) => {
    const sag = 60 + Math.abs(s) * 26;
    return 4 * t * (1 - t) * sag; // quadratic Bézier with its control point at the middle
  });
  const rotate = useTransform(sway, (s) => s * (6 + (i % 3) * 3) * (i % 2 ? -1 : 1) + (i % 2 ? 2 : -2));
  return (
    <motion.li className="print" style={{ left: `${t * 100}%`, y: yOnLine, rotate }} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}>
      <span className="print__peg" aria-hidden />
      {children}
    </motion.li>
  );
}

/** First slide of a saved project, rendered small. */
function ProjectThumb({ p }: { p: ProjectSummary }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let made: string | null = null;
    (async () => {
      const r = await loadProject(p.id);
      if (!r || !alive) return;
      await fontsReady();
      const bitmaps = new Map<string, ImageBitmap>();
      for (const a of r.project.assets) {
        const b = r.blobs.get(a.id);
        if (a.type === 'image' && b) bitmaps.set(a.id, await createImageBitmap(b).catch(() => null as unknown as ImageBitmap));
      }
      const { pageWidth: W, pageHeight: H } = r.project.canvas;
      const scale = 220 / H;
      const c = new OffscreenCanvas(Math.round(W * scale), 220);
      drawPage(c.getContext('2d')!, r.project, 0, 0, { image: (id) => bitmaps.get(id), video: () => null }, { scale });
      for (const b of bitmaps.values()) b?.close();
      made = URL.createObjectURL(await c.convertToBlob({ type: 'image/jpeg', quality: 0.8 }));
      if (alive) setUrl(made);
    })().catch(() => undefined);
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [p.id, p.updatedAt]);
  return url ? <img className="print__photo" src={url} alt="" draggable={false} /> : <span className="print__photo print__photo--blank" aria-hidden />;
}
