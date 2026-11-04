import { Audio } from '@remotion/media';
import type { CSSProperties, ReactNode } from 'react';
import { AbsoluteFill, Easing, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, MONO, SERIF, UI } from './theme';

export const FPS = 30;
/** Scene layout on the timeline (frames). Scenes overlap a little for crossfades. */
const S = {
  intro: { from: 0, dur: 84 },
  pano: { from: 72, dur: 176 },
  swipe: { from: 236, dur: 196 },
  clip: { from: 420, dur: 190 },
  export: { from: 598, dur: 140 },
  outro: { from: 726, dur: 120 },
};
export const DURATION = S.outro.from + S.outro.dur;

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const easeOut = Easing.bezier(0.2, 0.8, 0.2, 1);

/** UI spring: snappy with a barely visible overshoot (same feel as the app). */
function useSpring(delay: number, cfg: { damping?: number; stiffness?: number; mass?: number } = { damping: 16, stiffness: 170 }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping: 16, stiffness: 170, ...cfg } });
}

function Sfx({ at, src, volume = 0.6 }: { at: number; src: string; volume?: number }) {
  return (
    <Sequence from={at} durationInFrames={60} layout="none">
      <Audio src={staticFile(`sfx/${src}`)} volume={volume} />
    </Sequence>
  );
}

/** Wraps a scene with a short fade in/out so cuts become crossfades. */
function Scene({ dur, children }: { dur: number; children: ReactNode }) {
  const f = useCurrentFrame();
  const o = interpolate(f, [0, 12, dur - 12, dur], [0, 1, 1, 0], clamp);
  const blur = interpolate(f, [0, 12, dur - 12, dur], [8, 0, 0, 8], clamp);
  return <AbsoluteFill style={{ opacity: o, filter: `blur(${blur}px)` }}>{children}</AbsoluteFill>;
}

function Caption({ n, title, sub, delay = 4 }: { n: string; title: ReactNode; sub?: string; delay?: number }) {
  const a = useSpring(delay, { damping: 200 });
  const b = useSpring(delay + 10, { damping: 200 });
  return (
    <div style={{ position: 'absolute', left: 150, top: 120 }}>
      <div style={{ fontFamily: MONO, fontSize: 22, letterSpacing: '0.12em', color: C.red, opacity: a, transform: `translateY(${(1 - a) * 16}px)` }}>{n}</div>
      <div style={{ fontFamily: SERIF, fontSize: 84, lineHeight: 1, color: C.ink, marginTop: 10, opacity: a, transform: `translateY(${(1 - a) * 26}px)`, filter: `blur(${(1 - a) * 6}px)` }}>{title}</div>
      {sub && <div style={{ fontFamily: MONO, fontSize: 20, letterSpacing: '0.08em', color: C.muted, marginTop: 18, textTransform: 'uppercase', opacity: b }}>{sub}</div>}
    </div>
  );
}

/* ------------------------------------------------------------ */

function Intro() {
  const f = useCurrentFrame();
  const lamp = useSpring(0, { damping: 12 });
  const words = ['Slides', 'that'];
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            width: 16,
            height: 16,
            borderRadius: 8,
            margin: '0 auto 40px',
            background: C.red,
            transform: `scale(${lamp})`,
            boxShadow: `0 0 ${30 + Math.sin(f / 6) * 10}px 8px rgba(255,59,47,0.5)`,
          }}
        />
        <div style={{ fontFamily: SERIF, fontSize: 170, lineHeight: 0.9, color: C.ink }}>
          {words.map((w, i) => (
            <Word key={w} delay={6 + i * 5}>
              {w}&nbsp;
            </Word>
          ))}
        </div>
        <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 190, lineHeight: 1, color: C.red }}>
          <Word delay={20}>keep going.</Word>
        </div>
      </div>
    </AbsoluteFill>
  );
}

function Word({ delay, children }: { delay: number; children: ReactNode }) {
  const s = useSpring(delay, { damping: 14, stiffness: 140 });
  return <span style={{ display: 'inline-block', opacity: s, transform: `translateY(${(1 - s) * 60}px)`, filter: `blur(${(1 - s) * 10}px)` }}>{children}</span>;
}

/* ------------------------------------------------------------ */

const PANO_W = 1500;
const PANO_H = 625;
const SLICE = PANO_W / 3;

