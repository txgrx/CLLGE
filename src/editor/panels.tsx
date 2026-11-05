import { motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { STICKERS, type StickerDef } from '../render/shapes';
import { FONT_GROUP_LABEL, FONTS, familyOf, fontByValue, type FontGroup } from '../ui/fonts';
import { Icon, type IconName } from '../ui/Icon';
import { listItem, listParent, spring } from '../ui/motion';
import { addBridge, addContinuousLine, addSticker, addText, BRIDGES, regenerateLine, type BridgeKind } from './actions';
import { Swatches, usePalette } from './palette';
import { useEditor } from './store';
import { TEXT_PRESETS, type TextPreset } from './textPresets';
import { useUi, type Pen } from './ui';

export function PanelHead({ title, onClose, children }: { title: string; onClose?(): void; children?: ReactNode }) {
  return (
    <div className="panel-head">
      <h3>{title}</h3>
      {children}
      {onClose && (
        <button className="icon" onClick={onClose} aria-label={`Close ${title.toLowerCase()}`}>
          <Icon name="close" size={17} />
        </button>
      )}
    </div>
  );
}

/* ---------------- Add (mobile sheet + desktop empty state) ---------------- */

export interface AddAction {
  id: string;
  icon: IconName;
  label: string;
  run(): void;
  accent?: boolean;
}

export function AddGrid({ actions }: { actions: AddAction[] }) {
  return (
    <motion.div className="add-grid" initial="initial" animate="animate" variants={listParent}>
      {actions.map((a) => (
        <motion.button key={a.id} variants={listItem} className={`add-tile ${a.accent ? 'add-tile--accent' : ''}`} onClick={a.run} data-testid={`add-${a.id}`}>
          <Icon name={a.icon} size={24} />
          <span>{a.label}</span>
        </motion.button>
      ))}
    </motion.div>
  );
}

/* ---------------- Stickers ---------------- */

/** Light inks get a dark tile so they stay visible. */
function isLight(c: string): boolean {
  const m = /^#([0-9a-f]{6})$/i.exec(c);
  if (!m) return /rgba?\(2[0-5]\d/.test(c);
  const n = parseInt(m[1], 16);
  return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 170;
}

function StickerThumb({ def, color }: { def: StickerDef; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const h = 56;
    const w = Math.min(120, Math.round(h * def.aspect));
    const hh = Math.round(w / def.aspect);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = w * dpr;
    cv.height = hh * dpr;
    cv.style.width = `${w}px`;
    cv.style.height = `${hh}px`;
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, hh);
    def.draw(ctx, w, hh, { color, weight: 1, seed: 7, label: def.defaultLabel });
  }, [def, color]);
  return <canvas ref={ref} aria-hidden />;
}

export function StickerSheet({ onDone }: { onDone?(): void }) {
  const project = useEditor((s) => s.project)!;
  const colors = usePalette(project);
  const [color, setColor] = useState<string | null>(null);
  return (
    <div className="panel" data-testid="sticker-sheet">
      <p className="hint">Drawn by hand in code: sharp at any size. Tap to add one to this slide.</p>
      <Swatches colors={colors} value={color ?? ''} onChange={setColor} label="Sticker colour" />
      <motion.div className="sticker-grid" initial="initial" animate="animate" variants={listParent}>
        {STICKERS.map((s) => {
          const c = color && s.id !== 'tape' ? color : s.defaultColor;
          return (
            <motion.button
              key={s.id}
              variants={listItem}
              whileTap={{ scale: 0.92 }}
              className={`sticker-tile ${isLight(c) ? 'sticker-tile--dark' : ''}`}
              onClick={() => {
                addSticker(s.id, c);
                onDone?.();
              }}
              aria-label={`Add ${s.label} sticker`}
              data-testid={`sticker-${s.id}`}
            >
              <StickerThumb def={s} color={c} />
              <span>{s.label}</span>
            </motion.button>
          );
        })}
      </motion.div>
    </div>
  );
}

/* ---------------- Text presets ---------------- */

/** CSS approximation of a preset, for its chip. */
export function presetStyle(p: TextPreset): CSSProperties {
  const s = p.style;
  const css: CSSProperties = {
    fontFamily: s.ransom ? undefined : s.fontFamily,
    fontWeight: s.fontWeight,
    fontStyle: s.italic ? 'italic' : undefined,
    textTransform: s.uppercase ? 'uppercase' : undefined,
    letterSpacing: s.letterSpacing ? `${s.letterSpacing}em` : undefined,
    color: s.outlineOnly ? 'transparent' : s.color,
    WebkitTextStroke: s.stroke ? `1px ${s.stroke.color}` : undefined,
    textShadow: s.shadow ? `0 0 10px ${s.shadow.color}` : undefined,
    transform: s.rotation ? `rotate(${s.rotation}deg)` : undefined,
  };
  if (s.highlight?.style === 'marker') css.background = `linear-gradient(transparent 18%, ${s.highlight.color} 18%, ${s.highlight.color} 88%, transparent 88%)`;
  if (s.highlight?.style === 'dymo') {
    css.background = s.highlight.color;
    css.padding = '1px 6px';
    css.borderRadius = 3;
  }
  return css;
}

