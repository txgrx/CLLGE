import { animate, motion, useMotionValue, useMotionValueEvent, useScroll, useTransform, type MotionValue } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { SLIDES, type World } from './world';

/**
 * Act II: scrolling down moves one continuous world sideways, five "slides" long,
 * with the seams marked like in the editor. Each slide tells one part of the story.
 */
export function ActPanorama({ world }: { world: World | null }) {
  const section = useRef<HTMLElement>(null);
  const { scrollYProgress: p } = useScroll({ target: section, offset: ['start start', 'end end'] });
  const x = useTransform(p, [0, 1], ['0vw', `-${(SLIDES - 1) * 100}vw`]);
  const [slide, setSlide] = useState(0);
  useMotionValueEvent(p, 'change', (v) => setSlide(Math.min(SLIDES - 1, Math.round(v * (SLIDES - 1)))));

  return (
    <section ref={section} className="act act--pano" aria-label="How it works">
      <div className="act__pin">
        <motion.div className="world" style={{ x, width: `${SLIDES * 100}vw` }}>
          {world && (
            <img
              className="world__img"
              src={world.url}
              alt=""
              draggable={false}
              // On narrow screens the whole panorama would not fit 5 slides wide: show it whole, on blue bands.
              style={{ objectFit: (SLIDES * innerWidth) / innerHeight < world.width / world.height ? 'contain' : 'cover' }}
            />
          )}
          <div className="world__shade" />
          {Array.from({ length: SLIDES - 1 }, (_, k) => (
            <span key={k} className="world__seam" style={{ left: `${(k + 1) * 100}vw` }} />
          ))}
          {Array.from({ length: SLIDES }, (_, k) => (
            <span key={k} className="world__label mono" style={{ left: `${k * 100 + 50}vw` }}>
              {String(k + 1).padStart(2, '0')}
            </span>
          ))}

          {/* 01 — the headline is cut by the first seam */}
          <div className="w-slide" style={{ left: 0 }}>
            <p className="mono w-kicker">01 — One photo</p>
            <h2 className="w-giant">
              One photo,
              <br />
              <span className="w-giant__cross">many slides.</span>
            </h2>
          </div>

          {/* 03 — a clip that stands in the seam between 03 and 04 */}
          <div className="w-slide" style={{ left: '200vw' }}>
            <p className="mono w-kicker">03 — Mix</p>
            <h2 className="w-title">
              Drop a clip
              <br />
              in the seam.
            </h2>
            <p className="w-body">Photos and video in the same post. A clip across two slides becomes two MP4s that stay in sync.</p>
          </div>
          <ClipWindow world={world} p={p} />

          {/* 04 — export */}
          <div className="w-slide w-slide--export" style={{ left: '300vw' }}>
            <p className="mono w-kicker">04 — Export</p>
            <h2 className="w-title">
              Files in order,
              <br />
              on your device.
            </h2>
          </div>
          <ExportBit p={p} />

          {/* 05 — the promise */}
          <div className="w-slide w-slide--last" style={{ left: '400vw' }}>
            <p className="mono w-kicker">05 — Yours</p>
            <div className="w-stats">
              <Stat p={p} at={0.86} to={20} label="slides per carousel" />
              <Stat p={p} at={0.89} to={0} label="uploads to a server" />
              <Stat p={p} at={0.92} to={0} suffix=" €" label="forever" />
            </div>
            <p className="w-body">No account. No watermark. Open source under MIT.</p>
          </div>
        </motion.div>

        {/* 02 — the phone is a lens on the world: it shows the carousel you'd post */}
        <PhoneLens world={world} p={p} />

        <div className="scrubber" aria-hidden>
          <span className="mono">{String(slide + 1).padStart(2, '0')} / 05</span>
          <div className="scrubber__dots">
            {Array.from({ length: SLIDES }, (_, k) => (
              <span key={k} className={k === slide ? 'is-on' : ''} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Ease each page turn so a continuous scroll reads as discrete swipes. */
function swipeEase(v: number): number {
  const i = Math.floor(v);
  const f = v - i;
  const e = f < 0.35 ? 0 : f > 0.85 ? 1 : (1 - Math.cos(((f - 0.35) / 0.5) * Math.PI)) / 2;
  return i + e;
}

function PhoneLens({ world, p }: { world: World | null; p: MotionValue<number> }) {
  const opacity = useTransform(p, [0.1, 0.16, 0.42, 0.48], [0, 1, 1, 0]);
  const y = useTransform(p, [0.1, 0.16, 0.42, 0.48], [80, 0, 0, -60]);
  const rotate = useTransform(p, [0.1, 0.3, 0.48], [-6, 0, 5]);
  const post = useRef<HTMLDivElement>(null);
  const [pw, setPw] = useState(280);
  useEffect(() => {
    const el = post.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPw(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const postH = (pw * 5) / 4;
  const worldW = world ? (world.width / world.height) * postH : 0;
  const pages = worldW ? Math.floor(worldW / pw) : 1;
  const page = useTransform(p, [0.14, 0.46], [0, Math.max(0, Math.min(5, pages - 1))]);
  const bx = useTransform(page, (v) => `${-swipeEase(v) * pw}px`);
  const [dot, setDot] = useState(0);
  useMotionValueEvent(page, 'change', (v) => setDot(Math.round(swipeEase(v))));
  return (
    <motion.div className="lens" style={{ opacity, y, rotate }} aria-hidden>
      <div className="lens__copy">
        <p className="mono w-kicker">02 — Swipe</p>
        <h2 className="w-title">It keeps going.</h2>
        <p className="w-body">Every swipe lands exactly where the last slide ended.</p>
      </div>
      <div className="lens__phone">
        <div className="lens__bar">
          <span className="phone__avatar" /> your.handle
        </div>
        <div className="lens__post" ref={post}>
          {world && <motion.div className="lens__strip" style={{ backgroundImage: `url(${world.url})`, backgroundSize: `auto ${postH}px`, backgroundPositionX: bx }} />}
        </div>
        <div className="dots">
          {Array.from({ length: Math.min(6, pages) }, (_, k) => (
            <span key={k} className={k === dot ? 'is-on' : ''} />
          ))}
        </div>
      </div>
    </motion.div>
  );
}

function ClipWindow({ world, p }: { world: World | null; p: MotionValue<number> }) {
  const live = useTransform(p, [0.44, 0.5], [0, 1]);
  const scale = useTransform(live, [0, 1], [0.85, 1]);
  return (
    <motion.div className="clipwin" style={{ left: 'calc(300vw - 17vw)', opacity: live, scale }}>
      <div className="clipwin__frame">
        {world && <div className="clipwin__video" style={{ backgroundImage: `url(${world.url})` }} />}
        <i className="clipwin__rec mono">● REC</i>
        <span className="clipwin__seam" />
      </div>
      <div className="clipwin__badges">
        <span className="badge badge--video">03.mp4</span>
        <span className="badge badge--video">04.mp4</span>
      </div>
    </motion.div>
  );
}

function ExportBit({ p }: { p: MotionValue<number> }) {
  const fill = useTransform(p, [0.66, 0.76], [0, 100], { clamp: true });
  const fillW = useTransform(fill, (v) => `${v}%`);
  const [state, setState] = useState<'idle' | 'run' | 'done'>('idle');
  useMotionValueEvent(p, 'change', (v) => setState(v < 0.66 ? 'idle' : v < 0.76 ? 'run' : 'done'));
  const fan = useTransform(p, [0.76, 0.82], [0, 1], { clamp: true });
  return (
    <div className="exportbit" style={{ left: '368vw' }}>
      <motion.div className={`go ${state === 'run' ? 'go--running' : state === 'done' ? 'go--done' : ''}`} layout transition={{ type: 'spring', stiffness: 380, damping: 30 }}>
        {state === 'run' && <motion.span className="go__fill" style={{ width: fillW }} />}
        <span className="go__label">{state === 'done' ? '✓  Files ready' : state === 'run' ? 'Encoding on your device…' : '↑  Export 5 files'}</span>
      </motion.div>
      <div className="exportbit__files">
        {['01.jpg', '02.jpg', '03.mp4', '04.mp4', '05.jpg'].map((f, i) => (
          <FileCard key={f} name={f} i={i} fan={fan} />
        ))}
      </div>
    </div>
  );
}

function FileCard({ name, i, fan }: { name: string; i: number; fan: MotionValue<number> }) {
  const y = useTransform(fan, [0, 1], [-60, 0]);
  const rotate = useTransform(fan, [0, 1], [(i - 2) * 14, (i - 2) * 3]);
  const x = useTransform(fan, [0, 1], [-(i - 2) * 40, 0]);
  return (
    <motion.div className="filecard" style={{ opacity: fan, y, rotate, x }}>
      <b className="mono">{name}</b>
      <small className="mono">{name.endsWith('mp4') ? 'video · sound' : 'photo'}</small>
    </motion.div>
  );
}

function Stat({ p, at, to, suffix = '', label }: { p: MotionValue<number>; at: number; to: number; suffix?: string; label: string }) {
  // Counts up to its value (or down to zero from 100) once its slide arrives.
  const from = to === 0 ? 100 : 0;
  const v = useMotionValue(from);
  const [n, setN] = useState(from);
  const [on, setOn] = useState(false);
  useMotionValueEvent(p, 'change', (s) => {
    if (s >= at && !on) {
      setOn(true);
      animate(v, to, { duration: 1.2, ease: [0.2, 0.8, 0.2, 1] });
    }
  });
  useMotionValueEvent(v, 'change', (x) => setN(Math.round(x)));
  return (
    <motion.div className="stat" animate={{ opacity: on ? 1 : 0, y: on ? 0 : 24 }} transition={{ type: 'spring', stiffness: 220, damping: 24 }}>
      <span className="stat__n">
        {n}
        {suffix}
      </span>
      <span className="mono">{label}</span>
    </motion.div>
  );
}