function Pano() {
  const f = useCurrentFrame();
  const reveal = interpolate(f, [8, 46], [100, 0], { ...clamp, easing: easeOut });
  const cut1 = useSpring(54, { damping: 22, stiffness: 220 });
  const cut2 = useSpring(66, { damping: 22, stiffness: 220 });
  const split = useSpring(118, { damping: 18, stiffness: 120 });
  const left = (1920 - PANO_W) / 2;
  const top = 340;
  return (
    <AbsoluteFill>
      <Caption n="01 — PICK" title="One wide photo." sub="3600 × 1500 · it fills three slides" />
      {[0, 1, 2].map((i) => {
        const dx = (i - 1) * 70 * split;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: left + i * SLICE + dx,
              top,
              width: SLICE,
              height: PANO_H,
              overflow: 'hidden',
              borderRadius: 6 * split,
              clipPath: `inset(0 ${Math.max(0, Math.min(100, (reveal - (2 - i) * 33.33) * 3))}% 0 0)`,
              boxShadow: split > 0.05 ? `0 30px 60px -30px rgba(0,0,0,${0.8 * split})` : undefined,
            }}
          >
            <Img src={staticFile(`img/slide-${i + 1}.jpg`)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        );
      })}
      {[1, 2].map((k) => {
        const s = k === 1 ? cut1 : cut2;
        const fade = 1 - split;
        return (
          <div
            key={k}
            style={{
              position: 'absolute',
              left: left + k * SLICE - 1,
              top: top - 40,
              width: 2,
              height: PANO_H + 80,
              background: C.red,
              transformOrigin: 'top',
              transform: `scaleY(${s})`,
              opacity: fade,
              boxShadow: '0 0 14px rgba(255,59,47,0.7)',
            }}
          />
        );
      })}
      {[0, 1, 2].map((i) => {
        const s = interpolate(f, [80 + i * 5, 92 + i * 5], [0, 1], clamp);
        return (
          <div
            key={i}
            style={{ position: 'absolute', left: left + i * SLICE + (i - 1) * 70 * split, top: top + PANO_H + 26, width: SLICE, textAlign: 'center', fontFamily: MONO, fontSize: 22, color: C.muted, opacity: s, letterSpacing: '0.1em' }}
          >
            {String(i + 1).padStart(2, '0')} · 1200×1500 px
          </div>
        );
      })}
      <Sfx at={54} src="click.wav" volume={0.5} />
      <Sfx at={66} src="click.wav" volume={0.5} />
      <Sfx at={116} src="whoosh.wav" volume={0.35} />
    </AbsoluteFill>
  );
}

/* ------------------------------------------------------------ */

const PHONE = { x: 1150, y: 120, w: 400, h: 840 };
const POST_W = PHONE.w - 28;
const POST_H = (POST_W * 5) / 4;

