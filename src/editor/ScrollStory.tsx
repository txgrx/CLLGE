import { motion, useMotionValueEvent, useScroll, useSpring, useTransform, type MotionValue } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { newId } from '../model/ids';
import { buildPanoramaProject } from '../panorama/split';
import { coast } from '../templates/art';
import { renderPages, templateThumbs } from '../templates/thumbs';

const CHAPTERS = [
  { n: '01', title: 'One wide photo.', text: 'Start from a panorama — or any photo too big for one post.' },
  { n: '02', title: 'It keeps going.', text: 'We cut it where the slides meet. Swipe, and the horizon carries on.' },
  { n: '03', title: 'Drop a clip in the seam.', text: 'Photos and video in the same post. A clip across two slides becomes two MP4s that line up.' },
  { n: '04', title: 'Export, on your device.', text: 'Files in carousel order, ready for Instagram. No upload, no account, no watermark.' },
];

/** Slot of the "Doorway" template, in % of its 3-page strip. */
const DOOR_SLOT = { left: (690 / 3240) * 100, top: (300 / 1350) * 100, width: (780 / 3240) * 100, height: (900 / 1350) * 100 };

/**
 * "How it works", told by scrolling: a sticky stage whose scenes are driven by the
 * scroll position (a smoothed spring of it), not by time.
 */
export function ScrollStory() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const p = useSpring(scrollYProgress, { stiffness: 140, damping: 28, mass: 0.4 });
  const [chapter, setChapter] = useState(0);
  useMotionValueEvent(p, 'change', (v) => setChapter(Math.min(3, Math.max(0, Math.floor(v * 4 + 0.05)))));
  const [slides, setSlides] = useState<string[]>([]);
  const [door, setDoor] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const blob = await coast(1800, 750, 11);
      const project = buildPanoramaProject({
        asset: { id: newId('a_'), type: 'image', name: 'story', mime: 'image/jpeg', width: 1800, height: 750 },
        slides: 3,
        pageWidth: 1080,
        pageHeight: 1350,
        crop: { focusX: 0.5, focusY: 0.5, zoom: 1 },
      });
      const urls = await renderPages(project, new Map([[project.assets[0].id, blob]]), 600);
      const d = await templateThumbs('doorway');
      if (alive) {
        setSlides(urls);
        setDoor(d);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section ref={ref} className="story" aria-labelledby="story-h">
      <div className="story__sticky">
        <div className="story__text">
          <h2 id="story-h" className="mono">
            How it works
          </h2>
          <ol className="story__chapters">
            {CHAPTERS.map((c, i) => (
              <motion.li key={c.n} animate={{ opacity: i === chapter ? 1 : 0.28, x: i === chapter ? 0 : -6 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }} aria-current={i === chapter ? 'step' : undefined}>
                <span className="mono story__n">{c.n}</span>
                <span className="story__title">{c.title}</span>
                <motion.span className="story__body" initial={false} animate={{ height: i === chapter ? 'auto' : 0, opacity: i === chapter ? 1 : 0 }}>
                  {c.text}
                </motion.span>
              </motion.li>
            ))}
          </ol>
          <Progress p={p} />
        </div>
        <div className="story__stage" aria-hidden>
          <PanoScene p={p} slides={slides} />
          <ClipScene p={p} door={door} />
          <ExportScene p={p} slides={slides} />
        </div>
      </div>
    </section>
  );
}

function Progress({ p }: { p: MotionValue<number> }) {
  const w = useTransform(p, (v) => `${Math.min(100, Math.max(0, v * 100))}%`);
  return (
    <div className="story__progress">
      <motion.span style={{ width: w }} />
    </div>
  );
}

/** Chapters 1–2: a strip of three slides is cut, then flows through a phone. */
function PanoScene({ p, slides }: { p: MotionValue<number>; slides: string[] }) {
  const visible = useTransform(p, [0, 0.46, 0.52], [1, 1, 0]);
  const cut = useTransform(p, [0.06, 0.16], [0, 1]);
  const gap = useTransform(p, [0.17, 0.24], [0, 18]);
  const phone = useTransform(p, [0.26, 0.32], [0, 1]);
  // Swipe: as you scroll through chapter 2 the track moves by two slides.
  const track = useTransform(p, [0.32, 0.48], [0, -200]);
  const trackX = useTransform(track, (v) => `${v}%`);
  const stripOpacity = useTransform(p, [0.26, 0.32], [1, 0.16]);
  const stripScale = useTransform(p, [0, 0.1], [0.94, 1]);
  const seamOpacity = useTransform(p, [0.05, 0.07, 0.2, 0.25], [0, 1, 1, 0]);
  return (
    <motion.div className="sc sc--pano" style={{ opacity: visible }}>
      <motion.div className="sc__strip" style={{ scale: stripScale, gap, opacity: stripOpacity }}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="sc__slice">
            {slides[i] && <img src={slides[i]} alt="" />}
          </div>
        ))}
        {[1, 2].map((k) => (
          <motion.span key={k} className="sc__cut" style={{ left: `${(k * 100) / 3}%`, scaleY: cut, opacity: seamOpacity }} />
        ))}
      </motion.div>
      <motion.div className="sc__phone" style={{ opacity: phone, scale: useTransform(phone, [0, 1], [0.92, 1]) }}>
        <div className="sc__phone-bar">
          <span className="phone__avatar" /> your.handle
        </div>
        <div className="sc__post">
          <motion.div className="sc__track" style={{ x: trackX }}>
            {slides.map((u, i) => (
              <img key={i} src={u} alt="" />
            ))}
          </motion.div>
        </div>
        <Dots p={p} />
      </motion.div>
    </motion.div>
  );
}