function RansomSample({ text }: { text: string }) {
  const fonts = TEXT_PRESETS.find((p) => p.id === 'ransom')!.style.ransom!.fonts;
  const papers = ['#F4F1EA', '#141414', '#FFD84A', '#E2462C', '#F4F1EA'];
  return (
    <span className="ransom">
      {[...text].map((ch, i) => (
        <span key={i} style={{ fontFamily: fonts[(i * 5 + 3) % fonts.length], background: papers[i % papers.length], color: i % 5 === 1 ? '#F4F1EA' : '#141414', transform: `rotate(${((i * 37) % 9) - 4}deg)` }}>
          {ch}
        </span>
      ))}
    </span>
  );
}

export function PresetChips({ onPick, active }: { onPick(p: TextPreset): void; active?: string }) {
  return (
    <div className="preset-grid" role="list">
      {TEXT_PRESETS.map((p) => (
        <button key={p.id} role="listitem" className={`preset ${active === p.id ? 'is-active' : ''}`} onClick={() => onPick(p)} data-testid={`preset-${p.id}`} aria-label={`${p.label} text style`}>
          <span className="preset__sample" style={p.id === 'ransom' ? undefined : presetStyle(p)}>
            {p.id === 'ransom' ? <RansomSample text="Note" /> : p.id === 'curved' ? <CurvedSample font={p.style.fontFamily!} /> : p.sample}
          </span>
          <span className="preset__label">{p.label}</span>
        </button>
      ))}
    </div>
  );
}

function CurvedSample({ font }: { font: string }) {
  return (
    <svg viewBox="0 0 120 44" width="96" height="36" aria-hidden>
      <path id="curve-sample" d="M8 36 Q60 4 112 36" fill="none" />
      <text fontFamily={font} fontStyle="italic" fontSize="17" fill="currentColor">
        <textPath href="#curve-sample" startOffset="50%" textAnchor="middle">
          around &amp; around
        </textPath>
      </text>
    </svg>
  );
}

export function TextPanel({ onDone }: { onDone?(): void }) {
  return (
    <div className="panel" data-testid="text-panel">
      <button
        className="btn btn--block"
        onClick={() => {
          addText();
          onDone?.();
        }}
      >
        <Icon name="text" /> Plain text
      </button>
      <PresetChips
        onPick={(p) => {
          addText(p);
          onDone?.();
        }}
      />
    </div>
  );
}

/* ---------------- Font picker ---------------- */

export function FontPicker({ value, onChange }: { value: string; onChange(v: string): void }) {
  const [q, setQ] = useState('');
  const current = familyOf(value);
  const groups = useMemo(() => {
    const m = new Map<FontGroup, typeof FONTS>();
    for (const f of FONTS) {
      if (q && !f.label.toLowerCase().includes(q.toLowerCase()) && !FONT_GROUP_LABEL[f.group].toLowerCase().includes(q.toLowerCase())) continue;
      m.set(f.group, [...(m.get(f.group) ?? []), f]);
    }
    return [...m.entries()];
  }, [q]);
  return (
    <div className="fontpicker" data-testid="font-picker">
      <input className="fontpicker__search" type="search" placeholder="Search 21 fonts" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search fonts" />
      {groups.map(([g, list]) => (
        <div key={g} className="fontpicker__group" role="radiogroup" aria-label={FONT_GROUP_LABEL[g]}>
          <h4>{FONT_GROUP_LABEL[g]}</h4>
          {list.map((f) => (
            <button key={f.family} role="radio" aria-checked={f.family === current} className={`fontpicker__item ${f.family === current ? 'is-active' : ''}`} style={{ fontFamily: f.value, fontWeight: f.weights.includes(400) ? 400 : f.weights[0] }} onClick={() => onChange(f.value)}>
              {f.label}
              {f.family === current && <Icon name="check" size={16} />}
            </button>
          ))}
        </div>
      ))}
      {!groups.length && <p className="hint">No font called “{q}”.</p>}
      {!fontByValue(value) && <p className="hint">Current: {current}</p>}
    </div>
  );
}

/* ---------------- Draw ---------------- */

const PEN_STYLES: { value: Pen['style']; label: string }[] = [
  { value: 'marker', label: 'Marker' },
  { value: 'pencil', label: 'Pencil' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'scribble', label: 'Scribble' },
];

