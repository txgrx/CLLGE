import { motion, useMotionValue, useSpring } from 'motion/react';
import { useEffect, useState } from 'react';

/**
 * Desktop-only companion cursor: a red dot that follows instantly and a ring that
 * trails on a spring, growing (with a label) over [data-cursor] elements. The
 * system cursor stays visible.
 */
export function Cursor() {
  const [enabled] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(pointer: fine)').matches && !matchMedia('(prefers-reduced-motion: reduce)').matches);
  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const rx = useSpring(x, { stiffness: 380, damping: 32, mass: 0.5 });
  const ry = useSpring(y, { stiffness: 380, damping: 32, mass: 0.5 });
  const [label, setLabel] = useState<string | null>(null);
  const [down, setDown] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const move = (e: PointerEvent) => {
      x.set(e.clientX);
      y.set(e.clientY);
      const t = (e.target as Element | null)?.closest?.('[data-cursor], a, button');
      setLabel(t ? (t.getAttribute('data-cursor') ?? '') : null);
    };
    const d = () => setDown(true);
    const u = () => setDown(false);
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerdown', d);
    window.addEventListener('pointerup', u);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerdown', d);
      window.removeEventListener('pointerup', u);
    };
  }, [enabled, x, y]);

  if (!enabled) return null;
  const big = label !== null && label !== '';
  return (
    <>
      <motion.div className="cur-dot" style={{ x, y }} aria-hidden />
      <motion.div className="cur-ring" style={{ x: rx, y: ry }} animate={{ width: big ? 84 : label === '' ? 44 : 30, height: big ? 84 : label === '' ? 44 : 30, scale: down ? 0.85 : 1 }} transition={{ type: 'spring', stiffness: 300, damping: 24 }} aria-hidden>
        {big && <span className="mono">{label}</span>}
      </motion.div>
    </>
  );
}
