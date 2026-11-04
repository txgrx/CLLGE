import type { Transition, Variants } from 'motion/react';

/** Snappy spring with a barely visible overshoot: the default for UI. */
export const spring: Transition = { type: 'spring', stiffness: 420, damping: 34, mass: 0.9 };
/** Slower spring for big surfaces (panels, screens). */
export const soft: Transition = { type: 'spring', stiffness: 260, damping: 30 };
/** Trailing edge of a stretching indicator: lags a little behind the leading edge. */
export const lag: Transition = { type: 'spring', stiffness: 260, damping: 28 };

/** Content swap: fade with a short blur instead of a hard cut. */
export const blurSwap: Variants = {
  initial: { opacity: 0, filter: 'blur(4px)' },
  animate: { opacity: 1, filter: 'blur(0px)', transition: { duration: 0.22 } },
  exit: { opacity: 0, filter: 'blur(4px)', transition: { duration: 0.14 } },
};

/** Staggered reveal for lists and grids. */
export const listParent: Variants = { animate: { transition: { staggerChildren: 0.04, delayChildren: 0.05 } } };
export const listItem: Variants = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0, transition: spring },
};
