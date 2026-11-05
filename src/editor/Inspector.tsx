import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { library } from '../media/library';
import { planPages } from '../model/plan';
import { addPageAtEnd, duplicateLayer, removeLastPage, removeLayers, reorderLayer, updateLayer } from '../model/project';
import { clipEndMs } from '../model/timing';
import { MAX_PAGES, type Layer, type MaskKind, type MediaFrame, type MediaLayer, type Project, type StickerLayer, type StrokeLayer, type TextLayer, type VideoLayer } from '../model/types';
import { drawPage } from '../render/drawWindow';
import { stickerById } from '../render/shapes';
import { snapWeight, fontByValue } from '../ui/fonts';
import { Icon } from '../ui/Icon';
import { blurSwap, spring } from '../ui/motion';
import { regenerateLine } from './actions';
import { BASE_INKS, Swatches, usePalette } from './palette';
import { FontPicker, PresetChips } from './panels';
import { useEditor } from './store';
import { applyPreset } from './textPresets';
import { useUi } from './ui';

type Tab = 'style' | 'font' | 'frame' | 'mask' | 'crop' | 'clip' | 'arrange';

const TAB_LABEL: Record<Tab, string> = { style: 'Style', font: 'Font', frame: 'Frame', mask: 'Mask', crop: 'Crop', clip: 'Clip', arrange: 'Arrange' };

function tabsFor(l: Layer): Tab[] {
  switch (l.type) {
    case 'image':
      return ['frame', 'mask', 'crop', 'style', 'arrange'];
    case 'video':
      return ['frame', 'mask', 'crop', 'clip', 'style', 'arrange'];
    case 'text':
      return ['style', 'font', 'arrange'];
    default:
      return ['style', 'arrange'];
  }
}

export function Inspector({ onReplace }: { onReplace(layerId: string): void }) {
  const project = useEditor((s) => s.project)!;
  const selection = useEditor((s) => s.selection);
  const layer = selection.length === 1 ? project.layers.find((l) => l.id === selection[0]) : undefined;
  return (
    <aside className="inspector" aria-label="Inspector">
      {layer ? <LayerInspector key={layer.id} layer={layer} project={project} onReplace={onReplace} /> : <ProjectInspector project={project} />}
    </aside>
  );
}

function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="insp-section">
      {title && <h3>{title}</h3>}
      {children}
    </section>
  );
}

function Num({ label, value, onChange, step = 1, min, max, suffix }: { label: string; value: number; onChange(v: number): void; step?: number; min?: number; max?: number; suffix?: string }) {
  return (
    <label className="num">
      <span>{label}</span>
      <input
        type="number"
        inputMode="decimal"
        value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0}
        step={step}
        min={min}
        max={max}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
      />
      {suffix && <em>{suffix}</em>}
    </label>
  );
}

function Range({ label, value, min, max, step, onChange, format }: { label: string; value: number; min: number; max: number; step: number; onChange(v: number): void; format?(v: number): string }) {
  return (
    <label className="range">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      {format && <output className="mono">{format(value)}</output>}
    </label>
  );
}

function Toggle({ on, label, onChange }: { on: boolean; label: string; onChange(v: boolean): void }) {
  return (
    <button type="button" className={`chip ${on ? 'is-active' : ''}`} aria-pressed={on} onClick={() => onChange(!on)}>
      {label}
    </button>
  );
}

/* ------------------------------------------------------------------ */

