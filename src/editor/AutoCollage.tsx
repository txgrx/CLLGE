import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { build, plan, RECIPE_LABEL, STYLE_LABEL, type ComposeStyle, type Group } from '../autolayout/compose';
import { importFiles } from '../media/importMedia';
import { library } from '../media/library';
import { FORMAT_PRESETS, type Asset, type Project } from '../model/types';
import { drawPage } from '../render/drawWindow';
import { ensureFonts } from '../ui/fonts';
import { Icon } from '../ui/Icon';
import { listItem, listParent, spring } from '../ui/motion';

export interface MediaItem {
  asset: Asset;
  blob: Blob;
}

interface Props {
  /** Media to start from (the editor passes the project's photos and clips). */
  media: MediaItem[];
  title: string;
  /** Fixed slide size (editor); when absent the user picks a format. */
  size?: { width: number; height: number };
  applyLabel?: string;
  onApply(project: Project, blobs: Map<string, Blob>): void;
  onClose(): void;
}

const STYLES = Object.keys(STYLE_LABEL) as ComposeStyle[];

/**
 * Auto-collage: choose photos, get a whole carousel laid out — cover, spreads,
 * a photo across a seam, a closing slide. "Another idea" reshuffles; locked slides stay.
 */
export function AutoCollage({ media, title, size, applyLabel = 'Use this layout', onApply, onClose }: Props) {
  const [items, setItems] = useState<MediaItem[]>(media);
  const [style, setStyle] = useState<ComposeStyle>('editorial');
  const [seed, setSeed] = useState(() => 1 + Math.floor(Math.random() * 999));
  const [locked, setLocked] = useState<Group[]>([]);
  const [format, setFormat] = useState(FORMAT_PRESETS[0].key);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const f = FORMAT_PRESETS.find((x) => x.key === format)!;
  const W = size?.width ?? f.width;
  const H = size?.height ?? f.height;

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  const add = async (files: File[]) => {
    if (!files.length) return;
    setBusy(true);
    const { ok, failed } = await importFiles(files);
    for (const m of ok) library.add(m.asset, m.blob);
    setItems((x) => [...x, ...ok.map((m) => ({ asset: m.asset, blob: m.blob }))]);
    setErrors(failed.map((x) => `${x.name}: ${x.reason}`));
    setLocked([]);
    setBusy(false);
  };

  const assets = useMemo(() => items.map((m) => m.asset), [items]);
  const input0 = useMemo(() => ({ assets, pageWidth: W, pageHeight: H, style, seed, locked, title }), [assets, W, H, style, seed, locked, title]);
  const pl = useMemo(() => (assets.length ? plan(input0) : null), [input0, assets.length]);
  const project = useMemo(() => (pl ? build(input0, pl) : null), [pl, input0]);

  const toggleLock = (g: Group) => setLocked((l) => (l.some((x) => x.key === g.key) ? l.filter((x) => x.key !== g.key) : [...l, g]));
  const move = (i: number, d: -1 | 1) =>
    setItems((x) => {
      const j = i + d;
      if (j < 0 || j >= x.length) return x;
      const n = [...x];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });

  return (
    <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className="sheet sheet--wide auto" role="dialog" aria-modal="true" aria-labelledby="auto-h" initial={{ y: 40, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 20, opacity: 0, scale: 0.98 }} transition={spring} onClick={(e) => e.stopPropagation()} data-testid="auto-collage">
        <div className="sheet__head">
          <h2 className="sheet__title" id="auto-h">
            Auto collage <em>· it lays out, you adjust</em>
          </h2>
          <button className="btn btn--icon btn--ghost" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>

        <div className="auto__media">
          <motion.ol className="auto__thumbs" initial="initial" animate="animate" variants={listParent} aria-label="Photos in order">
            {items.map((m, i) => (
              <motion.li key={m.asset.id} variants={listItem} layout transition={spring}>
                <MediaChip item={m} />
                <span className="auto__n mono">{i + 1}</span>
                <span className="auto__chip-tools">
                  <button aria-label={`Move ${m.asset.name} earlier`} disabled={i === 0} onClick={() => move(i, -1)}>
                    ‹
                  </button>
                  <button aria-label={`Remove ${m.asset.name}`} onClick={() => setItems((x) => x.filter((_, k) => k !== i))}>
                    ×
                  </button>
                  <button aria-label={`Move ${m.asset.name} later`} disabled={i === items.length - 1} onClick={() => move(i, 1)}>
                    ›
                  </button>
                </span>
              </motion.li>
            ))}
            <li>
              <button className="auto__add" onClick={() => input.current?.click()} disabled={busy} data-testid="auto-add">
                <Icon name="plus" />
                <span>{busy ? 'Reading…' : items.length ? 'More' : 'Choose photos'}</span>
              </button>
            </li>
          </motion.ol>
          <input
            ref={input}
            type="file"
            accept="image/*,video/*"
            multiple
            hidden
            data-testid="auto-input"
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = '';
              void add(files);
            }}
          />
          {errors.map((x) => (
            <p key={x} className="notice notice--warn">
              {x}
            </p>
          ))}
        </div>

        <div className="auto__controls">
          <div className="chips" role="radiogroup" aria-label="Style">
            {STYLES.map((s) => (
              <button key={s} role="radio" aria-checked={s === style} className={`chip chip--lg ${s === style ? 'is-active' : ''}`} onClick={() => setStyle(s)} data-testid={`auto-style-${s}`}>
                {STYLE_LABEL[s]}
              </button>
            ))}
          </div>
          {!size && (
            <select value={format} onChange={(e) => setFormat(e.target.value)} aria-label="Slide format" className="auto__format">
              {FORMAT_PRESETS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="auto__preview">
          {project && pl ? (
            <Strip project={project} groups={pl.groups} locked={locked} onLock={toggleLock} />
          ) : (
            <div className="auto__empty">
              <p className="serif">Pick 3 to 30 photos (or clips). CLLGE lays them out over the slides, keeping your order.</p>
            </div>
          )}
          {pl && pl.dropped > 0 && <p className="hint">{pl.dropped} left out: a carousel holds 20 slides at most.</p>}
        </div>

        <div className="auto__bar">
          <button className="btn" disabled={!project} onClick={() => setSeed((s) => s + 1)} data-testid="auto-another">
            <Icon name="auto" /> Another idea
          </button>
          <span className="hint">{locked.length ? `${locked.length} locked · ` : ''}Tap a lock to keep a slide.</span>
          <button
            className="btn btn--primary"
            disabled={!project}
            data-testid="auto-apply"
            onClick={() => {
              if (!project) return;
              const blobs = new Map(items.map((m) => [m.asset.id, m.blob]));
              onApply(project, blobs);
            }}
          >
            {applyLabel}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function MediaChip({ item }: { item: MediaItem }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (item.asset.type !== 'image') return;
    const u = URL.createObjectURL(item.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [item]);
  return url ? <img src={url} alt={item.asset.name} /> : <span className="auto__clip" aria-label={item.asset.name}><Icon name="clip" /></span>;
}

function Strip({ project, groups, locked, onLock }: { project: Project; groups: Group[]; locked: Group[]; onLock(g: Group): void }) {
  let page = 0;
  return (
    <div className="auto__strip" data-testid="auto-strip">
      <AnimatePresence initial={false} mode="popLayout">
        {groups.map((g) => {
          const first = page;
          page += g.pages;
          const isLocked = locked.some((x) => x.key === g.key);
          return (
            <motion.div key={g.key + project.id} className={`auto__group ${isLocked ? 'is-locked' : ''}`} initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0 }} transition={{ ...spring, delay: first * 0.03 }}>
              <div className="auto__group-head">
                <span className="mono">{RECIPE_LABEL[g.recipe]}</span>
                <button className={`auto__lock ${isLocked ? 'is-on' : ''}`} onClick={() => onLock(g)} aria-pressed={isLocked} aria-label={`${isLocked ? 'Unlock' : 'Lock'} slide ${first + 1}`}>
                  <Icon name={isLocked ? 'lock' : 'unlock'} size={14} />
                </button>
              </div>
              <div className="auto__pages">
                {Array.from({ length: g.pages }, (_, k) => (
                  <PageThumb key={k} project={project} index={first + k} />
                ))}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

function PageThumb({ project, index }: { project: Project; index: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let live = true;
    const paint = () => {
      const cv = ref.current;
      if (!cv || !live) return;
      const h = 168;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const scale = (h * dpr) / project.canvas.pageHeight;
      cv.width = Math.round(project.canvas.pageWidth * scale);
      cv.height = Math.round(h * dpr);
      cv.style.height = `${h}px`;
      cv.style.width = `${Math.round((project.canvas.pageWidth * h) / project.canvas.pageHeight)}px`;
      drawPage(cv.getContext('2d')!, project, index, 0, library.sources(), { scale, showAllClips: true });
    };
    paint();
    void ensureFonts(project.layers).then(paint);
    const off = library.onChange(paint);
    return () => {
      live = false;
      off();
    };
  }, [project, index]);
  return <canvas ref={ref} aria-label={`Slide ${index + 1}`} role="img" />;
}
