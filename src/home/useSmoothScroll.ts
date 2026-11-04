import Lenis from 'lenis';
import { useEffect } from 'react';

/**
 * Inertial scrolling for the home page (desktop wheels/trackpads). Native scrolling
 * is kept on touch devices and when the system asks for reduced motion.
 */
export function useSmoothScroll(): void {
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || matchMedia('(pointer: coarse)').matches) return;
    const lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 0.9 });
    let raf = 0;
    const loop = (t: number) => {
      lenis.raf(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
    };
  }, []);
}
