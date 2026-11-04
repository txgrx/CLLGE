import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { fitMedia, layerBounds, layerContainsPoint, layerCorners, type Point } from '../model/geometry';
import { updateLayer } from '../model/project';
import type { Layer, Project } from '../model/types';
import { drawRegion } from '../render/drawWindow';
import { library } from '../media/library';
import { useEditor } from './store';

const PAD = 48; // screen px around the strip
const SNAP_PX = 8; // snap tolerance in *screen* pixels, converted with the zoom

interface Props {
  onDropFiles(files: File[], pageIndex: number): void;
  cropMode: boolean;
  setCropMode(v: boolean): void;
}

type Gesture =
  | { kind: 'move'; id: string; start: Point; orig: Layer }
  | { kind: 'resize'; id: string; corner: number; orig: Layer; free: boolean }
  | { kind: 'rotate'; id: string; orig: Layer }
  | { kind: 'crop'; id: string; start: Point; orig: Layer }
  | { kind: 'pan'; startClient: Point; startScroll: Point }
  | { kind: 'pinch'; startDist: number; startZoom: number };

interface Guides {
  x: number[];
  y: number[];
}

export function Stage({ onDropFiles, cropMode, setCropMode }: Props) {
  const project = useEditor((s) => s.project)!;
  const zoom = useEditor((s) => s.zoom);
  const selection = useEditor((s) => s.selection);
  const scroller = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const pointers = useRef(new Map<number, Point>());
  const [guides, setGuides] = useState<Guides>({ x: [], y: [] });
  const [tick, setTick] = useState(0);
  const { pageWidth: W, pageHeight: H } = project.canvas;
  const N = project.pages.length;
  const worldW = N * W;

  /* ---------- drawing: only the visible part of the strip ---------- */
  const raf = useRef(0);
  const draw = useCallback(() => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const sc = scroller.current;
      const cv = canvas.current;
      if (!sc || !cv) return;
      const dpr = window.devicePixelRatio || 1;
      const vw = sc.clientWidth;
      const vh = sc.clientHeight;
      if (cv.width !== Math.round(vw * dpr) || cv.height !== Math.round(vh * dpr)) {
        cv.width = Math.round(vw * dpr);
        cv.height = Math.round(vh * dpr);
        cv.style.width = `${vw}px`;
        cv.style.height = `${vh}px`;
      }
      const ctx = cv.getContext('2d')!;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      const p = useEditor.getState().project;
      if (!p) return;
      const z = useEditor.getState().zoom;
      const x0 = Math.max(0, (sc.scrollLeft - PAD) / z);
      const y0 = Math.max(0, (sc.scrollTop - PAD) / z);
      const x1 = Math.min(p.pages.length * p.canvas.pageWidth, (sc.scrollLeft + vw - PAD) / z);
      const y1 = Math.min(p.canvas.pageHeight, (sc.scrollTop + vh - PAD) / z);
      if (x1 <= x0 || y1 <= y0) return;
      drawRegion(ctx, p, { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }, 0, library.sources(), {
        scale: z * dpr,
        originX: (PAD + x0 * z - sc.scrollLeft) * dpr,
        originY: (PAD + y0 * z - sc.scrollTop) * dpr,
        showAllClips: true,
      });
    });
  }, []);

  useEffect(() => library.onChange(draw), [draw]);
  useEffect(draw, [draw, project, zoom, tick]);
  useEffect(() => {
    const ro = new ResizeObserver(() => setTick((t) => t + 1));
    if (scroller.current) ro.observe(scroller.current);
    return () => ro.disconnect();
  }, []);

  /* ---------- zoom helpers ---------- */
  const zoomAt = useCallback((newZoom: number, clientX: number, clientY: number) => {
    const sc = scroller.current;
    if (!sc) return;
    const r = sc.getBoundingClientRect();
    const z = useEditor.getState().zoom;
    const wx = (clientX - r.left + sc.scrollLeft - PAD) / z;
    const wy = (clientY - r.top + sc.scrollTop - PAD) / z;
    useEditor.getState().setZoom(newZoom);
    const nz = useEditor.getState().zoom;
    requestAnimationFrame(() => {
      sc.scrollLeft = wx * nz + PAD - (clientX - r.left);
      sc.scrollTop = wy * nz + PAD - (clientY - r.top);
    });
  }, []);

  useEffect(() => {
    const sc = scroller.current;
    if (!sc) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      zoomAt(useEditor.getState().zoom * Math.exp(-e.deltaY * 0.002), e.clientX, e.clientY);
    };
    sc.addEventListener('wheel', onWheel, { passive: false });
    return () => sc.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  // Fit the whole strip on first open.
  useLayoutEffect(() => {
    const sc = scroller.current;
    if (!sc) return;
    const fit = Math.min((sc.clientWidth - PAD * 2) / worldW, (sc.clientHeight - PAD * 2) / H);
    useEditor.getState().setZoom(Math.max(0.05, Math.min(1, fit)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  /* ---------- pointer interaction ---------- */
  const toWorld = (clientX: number, clientY: number): Point => {
    const r = world.current!.getBoundingClientRect();
    const z = useEditor.getState().zoom;
    return { x: (clientX - r.left - PAD) / z, y: (clientY - r.top - PAD) / z };
  };

  const hitTest = (p: Project, pt: Point): Layer | undefined => {
    for (let i = p.layers.length - 1; i >= 0; i--) {
      const l = p.layers[i];
      if (l.visible && !l.locked && layerContainsPoint(l, pt)) return l;
    }
    return undefined;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const st = useEditor.getState();
    const p = st.project!;
    if (pointers.current.size === 2) {
      // Second finger: pinch-zoom the view; cancel any edit gesture.
      if (gesture.current && gesture.current.kind !== 'pan') st.endGesture();
      const [a, b] = [...pointers.current.values()];
      gesture.current = { kind: 'pinch', startDist: Math.hypot(a.x - b.x, a.y - b.y), startZoom: st.zoom };
      return;
    }
    const pt = toWorld(e.clientX, e.clientY);
    const handle = (e.target as Element).closest('[data-handle]')?.getAttribute('data-handle');
    const selected = st.selection.length === 1 ? p.layers.find((l) => l.id === st.selection[0]) : undefined;
    if (handle && selected && !selected.locked) {
      st.beginGesture();
      if (handle === 'rotate') gesture.current = { kind: 'rotate', id: selected.id, orig: selected };
      else gesture.current = { kind: 'resize', id: selected.id, corner: Number(handle), orig: selected, free: e.altKey || selected.type === 'text' };
      return;
    }
    if (cropMode && selected && (selected.type === 'image' || selected.type === 'video') && layerContainsPoint(selected, pt)) {
      st.beginGesture();
      gesture.current = { kind: 'crop', id: selected.id, start: pt, orig: selected };
      return;
    }
    const hit = hitTest(p, pt);
    if (hit) {
      if (cropMode && hit.id !== selected?.id) setCropMode(false);
      if (!st.selection.includes(hit.id)) st.select([hit.id]);
      st.beginGesture();
      gesture.current = { kind: 'move', id: hit.id, start: pt, orig: hit };
    } else {
      st.select([]);
      setCropMode(false);
      const sc = scroller.current!;
      gesture.current = { kind: 'pan', startClient: { x: e.clientX, y: e.clientY }, startScroll: { x: sc.scrollLeft, y: sc.scrollTop } };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    const st = useEditor.getState();
    const z = st.zoom;
    if (g.kind === 'pinch') {
      const [a, b] = [...pointers.current.values()];
      if (!a || !b) return;
      zoomAt(g.startZoom * (Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, g.startDist)), (a.x + b.x) / 2, (a.y + b.y) / 2);
      return;
    }
    if (g.kind === 'pan') {
      const sc = scroller.current!;
      sc.scrollLeft = g.startScroll.x - (e.clientX - g.startClient.x);
      sc.scrollTop = g.startScroll.y - (e.clientY - g.startClient.y);
      return;
    }
    const pt = toWorld(e.clientX, e.clientY);
    const p = st.project!;
    if (g.kind === 'move') {
      let dx = pt.x - g.start.x;
      let dy = pt.y - g.start.y;
      const moved = { ...g.orig, x: g.orig.x + dx, y: g.orig.y + dy };
      const snap = e.shiftKey ? null : computeSnap(p, moved, SNAP_PX / z);
      if (snap) {
        dx += snap.dx;
        dy += snap.dy;
      }
      setGuides(snap ? { x: snap.gx, y: snap.gy } : { x: [], y: [] });
      st.apply((pp) => updateLayer(pp, g.id, { x: Math.round(g.orig.x + dx), y: Math.round(g.orig.y + dy) }));
    } else if (g.kind === 'resize') {
      st.apply((pp) => updateLayer(pp, g.id, resizeFromCorner(g.orig, g.corner, pt, g.free !== e.altKey ? true : false)));
    } else if (g.kind === 'rotate') {
      const c = { x: g.orig.x + g.orig.width / 2, y: g.orig.y + g.orig.height / 2 };
      let deg = (Math.atan2(pt.y - c.y, pt.x - c.x) * 180) / Math.PI + 90;
      const step = e.shiftKey ? 15 : 0;
      if (step) deg = Math.round(deg / step) * step;
      else if (Math.abs(deg - Math.round(deg / 90) * 90) < 3) deg = Math.round(deg / 90) * 90;
      deg = ((((deg + 180) % 360) + 360) % 360) - 180;
      st.apply((pp) => updateLayer(pp, g.id, { rotation: Math.round(deg * 10) / 10 }));
    } else if (g.kind === 'crop') {
      const l = g.orig;
      if (l.type !== 'image' && l.type !== 'video') return;
      const asset = p.assets.find((a) => a.id === l.assetId);
      if (!asset) return;
      const r = fitMedia(asset.width, asset.height, l.width, l.height, l.fit, l.crop);
      const overX = l.width - r.width;
      const overY = l.height - r.height;
      // Drag in the layer's own (rotated) frame.
      const a = (-l.rotation * Math.PI) / 180;
      const ddx = pt.x - g.start.x;
      const ddy = pt.y - g.start.y;
      const lx = ddx * Math.cos(a) - ddy * Math.sin(a);
      const ly = ddx * Math.sin(a) + ddy * Math.cos(a);
      const focusX = overX !== 0 ? clamp01(l.crop.focusX + lx / overX) : l.crop.focusX;
      const focusY = overY !== 0 ? clamp01(l.crop.focusY + ly / overY) : l.crop.focusY;
      st.apply((pp) => updateLayer(pp, g.id, { crop: { ...l.crop, focusX, focusY } } as Partial<Layer>));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (g && g.kind !== 'pan' && g.kind !== 'pinch') useEditor.getState().endGesture();
    if (pointers.current.size === 0 || g?.kind === 'pinch') gesture.current = null;
    setGuides({ x: [], y: [] });
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const st = useEditor.getState();
    const hit = hitTest(st.project!, toWorld(e.clientX, e.clientY));
    if (hit && (hit.type === 'image' || hit.type === 'video')) {
      st.select([hit.id]);
      setCropMode(true);
    }
  };

  /* ---------- drop ---------- */
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = [...e.dataTransfer.files];
    if (!files.length) return;
    const pt = toWorld(e.clientX, e.clientY);
    onDropFiles(files, Math.min(N - 1, Math.max(0, Math.floor(pt.x / W))));
  };

  const selected = selection.length === 1 ? project.layers.find((l) => l.id === selection[0]) : undefined;
  const hs = 8 / zoom; // handle size in world units

  return (
    <div className="stage">
      <canvas ref={canvas} className="stage__canvas" aria-hidden />
      <div
        ref={scroller}
        className="stage__scroller"
        onScroll={draw}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        data-testid="stage"
      >
        <div
          ref={world}
          className="stage__world"
          style={{ width: worldW * zoom + PAD * 2, height: H * zoom + PAD * 2 }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={onDoubleClick}
        >
          <svg
            className="stage__overlay"
            style={{ left: PAD, top: PAD, width: worldW * zoom, height: H * zoom }}
            viewBox={`0 0 ${worldW} ${H}`}
            preserveAspectRatio="none"
          >
            <rect x={0} y={0} width={worldW} height={H} className="ov-page" />
            {project.pages.map((pg, i) => (
              <g key={pg.id}>
                {i > 0 && <line x1={i * W} x2={i * W} y1={-16 / zoom} y2={H + 16 / zoom} className="ov-seam" />}
                <text x={i * W + W / 2} y={-14 / zoom} className="ov-label" style={{ fontSize: 12 / zoom }}>
                  {i + 1}
                </text>
              </g>
            ))}
            {guides.x.map((x, i) => (
              <line key={`gx${i}`} x1={x} x2={x} y1={0} y2={H} className="ov-guide" />
            ))}
            {guides.y.map((y, i) => (
              <line key={`gy${i}`} x1={0} x2={worldW} y1={y} y2={y} className="ov-guide" />
            ))}
            {selected && <SelectionBox layer={selected} hs={hs} crop={cropMode} />}
          </svg>
        </div>
      </div>
    </div>
  );
}

function SelectionBox({ layer, hs, crop }: { layer: Layer; hs: number; crop: boolean }) {
  const pts = layerCorners(layer);
  const poly = pts.map((p) => `${p.x},${p.y}`).join(' ');
  const top = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
  const a = (layer.rotation * Math.PI) / 180;
  const rot = { x: top.x + Math.sin(a) * hs * 4, y: top.y - Math.cos(a) * hs * 4 };
  return (
    <g>
      <polygon points={poly} className={crop ? 'ov-sel ov-sel--crop' : 'ov-sel'} />
      {!layer.locked && !crop && (
        <>
          <line x1={top.x} y1={top.y} x2={rot.x} y2={rot.y} className="ov-sel" />
          <circle cx={rot.x} cy={rot.y} r={hs * 0.9} className="ov-handle ov-handle--rotate" data-handle="rotate" />
          {pts.map((p, i) => (
            <rect key={i} x={p.x - hs / 2} y={p.y - hs / 2} width={hs} height={hs} className="ov-handle" data-handle={i} />
          ))}
        </>
      )}
    </g>
  );
}

/**
 * Corner resize in the layer's own frame: the opposite corner stays fixed.
 * Corners are numbered 0 TL, 1 TR, 2 BR, 3 BL. Media keeps its ratio unless `free`.
 */
export function resizeFromCorner(orig: Layer, corner: number, pt: Point, free: boolean): Partial<Layer> {
  const opposite = layerCorners(orig)[(corner + 2) % 4];
  const a = (orig.rotation * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const dx = pt.x - opposite.x;
  const dy = pt.y - opposite.y;
  const lx = dx * cos + dy * sin;
  const ly = -dx * sin + dy * cos;
  const sx = corner === 1 || corner === 2 ? 1 : -1;
  const sy = corner === 2 || corner === 3 ? 1 : -1;
  let w = Math.max(10, lx * sx);
  let h = Math.max(10, ly * sy);
  if (!free) {
    const s = Math.max(w / orig.width, h / orig.height);
    w = orig.width * s;
    h = orig.height * s;
  }
  const cxl = (sx * w) / 2;
  const cyl = (sy * h) / 2;
  const cx = opposite.x + cxl * cos - cyl * sin;
  const cy = opposite.y + cxl * sin + cyl * cos;
  return { x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), width: Math.round(w), height: Math.round(h) };
}

/** Snap the moving layer's bounds to seams, page centres, canvas edges and other layers. */
export function computeSnap(p: Project, moving: Layer, tol: number): { dx: number; dy: number; gx: number[]; gy: number[] } | null {
  const { pageWidth: W, pageHeight: H } = p.canvas;
  const N = p.pages.length;
  const xs: number[] = [];
  for (let i = 0; i <= N; i++) xs.push(i * W);
  for (let i = 0; i < N; i++) xs.push(i * W + W / 2);
  const ys = [0, H / 2, H];
  for (const l of p.layers) {
    if (l.id === moving.id || !l.visible) continue;
    const b = layerBounds(l);
    xs.push(b.x, b.x + b.width / 2, b.x + b.width);
    ys.push(b.y, b.y + b.height / 2, b.y + b.height);
  }
  const b = layerBounds(moving);
  const best = (cands: number[], edges: number[]) => {
    let d = Infinity;
    let at: number | null = null;
    for (const c of cands)
      for (const e of edges)
        if (Math.abs(c - e) < Math.abs(d) && Math.abs(c - e) <= tol) {
          d = c - e;
          at = c;
        }
    return at === null ? null : { d, at };
  };
  const sx = best(xs, [b.x, b.x + b.width / 2, b.x + b.width]);
  const sy = best(ys, [b.y, b.y + b.height / 2, b.y + b.height]);
  if (!sx && !sy) return null;
  return { dx: sx?.d ?? 0, dy: sy?.d ?? 0, gx: sx ? [sx.at] : [], gy: sy ? [sy.at] : [] };
}

function clamp01(v: number) {
  return Math.min(1, Math.max(0, v));
}
