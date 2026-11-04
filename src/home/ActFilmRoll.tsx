import { AnimatePresence, animate, motion, useMotionValue, useScroll, useTransform } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { FAMILY_LABEL, TEMPLATES, type TemplateFamily, type TemplateSpec } from '../templates/catalog';
import { templateThumbs } from '../templates/thumbs';
import { Seg } from '../ui/controls';
import { spring } from '../ui/motion';

interface Props {
  opening: string | null;
  onPick(t: TemplateSpec, from: DOMRect, image?: string): void;
}

/**
 * Act III: the templates on a roll of 35 mm negative. Each frame comes in as a
 * negative and turns positive as it reaches the middle of the screen.
 */
export function ActFilmRoll({ opening, onPick }: Props) {
  const section = useRef<HTMLElement>(null);
  const [family, setFamily] = useState<'all' | TemplateFamily>('all');
  const { scrollYProgress } = useScroll({ target: section, offset: ['start end', 'end start'] });
  // Sprockets drift a little faster than the page: the film feels like it's running.
  const sprocket = useTransform(scrollYProgress, [0, 1], ['0px', '-420px']);
  const shown = TEMPLATES.filter((t) => family === 'all' || t.family === family);

  return (
    <section ref={section} className="roll" aria-labelledby="roll-h">
      <header className="roll__head">
        <motion.h2 id="roll-h" className="roll__title" initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={spring}>
          <small className="mono">Act III — start from an idea</small>
          Eight rolls,
          <br />
          <em>ready to develop.</em>
        </motion.h2>
        <Seg<'all' | TemplateFamily>
          label="Template family"
          value={family}
          onChange={setFamily}
          options={[{ value: 'all', label: 'All' }, ...(Object.keys(FAMILY_LABEL) as TemplateFamily[]).map((f) => ({ value: f, label: FAMILY_LABEL[f] }))]}
        />
      </header>
      <div className="roll__film">
        <motion.span className="roll__holes roll__holes--l" style={{ backgroundPositionY: sprocket }} aria-hidden />
        <motion.span className="roll__holes roll__holes--r" style={{ backgroundPositionY: sprocket }} aria-hidden />
        <ul className="roll__frames">
          <AnimatePresence mode="popLayout">
            {shown.map((t, i) => (
              <motion.li key={t.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.15 } }} className={i % 2 ? 'is-right' : 'is-left'}>
                <Frame spec={t} n={24 + TEMPLATES.indexOf(t)} opening={opening === t.id} onPick={onPick} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </div>
    </section>
  );
}

function Frame({ spec, n, opening, onPick }: { spec: TemplateSpec; n: number; opening: boolean; onPick: Props['onPick'] }) {
  const ref = useRef<HTMLButtonElement>(null);
  const win = useRef<HTMLDivElement>(null);
  const [thumbs, setThumbs] = useState<string[] | null>(null);
  const [page, setPage] = useState(0);
  const [hover, setHover] = useState(false);
  const x = useMotionValue(0);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'center center'] });
  // 0 = negative, 1 = positive.
  const pos = useTransform(scrollYProgress, [0.25, 0.95], [0, 1], { clamp: true });
  const filter = useTransform(pos, (v) => `invert(${1 - v}) hue-rotate(${(1 - v) * 180}deg) saturate(${0.6 + v * 0.4})`);
  const mask = useTransform(pos, [0, 1], [0.55, 0]);
  const scale = useTransform(pos, [0, 1], [0.92, 1]);
  const captionX = useTransform(pos, [0, 1], [24, 0]);
  const captionO = useTransform(pos, [0.4, 1], [0, 1]);

  useEffect(() => {
    let alive = true;
    void templateThumbs(spec.id).then((t) => alive && setThumbs(t));
    return () => {
      alive = false;
    };
  }, [spec.id]);
  useEffect(() => {
    if (!hover || !thumbs) return;
    const t = setInterval(() => setPage((p) => (p + 1) % thumbs.length), 850);
    return () => clearInterval(t);
  }, [hover, thumbs]);
  useEffect(() => {
    if (!hover) setPage(0);
  }, [hover]);
  useEffect(() => {
    animate(x, -page * (win.current?.clientWidth ?? 0), spring);
  }, [page, x]);

  return (
    <div className="frame">
      <button
        ref={ref}
        className="frame__btn"
        onClick={() => onPick(spec, win.current!.getBoundingClientRect(), thumbs?.[0])}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        aria-label={`${spec.name}: ${spec.idea} ${spec.pages} slides.`}
        data-testid={`tpl-${spec.id}`}
        data-cursor="Open"
      >
        <motion.div className="frame__win" ref={win} style={{ filter, scale }}>
          {thumbs && (
            <motion.div className="frame__track" style={{ x }}>
              {thumbs.map((u, k) => (
                <img key={k} src={u} alt="" draggable={false} />
              ))}
            </motion.div>
          )}
          <motion.span className="frame__mask" style={{ opacity: mask }} />
          {(!thumbs || opening) && <span className="tpl__developing" />}
        </motion.div>
        <span className="frame__edge mono" aria-hidden>
          KD 400 ▸ {n}A
        </span>
        <span className="frame__num mono" aria-hidden>
          {n}
        </span>
      </button>
      <motion.div className="frame__caption" style={{ x: captionX, opacity: captionO }}>
        <span className="mono">
          {FAMILY_LABEL[spec.family]} · {spec.pages} slides
        </span>
        <h3>{spec.name}</h3>
        <p>{spec.idea}</p>
        <span className="frame__pages" aria-hidden>
          {Array.from({ length: spec.pages }, (_, k) => (
            <span key={k} className={k === page ? 'is-on' : ''} />
          ))}
        </span>
      </motion.div>
    </div>
  );
}
