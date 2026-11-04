/**
 * Undo/redo over immutable snapshots. A drag is one gesture: begin() remembers the
 * starting snapshot, intermediate updates do not touch history, end() pushes once.
 */
export interface History<T> {
  past: T[];
  future: T[];
  gestureStart: T | null;
}

export const HISTORY_LIMIT = 100;

export function emptyHistory<T>(): History<T> {
  return { past: [], future: [], gestureStart: null };
}

export function record<T>(h: History<T>, before: T): History<T> {
  const past = [...h.past, before];
  if (past.length > HISTORY_LIMIT) past.shift();
  return { past, future: [], gestureStart: h.gestureStart };
}

export function beginGesture<T>(h: History<T>, current: T): History<T> {
  return h.gestureStart ? h : { ...h, gestureStart: current };
}

export function endGesture<T>(h: History<T>, current: T): History<T> {
  if (!h.gestureStart) return h;
  const start = h.gestureStart;
  const cleared = { ...h, gestureStart: null };
  return start === current ? cleared : record(cleared, start);
}

export function undo<T>(h: History<T>, current: T): { history: History<T>; value: T } | null {
  if (!h.past.length) return null;
  const value = h.past[h.past.length - 1];
  return { history: { past: h.past.slice(0, -1), future: [current, ...h.future], gestureStart: null }, value };
}

export function redo<T>(h: History<T>, current: T): { history: History<T>; value: T } | null {
  if (!h.future.length) return null;
  const [value, ...future] = h.future;
  return { history: { past: [...h.past, current], future, gestureStart: null }, value };
}