export function DrawPanel({ onDone }: { onDone?(): void }) {
  const project = useEditor((s) => s.project)!;
  const selection = useEditor((s) => s.selection);
  const pen = useUi((s) => s.pen);
  const set = useUi((s) => s.set);
  const colors = usePalette(project);
  const selected = selection.length === 1 ? project.layers.find((l) => l.id === selection[0]) : undefined;
  const generated = selected?.type === 'stroke' && selected.generated ? selected : undefined;
  const setPen = (patch: Partial<Pen>) => set({ pen: { ...pen, ...patch } });
  return (
    <div className="panel" data-testid="draw-panel">
      <p className="hint">Drag on the slides to draw. Lines can run across seams — that is the point.</p>
      <div className="pen-styles" role="radiogroup" aria-label="Pen">
        {PEN_STYLES.map((s) => (
          <button key={s.value} role="radio" aria-checked={pen.style === s.value} className={`pen-style ${pen.style === s.value ? 'is-active' : ''}`} onClick={() => setPen({ style: s.value })}>
            <PenSample style={s.value} color={pen.color} />
            {s.label}
          </button>
        ))}
      </div>
      <Swatches colors={colors} value={pen.color} onChange={(color) => setPen({ color })} label="Ink" />
      <label className="range">
        <span>Thickness</span>
        <input type="range" min={3} max={48} step={1} value={pen.width} onChange={(e) => setPen({ width: Number(e.target.value) })} />
      </label>
      <div className="row">
        <button className="btn" onClick={() => addContinuousLine()} data-testid="continuous-line">
          <Icon name="swipe" /> Continuous line
        </button>
        {generated && (
          <motion.button className="btn" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={spring} onClick={() => regenerateLine(generated.id)}>
            Another one
          </motion.button>
        )}
      </div>
      {onDone && (
        <button className="btn btn--primary btn--block" onClick={onDone}>
          Done drawing
        </button>
      )}
    </div>
  );
}

function PenSample({ style, color }: { style: Pen['style']; color: string }) {
  const d = 'M4 18 C 14 4, 22 26, 34 12 S 50 8, 56 14';
  return (
    <svg viewBox="0 0 60 26" width="54" height="24" aria-hidden>
      {style === 'pencil' ? (
        <>
          <path d={d} stroke={color} strokeWidth={1.6} fill="none" opacity={0.6} />
          <path d={d} stroke={color} strokeWidth={1} fill="none" opacity={0.5} transform="translate(0.8 0.6)" />
        </>
      ) : style === 'dashed' ? (
        <path d={d} stroke={color} strokeWidth={3} strokeDasharray="6 5" strokeLinecap="round" fill="none" />
      ) : style === 'scribble' ? (
        <>
          <path d={d} stroke={color} strokeWidth={2} fill="none" />
          <path d={d} stroke={color} strokeWidth={2} fill="none" transform="translate(1.5 2)" />
        </>
      ) : (
        <path d={d} stroke={color} strokeWidth={4} strokeLinecap="round" fill="none" />
      )}
    </svg>
  );
}

/* ---------------- Bridges ---------------- */

const BRIDGE_ICON: Record<BridgeKind, IconName> = { photo: 'media', tape: 'shape', text: 'text', arrow: 'next', swipe: 'swipe', line: 'pano' };

export function BridgePanel({ onPhoto, onDone }: { onPhoto(seam: number): void; onDone?(): void }) {
  const project = useEditor((s) => s.project)!;
  const seam = useUi((s) => s.seam);
  const set = useUi((s) => s.set);
  const seams = project.pages.length - 1;
  const k = Math.min(Math.max(1, seam), Math.max(1, seams));
  if (seams < 1) return <p className="hint panel">Add a second slide to build a bridge between slides.</p>;
  return (
    <div className="panel" data-testid="bridge-panel">
      <p className="hint">Things that cross the cut make people swipe. Pick a seam, then a bridge.</p>
      <div className="seam-pick" role="radiogroup" aria-label="Seam">
        {Array.from({ length: seams }, (_, i) => i + 1).map((s) => (
          <button key={s} role="radio" aria-checked={s === k} className={`seam-pick__btn mono ${s === k ? 'is-active' : ''}`} onClick={() => set({ seam: s })}>
            {String(s).padStart(2, '0')}
            <i aria-hidden />
            {String(s + 1).padStart(2, '0')}
          </button>
        ))}
      </div>
      <div className="bridge-grid">
        {BRIDGES.map((b) => (
          <button
            key={b.kind}
            className="bridge"
            data-testid={`bridge-${b.kind}`}
            onClick={() => {
              if (b.kind === 'photo') onPhoto(k);
              else addBridge(b.kind, k);
              onDone?.();
            }}
          >
            <Icon name={BRIDGE_ICON[b.kind]} size={20} />
            <strong>{b.label}</strong>
            <span>{b.hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
