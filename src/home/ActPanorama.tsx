import { animate, motion, useInView, useMotionValue, useMotionValueEvent, useScroll, useTransform, type MotionValue } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { SLIDES, useElementSize, type Accent, type World } from './world';

const art = (key: string) => `${import.meta.env.BASE_URL}art/${key}.webp`;

/**
 * Act II: scrolling down travels sideways through one continuous cyanotype world,
 * cut into five carousel slides with red seams. The camera stops on each slide's
 * story beat; the world's red accents (sun, lighthouse, window, lantern) glow as
 * they pass. Laid out in pixels so narrow screens travel the whole panorama too.
 */
export function ActPanorama({ world }: { world: World | null }) {
  const section = useRef<HTMLElement>(null);
  const pin = useRef<HTMLDivElement>(null);
  const { w: vw, h: vh } = useElementSize(pin);
  const { scrollYProgress: p } = useScroll({ target: section, offset: ['start start', 'end end'] });

  const imgW = world?.width ?? SLIDES * vw;
  const imgH = world?.height ?? vh;
  // The world is at least five screens wide, and tall enough to fill the screen.
  const worldW = Math.max(SLIDES * vw, (vh * imgW) / imgH);
  const travel = worldW - vw;
  const page = worldW / SLIDES; // width of one carousel slide of the panorama
  const stop = (k: number) => (k / (SLIDES - 1)) * travel; // camera position of story beat k
  const x = useTransform(p, (v) => -v * travel);
  const narrow = vw < 860;

  // Cover-fit the image into worldW × vh.
  const s = Math.max(worldW / imgW, vh / imgH);
  const img = { w: imgW * s, h: imgH * s, x: (worldW - imgW * s) / 2, y: (vh - imgH * s) / 2 };

  const [slide, setSlide] = useState(0);
  useMotionValueEvent(p, 'change', (v) => setSlide(Math.min(SLIDES - 1, Math.round(v * (SLIDES - 1)))));

  return (
    <section ref={section} className="act act--pano" aria-label="How it works">
      <div className="act__pin" ref={pin}>
        <motion.div className="world" style={{ x, width: worldW }}>
          {world && <img className="world__img" src={world.url} alt="" draggable={false} style={{ left: img.x, top: img.y, width: img.w, height: img.h }} />}
          <div className="world__shade" />
          {world?.accents.map((a) => (
            <Glow key={a.label} a={a} left={img.x + a.x * s} top={img.y + a.y * s} camera={x} vw={vw} />
          ))}
          {Array.from({ length: SLIDES - 1 }, (_, k) => (
            <span key={k} className="world__seam" style={{ left: (k + 1) * page }} />
          ))}
          {Array.from({ length: SLIDES }, (_, k) => (
            <span key={k} className="world__label mono" style={{ left: (k + 0.5) * page }}>
              {String(k + 1).padStart(2, '0')}
            </span>
          ))}

          {/* 01 — the headline runs across the first seam */}
          <Beat className="w-slide w-slide--first" left={stop(0)} vw={vw} camera={x}>
            <p className="mono w-kicker">01 — One photo</p>
            <h2 className="w-giant">
              One photo,
              <br />
              <span className="w-giant__cross">many slides.</span>
            </h2>
          </Beat>

          {/* 03 — a clip that stands in the seam between 03 and 04 */}
          <Beat className="w-slide" left={stop(2)} vw={vw} camera={x}>
            <p className="mono w-kicker">03 — Mix</p>
            <h2 className="w-title">
              Drop a clip
              <br />
              in the seam.
            </h2>
            <p className="w-body">Photos and video in the same post. A clip across two slides becomes two MP4s that stay in sync.</p>
          </Beat>
          <ClipWindow p={p} left={3 * page} width={narrow ? vw * 0.62 : vw * 0.34} />

          {/* 04 — export */}
          <Beat className="w-slide w-slide--export" left={stop(3)} vw={vw} camera={x}>
            <p className="mono w-kicker">04 — Export</p>
            <h2 className="w-title">
              Files in order,
              <br />
              on your device.
            </h2>
          </Beat>
          <ExportBit p={p} left={stop(3) + vw * (narrow ? 0.5 : 0.68)} />

          {/* 05 — the promise */}
          <Beat className="w-slide w-slide--last" left={stop(4)} vw={vw} camera={x}>
            <p className="mono w-kicker">05 — Yours</p>
            <div className="w-stats">
              <Stat p={p} at={0.86} to={20} label="slides per carousel" />
              <Stat p={p} at={0.89} to={0} label="uploads to a server" />
              <Stat p={p} at={0.92} to={0} suffix=" €" label="forever" />
            </div>
            <p className="w-body">No account. No watermark. Open source under MIT.</p>
          </Beat>
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

/** A story beat: fully visible when the camera stops on it, fading (and drifting) on the way. */
function Beat({ className, left, vw, camera, children }: { className: string; left: number; vw: number; camera: MotionValue<number>; children: React.ReactNode }) {
  const d = useTransform(camera, (cx) => (left + cx) / Math.max(1, vw)); // 0 when the beat is on screen
  const opacity = useTransform(d, [-0.75, -0.3, 0.3, 0.75], [0, 1, 1, 0]);
  const tx = useTransform(d, [-1, 0, 1], [-90, 0, 90]);
  return (
    <motion.div className={className} style={{ left, width: vw, opacity, x: tx }}>
      {children}
    </motion.div>
  );
}

/** A red accent of the print that lights up as the camera passes it. */
function Glow({ a, left, top, camera, vw }: { a: Accent; left: number; top: number; camera: MotionValue<number>; vw: number }) {
  const size = a.label === 'sun' ? 1.4 : 1;
  // 1 when the accent is in the middle of the screen, 0 a screen away.
  const near = useTransform(camera, (cx) => Math.max(0, 1 - Math.abs(left + cx - vw / 2) / vw));
  const scale = useTransform(near, [0, 1], [0.4, 1]);
  return (
    <motion.span className="glow" style={{ left, top, opacity: near, scale, width: 220 * size, height: 220 * size, marginLeft: -110 * size, marginTop: -110 * size }} aria-hidden>
      <span className="glow__ring" />
    </motion.span>
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
  const last = Math.max(0, Math.min(5, pages - 1));
  const page = useTransform(p, [0.14, 0.46], [0, last]);
  const bx = useTransform(page, (v) => `${-swipeEase(v) * pw}px`);
  const [dot, setDot] = useState(0);
  useMotionValueEvent(page, 'change', (v) => setDot(Math.round(swipeEase(v))));
  return (
    <motion.div className="lens" style={{ opacity, y, rotate }} aria-hidden>
      <div className="lens__copy">
        <p className="mono w-kicker">02 — Swipe</p>
        <h2 className="w-title">It keeps going.</h2>
        <p className="w-body">Every swipe lands exactly where the last slide ended — the sun, the lighthouse, the town, the night.</p>
      </div>
      <div className="lens__phone">
        <div className="lens__bar">
          <span className="phone__avatar" /> your.handle
        </div>
        <div className="lens__post" ref={post}>
          {world && <motion.div className="lens__strip" style={{ backgroundImage: `url(${world.url})`, backgroundSize: `auto ${postH}px`, backgroundPositionX: bx }} />}
        </div>
        <div className="dots">
          {Array.from({ length: last + 1 }, (_, k) => (
            <span key={k} className={k === dot ? 'is-on' : ''} />
          ))}
        </div>
      </div>
    </motion.div>
  );
}

const DIVE = [1, 2, 3, 4, 5, 6].map((n) => art(`frame-${n}`));

/** The clip in the seam: a dive, played frame by frame, cut by the red seam into 03.mp4 and 04.mp4. */
function ClipWindow({ p, left, width }: { p: MotionValue<number>; left: number; width: number }) {
  const live = useTransform(p, [0.44, 0.5], [0, 1]);
  const scale = useTransform(live, [0, 1], [0.85, 1]);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.2 });
  const [f, setF] = useState(0);
  const [ok, setOk] = useState(true);
  useEffect(() => {
    if (!inView) return;
    let i = 0;
    const t = setInterval(() => {
      i = (i + 1) % 9; // frames 0–5, then hold the splash for a beat
      setF(Math.min(5, i));
    }, 170);
    return () => clearInterval(t);
  }, [inView]);
  return (
    <motion.div className="clipwin" ref={ref} style={{ left: left - width / 2, width, opacity: live, scale }}>
      <div className="clipwin__frame">
        {ok ? (
          DIVE.map((src, i) => <img key={src} src={src} alt="" className="clipwin__img" style={{ opacity: i === f ? 1 : 0 }} onError={() => setOk(false)} draggable={false} />)
        ) : (
          <div className="clipwin__video" />
        )}
        <i className="clipwin__rec mono">● REC 00:0{f}</i>
        <span className="clipwin__seam" />
      </div>
      <div className="clipwin__badges">
        <span className="badge badge--video">03.mp4</span>
        <span className="badge badge--video">04.mp4</span>
      </div>
    </motion.div>
  );
}

function ExportBit({ p, left }: { p: MotionValue<number>; left: number }) {
  const fill = useTransform(p, [0.66, 0.76], [0, 100], { clamp: true });
  const fillW = useTransform(fill, (v) => `${v}%`);
  const [state, setState] = useState<'idle' | 'run' | 'done'>('idle');
  useMotionValueEvent(p, 'change', (v) => setState(v < 0.66 ? 'idle' : v < 0.76 ? 'run' : 'done'));
  const fan = useTransform(p, [0.76, 0.82], [0, 1], { clamp: true });
  return (
    <div className="exportbit" style={{ left }}>
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
