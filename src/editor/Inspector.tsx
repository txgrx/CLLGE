import type { ReactNode } from 'react';
import { planPages } from '../model/plan';
import { addPageAtEnd, removeLastPage, updateLayer } from '../model/project';
import { clipEndMs } from '../model/timing';
import { MAX_PAGES, type Layer, type Project, type VideoLayer } from '../model/types';
import { TEXT_FONTS } from '../ui/fonts';
import { useEditor } from './store';

const FONTS = TEXT_FONTS;

export function Inspector({ onReplace }: { onReplace(layerId: string): void }) {
  const project = useEditor((s) => s.project)!;
  const selection = useEditor((s) => s.selection);
  const layer = selection.length === 1 ? project.layers.find((l) => l.id === selection[0]) : undefined;
  return <aside className="inspector" aria-label="Inspector">{layer ? <LayerInspector layer={layer} project={project} onReplace={onReplace} /> : <ProjectInspector project={project} />}</aside>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="insp-section">
      <h3>{title}</h3>
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

function ProjectInspector({ project }: { project: Project }) {
  const apply = useEditor((s) => s.apply);
  const plans = planPages(project);
  const videoLayers = project.layers.filter((l): l is VideoLayer => l.type === 'video');
  return (
    <>
      <Section title="Carousel">
        <label className="field">
          <span>Title</span>
          <input value={project.title} onChange={(e) => apply((p) => ({ ...p, title: e.target.value }))} />
        </label>
        <p className="hint">
          {project.pages.length} pages · {project.canvas.pageWidth} × {project.canvas.pageHeight} each
        </p>
        <label className="field field--inline">
          <span>Background</span>
          <input type="color" value={project.canvas.background} onChange={(e) => apply((p) => ({ ...p, canvas: { ...p.canvas, background: e.target.value } }))} />
        </label>
        <div className="row">
          <button className="btn" disabled={project.pages.length >= MAX_PAGES} onClick={() => apply(addPageAtEnd)}>
            + Page
          </button>
          <button
            className="btn"
            disabled={project.pages.length <= 1}
            onClick={() => {
              const last = plans[plans.length - 1];
              if (last.layers.length && !confirm(`Page ${last.index + 1} has content. Remove it? Anything on it will no longer be exported (Undo brings it back).`)) return;
              apply(removeLastPage);
            }}
          >
            − Last page
          </button>
        </div>
      </Section>
      <Section title="Pages">
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
                  aria-label={`Audio for page ${pl.index + 1}`}
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
        <p className="hint">A page becomes a video when a clip reaches it or it has audio. The first clip you added is heard by default.</p>
      </Section>
    </>
  );
}

function LayerInspector({ layer, project, onReplace }: { layer: Layer; project: Project; onReplace(id: string): void }) {
  const apply = useEditor((s) => s.apply);
  const set = (patch: Partial<Layer>) => apply((p) => updateLayer(p, layer.id, patch));
  const asset = 'assetId' in layer ? project.assets.find((a) => a.id === layer.assetId) : undefined;
  return (
    <>
      <Section title={layer.type === 'image' ? 'Photo' : layer.type === 'video' ? 'Video' : layer.type === 'text' ? 'Text' : 'Shape'}>
        <label className="field">
          <span>Name</span>
          <input value={layer.name ?? ''} onChange={(e) => set({ name: e.target.value })} />
        </label>
        <div className="grid2">
          <Num label="X" value={layer.x} onChange={(x) => set({ x })} />
          <Num label="Y" value={layer.y} onChange={(y) => set({ y })} />
          <Num label="W" value={layer.width} min={1} onChange={(width) => set({ width: Math.max(1, width) })} />
          <Num label="H" value={layer.height} min={1} onChange={(height) => set({ height: Math.max(1, height) })} />
          <Num label="Rotate" value={layer.rotation} suffix="°" onChange={(rotation) => set({ rotation })} />
          <Num label="Opacity" value={Math.round(layer.opacity * 100)} min={0} max={100} suffix="%" onChange={(o) => set({ opacity: Math.min(1, Math.max(0, o / 100)) })} />
        </div>
      </Section>

      {(layer.type === 'image' || layer.type === 'video') && (
        <Section title="Framing">
          {asset && (
            <p className="hint">
              {asset.name} · {asset.width} × {asset.height}
              {asset.type === 'video' ? ` · ${(asset.durationMs / 1000).toFixed(1)} s${asset.hasAudio ? ' · audio' : ' · no audio'}` : ''}
            </p>
          )}
          <div className="seg" role="group" aria-label="Fit">
            {(['cover', 'contain'] as const).map((f) => (
              <button key={f} className={layer.fit === f ? 'is-active' : ''} onClick={() => set({ fit: f } as Partial<Layer>)}>
                {f === 'cover' ? 'Fill' : 'Fit'}
              </button>
            ))}
          </div>
          <label className="range">
            <span>Zoom</span>
            <input type="range" min={1} max={4} step={0.01} value={layer.crop.zoom} onChange={(e) => set({ crop: { ...layer.crop, zoom: Number(e.target.value) } } as Partial<Layer>)} />
          </label>
          <label className="range">
            <span>Horizontal</span>
            <input type="range" min={0} max={1} step={0.001} value={layer.crop.focusX} onChange={(e) => set({ crop: { ...layer.crop, focusX: Number(e.target.value) } } as Partial<Layer>)} />
          </label>
          <label className="range">
            <span>Vertical</span>
            <input type="range" min={0} max={1} step={0.001} value={layer.crop.focusY} onChange={(e) => set({ crop: { ...layer.crop, focusY: Number(e.target.value) } } as Partial<Layer>)} />
          </label>
          <Num label="Corners" value={layer.radius} min={0} onChange={(radius) => set({ radius: Math.max(0, radius) } as Partial<Layer>)} />
          <p className="hint">Double-click the photo to drag it inside its frame. Moving the frame never changes the crop.</p>
          <button className="btn" onClick={() => onReplace(layer.id)}>
            Replace…
          </button>
        </Section>
      )}

      {layer.type === 'video' && <ClipSection layer={layer} maxMs={asset?.type === 'video' ? asset.durationMs : layer.clip.outMs} hasAudio={asset?.type === 'video' && asset.hasAudio} />}

      {layer.type === 'text' && (
        <Section title="Text">
          <textarea value={layer.text} rows={3} onChange={(e) => set({ text: e.target.value } as Partial<Layer>)} aria-label="Text content" />
          <label className="field">
            <span>Font</span>
            <select value={layer.fontFamily} onChange={(e) => set({ fontFamily: e.target.value } as Partial<Layer>)}>
              {FONTS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <div className="grid2">
            <Num label="Size" value={layer.fontSize} min={4} onChange={(fontSize) => set({ fontSize: Math.max(4, fontSize) } as Partial<Layer>)} />
            <Num label="Weight" value={layer.fontWeight} step={100} min={100} max={900} onChange={(fontWeight) => set({ fontWeight } as Partial<Layer>)} />
            <Num label="Line" value={layer.lineHeight} step={0.05} min={0.6} onChange={(lineHeight) => set({ lineHeight } as Partial<Layer>)} />
            <label className="num">
              <span>Color</span>
              <input type="color" value={layer.color} onChange={(e) => set({ color: e.target.value } as Partial<Layer>)} />
            </label>
          </div>
          <div className="seg" role="group" aria-label="Alignment">
            {(['left', 'center', 'right'] as const).map((a) => (
              <button key={a} className={layer.align === a ? 'is-active' : ''} onClick={() => set({ align: a } as Partial<Layer>)}>
                {a[0].toUpperCase() + a.slice(1)}
              </button>
            ))}
          </div>
        </Section>
      )}

      {layer.type === 'shape' && (
        <Section title="Shape">
          <div className="grid2">
            <label className="num">
              <span>Fill</span>
              <input type="color" value={layer.fill} onChange={(e) => set({ fill: e.target.value } as Partial<Layer>)} />
            </label>
            <Num label="Corners" value={layer.radius} min={0} onChange={(radius) => set({ radius: Math.max(0, radius) } as Partial<Layer>)} />
          </div>
        </Section>
      )}
    </>
  );
}

function ClipSection({ layer, maxMs, hasAudio }: { layer: VideoLayer; maxMs: number; hasAudio: boolean }) {
  const apply = useEditor((s) => s.apply);
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
    <Section title="Clip timing">
      <div className="grid2">
        <Num label="In" value={s(c.inMs)} step={0.1} suffix="s" onChange={(v) => setClip({ inMs: v * 1000 })} />
        <Num label="Out" value={s(c.outMs)} step={0.1} suffix="s" onChange={(v) => setClip({ outMs: v * 1000 })} />
        <Num label="Starts at" value={s(c.startMs)} step={0.1} suffix="s" onChange={(v) => setClip({ startMs: v * 1000 })} />
        <Num label="Volume" value={Math.round(c.gain * 100)} min={0} max={200} suffix="%" onChange={(v) => setClip({ gain: Math.max(0, v / 100) })} />
      </div>
      <p className="hint">
        Plays {s(c.outMs - c.inMs)} s, from {s(c.startMs)} s to {s(clipEndMs(c))} s on the page, then holds its last frame.
        {!hasAudio && ' This clip has no audio track.'}
      </p>
    </Section>
  );
}
