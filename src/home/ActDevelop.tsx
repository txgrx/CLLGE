import { motion, useMotionValueEvent, useScroll, useTransform } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MAX_PAGES } from '../model/types';
import { Icon } from '../ui/Icon';
import { createTray, type Tray } from './gl/developTray';
import { prefersReducedMotion, type World } from './world';

interface Props {
  world: World | null;
  actions: ReactNode;
}

/** Act I: the print develops in the tray as you scroll; the pointer stirs the liquid. */
export function ActDevelop({ world, actions }: Props) {
  const section = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const tray = useRef<Tray | null>(null);
  const [gl, setGl] = useState<'pending' | 'on' | 'off'>('pending');
  const { scrollYProgress: p } = useScroll({ target: section, offset: ['start start', 'end end'] });
  // Development runs over the first 80 % of the act, then the print lifts out.
  const dev = useTransform(p, [0, 0.78], [0.08, 1], { clamp: true });
  const lift = useTransform(p, [0.8, 1], [0, 1], { clamp: true });
  const scale = useTransform(lift, [0, 1], [1, 0.88]);
  const rotateX = useTransform(lift, [0, 1], [0, 10]);
  const radius = useTransform(lift, [0, 1], [0, 28]);
  const titleY = useTransform(p, [0, 0.6], ['0%', '-28%']);
  const hint = useTransform(p, [0, 0.06], [1, 0]);
  const css = useTransform(dev, (d) => `brightness(${0.08 + d * 0.95}) contrast(${0.7 + d * 0.35}) sepia(${Math.max(0, 0.7 - d * 0.9)})`);

  useEffect(() => {
    if (!world || !canvas.current) return;
    if (prefersReducedMotion()) {
      setGl('off');
      return;
    }
    const t = createTray(canvas.current, world.print, world.printAspect, world.sunInPrint);
    if (!t) {
      setGl('off');
      return;
    }
    tray.current = t;
    setGl('on');
    t.setProgress(dev.get());
    // Only animate while the act is on screen.
    const io = new IntersectionObserver(([e]) => t.setActive(e.isIntersecting && document.visibilityState === 'visible'));
    io.observe(section.current!);
    const vis = () => t.setActive(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', vis);
    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', vis);
      t.destroy();
      tray.current = null;
    };
  }, [world, dev]);

  useMotionValueEvent(dev, 'change', (v) => tray.current?.setProgress(v));

  const last = useRef({ x: 0, y: 0 });
  const onMove = (e: React.PointerEvent) => {
    const t = tray.current;
    const el = canvas.current;
    if (!t || !el) return;
    const r = el.getBoundingClientRect();
    if (Math.hypot(e.clientX - last.current.x, e.clientY - last.current.y) < 46) return;
    last.current = { x: e.clientX, y: e.clientY };
    t.ripple((e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height, 0.45);
  };
  const onDown = (e: React.PointerEvent) => {
    const t = tray.current;
    const el = canvas.current;
    if (!t || !el) return;
    const r = el.getBoundingClientRect();
    t.ripple((e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height, 1);
  };

  return (
    <section ref={section} className="act act--develop" aria-label="Introduction">
      <div className="act__pin">
        <motion.div className="tray" style={{ scale, rotateX, borderRadius: radius }} onPointerMove={onMove} onPointerDown={onDown}>
          <canvas ref={canvas} className="tray__gl" style={{ opacity: gl === 'on' ? 1 : 0 }} aria-hidden />
          {gl === 'off' && world && <motion.img className="tray__fallback" src={world.url} alt="" style={{ filter: css }} />}
          <div className="tray__shade" aria-hidden />
        </motion.div>

        <motion.div className="hero2" style={{ y: titleY }}>
          <p className="mono hero2__kicker">
            <span className="lamp" aria-hidden /> CLLGE · free & open source
          </p>
          <h1 className="hero2__title" aria-label="Slides that keep going.">
            <Rise text="Slides that" delay={0.15} />
            <br />
            <em>
              <Rise text="keep going." delay={0.45} />
            </em>
          </h1>
          <motion.p className="hero2__lede" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.1, duration: 0.6 }}>
            Lay one wide photo — or photos and clips together — across a carousel. People swipe, and the picture carries on.
          </motion.p>
          <motion.div className="hero2__actions" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.3, duration: 0.6 }}>
            {actions}
          </motion.div>
          <motion.p className="mono hero2__facts" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.6 }}>
            Up to {MAX_PAGES} slides · photo + MP4 with sound · nothing leaves your device
          </motion.p>
        </motion.div>

        <motion.div className="scroll-hint mono" style={{ opacity: hint }} aria-hidden>
          <Icon name="down" size={16} /> Scroll to develop
        </motion.div>
      </div>
    </section>
  );
}

/** Letters rise out of the liquid, each a little later than the last. */
function Rise({ text, delay }: { text: string; delay: number }) {
  return (
    <span className="rise" aria-hidden>
      {[...text].map((ch, i) => (
        <motion.span
          key={i}
          className="rise__ch"
          initial={{ y: '105%', opacity: 0, filter: 'blur(8px)' }}
          animate={{ y: '0%', opacity: 1, filter: 'blur(0px)' }}
          transition={{ type: 'spring', stiffness: 160, damping: 18, delay: delay + i * 0.035 }}
        >
          {ch === ' ' ? ' ' : ch}
        </motion.span>
      ))}
    </span>
  );
}
