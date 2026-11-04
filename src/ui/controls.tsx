import { animate, motion, useMotionValue, useReducedMotion, useTransform, type PanInfo } from 'motion/react';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { lag, spring } from './motion';

/**
 * Segmented control. The indicator's two edges ride different springs: the edge
 * moving towards the target leads, the other trails, so the pill stretches slightly
 * on the way and settles at its new width.
 */
export function Seg<T extends string>({ value, options, onChange, label, disabled }: { value: T; options: { value: T; label: ReactNode }[]; onChange(v: T): void; label: string; disabled?: (v: T) => boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const left = useMotionValue(0);
  const right = useMotionValue(0);
  const width = useTransform(() => right.get() - left.get());
  const first = useRef(true);
  const reduced = useReducedMotion();

  useLayoutEffect(() => {
    const el = ref.current?.querySelector<HTMLButtonElement>(`button[data-v="${CSS.escape(value)}"]`);
    if (!el) return;
    const L = el.offsetLeft;
    const R = el.offsetLeft + el.offsetWidth;
    if (first.current || reduced) {
      left.set(L);
      right.set(R);
      first.current = false;
      return;
    }
    const goingRight = L > left.get();
    animate(left, L, goingRight ? lag : spring);
    animate(right, R, goingRight ? spring : lag);
  }, [value, options.length, left, right, reduced]);

  return (
    <div className="seg" role="radiogroup" aria-label={label} ref={ref}>
      <motion.span className="seg__pill" style={{ left, width, right: 'auto' }} aria-hidden />
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} data-v={o.value} className={o.value === value ? 'is-active' : ''} disabled={disabled?.(o.value)} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange(v: boolean): void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className="switch" onClick={() => onChange(!checked)} style={{ background: 'none', border: 0, padding: 0 }}>
      <span className="switch__track">
        <motion.span className="switch__knob" animate={{ x: checked ? 14 : 0 }} transition={spring} />
      </span>
      <span>{label}</span>
    </button>
  );
}

export function Stepper({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange(v: number): void; label: string }) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" aria-label={`Fewer ${label.toLowerCase()}`} disabled={value <= min} onClick={() => onChange(value - 1)}>
        −
      </button>
      <output aria-live="polite">{value}</output>
      <button type="button" aria-label={`More ${label.toLowerCase()}`} disabled={value >= max} onClick={() => onChange(value + 1)}>
        +
      </button>
    </div>
  );
}

/**
 * A feed post you can swipe like the real thing: direct-manipulation drag,
 * then a spring to the nearest slide (velocity decides close calls).
 */
export function PhoneCarousel({
  slides,
  index,
  onIndex,
  auto,
  label = 'Carousel preview',
}: {
  slides: ReactNode[];
  index?: number;
  onIndex?(i: number): void;
  /** Auto-advance every n ms (demo). Stops while the user drags. */
  auto?: number;
  label?: string;
}) {
  const post = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(300);
  const [inner, setInner] = useState(0);
  const i = index ?? inner;
  const setI = (n: number) => (onIndex ? onIndex(n) : setInner(n));
  const x = useMotionValue(0);
  const dragging = useRef(false);
  const count = slides.length;

  useEffect(() => {
    const el = post.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!dragging.current) animate(x, -i * w, spring);
  }, [i, w, x]);

  useEffect(() => {
    if (!auto || count < 2) return;
    const t = setInterval(() => {
      if (!dragging.current) setI((i + 1) % count);
    }, auto);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, count, i]);

  const onEnd = (_: unknown, info: PanInfo) => {
    dragging.current = false;
    const projected = -x.get() + -info.velocity.x * 0.18;
    const n = Math.max(0, Math.min(count - 1, Math.round(projected / w)));
    setI(n);
    animate(x, -n * w, spring);
  };

  return (
    <div className="phone__screen" aria-label={label} role="group">
      <div className="phone__bar">
        <span className="phone__avatar" />
        <span>your.handle</span>
      </div>
      <div className="phone__post" ref={post}>
        <motion.div
          className="phone__track"
          style={{ x }}
          drag={count > 1 ? 'x' : false}
          dragConstraints={{ left: -(count - 1) * w, right: 0 }}
          dragElastic={0.12}
          dragMomentum={false}
          onDragStart={() => (dragging.current = true)}
          onDragEnd={onEnd}
        >
          {slides}
        </motion.div>
      </div>
      <div className="dots" aria-hidden>
        {slides.map((_, k) => (
          <span key={k} className={k === i ? 'is-on' : ''} />
        ))}
      </div>
      <span className="sr-only" aria-live="polite">
        Slide {i + 1} of {count}
      </span>
    </div>
  );
}
