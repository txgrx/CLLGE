import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { fitMedia, layerBounds, layerContainsPoint, layerCorners, type Point } from '../model/geometry';
import { strokeLayer, updateLayer, addLayer } from '../model/project';
import { poiWorld } from '../model/seams';
import type { Layer, MediaLayer, Project, StrokeLayer } from '../model/types';
import { drawRegion } from '../render/drawWindow';
import { library } from '../media/library';
import { Icon } from '../ui/Icon';
import { useEditor } from './store';
import { isCoarse, isMobile, stagePad, useUi } from './ui';

const SNAP_PX = 8; // snap tolerance in *screen* pixels, converted with the zoom
const LONG_PRESS_MS = 520;

interface Props {
  /** Files dropped on the stage; `slotId` when they landed on an empty template slot. */
  onDropFiles(files: File[], pageIndex: number, slotId?: string): void;
  /** The "+ Photo / + Clip" pill of a slot was pressed. */
  onSlot(layerId: string): void;
  /** Touch: a finger rested on a layer. */
  onLongPress?(layerId: string, clientX: number, clientY: number): void;
}

type Gesture =
  | { kind: 'move'; id: string; start: Point; orig: Layer }
  | { kind: 'resize'; id: string; corner: number; orig: Layer; free: boolean }
  | { kind: 'rotate'; id: string; orig: Layer }
  | { kind: 'crop'; id: string; start: Point; orig: Layer }
  | { kind: 'pan'; startClient: Point; startScroll: Point; samples: { x: number; t: number }[] }
  | { kind: 'pinch'; startDist: number; startZoom: number }
  | { kind: 'pinchLayer'; id: string; orig: Layer; startDist: number; startAngle: number; startMid: Point }
  | { kind: 'draw'; pts: [number, number][] };

interface Guides {
  x: number[];
  y: number[];
}

/** Distance from a point to a stroke layer's polyline (world units). */
function strokeDistance(l: StrokeLayer, pt: Point): number {
  const pts = l.points.map(([u, v]) => [l.x + u * l.width, l.y + v * l.height]);
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const dx = bx - ax;
    const dy = by - ay;
    const len = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((pt.x - ax) * dx + (pt.y - ay) * dy) / len));
    best = Math.min(best, Math.hypot(pt.x - (ax + t * dx), pt.y - (ay + t * dy)));
  }
  return best;
}