function Dots({ p }: { p: MotionValue<number> }) {
  const [i, setI] = useState(0);
  useMotionValueEvent(p, 'change', (v) => setI(v < 0.37 ? 0 : v < 0.44 ? 1 : 2));
  return (
    <div className="dots">
      {[0, 1, 2].map((k) => (
        <span key={k} className={k === i ? 'is-on' : ''} />
      ))}
    </div>
  );
}

/** Chapter 3: the "Doorway" template; its clip shimmers across the seam. */
function ClipScene({ p, door }: { p: MotionValue<number>; door: string[] }) {
  const opacity = useTransform(p, [0.48, 0.54, 0.72, 0.78], [0, 1, 1, 0]);
  const y = useTransform(p, [0.48, 0.56], [40, 0]);
  const live = useTransform(p, [0.56, 0.62], [0, 1]);
  return (
    <motion.div className="sc sc--clip" style={{ opacity, y }}>
      <div className="sc__door">
        {door.map((u, i) => (
          <img key={i} src={u} alt="" />
        ))}
        <motion.div className="sc__clip" style={{ ...pct(DOOR_SLOT), opacity: live }}>
          {Array.from({ length: 7 }, (_, k) => (
            <span key={k} style={{ top: `${46 + k * 7}%`, animationDelay: `${-k * 0.7}s`, width: `${20 + (k % 3) * 12}%` }} />
          ))}
          <i className="sc__rec mono">● REC</i>
        </motion.div>
        {[1, 2].map((k) => (
          <span key={k} className="sc__seam" style={{ left: `${(k * 100) / 3}%` }} />
        ))}
      </div>
      <div className="sc__badges">
        <motion.span className="badge badge--video" style={{ opacity: live }}>
          01.mp4
        </motion.span>
        <motion.span className="badge badge--video" style={{ opacity: live }}>
          02.mp4
        </motion.span>
        <span className="badge">03.jpg</span>
      </div>
    </motion.div>
  );
}

function pct(r: { left: number; top: number; width: number; height: number }) {
  return { left: `${r.left}%`, top: `${r.top}%`, width: `${r.width}%`, height: `${r.height}%` };
}

/** Chapter 4: the Export button fills, turns into a check, files fan out. */
function ExportScene({ p, slides }: { p: MotionValue<number>; slides: string[] }) {
  const opacity = useTransform(p, [0.76, 0.82], [0, 1]);
  const fill = useTransform(p, [0.82, 0.92], [0, 100]);
  const fillW = useTransform(fill, (v) => `${v}%`);
  const [state, setState] = useState<'idle' | 'run' | 'done'>('idle');
  useMotionValueEvent(p, 'change', (v) => setState(v < 0.82 ? 'idle' : v < 0.92 ? 'run' : 'done'));
  const fan = useTransform(p, [0.92, 0.98], [0, 1]);
  const files = ['01.mp4', '02.mp4', '03.jpg'];
  return (
    <motion.div className="sc sc--export" style={{ opacity }}>
      <motion.div className={`go ${state === 'run' ? 'go--running' : state === 'done' ? 'go--done' : ''}`} layout transition={{ type: 'spring', stiffness: 380, damping: 30 }}>
        {state === 'run' && <motion.span className="go__fill" style={{ width: fillW }} />}
        <span className="go__label">{state === 'done' ? '✓  Files ready' : state === 'run' ? 'Encoding…' : '↑  Export 3 files'}</span>
      </motion.div>
      <div className="sc__files">
        {files.map((f, i) => (
          <FileChip key={f} name={f} img={slides[i]} i={i} fan={fan} />
        ))}
      </div>
    </motion.div>
  );
}

function FileChip({ name, img, i, fan }: { name: string; img?: string; i: number; fan: MotionValue<number> }) {
  const x = useTransform(fan, [0, 1], [0, (i - 1) * 18]);
  const y = useTransform(fan, [0, 1], [-40, 0]);
  const rotate = useTransform(fan, [0, 1], [(i - 1) * 10, 0]);
  return (
    <motion.div className="sc__file" style={{ opacity: fan, x, y, rotate }}>
      {img && <img src={img} alt="" />}
      <span>
        <b className="mono">{name}</b>
        <small className="mono">{name.endsWith('mp4') ? 'video · sound' : 'photo'}</small>
      </span>
    </motion.div>
  );
}