function Swipe() {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const into = useSpring(4, { damping: 20, stiffness: 110 });
  const phone = useSpring(16, { damping: 18, stiffness: 140 });
  // Swipes: index goes 0 → 1 → 2 with springs.
  const s1 = spring({ frame: f - 92, fps, config: { damping: 16, stiffness: 150 } });
  const s2 = spring({ frame: f - 138, fps, config: { damping: 16, stiffness: 150 } });
  const index = s1 + s2;
  const postX = PHONE.x + 14;
  const postY = PHONE.y + 160;

  // Start: the three slices as they ended in the previous scene.
  const startLeft = (1920 - PANO_W) / 2;
  const scale = interpolate(into, [0, 1], [1, POST_W / SLICE]);
  const slides = [0, 1, 2].map((i) => {
    const x0 = startLeft + i * SLICE + (i - 1) * 70;
    const y0 = 340;
    const x1 = postX + (i - index) * POST_W;
    const y1 = postY;
    return { x: interpolate(into, [0, 1], [x0, x1]), y: interpolate(into, [0, 1], [y0, y1]) };
  });

  // Finger: drags left on each swipe.
  const fingerAt = (start: number) => interpolate(f, [start - 14, start + 10], [0, 1], { ...clamp, easing: Easing.inOut(Easing.quad) });
  const d1 = fingerAt(92);
  const d2 = fingerAt(138);
  const dragging = (f > 76 && f < 104) || (f > 122 && f < 150);
  const fx = PHONE.x + PHONE.w * 0.72 - (f < 115 ? d1 : d2) * 220;
  const fy = postY + POST_H * 0.55;
  const fingerOpacity = interpolate(f, [70, 78, 150, 158], [0, 1, 1, 0], clamp);

  const track = (dim: boolean) =>
    slides.map((p, i) => (
      <Img
        key={i}
        src={staticFile(`img/slide-${i + 1}.jpg`)}
        style={{
          position: 'absolute',
          left: p.x - (dim ? 0 : postX),
          top: p.y - (dim ? 0 : postY),
          width: SLICE * scale,
          height: PANO_H * scale,
          opacity: dim ? 0.18 + (1 - into) * 0.82 : 1,
          borderRadius: dim ? 6 : 0,
        }}
      />
    ));

  return (
    <AbsoluteFill>
      <Caption n="02 — SWIPE" title={<>It keeps going.</>} sub="one photo · three posts · no seams" />
      {/* Dim strip outside the phone shows where the next slides come from. */}
      {track(true)}
      <div
        style={{
          position: 'absolute',
          left: PHONE.x,
          top: PHONE.y,
          width: PHONE.w,
          height: PHONE.h,
          borderRadius: 56,
          background: '#050505',
          border: `1px solid ${C.line}`,
          boxShadow: '0 60px 120px -40px rgba(0,0,0,0.9), 0 0 0 8px #111113',
          opacity: phone,
          transform: `scale(${0.94 + 0.06 * phone})`,
        }}
      >
        <div style={{ position: 'absolute', left: 14, top: 104, display: 'flex', alignItems: 'center', gap: 10, fontFamily: UI, fontSize: 18, color: C.muted }}>
          <div style={{ width: 30, height: 30, borderRadius: 15, background: `linear-gradient(135deg, ${C.red}, #FFB547)` }} />
          your.handle
        </div>
        <div style={{ position: 'absolute', left: 14, top: 160, width: POST_W, height: POST_H, overflow: 'hidden', background: '#000' }}>{track(false)}</div>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 160 + POST_H + 22, display: 'flex', justifyContent: 'center', gap: 8 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ width: 9, height: 9, borderRadius: 5, background: Math.round(index) === i ? C.video : '#444', transform: `scale(${Math.round(index) === i ? 1.25 : 1})` }} />
          ))}
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          left: fx - 30,
          top: fy - 30,
          width: 60,
          height: 60,
          borderRadius: 30,
          background: 'rgba(237,235,230,0.85)',
          boxShadow: '0 0 0 10px rgba(237,235,230,0.18)',
          opacity: fingerOpacity,
          transform: `scale(${dragging ? 0.85 : 1})`,
        }}
      />
      <Sfx at={4} src="whoosh.wav" volume={0.3} />
      <Sfx at={90} src="whoosh.wav" volume={0.4} />
      <Sfx at={136} src="whoosh.wav" volume={0.4} />
    </AbsoluteFill>
  );
}

/* ------------------------------------------------------------ */

const STRIP = { x: 0, y: 0, w: 1620, h: 675 };
/** The strip group is scaled to leave room for the caption. */
const GROUP = { scale: 0.82, x: (1920 - 1620 * 0.82) / 2, y: 400 };
const SLOT = { x: 345, y: 150, w: 390, h: 450 }; // in strip coordinates (template at 50 %)