export function Stage({ onDropFiles, onSlot, onLongPress }: Props) {
  const project = useEditor((s) => s.project)!;
  const zoom = useEditor((s) => s.zoom);
  const selection = useEditor((s) => s.selection);
  const tool = useUi((s) => s.tool);
  const pen = useUi((s) => s.pen);
  const cropMode = useUi((s) => s.crop);
  const warnings = useUi((s) => s.warnings);
  const ignored = useUi((s) => s.ignored);
  const setUi = useUi((s) => s.set);
  const scroller = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const pointers = useRef(new Map<number, Point>());
  const press = useRef<{ timer: number; x: number; y: number } | null>(null);
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  const downAt = useRef<{ x: number; y: number; moved: boolean }>({ x: 0, y: 0, moved: false });
  const [guides, setGuides] = useState<Guides>({ x: [], y: [] });
  const [ink, setInk] = useState<[number, number][] | null>(null);
  const [tick, setTick] = useState(0);
  const [pad, setPad] = useState(stagePad);
  const { pageWidth: W, pageHeight: H } = project.canvas;
  const N = project.pages.length;
  const worldW = N * W;
  const coarse = isCoarse();

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
      const P = stagePad();
      // The world is centred in the scroller when smaller than it (flex auto margins).
      const ox = (world.current?.offsetLeft ?? 0) + P;
      const oy = (world.current?.offsetTop ?? 0) + P;
      const x0 = Math.max(0, (sc.scrollLeft - ox) / z);
      const y0 = Math.max(0, (sc.scrollTop - oy) / z);
      const x1 = Math.min(p.pages.length * p.canvas.pageWidth, (sc.scrollLeft + vw - ox) / z);
      const y1 = Math.min(p.canvas.pageHeight, (sc.scrollTop + vh - oy) / z);
      if (x1 <= x0 || y1 <= y0) return;
      drawRegion(ctx, p, { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }, 0, library.sources(), {
        scale: z * dpr,
        originX: (ox + x0 * z - sc.scrollLeft) * dpr,
        originY: (oy + y0 * z - sc.scrollTop) * dpr,
        showAllClips: true,
      });
    });
  }, []);

  useEffect(() => library.onChange(draw), [draw]);
  useEffect(draw, [draw, project, zoom, tick, pad]);
  useEffect(() => {
    const ro = new ResizeObserver(() => {
      setPad(stagePad());
      setTick((t) => t + 1);
    });
    if (scroller.current) ro.observe(scroller.current);
    return () => ro.disconnect();
  }, []);

  /* ---------- zoom helpers ---------- */
  const zoomAt = useCallback((newZoom: number, clientX: number, clientY: number) => {
    const sc = scroller.current;
    if (!sc) return;
    const P = stagePad();
    const z = useEditor.getState().zoom;
    const wr = world.current!.getBoundingClientRect();
    const wx = (clientX - wr.left - P) / z;
    const wy = (clientY - wr.top - P) / z;
    useEditor.getState().setZoom(newZoom);
    const nz = useEditor.getState().zoom;
    requestAnimationFrame(() => {
      const after = world.current!.getBoundingClientRect();
      sc.scrollLeft += after.left + P + wx * nz - clientX;
      sc.scrollTop += after.top + P + wy * nz - clientY;
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

  // Fit on open: the whole strip on desktop, one slide on a phone.
  useLayoutEffect(() => {
    const sc = scroller.current;
    if (!sc) return;
    const P = stagePad();
    const fit = isMobile() ? Math.min((sc.clientWidth - P * 2) / W, (sc.clientHeight - P * 2) / H) : Math.min((sc.clientWidth - P * 2) / worldW, (sc.clientHeight - P * 2) / H);
    useEditor.getState().setZoom(Math.max(0.05, Math.min(1, fit)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  /* ---------- pointer interaction ---------- */
  const toWorld = (clientX: number, clientY: number): Point => {
    const r = world.current!.getBoundingClientRect();
    const z = useEditor.getState().zoom;
    const P = stagePad();
    return { x: (clientX - r.left - P) / z, y: (clientY - r.top - P) / z };
  };

  const hitTest = (p: Project, pt: Point): Layer | undefined => {
    const tol = (coarse ? 18 : 8) / useEditor.getState().zoom;
    for (let i = p.layers.length - 1; i >= 0; i--) {
      const l = p.layers[i];
      if (!l.visible || l.locked) continue;
      if (l.type === 'stroke') {
        if (strokeDistance(l, pt) <= l.lineWidth / 2 + tol) return l;
        continue;
      }
      if (layerContainsPoint(l, pt)) return l;
    }
    return undefined;
  };

  const cancelPress = () => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  };

  /** Set the point of interest of a media layer from a world point. */
  const setPoi = (l: MediaLayer, pt: Point) => {
    const asset = useEditor.getState().project!.assets.find((a) => a.id === l.assetId);
    if (!asset) return;
    const r = fitMedia(asset.width, asset.height, l.width, l.height, l.fit, l.crop);
    const a = (-l.rotation * Math.PI) / 180;
    const cx = l.x + l.width / 2;
    const cy = l.y + l.height / 2;
    const lx = (pt.x - cx) * Math.cos(a) - (pt.y - cy) * Math.sin(a) + l.width / 2;
    const ly = (pt.x - cx) * Math.sin(a) + (pt.y - cy) * Math.cos(a) + l.height / 2;
    const poi = { x: Math.min(1, Math.max(0, (lx - r.x) / r.width)), y: Math.min(1, Math.max(0, (ly - r.y) / r.height)) };
    useEditor.getState().apply((pp) => updateLayer(pp, l.id, { poi } as Partial<Layer>));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    downAt.current = { x: e.clientX, y: e.clientY, moved: false };
    const st = useEditor.getState();
    const p = st.project!;
    const selected = st.selection.length === 1 ? p.layers.find((l) => l.id === st.selection[0]) : undefined;
    if (pointers.current.size === 2) {
      cancelPress();
      const [a, b] = [...pointers.current.values()];
      const g = gesture.current;
      if (g?.kind === 'draw') setInk(null);
      // Two fingers on a selected layer: scale and rotate it. Otherwise: zoom the view.
      if (selected && !selected.locked && (g?.kind === 'move' || g?.kind === 'resize') && g.id === selected.id) {
        gesture.current = { kind: 'pinchLayer', id: selected.id, orig: g.orig, startDist: Math.hypot(a.x - b.x, a.y - b.y), startAngle: Math.atan2(b.y - a.y, b.x - a.x), startMid: toWorld((a.x + b.x) / 2, (a.y + b.y) / 2) };
        return;
      }
      if (g && g.kind !== 'pan' && g.kind !== 'draw') st.endGesture();
      gesture.current = { kind: 'pinch', startDist: Math.hypot(a.x - b.x, a.y - b.y), startZoom: st.zoom };
      return;
    }
    const pt = toWorld(e.clientX, e.clientY);
    if (useUi.getState().tool === 'draw') {
      gesture.current = { kind: 'draw', pts: [[pt.x, pt.y]] };
      setInk([[pt.x, pt.y]]);
      return;
    }
    const handle = (e.target as Element).closest('[data-handle]')?.getAttribute('data-handle');
    if (handle && selected && !selected.locked) {
      st.beginGesture();
      if (handle === 'rotate') gesture.current = { kind: 'rotate', id: selected.id, orig: selected };
      else gesture.current = { kind: 'resize', id: selected.id, corner: Number(handle), orig: selected, free: e.altKey || selected.type === 'text' || selected.type === 'stroke' };
      return;
    }
    if (cropMode && selected && (selected.type === 'image' || selected.type === 'video') && layerContainsPoint(selected, pt)) {
      st.beginGesture();
      gesture.current = { kind: 'crop', id: selected.id, start: pt, orig: selected };
      if (e.pointerType !== 'mouse') press.current = { timer: window.setTimeout(() => {
        st.endGesture();
        gesture.current = null;
        setPoi(selected, pt);
      }, LONG_PRESS_MS), x: e.clientX, y: e.clientY };
      return;
    }
    const hit = hitTest(p, pt);
    if (hit) {
      if (cropMode && hit.id !== selected?.id) setUi({ crop: false });
      if (!st.selection.includes(hit.id)) st.select([hit.id]);
      st.beginGesture();
      gesture.current = { kind: 'move', id: hit.id, start: pt, orig: hit };
      if (e.pointerType !== 'mouse' && onLongPress) {
        press.current = {
          timer: window.setTimeout(() => {
            st.endGesture();
            gesture.current = null;
            press.current = null;
            onLongPress(hit.id, e.clientX, e.clientY);
          }, LONG_PRESS_MS),
          x: e.clientX,
          y: e.clientY,
        };
      }
    } else {
      st.select([]);
      setUi({ crop: false });
      const sc = scroller.current!;
      gesture.current = { kind: 'pan', startClient: { x: e.clientX, y: e.clientY }, startScroll: { x: sc.scrollLeft, y: sc.scrollTop }, samples: [{ x: e.clientX, t: e.timeStamp }] };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (Math.hypot(e.clientX - downAt.current.x, e.clientY - downAt.current.y) > 6) downAt.current.moved = true;
    if (press.current && Math.hypot(e.clientX - press.current.x, e.clientY - press.current.y) > 8) cancelPress();
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
    if (g.kind === 'pinchLayer') {
      const [a, b] = [...pointers.current.values()];
      if (!a || !b) return;
      const s = Math.max(0.1, Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, g.startDist));
      const rot = ((Math.atan2(b.y - a.y, b.x - a.x) - g.startAngle) * 180) / Math.PI;
      const mid = toWorld((a.x + b.x) / 2, (a.y + b.y) / 2);
      const o = g.orig;
      const w = o.width * s;
      const h = o.height * s;
      const cx = o.x + o.width / 2 + (mid.x - g.startMid.x);
      const cy = o.y + o.height / 2 + (mid.y - g.startMid.y);
      let deg = o.rotation + rot;
      if (Math.abs(deg - Math.round(deg / 90) * 90) < 4) deg = Math.round(deg / 90) * 90;
      const patch: Partial<Layer> = { x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), width: Math.round(w), height: Math.round(h), rotation: Math.round(deg * 10) / 10 };
      if (o.type === 'text') (patch as Partial<Extract<Layer, { type: 'text' }>>).fontSize = Math.max(4, Math.round(o.fontSize * s));
      st.apply((pp) => updateLayer(pp, g.id, patch));
      return;
    }
    if (g.kind === 'pan') {
      const sc = scroller.current!;
      sc.scrollLeft = g.startScroll.x - (e.clientX - g.startClient.x);
      sc.scrollTop = g.startScroll.y - (e.clientY - g.startClient.y);
      g.samples.push({ x: e.clientX, t: e.timeStamp });
      if (g.samples.length > 6) g.samples.shift();
      return;
    }
    const pt = toWorld(e.clientX, e.clientY);
    if (g.kind === 'draw') {
      const last = g.pts[g.pts.length - 1];
      if (Math.hypot(pt.x - last[0], pt.y - last[1]) > 3 / z) {
        g.pts.push([pt.x, pt.y]);
        setInk([...g.pts]);
      }
      return;
    }
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
      const patch = resizeFromCorner(g.orig, g.corner, pt, g.free !== e.altKey ? true : false);
      if (g.orig.type === 'text' && patch.height && !g.free) (patch as Partial<Extract<Layer, { type: 'text' }>>).fontSize = Math.round((g.orig.fontSize * patch.height) / g.orig.height);
      st.apply((pp) => updateLayer(pp, g.id, patch));
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

  const snapToPage = (velocity: number) => {
    const sc = scroller.current;
    if (!sc) return;
    const z = useEditor.getState().zoom;
    const P = stagePad();
    const ox = world.current?.offsetLeft ?? 0;
    const center = (sc.scrollLeft + sc.clientWidth / 2 - P - ox) / z;
    const projected = center - velocity * 0.28 / z;
    const i = Math.max(0, Math.min(N - 1, Math.round((projected - W / 2) / W)));
    sc.scrollTo({ left: ox + P + (i * W + W / 2) * z - sc.clientWidth / 2, behavior: 'smooth' });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    cancelPress();
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (g?.kind === 'draw') {
      if (g.pts.length >= 2) {
        const pen0 = useUi.getState().pen;
        const thin: [number, number][] = [g.pts[0]];
        for (const q of g.pts.slice(1)) {
          const last = thin[thin.length - 1];
          if (Math.hypot(q[0] - last[0], q[1] - last[1]) >= Math.max(4, pen0.width * 0.4)) thin.push(q);
        }
        if (thin[thin.length - 1] !== g.pts[g.pts.length - 1]) thin.push(g.pts[g.pts.length - 1]);
        if (thin.length >= 2) useEditor.getState().apply((pp) => addLayer(pp, strokeLayer(thin, pen0.color, pen0.width, pen0.style, 'Drawing')));
      }
      setInk(null);
      gesture.current = null;
      return;
    }
    if (g && g.kind !== 'pan' && g.kind !== 'pinch') useEditor.getState().endGesture();
    if (g?.kind === 'pan' && isMobile() && pointers.current.size === 0) {
      const s = g.samples;
      const v = s.length > 1 ? ((s[s.length - 1].x - s[0].x) / Math.max(1, s[s.length - 1].t - s[0].t)) * 1000 : 0;
      snapToPage(v);
    }
    // Double tap (touch): crop mode on media; in crop mode, mark the point of interest.
    if (e.pointerType !== 'mouse' && !downAt.current.moved && pointers.current.size === 0) {
      const now = e.timeStamp;
      const lt = lastTap.current;
      if (lt && now - lt.t < 320 && Math.hypot(e.clientX - lt.x, e.clientY - lt.y) < 24) {
        lastTap.current = null;
        doubleTap(e.clientX, e.clientY);
      } else lastTap.current = { t: now, x: e.clientX, y: e.clientY };
    }
    if (pointers.current.size === 0 || g?.kind === 'pinch' || g?.kind === 'pinchLayer') gesture.current = null;
    setGuides({ x: [], y: [] });
  };

  const doubleTap = (clientX: number, clientY: number) => {
    const st = useEditor.getState();
    const pt = toWorld(clientX, clientY);
    const selected = st.selection.length === 1 ? st.project!.layers.find((l) => l.id === st.selection[0]) : undefined;
    if (useUi.getState().crop && selected && (selected.type === 'image' || selected.type === 'video') && layerContainsPoint(selected, pt)) {
      setPoi(selected, pt);
      return;
    }
    const hit = hitTest(st.project!, pt);
    if (hit && (hit.type === 'image' || hit.type === 'video')) {
      st.select([hit.id]);
      setUi({ crop: true });
    }
  };

  /* ---------- drop ---------- */
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = [...e.dataTransfer.files];
    if (!files.length) return;
    const pt = toWorld(e.clientX, e.clientY);
    const p = useEditor.getState().project!;
    let slotId: string | undefined;
    for (let i = p.layers.length - 1; i >= 0; i--) {
      const l = p.layers[i];
      if (l.visible && layerContainsPoint(l, pt)) {
        if ((l.type === 'image' || l.type === 'video') && l.slot) slotId = l.id;
        break;
      }
    }
    onDropFiles(files, Math.min(N - 1, Math.max(0, Math.floor(pt.x / W))), slotId);
  };

  const selected = selection.length === 1 ? project.layers.find((l) => l.id === selection[0]) : undefined;
  const hs = (coarse ? 14 : 8) / zoom; // visible handle size in world units
  const hit = (coarse ? 44 : 14) / zoom; // touch target
  const shownWarnings = warnings.filter((w) => !ignored.includes(w.key));
  const poi = selected && (selected.type === 'image' || selected.type === 'video') ? poiWorld(project, selected) : null;

  return (
    <div className={`stage ${tool === 'draw' ? 'stage--draw' : ''}`}>
      <canvas ref={canvas} className="stage__canvas" aria-hidden />
      <div ref={scroller} className="stage__scroller" onScroll={draw} onDragOver={(e) => e.preventDefault()} onDrop={onDrop} data-testid="stage">
        <div
          ref={world}
          className="stage__world"
          style={{ width: worldW * zoom + pad * 2, height: H * zoom + pad * 2 }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={(e) => doubleTap(e.clientX, e.clientY)}
        >
          <svg className="stage__overlay" style={{ left: pad, top: pad, width: worldW * zoom, height: H * zoom }} viewBox={`0 0 ${worldW} ${H}`} preserveAspectRatio="none">
            <rect x={0} y={0} width={worldW} height={H} className="ov-page" />
            {project.pages.map((pg, i) => (
              <g key={pg.id}>
                {i > 0 && <line x1={i * W} x2={i * W} y1={0} y2={H} className="ov-seam" pathLength={1} style={{ animationDelay: `${0.25 + i * 0.08}s` }} />}
                {pad > 30 && (
                  <text x={i * W + W / 2} y={-16 / zoom} className="ov-label" style={{ fontSize: 11 / zoom }}>
                    {String(i + 1).padStart(2, '0')}
                  </text>
                )}
              </g>
            ))}
            {shownWarnings.map((w) => {
              const l = project.layers.find((x) => x.id === w.layerId);
              if (!l) return null;
              const pt = w.kind === 'poi' && (l.type === 'image' || l.type === 'video') ? poiWorld(project, l) : { x: w.seam * W, y: l.y + l.height / 2 };
              return (
                <g key={w.key} className="ov-warn">
                  <line x1={w.seam * W} x2={w.seam * W} y1={0} y2={H} className="ov-warn__seam" />
                  <circle cx={w.seam * W} cy={Math.min(H - 20 / zoom, Math.max(20 / zoom, pt?.y ?? H / 2))} r={18 / zoom} className="ov-warn__pulse" />
                </g>
              );
            })}
            {guides.x.map((x, i) => (
              <line key={`gx${i}`} x1={x} x2={x} y1={0} y2={H} className="ov-guide" />
            ))}
            {guides.y.map((y, i) => (
              <line key={`gy${i}`} x1={0} x2={worldW} y1={y} y2={y} className="ov-guide" />
            ))}
            {selected && <SelectionBox layer={selected} hs={hs} hit={hit} crop={cropMode} />}
            {poi && (
              <g className={`ov-poi ${cropMode ? 'is-big' : ''}`} transform={`translate(${poi.x} ${poi.y})`}>
                <circle r={(cropMode ? 22 : 12) / zoom} />
                <line x1={-34 / zoom} x2={-10 / zoom} y1={0} y2={0} />
                <line x1={10 / zoom} x2={34 / zoom} y1={0} y2={0} />
                <line y1={-34 / zoom} y2={-10 / zoom} x1={0} x2={0} />
                <line y1={10 / zoom} y2={34 / zoom} x1={0} x2={0} />
              </g>
            )}
            {ink && ink.length > 1 && <polyline points={ink.map((q) => q.join(',')).join(' ')} className="ov-ink" style={{ stroke: pen.color, strokeWidth: pen.width, strokeDasharray: pen.style === 'dashed' ? `${pen.width * 2.4} ${pen.width * 2}` : undefined, opacity: pen.style === 'pencil' ? 0.6 : 1 }} />}
          </svg>
          {project.pages.slice(1).map((pg, k) => (
            <button
              key={pg.id}
              className="seam-chip"
              style={{ left: pad + (k + 1) * W * zoom, top: pad }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setUi({ seam: k + 1, tray: 'bridge' })}
              aria-label={`Bridge slides ${k + 1} and ${k + 2}`}
              title="Add a bridge across this seam"
              data-testid={`seam-chip-${k + 1}`}
            >
              <Icon name="bridge" size={14} />
            </button>
          ))}
          {project.layers.map((l) =>
            (l.type === 'image' || l.type === 'video') && l.slot && l.visible ? (
              <button
                key={l.id}
                className={`slot-pill ${l.width * zoom < 120 ? 'slot-pill--compact' : ''}`}
                // Wide background slots put their pill near the top-left so it never sits on top of a smaller slot's pill.
                style={l.width > W * 1.5 ? { left: pad + (l.x + 90 / zoom / 2 + 40) * zoom, top: pad + (l.y + 40) * zoom + 20 } : { left: pad + (l.x + l.width / 2) * zoom, top: pad + (l.y + l.height / 2) * zoom }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => onSlot(l.id)}
                data-testid={`slot-${l.id}`}
                aria-label={`${l.slot === 'video' ? 'Add a clip' : 'Add a photo'} to ${l.name ?? 'slot'}`}
              >
                <Icon name={l.slot === 'video' ? 'clip' : 'plus'} size={16} />
                {l.width * zoom >= 120 && (l.slot === 'video' ? 'Clip' : 'Photo')}
              </button>
            ) : null,
          )}
        </div>
      </div>
    </div>
  );
}

function SelectionBox({ layer, hs, hit, crop }: { layer: Layer; hs: number; hit: number; crop: boolean }) {
  const pts = layerCorners(layer);
  const poly = pts.map((p) => `${p.x},${p.y}`).join(' ');
  const top = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
  const a = (layer.rotation * Math.PI) / 180;
  const rot = { x: top.x + Math.sin(a) * hs * 3.4, y: top.y - Math.cos(a) * hs * 3.4 };
  return (
    <g>
      <polygon points={poly} className={crop ? 'ov-sel ov-sel--crop' : 'ov-sel'} />
      {!layer.locked && !crop && (
        <>
          <line x1={top.x} y1={top.y} x2={rot.x} y2={rot.y} className="ov-sel" />
          <circle cx={rot.x} cy={rot.y} r={hs * 0.9} className="ov-handle ov-handle--rotate" />
          <circle cx={rot.x} cy={rot.y} r={hit / 2} className="ov-hit" data-handle="rotate" />
          {pts.map((p, i) => (
            <g key={i}>
              <rect x={p.x - hs / 2} y={p.y - hs / 2} width={hs} height={hs} className="ov-handle" />
              <rect x={p.x - hit / 2} y={p.y - hit / 2} width={hit} height={hit} className="ov-hit" data-handle={i} />
            </g>
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
    if (l.id === moving.id || !l.visible || l.type === 'stroke') continue;
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