export function ProjectInspector({ project }: { project: Project }) {
  const apply = useEditor((s) => s.apply);
  const plans = planPages(project);
  const videoLayers = project.layers.filter((l): l is VideoLayer => l.type === 'video');
  const colors = usePalette(project);
  return (
    <>
      <Section title="Carousel">
        <p className="hint">
          {project.pages.length} slides · {project.canvas.pageWidth} × {project.canvas.pageHeight} each
        </p>
        <h4 className="insp-sub">Background</h4>
        <Swatches colors={['#0E0E0F', '#141414', '#F2EEE6', '#E7DCC6', ...colors.slice(BASE_INKS.length)]} value={project.canvas.background} onChange={(c) => apply((p) => ({ ...p, canvas: { ...p.canvas, background: c } }))} label="Background" />
        <div className="row">
          <button className="btn" disabled={project.pages.length >= MAX_PAGES} onClick={() => apply(addPageAtEnd)}>
            + Slide
          </button>
          <button
            className="btn"
            disabled={project.pages.length <= 1}
            onClick={() => {
              const last = plans[plans.length - 1];
              if (last.layers.length && !confirm(`Slide ${last.index + 1} has content. Remove it? Anything on it will no longer be exported (Undo brings it back).`)) return;
              apply(removeLastPage);
            }}
          >
            − Last slide
          </button>
        </div>
      </Section>
      <Section title="Slides">
        <ol className="page-list">
          {plans.map((pl) => (
            <li key={pl.pageId}>
              <span className={`badge badge--${pl.kind}`}>{pl.kind === 'video' ? 'Video' : 'Photo'}</span>
              <span>
                {pl.baseName}
                {pl.kind === 'video' ? ` · ${(pl.durationMs / 1000).toFixed(1)} s` : ''}
              </span>
              {videoLayers.length > 0 && (
                <select
                  aria-label={`Audio for slide ${pl.index + 1}`}
                  value={project.pages[pl.index].audioLayerId === undefined ? 'auto' : project.pages[pl.index].audioLayerId === null ? 'none' : project.pages[pl.index].audioLayerId!}
                  onChange={(e) => {
                    const v = e.target.value;
                    apply((p) => ({
                      ...p,
                      pages: p.pages.map((pg, i) => (i === pl.index ? { ...pg, audioLayerId: v === 'auto' ? undefined : v === 'none' ? null : v } : pg)),
                    }));
                  }}
                >
                  <option value="auto">Audio: auto{pl.audioLayer && project.pages[pl.index].audioLayerId === undefined ? ` (${pl.audioLayer.name ?? 'clip'})` : ''}</option>
                  <option value="none">Audio: silent</option>
                  {videoLayers.map((v) => (
                    <option key={v.id} value={v.id}>
                      Audio: {v.name ?? v.id}
                    </option>
                  ))}
                </select>
              )}
            </li>
          ))}
        </ol>
        <p className="hint">A slide becomes a video when a clip reaches it or it has audio. The first clip you added is heard by default.</p>
      </Section>
    </>
  );
}

/* ------------------------------------------------------------------ */

const KIND_TITLE: Record<Layer['type'], string> = { image: 'Photo', video: 'Video', text: 'Text', shape: 'Shape', sticker: 'Sticker', stroke: 'Line' };