function Clip() {
  const f = useCurrentFrame();
  const enter = useSpring(0, { damping: 200 });
  const cursorT = interpolate(f, [16, 58], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const press = interpolate(f, [62, 66, 72], [1, 0.86, 1], clamp);
  const pill = interpolate(f, [66, 74], [1, 0], clamp);
  const clipIn = useSpring(70, { damping: 20, stiffness: 120 });
  const pillX = STRIP.x + SLOT.x + SLOT.w / 2;
  const pillY = STRIP.y + SLOT.y + SLOT.h / 2;
  const cx = interpolate(cursorT, [0, 1], [1600, pillX + 10]);
  const cy = interpolate(cursorT, [0, 1], [760, pillY + 12]);
  const cursorOpacity = interpolate(f, [12, 18, 92, 104], [0, 1, 1, 0], clamp);
  // The "clip": dunes with a slow pan and a drifting heat shimmer, so it reads as video.
  const pan = interpolate(f, [70, 190], [0, -70]);
  const zoom = interpolate(f, [70, 190], [1.08, 1.16]);
  const tc = Math.max(0, (f - 70) / 30);
  return (
    <AbsoluteFill>
      <Caption n="03 — MIX" title="Drop a clip across the seam." sub="photo + video in the same post" />
      <div style={{ position: 'absolute', left: GROUP.x, top: GROUP.y, width: STRIP.w, height: STRIP.h + 120, transform: `scale(${GROUP.scale})`, transformOrigin: 'top left' }}>
      <div style={{ position: 'absolute', left: STRIP.x, top: STRIP.y, width: STRIP.w, height: STRIP.h, background: '#141414', opacity: enter, transform: `translateY(${(1 - enter) * 30}px)` }}>
        <div style={{ position: 'absolute', left: SLOT.x, top: SLOT.y, width: SLOT.w, height: SLOT.h, overflow: 'hidden', background: '#0b0b0b' }}>
          <div style={{ position: 'absolute', inset: 0, opacity: clipIn, transform: `scale(${0.9 + 0.1 * clipIn})` }}>
            <Img src={staticFile('img/clip.jpg')} style={{ position: 'absolute', left: pan, top: -20, width: SLOT.w * zoom + 80, height: SLOT.h * zoom + 40, objectFit: 'cover' }} />
            {Array.from({ length: 9 }, (_, k) => (
              <div
                key={k}
                style={{
                  position: 'absolute',
                  left: ((k * 97 + f * (1.5 + (k % 3))) % (SLOT.w + 120)) - 60,
                  top: 240 + k * 22,
                  width: 60 + (k % 4) * 20,
                  height: 2,
                  background: 'rgba(255,236,210,0.35)',
                  borderRadius: 2,
                }}
              />
            ))}
          </div>
        </div>
        <Img src={staticFile('img/doorway.png')} style={{ position: 'absolute', inset: 0, width: STRIP.w, height: STRIP.h }} />
        {[1, 2].map((k) => (
          <div key={k} style={{ position: 'absolute', left: k * 540 - 1, top: -30, width: 2, height: STRIP.h + 60, background: C.red, opacity: 0.85 }} />
        ))}
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ position: 'absolute', left: i * 540, top: -62, width: 540, textAlign: 'center', fontFamily: MONO, fontSize: 20, color: C.muted, letterSpacing: '0.1em' }}>
            {String(i + 1).padStart(2, '0')}
          </div>
        ))}
        {[0, 1].map((i) => {
          const b = interpolate(f, [92 + i * 7, 102 + i * 7], [0, 1], clamp);
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: i * 540 + 20,
                top: STRIP.h + 22,
                padding: '6px 14px',
                border: `1px solid rgba(143,179,255,0.5)`,
                borderRadius: 99,
                fontFamily: MONO,
                fontSize: 18,
                color: C.video,
                letterSpacing: '0.08em',
                opacity: b,
                transform: `scale(${0.8 + 0.2 * b})`,
              }}
            >
              {String(i + 1).padStart(2, '0')}.MP4 · 6.0 S
            </div>
          );
        })}
        <div style={{ position: 'absolute', left: 2 * 540 + 20, top: STRIP.h + 22, padding: '6px 14px', border: `1px solid ${C.line}`, borderRadius: 99, fontFamily: MONO, fontSize: 18, color: C.muted, opacity: interpolate(f, [106, 116], [0, 1], clamp) }}>
          03.JPG
        </div>
        {f > 74 && (
          <div style={{ position: 'absolute', left: SLOT.x + 14, top: SLOT.y + 14, fontFamily: MONO, fontSize: 16, color: C.ink, display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ width: 9, height: 9, borderRadius: 5, background: C.red, opacity: Math.floor(f / 10) % 2 ? 1 : 0.35 }} />
            00:0{Math.min(9, Math.floor(tc))}
          </div>
        )}
      </div>
      {/* "+ Clip" pill */}
      <div
        style={{
          position: 'absolute',
          left: pillX,
          top: pillY,
          transform: `translate(-50%, -50%) scale(${press * (0.6 + 0.4 * pill)})`,
          opacity: pill * enter,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 22px',
          borderRadius: 99,
          background: f > 58 ? C.red : 'rgba(10,10,10,0.75)',
          border: `1px solid ${f > 58 ? C.red : 'rgba(255,255,255,0.4)'}`,
          color: f > 58 ? '#0E0E0F' : C.ink,
          fontFamily: UI,
          fontWeight: 600,
          fontSize: 24,
        }}
      >
        + Clip
      </div>
      <Cursor x={cx} y={cy} opacity={cursorOpacity} pressed={f > 60 && f < 70} />
      </div>
      <Sfx at={64} src="click.wav" />
      <Sfx at={72} src="pop.wav" volume={0.45} />
      <Sfx at={93} src="pop.wav" volume={0.3} />
      <Sfx at={100} src="pop.wav" volume={0.3} />
    </AbsoluteFill>
  );
}

