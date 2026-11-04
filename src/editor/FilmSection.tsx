import { motion, useInView } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../ui/Icon';
import { spring } from '../ui/motion';

/** The 28-second demo film (made in code with Remotion, see video/). Plays muted when in view. */
export function FilmSection() {
  const frame = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const inView = useInView(frame, { amount: 0.45 });
  const [muted, setMuted] = useState(true);
  const base = import.meta.env.BASE_URL;

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (inView) void v.play().catch(() => undefined);
    else v.pause();
  }, [inView]);

  return (
    <section className="section film-section" aria-labelledby="film-h">
      <div className="section__head">
        <motion.h2 className="section__title" id="film-h" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={spring}>
          <small className="mono">28 seconds · made with code</small>
          See it move
        </motion.h2>
      </div>
      <motion.div
        ref={frame}
        className="film-frame"
        initial={{ opacity: 0, y: 40, scale: 0.97 }}
        whileInView={{ opacity: 1, y: 0, scale: 1 }}
        viewport={{ once: true, amount: 0.25 }}
        transition={spring}
      >
        <video
          ref={video}
          src={`${base}media/how-it-works.mp4`}
          poster={`${base}media/how-it-works.jpg`}
          muted={muted}
          loop
          playsInline
          preload="metadata"
          aria-label="Demo film: a panorama is split into three slides, swiped on a phone, a clip is dropped across a seam, and the carousel is exported."
        />
        <button
          className="btn btn--sm film-frame__sound"
          onClick={() => {
            const v = video.current;
            setMuted((m) => !m);
            if (v && muted) {
              v.currentTime = 0;
              void v.play();
            }
          }}
          aria-pressed={!muted}
        >
          <Icon name={muted ? 'mute' : 'sound'} size={16} /> {muted ? 'Sound off' : 'Sound on'}
        </button>
      </motion.div>
    </section>
  );
}