function LayerInspector({ layer, project, onReplace }: { layer: Layer; project: Project; onReplace(id: string): void }) {
  const tabs = tabsFor(layer);
  const [tab, setTab] = useState<Tab>(tabs[0]);
  const t = tabs.includes(tab) ? tab : tabs[0];
  const apply = useEditor((s) => s.apply);
  const set = (patch: Partial<Layer>) => apply((p) => updateLayer(p, layer.id, patch));
  const sticker = layer.type === 'sticker' ? stickerById(layer.sticker) : undefined;
  return (
    <>
      <div className="insp-head">
        <span className={`badge badge--${layer.type}`}>{KIND_TITLE[layer.type]}</span>
        <input className="insp-name" value={layer.name ?? (sticker?.label ?? '')} onChange={(e) => set({ name: e.target.value })} aria-label="Layer name" />
      </div>
      <div className="tabs" role="tablist" aria-label="Edit">
        {tabs.map((x) => (
          <button key={x} role="tab" aria-selected={x === t} className={`tab ${x === t ? 'is-active' : ''}`} onClick={() => setTab(x)} data-testid={`tab-${x}`}>
            {x === t && <motion.span layoutId="tab-pill" className="tab__pill" transition={spring} />}
            <span>{TAB_LABEL[x]}</span>
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={t} variants={blurSwap} initial="initial" animate="animate" exit="exit" className="tab-body" role="tabpanel">
          {t === 'arrange' && <ArrangeTab layer={layer} set={set} />}
          {t === 'style' && <StyleTab layer={layer} project={project} set={set} onReplace={onReplace} />}
          {t === 'font' && layer.type === 'text' && <FontTab layer={layer} set={set} />}
          {t === 'frame' && (layer.type === 'image' || layer.type === 'video') && <FrameTab layer={layer} project={project} set={set} />}
          {t === 'mask' && (layer.type === 'image' || layer.type === 'video') && <MaskTab layer={layer} project={project} set={set} />}
          {t === 'crop' && (layer.type === 'image' || layer.type === 'video') && <CropTab layer={layer} project={project} set={set} onReplace={onReplace} />}
          {t === 'clip' && layer.type === 'video' && <ClipSection layer={layer} project={project} />}
        </motion.div>
      </AnimatePresence>
    </>
  );
}

type Setter = (patch: Partial<Layer>) => void;

function ArrangeTab({ layer, set }: { layer: Layer; set: Setter }) {
  const apply = useEditor((s) => s.apply);
  const select = useEditor((s) => s.select);
  return (
    <>
      <div className="grid2">
        <Num label="X" value={layer.x} onChange={(x) => set({ x })} />
        <Num label="Y" value={layer.y} onChange={(y) => set({ y })} />
        <Num label="W" value={layer.width} min={1} onChange={(width) => set({ width: Math.max(1, width) })} />
        <Num label="H" value={layer.height} min={1} onChange={(height) => set({ height: Math.max(1, height) })} />
        <Num label="Rotate" value={layer.rotation} suffix="°" onChange={(rotation) => set({ rotation })} />
        <Num label="Opacity" value={Math.round(layer.opacity * 100)} min={0} max={100} suffix="%" onChange={(o) => set({ opacity: Math.min(1, Math.max(0, o / 100)) })} />
      </div>
      <div className="icon-row">
        <button className="btn btn--sm" onClick={() => apply((p) => reorderLayer(p, layer.id, 'top'))}>
          To front
        </button>
        <button className="btn btn--sm" onClick={() => apply((p) => reorderLayer(p, layer.id, 'up'))} aria-label="Bring forward">
          <Icon name="up" size={16} />
        </button>
        <button className="btn btn--sm" onClick={() => apply((p) => reorderLayer(p, layer.id, 'down'))} aria-label="Send backward">
          <Icon name="down" size={16} />
        </button>
        <button className="btn btn--sm" onClick={() => apply((p) => reorderLayer(p, layer.id, 'bottom'))}>
          To back
        </button>
      </div>
      <div className="icon-row">
        <button
          className="btn btn--sm"
          onClick={() => {
            let id: string | null = null;
            apply((p) => {
              const r = duplicateLayer(p, layer.id);
              id = r.newId;
              return r.project;
            });
            if (id) select([id]);
          }}
        >
          <Icon name="copy" size={16} /> Duplicate
        </button>
        <button className="btn btn--sm" onClick={() => set({ locked: !layer.locked })}>
          <Icon name={layer.locked ? 'unlock' : 'lock'} size={16} /> {layer.locked ? 'Unlock' : 'Lock'}
        </button>
        <button
          className="btn btn--sm btn--danger"
          onClick={() => {
            apply((p) => removeLayers(p, [layer.id]));
            select([]);
          }}
        >
          <Icon name="trash" size={16} /> Delete
        </button>
      </div>
    </>
  );
}

function StyleTab({ layer, project, set, onReplace }: { layer: Layer; project: Project; set: Setter; onReplace(id: string): void }) {
  const colors = usePalette(project);
  switch (layer.type) {
    case 'text':
      return <TextStyle layer={layer} set={set} colors={colors} />;
    case 'sticker':
      return <StickerStyle layer={layer} set={set} colors={colors} />;
    case 'stroke':
      return <StrokeStyle layer={layer} set={set} colors={colors} />;
    case 'shape':
      return (
        <>
          <Swatches colors={colors} value={layer.fill} onChange={(fill) => set({ fill } as Partial<Layer>)} label="Fill" />
          <Range label="Corners" value={layer.radius} min={0} max={Math.round(Math.min(layer.width, layer.height) / 2)} step={1} onChange={(radius) => set({ radius } as Partial<Layer>)} />
        </>
      );
    default:
      return (
        <>
          <div className="seg" role="group" aria-label="Fit">
            {(['cover', 'contain'] as const).map((f) => (
              <button key={f} className={layer.fit === f ? 'is-active' : ''} onClick={() => set({ fit: f } as Partial<Layer>)}>
                {f === 'cover' ? 'Fill' : 'Fit'}
              </button>
            ))}
          </div>
          <Range label="Corners" value={layer.radius} min={0} max={Math.round(Math.min(layer.width, layer.height) / 2)} step={1} onChange={(radius) => set({ radius } as Partial<Layer>)} />
          <Range label="Opacity" value={layer.opacity} min={0} max={1} step={0.01} onChange={(opacity) => set({ opacity })} />
          <button className="btn" onClick={() => onReplace(layer.id)}>
            Replace…
          </button>
        </>
      );
  }
}

function TextStyle({ layer, set, colors }: { layer: TextLayer; set: Setter; colors: string[] }) {
  const s = (patch: Partial<TextLayer>) => set(patch as Partial<Layer>);
  return (
    <>
      <textarea value={layer.text} rows={2} onChange={(e) => s({ text: e.target.value })} aria-label="Text content" data-testid="text-content" />
      <h4 className="insp-sub">One-tap styles</h4>
      <PresetChips active={layer.preset} onPick={(p) => s({ ...applyPreset(layer, p), fontWeight: snapWeight(p.style.fontFamily ?? layer.fontFamily, p.style.fontWeight ?? layer.fontWeight) })} />
      <h4 className="insp-sub">Ink</h4>
      <Swatches colors={colors} value={layer.color} onChange={(color) => s({ color })} label="Text colour" />
      <div className="chips">
        <Toggle on={!!layer.uppercase} label="CAPS" onChange={(uppercase) => s({ uppercase })} />
        <Toggle on={!!layer.italic} label="Italic" onChange={(italic) => s({ italic })} />
        <Toggle on={!!layer.outlineOnly} label="Outline" onChange={(outlineOnly) => s({ outlineOnly, stroke: layer.stroke ?? { color: layer.color, width: Math.max(2, Math.round(layer.fontSize * 0.03)) } })} />
        <Toggle on={!!layer.bridge} label="Across seam" onChange={(bridge) => s({ bridge })} />
      </div>
      <Range label="Spacing" value={layer.letterSpacing ?? 0} min={-0.08} max={0.4} step={0.01} onChange={(letterSpacing) => s({ letterSpacing })} />
      <Range label="Curve" value={layer.curve ?? 0} min={-1} max={1} step={0.01} onChange={(curve) => s({ curve: Math.abs(curve) < 0.03 ? 0 : curve })} />
      <h4 className="insp-sub">Effects</h4>
      <div className="chips">
        <Toggle on={!!layer.stroke && !layer.outlineOnly} label="Stroke" onChange={(on) => s({ stroke: on ? { color: '#141414', width: Math.max(2, Math.round(layer.fontSize * 0.05)) } : undefined, outlineOnly: false })} />
        <Toggle on={!!layer.shadow} label="Glow" onChange={(on) => s({ shadow: on ? { color: layer.color, blur: Math.round(layer.fontSize * 0.25), dx: 0, dy: 0 } : undefined })} />
        <Toggle on={layer.highlight?.style === 'marker'} label="Marker" onChange={(on) => s({ highlight: on ? { color: '#FFD84A', style: 'marker', pad: 0.12 } : undefined })} />
        <Toggle on={layer.highlight?.style === 'box'} label="Box" onChange={(on) => s({ highlight: on ? { color: '#141414', style: 'box', pad: 0.25 } : undefined })} />
        <Toggle on={layer.highlight?.style === 'dymo'} label="Label tape" onChange={(on) => s({ highlight: on ? { color: '#E2462C', style: 'dymo', pad: 0.4 } : undefined, uppercase: on || layer.uppercase })} />
      </div>
      {layer.stroke && (
        <>
          <Swatches colors={colors} value={layer.stroke.color} onChange={(color) => s({ stroke: { ...layer.stroke!, color } })} label="Stroke colour" />
          <Range label="Stroke" value={layer.stroke.width} min={1} max={Math.max(8, Math.round(layer.fontSize * 0.15))} step={1} onChange={(width) => s({ stroke: { ...layer.stroke!, width } })} />
        </>
      )}
      {layer.highlight && <Swatches colors={colors} value={layer.highlight.color} onChange={(color) => s({ highlight: { ...layer.highlight!, color } })} label="Highlight colour" />}
      {layer.shadow && <Swatches colors={colors} value={layer.shadow.color} onChange={(color) => s({ shadow: { ...layer.shadow!, color } })} label="Glow colour" />}
    </>
  );
}

function FontTab({ layer, set }: { layer: TextLayer; set: Setter }) {
  const s = (patch: Partial<TextLayer>) => set(patch as Partial<Layer>);
  const def = fontByValue(layer.fontFamily);
  return (
    <>
      <div className="grid2">
        <Num label="Size" value={layer.fontSize} min={4} onChange={(fontSize) => s({ fontSize: Math.max(4, fontSize) })} />
        <Num label="Line" value={layer.lineHeight} step={0.05} min={0.6} onChange={(lineHeight) => s({ lineHeight })} />
      </div>
      {def && def.weights.length > 1 && (
        <div className="seg" role="group" aria-label="Weight">
          {def.weights.map((w) => (
            <button key={w} className={layer.fontWeight === w ? 'is-active' : ''} onClick={() => s({ fontWeight: w })} style={{ fontWeight: w }}>
              {w <= 400 ? 'Regular' : w < 800 ? 'Bold' : 'Heavy'}
            </button>
          ))}
        </div>
      )}
      <div className="seg" role="group" aria-label="Alignment">
        {(['left', 'center', 'right'] as const).map((a) => (
          <button key={a} className={layer.align === a ? 'is-active' : ''} onClick={() => s({ align: a })}>
            {a[0].toUpperCase() + a.slice(1)}
          </button>
        ))}
      </div>
      <FontPicker value={layer.fontFamily} onChange={(fontFamily) => s({ fontFamily, fontWeight: snapWeight(fontFamily, layer.fontWeight), ransom: undefined, preset: undefined })} />
    </>
  );
}

function StickerStyle({ layer, set, colors }: { layer: StickerLayer; set: Setter; colors: string[] }) {
  const def = stickerById(layer.sticker);
  const s = (patch: Partial<StickerLayer>) => set(patch as Partial<Layer>);
  return (
    <>
      <Swatches colors={colors} value={layer.color} onChange={(color) => s({ color })} label="Sticker colour" />
      <Range label="Line" value={layer.weight} min={0.4} max={2.5} step={0.05} onChange={(weight) => s({ weight })} />
      {def?.defaultLabel !== undefined && (
        <label className="field">
          <span>Label</span>
          <input value={layer.label ?? ''} onChange={(e) => s({ label: e.target.value })} placeholder={def.defaultLabel || 'Text on the sticker'} />
        </label>
      )}
      <button className="btn" onClick={() => s({ seed: Math.floor(Math.random() * 1e6) })}>
        Redraw by hand
      </button>
    </>
  );
}

function StrokeStyle({ layer, set, colors }: { layer: StrokeLayer; set: Setter; colors: string[] }) {
  const s = (patch: Partial<StrokeLayer>) => set(patch as Partial<Layer>);
  return (
    <>
      <Swatches colors={colors} value={layer.color} onChange={(color) => s({ color })} label="Ink" />
      <Range label="Thickness" value={layer.lineWidth} min={2} max={60} step={1} onChange={(lineWidth) => s({ lineWidth })} />
      <div className="seg" role="group" aria-label="Pen">
        {(['marker', 'pencil', 'dashed', 'scribble'] as const).map((st) => (
          <button key={st} className={layer.style === st ? 'is-active' : ''} onClick={() => s({ style: st })}>
            {st[0].toUpperCase() + st.slice(1)}
          </button>
        ))}
      </div>
      {layer.generated && (
        <button className="btn" onClick={() => regenerateLine(layer.id)}>
          Draw another line
        </button>
      )}
    </>
  );
}

/* ---------------- Frames & masks (thumbnails drawn by the real renderer) ---------------- */

function MediaThumb({ layer, project, patch, size = 64 }: { layer: MediaLayer; project: Project; patch: Partial<MediaLayer>; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const paint = () => {
      const cv = ref.current;
      if (!cv) return;
      const aspect = layer.width / layer.height;
      const box = size * 0.62;
      const w = aspect >= 1 ? box : box * aspect;
      const h = aspect >= 1 ? box / aspect : box;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = size * dpr;
      cv.height = size * dpr;
      const k = w / layer.width;
      const one: MediaLayer = { ...layer, ...patch, x: (size - w) / 2 / k, y: (size - h) / 2 / k, rotation: 0, opacity: 1, visible: true, radius: layer.radius } as MediaLayer;
      const mini: Project = { ...project, canvas: { pageWidth: size / k, pageHeight: size / k, background: 'rgba(0,0,0,0)' }, pages: [{ id: 'thumb' }], layers: [one] };
      drawPage(cv.getContext('2d')!, mini, 0, 0, library.sources(), { scale: k * dpr, showAllClips: true });
    };
    paint();
    return library.onChange(paint);
  }, [layer, project, patch, size]);
  return <canvas ref={ref} style={{ width: size, height: size }} aria-hidden />;
}

const FRAMES: { value: MediaFrame['kind'] | 'none'; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'polaroid', label: 'Instant' },
  { value: 'film', label: '35 mm' },
  { value: 'stamp', label: 'Stamp' },
  { value: 'tape', label: 'Taped' },
  { value: 'shadow', label: 'Print' },
];

function FrameTab({ layer, project, set }: { layer: MediaLayer; project: Project; set: Setter }) {
  const current = layer.frame?.kind ?? 'none';
  return (
    <>
      <div className="look-grid" role="radiogroup" aria-label="Frame">
        {FRAMES.map((f) => {
          const patch = { frame: f.value === 'none' ? undefined : { kind: f.value, caption: f.value === 'polaroid' ? (layer.frame?.caption ?? '') : undefined } } as Partial<MediaLayer>;
          return (
            <button key={f.value} role="radio" aria-checked={current === f.value} className={`look ${current === f.value ? 'is-active' : ''}`} onClick={() => set(patch as Partial<Layer>)} data-testid={`frame-${f.value}`}>
              <MediaThumb layer={layer} project={project} patch={patch} />
              <span>{f.label}</span>
            </button>
          );
        })}
      </div>
      {layer.frame?.kind === 'polaroid' && (
        <label className="field">
          <span>Caption (handwritten)</span>
          <input value={layer.frame.caption ?? ''} placeholder="summer ’26" onChange={(e) => set({ frame: { ...layer.frame!, caption: e.target.value } } as Partial<Layer>)} />
        </label>
      )}
      {layer.frame && layer.frame.kind !== 'tape' && layer.frame.kind !== 'shadow' && (
        <Swatches colors={['#F7F4EC', '#EFE6D2', '#141414', '#D9D2C3', '#FFD84A']} value={layer.frame.color ?? (layer.frame.kind === 'film' ? '#141414' : '#F7F4EC')} onChange={(color) => set({ frame: { ...layer.frame!, color } } as Partial<Layer>)} label="Frame colour" />
      )}
    </>
  );
}

const MASKS: { value: MaskKind; label: string }[] = [
  { value: 'rect', label: 'Rectangle' },
  { value: 'circle', label: 'Circle' },
  { value: 'arch', label: 'Arch' },
  { value: 'blob', label: 'Blob' },
  { value: 'torn', label: 'Torn' },
  { value: 'stamp', label: 'Perforated' },
  { value: 'ticket', label: 'Ticket' },
];

function MaskTab({ layer, project, set }: { layer: MediaLayer; project: Project; set: Setter }) {
  const current = layer.mask ?? 'rect';
  return (
    <>
      <div className="look-grid" role="radiogroup" aria-label="Mask">
        {MASKS.map((m) => {
          const patch = { mask: m.value === 'rect' ? undefined : m.value } as Partial<MediaLayer>;
          return (
            <button key={m.value} role="radio" aria-checked={current === m.value} className={`look ${current === m.value ? 'is-active' : ''}`} onClick={() => set({ ...patch, seed: layer.seed ?? Math.floor(Math.random() * 1e6) } as Partial<Layer>)} data-testid={`mask-${m.value}`}>
              <MediaThumb layer={layer} project={project} patch={patch} />
              <span>{m.label}</span>
            </button>
          );
        })}
      </div>
      {(current === 'blob' || current === 'torn') && (
        <button className="btn" onClick={() => set({ seed: Math.floor(Math.random() * 1e6) } as Partial<Layer>)}>
          Another shape
        </button>
      )}
    </>
  );
}

interface DetectedFace {
  boundingBox: DOMRectReadOnly;
}
type FaceDetectorCtor = new (o?: { fastMode?: boolean; maxDetectedFaces?: number }) => { detect(src: ImageBitmapSource): Promise<DetectedFace[]> };

function CropTab({ layer, project, set, onReplace }: { layer: MediaLayer; project: Project; set: Setter; onReplace(id: string): void }) {
  const crop = useUi((s) => s.crop);
  const setUi = useUi((s) => s.set);
  const asset = project.assets.find((a) => a.id === layer.assetId);
  const FD = (globalThis as { FaceDetector?: FaceDetectorCtor }).FaceDetector;
  const [finding, setFinding] = useState(false);
  const findFace = async () => {
    const bmp = library.imageBitmap(layer.assetId);
    if (!FD || !bmp || !asset) return;
    setFinding(true);
    try {
      const faces = await new FD({ fastMode: true, maxDetectedFaces: 4 }).detect(bmp);
      if (faces.length) {
        const f = faces.reduce((a, b) => (a.boundingBox.width * a.boundingBox.height > b.boundingBox.width * b.boundingBox.height ? a : b));
        set({ poi: { x: (f.boundingBox.x + f.boundingBox.width / 2) / bmp.width, y: (f.boundingBox.y + f.boundingBox.height / 2) / bmp.height } } as Partial<Layer>);
      }
    } catch {
      /* not supported for this image */
    } finally {
      setFinding(false);
    }
  };
  return (
    <>
      {asset && (
        <p className="hint">
          {asset.name} · {asset.width} × {asset.height}
          {asset.type === 'video' ? ` · ${(asset.durationMs / 1000).toFixed(1)} s${asset.hasAudio ? ' · audio' : ' · no audio'}` : ''}
        </p>
      )}
      <button className={`btn btn--block ${crop ? 'btn--primary' : ''}`} onClick={() => setUi({ crop: !crop })} data-testid="crop-toggle">
        <Icon name="crop" /> {crop ? 'Done' : 'Move inside frame'}
      </button>
      <Range label="Zoom" value={layer.crop.zoom} min={1} max={4} step={0.01} onChange={(zoom) => set({ crop: { ...layer.crop, zoom } } as Partial<Layer>)} />
      <Range label="Horizontal" value={layer.crop.focusX} min={0} max={1} step={0.001} onChange={(focusX) => set({ crop: { ...layer.crop, focusX } } as Partial<Layer>)} />
      <Range label="Vertical" value={layer.crop.focusY} min={0} max={1} step={0.001} onChange={(focusY) => set({ crop: { ...layer.crop, focusY } } as Partial<Layer>)} />
      <h4 className="insp-sub">What matters</h4>
      <p className="hint">In crop mode, double-tap the photo on what must never be cut (a face, a sign). CLLGE warns you if a seam lands on it.</p>
      <div className="row">
        {FD && layer.type === 'image' && (
          <button className="btn btn--sm" disabled={finding} onClick={() => void findFace()}>
            <Icon name="target" size={16} /> {finding ? 'Looking…' : 'Find a face'}
          </button>
        )}
        {layer.poi && (
          <button className="btn btn--sm" onClick={() => set({ poi: undefined } as Partial<Layer>)}>
            Clear point
          </button>
        )}
      </div>
      <button className="btn" onClick={() => onReplace(layer.id)}>
        Replace…
      </button>
    </>
  );
}

function ClipSection({ layer, project }: { layer: VideoLayer; project: Project }) {
  const apply = useEditor((s) => s.apply);
  const asset = project.assets.find((a) => a.id === layer.assetId);
  const maxMs = asset?.type === 'video' ? asset.durationMs : layer.clip.outMs;
  const hasAudio = asset?.type === 'video' && asset.hasAudio;
  const c = layer.clip;
  const setClip = (patch: Partial<VideoLayer['clip']>) =>
    apply((p) => {
      const next = { ...c, ...patch };
      next.inMs = Math.max(0, Math.min(next.inMs, maxMs - 100));
      next.outMs = Math.max(next.inMs + 100, Math.min(next.outMs, maxMs));
      next.startMs = Math.max(0, next.startMs);
      return updateLayer(p, layer.id, { clip: next } as Partial<VideoLayer>);
    });
  const s = (ms: number) => Math.round(ms) / 1000;
  return (
    <>
      <div className="grid2">
        <Num label="In" value={s(c.inMs)} step={0.1} suffix="s" onChange={(v) => setClip({ inMs: v * 1000 })} />
        <Num label="Out" value={s(c.outMs)} step={0.1} suffix="s" onChange={(v) => setClip({ outMs: v * 1000 })} />
        <Num label="Starts at" value={s(c.startMs)} step={0.1} suffix="s" onChange={(v) => setClip({ startMs: v * 1000 })} />
        <Num label="Volume" value={Math.round(c.gain * 100)} min={0} max={200} suffix="%" onChange={(v) => setClip({ gain: Math.max(0, v / 100) })} />
      </div>
      <p className="hint">
        Plays {s(c.outMs - c.inMs)} s, from {s(c.startMs)} s to {s(clipEndMs(c))} s on the slide, then holds its last frame.
        {!hasAudio && ' This clip has no audio track.'}
      </p>
    </>
  );
}