function Cursor({ x, y, opacity, pressed }: { x: number; y: number; opacity: number; pressed: boolean }) {
  return (
    <svg width={40} height={48} viewBox="0 0 20 24" style={{ position: 'absolute', left: x, top: y, opacity, transform: `scale(${pressed ? 0.88 : 1})`, transformOrigin: 'top left', filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.6))' }}>
      <path d="M2 1.5 L2 19 L6.6 14.8 L9.6 21.5 L12.6 20.2 L9.7 13.6 L16 13.6 Z" fill={C.ink} stroke="#0E0E0F" strokeWidth={1.2} strokeLinejoin="round" />
    </svg>
  );
}

/* ------------------------------------------------------------ */

function Export() {
  const f = useCurrentFrame();
  const enter = useSpring(0, { damping: 18, stiffness: 160 });
  const running = f >= 36;
  const done = f >= 98;
  const press = interpolate(f, [30, 34, 40], [1, 0.92, 1], clamp);
  const w = interpolate(f, [34, 46], [330, 560], { ...clamp, easing: easeOut });
  const progress = interpolate(f, [42, 96], [0, 1], { ...clamp, easing: Easing.inOut(Easing.sin) });
  const doneS = useSpring(98, { damping: 14, stiffness: 180 });
  const cursorT = interpolate(f, [8, 28], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const bx = 960;
  const by = 520;
  const files = [
    { name: '01.mp4', video: true },
    { name: '02.mp4', video: true },
    { name: '03.jpg', video: false },
  ];
  return (
    <AbsoluteFill>
      <Caption n="04 — EXPORT" title="On your device." sub="no upload · no account · no watermark" />
      <div
        style={{
          position: 'absolute',
          left: bx - w / 2,
          top: by - 42,
          width: w,
          height: 84,
          borderRadius: 99,
          overflow: 'hidden',
          background: done ? C.ok : running ? C.surface3 : C.red,
          transform: `scale(${press * (0.8 + 0.2 * enter)}) scale(${1 + doneS * 0.04 - (done ? 0.04 : 0)})`,
          opacity: enter,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: UI,
          fontWeight: 600,
          fontSize: 30,
          color: done ? '#0B1A12' : running ? C.ink : '#0E0E0F',
        }}
      >
        {running && !done && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${progress * 100}%`, background: 'rgba(255,59,47,0.45)' }} />}
        <span style={{ position: 'relative', fontFamily: running && !done ? MONO : UI, fontSize: running && !done ? 26 : 30 }}>
          {done ? '✓  Files ready' : running ? `${Math.round(progress * 100)}%  Encoding ${progress < 0.45 ? '01' : progress < 0.9 ? '02' : '03'}` : '↑  Export 3 files'}
        </span>
      </div>
      {files.map((file, i) => {
        const s = spring({ frame: f - (104 + i * 6), fps: FPS, config: { damping: 15, stiffness: 160 } });
        const x = interpolate(s, [0, 1], [bx, bx + (i - 1) * 300]);
        const y = interpolate(s, [0, 1], [by, by + 190]);
        return (
          <div
            key={file.name}
            style={{
              position: 'absolute',
              left: x - 125,
              top: y - 50,
              width: 250,
              height: 100,
              borderRadius: 18,
              background: C.surface,
              border: `1px solid ${C.line}`,
              opacity: s,
              transform: `scale(${0.6 + 0.4 * s}) rotate(${(1 - s) * (i - 1) * 8}deg)`,
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              padding: '0 20px',
            }}
          >
            <Img src={staticFile(`img/slide-${i + 1}.jpg`)} style={{ width: 52, height: 65, objectFit: 'cover', borderRadius: 4 }} />
            <div>
              <div style={{ fontFamily: MONO, fontSize: 24, color: C.ink }}>{file.name}</div>
              <div style={{ fontFamily: MONO, fontSize: 15, color: file.video ? C.video : C.muted, letterSpacing: '0.08em', marginTop: 4 }}>{file.video ? 'VIDEO · SOUND' : 'PHOTO'}</div>
            </div>
          </div>
        );
      })}
      <Cursor x={interpolate(cursorT, [0, 1], [1500, bx + 40])} y={interpolate(cursorT, [0, 1], [900, by + 10])} opacity={interpolate(f, [6, 12, 40, 50], [0, 1, 1, 0], clamp)} pressed={f > 30 && f < 38} />
      <Sfx at={32} src="click.wav" />
      <Sfx at={98} src="chime.wav" volume={0.55} />
      <Sfx at={104} src="pop.wav" volume={0.25} />
      <Sfx at={110} src="pop.wav" volume={0.25} />
      <Sfx at={116} src="pop.wav" volume={0.25} />
    </AbsoluteFill>
  );
}

/* ------------------------------------------------------------ */

const TEMPLATES = ['horizon-line', 'postcard', 'window-seat', 'doorway', 'contact-sheet', 'drying-line', 'issue-01', 'field-notes'];

function Outro() {
  const f = useCurrentFrame();
  const a = useSpring(10, { damping: 200 });
  const b = useSpring(22, { damping: 200 });
  const drift = interpolate(f, [0, 120], [0, -220]);
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', top: 90, left: 0, right: 0, display: 'flex', gap: 28, transform: `translateX(${drift}px)`, opacity: 0.35, paddingLeft: 120 }}>
        {TEMPLATES.concat(TEMPLATES.slice(0, 3)).map((t, i) => {
          const s = spring({ frame: f - i * 3, fps: FPS, config: { damping: 18, stiffness: 120 } });
          return <Img key={i} src={staticFile(`img/tpl-${t}.jpg`)} style={{ width: 216, height: 270, borderRadius: 10, opacity: s, transform: `translateY(${(1 - s) * 40}px) rotate(${(i % 2 ? 2 : -2) * s}deg)` }} />;
        })}
      </div>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(14,14,15,0.2) 0%, rgba(14,14,15,0.9) 45%, #0E0E0F 70%)' }} />
      <div style={{ position: 'relative', textAlign: 'center', marginTop: 200 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 22, opacity: a, transform: `translateY(${(1 - a) * 20}px)` }}>
          <div style={{ width: 18, height: 18, borderRadius: 9, background: C.red, boxShadow: '0 0 30px 6px rgba(255,59,47,0.55)' }} />
          <div style={{ fontFamily: MONO, fontSize: 64, letterSpacing: '0.32em', color: C.ink }}>CLLGE</div>
        </div>
        <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 74, color: C.ink, marginTop: 26, opacity: b }}>Slides that keep going.</div>
        <div style={{ fontFamily: MONO, fontSize: 24, letterSpacing: '0.12em', color: C.muted, marginTop: 34, opacity: b }}>FREE · OPEN SOURCE · TXGRX.GITHUB.IO/CLLGE</div>
      </div>
    </AbsoluteFill>
  );
}

/* ------------------------------------------------------------ */

/** Film grain (changes every frame) and a soft vignette, like the app. */
function Grain() {
  const f = useCurrentFrame();
  const style: CSSProperties = {
    position: 'absolute',
    inset: -100,
    opacity: 0.07,
    backgroundImage:
      "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .9 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
    transform: `translate(${(f * 37) % 100}px, ${(f * 53) % 100}px)`,
  };
  return (
    <>
      <div style={style} />
      <AbsoluteFill style={{ background: 'radial-gradient(120% 90% at 50% 40%, transparent 55%, rgba(0,0,0,0.55))' }} />
    </>
  );
}

export function HowItWorks() {
  const f = useCurrentFrame();
  const end = interpolate(f, [DURATION - 14, DURATION], [1, 0], clamp);
  const scenes: [keyof typeof S, () => ReactNode][] = [
    ['intro', () => <Intro />],
    ['pano', () => <Pano />],
    ['swipe', () => <Swipe />],
    ['clip', () => <Clip />],
    ['export', () => <Export />],
    ['outro', () => <Outro />],
  ];
  return (
    <AbsoluteFill style={{ background: C.bg, opacity: end }}>
      <Audio src={staticFile('sfx/bed.m4a')} volume={0.55} />
      {scenes.map(([k, render]) => (
        <Sequence key={k} from={S[k].from} durationInFrames={S[k].dur} premountFor={30}>
          <Scene dur={S[k].dur}>{render()}</Scene>
        </Sequence>
      ))}
      <Grain />
    </AbsoluteFill>
  );
}
