import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { OpenOptions } from '../App';
import { importImage } from '../media/importMedia';
import { fitMedia } from '../model/geometry';
import type { Crop, ImageAsset, Project } from '../model/types';
import { drawPage } from '../render/drawWindow';
import { coast } from '../templates/art';
import { PhoneCarousel, Seg, Stepper, Switch } from '../ui/controls';
import { fontsReady } from '../ui/fonts';
import { Icon } from '../ui/Icon';
import { blurSwap, spring } from '../ui/motion';
import { MAX_SLIDES, MIN_SLIDES, buildPanoramaProject, sliceInfo, suggestSlides } from './split';

type FormatKey = 'portrait' | 'square' | 'tall';
const FORMATS: Record<FormatKey, { label: string; w: number; h: number }> = {
  portrait: { label: '4:5', w: 1080, h: 1350 },
  square: { label: '1:1', w: 1080, h: 1080 },
  tall: { label: '3:4', w: 1080, h: 1440 },
};

interface Props {
  onBack(): void;
  onOpen(project: Project, blobs: Map<string, Blob>, savedRevision: number | null, opts?: OpenOptions): void;
}

interface Source {
  asset: ImageAsset;
  blob: Blob;
  url: string;
  bitmap: ImageBitmap;
}

export function PanoramaFlow({ onBack, onOpen }: Props) {
  const [src, setSrc] = useState<Source | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const load = async (file: Blob & { name?: string }) => {
    setError(null);
    try {
      const { asset, blob } = await importImage(file);
      if (asset.type !== 'image') return;
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      setSrc({ asset, blob, url: URL.createObjectURL(blob), bitmap });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const sample = async () => {
    const blob = await coast(3600, 1500, 11);
    await load(Object.assign(blob, { name: 'sample-panorama.jpg' }));
  };

  return (
    <div className="pano">
      <header className="pano__bar">
        <button className="btn btn--icon btn--ghost" onClick={onBack} aria-label="Back">
          <Icon name="back" />
        </button>
        <h1 className="serif" style={{ fontSize: 24 }}>
          Split a panorama
        </h1>
        <div className="steps mono" aria-label="Steps">
          <span className={!src ? 'is-on' : ''}>01 Pick</span>
          <span className={src ? 'is-on' : ''}>02 Slice & try</span>
        </div>
      </header>
      <div className="pano__body">
        <AnimatePresence mode="wait">
          {!src ? (
            <motion.div key="pick" variants={blurSwap} initial="initial" animate="animate" exit="exit">
              <div
                className={`drop ${over ? 'is-over' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOver(true);
                }}
                onDragLeave={() => setOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setOver(false);
                  const f = e.dataTransfer.files[0];
                  if (f) void load(f);
                }}
              >
                <div style={{ display: 'grid', gap: 14, justifyItems: 'center' }}>
                  <span className="mono">Drop a wide photo here</span>
                  <p className="drop__title">One photo, several slides.</p>
                  <p className="hint" style={{ maxWidth: 380 }}>
                    We'll suggest how many slides it fills and show exactly where each cut falls.
                  </p>
                  <div className="row" style={{ justifyContent: 'center', marginTop: 6 }}>
                    <button className="btn btn--primary" onClick={() => input.current?.click()}>
                      <Icon name="media" /> Choose photo
                    </button>
                    <button className="btn" onClick={() => void sample()}>
                      Use a sample
                    </button>
                  </div>
                  {error && (
                    <p className="notice notice--error" role="alert">
                      {error}
                    </p>
                  )}
                </div>
              </div>
              <input
                ref={input}
                type="file"
                accept="image/*"
                hidden
                data-testid="pano-input"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void load(f);
                }}
              />
            </motion.div>
          ) : (
            <motion.div key="compose" variants={blurSwap} initial="initial" animate="animate" exit="exit">
              <Compose src={src} onReset={() => setSrc(null)} onOpen={onOpen} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Compose({ src, onReset, onOpen }: { src: Source; onReset(): void; onOpen: Props['onOpen'] }) {
  const [format, setFormat] = useState<FormatKey>('portrait');
  const F = FORMATS[format];
  const suggested = suggestSlides(src.asset.width, src.asset.height, F.w, F.h);
  const [slides, setSlides] = useState(suggested);
  const touched = useRef(false);
  const [crop, setCrop] = useState<Crop>({ focusX: 0.5, focusY: 0.5, zoom: 1 });
  const [cover, setCover] = useState(false);
  const [coverTitle, setCoverTitle] = useState('Somewhere\nwide');
  const [closing, setClosing] = useState(false);
  const [closingText, setClosingText] = useState('the end of the view');
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    if (!touched.current) setSlides(suggestSlides(src.asset.width, src.asset.height, F.w, F.h));
  }, [format, src.asset.width, src.asset.height, F.w, F.h]);

  const project = useMemo(
    () =>
      buildPanoramaProject({
        asset: src.asset,
        slides,
        pageWidth: F.w,
        pageHeight: F.h,
        crop,
        title: src.asset.name.replace(/\.[a-z0-9]+$/i, '') || 'Panorama',
        cover: cover ? { title: coverTitle, kicker: `${slides} slides · swipe` } : null,
        closing: closing ? { text: closingText } : null,
      }),
    [src.asset, slides, F.w, F.h, crop, cover, coverTitle, closing, closingText],
  );
  const slices = sliceInfo(src.asset, slides, F.w, F.h, crop);
  const soft = slices[0].upscale > 1.25;

  useEffect(() => {
    setSlide((s) => Math.min(s, project.pages.length - 1));
  }, [project.pages.length]);

  const go = (exportNow: boolean) => {
    onOpen({ ...project, revision: 0 }, new Map([[src.asset.id, src.blob]]), null, { exportNow });
  };

  return (
    <div className="compose">
      <div>
        <Loupe src={src} slides={slides} pageW={F.w} pageH={F.h} crop={crop} onCrop={setCrop} />
        <div className="slices-meta mono">
          {slices.map((s) => (
            <span key={s.index}>
              {String(s.index + 1 + (cover ? 1 : 0)).padStart(2, '0')} · {Math.round(s.source.width)}×{Math.round(s.source.height)} px
            </span>
          ))}
        </div>
        {soft && (
          <p className="notice notice--warn" style={{ marginTop: 12 }}>
            This photo is small for {slides} slides — each one is enlarged {slices[0].upscale.toFixed(1)}×. Fewer slides will look sharper.
          </p>
        )}
        <p className="hint" style={{ marginTop: 12 }}>
          Drag the frame to choose what's in the carousel. Keep faces away from the red cut lines.
        </p>
      </div>

      <aside className="controls">
        <div className="phone" style={{ width: '100%', maxWidth: 300, margin: '0 auto' }}>
          <PhoneCarousel
            index={slide}
            onIndex={setSlide}
            label="Swipe preview"
            slides={project.pages.map((p, i) => (
              <PageCanvas key={p.id} project={project} index={i} bitmap={src.bitmap} />
            ))}
          />
        </div>
        <p className="hint" style={{ textAlign: 'center' }}>
          Swipe it. That's what your followers get.
        </p>

        <div className="control">
          <div className="control__row">
            <span className="mono">Slides</span>
            <span className="row">
              {slides === suggested && <span className="badge">fits best</span>}
              <Stepper
                label="Slides"
                value={slides}
                min={MIN_SLIDES}
                max={MAX_SLIDES}
                onChange={(n) => {
                  touched.current = true;
                  setSlides(n);
                }}
              />
            </span>
          </div>
          <div className="control__row">
            <span className="mono">Format</span>
            <Seg<FormatKey> label="Format" value={format} onChange={setFormat} options={(Object.keys(FORMATS) as FormatKey[]).map((k) => ({ value: k, label: FORMATS[k].label }))} />
          </div>
          <label className="range">
            <span>Zoom</span>
            <input type="range" min={1} max={3} step={0.01} value={crop.zoom} onChange={(e) => setCrop({ ...crop, zoom: Number(e.target.value) })} />
          </label>
        </div>

        <div className="control">
          <Switch checked={cover} onChange={setCover} label="Cover slide with a title" />
          <AnimatePresence initial={false}>
            {cover && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring} style={{ overflow: 'hidden' }}>
                <textarea rows={2} value={coverTitle} onChange={(e) => setCoverTitle(e.target.value)} aria-label="Cover title" />
              </motion.div>
            )}
          </AnimatePresence>
          <Switch checked={closing} onChange={setClosing} label="Closing slide" />
          <AnimatePresence initial={false}>
            {closing && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring} style={{ overflow: 'hidden' }}>
                <input value={closingText} onChange={(e) => setClosingText(e.target.value)} aria-label="Closing text" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="row" style={{ justifyContent: 'space-between' }}>
          <button className="btn btn--ghost btn--sm" onClick={onReset}>
            Other photo
          </button>
          <div className="row">
            <button className="btn" onClick={() => go(false)}>
              Edit in canvas
            </button>
            <button className="btn btn--primary" onClick={() => go(true)} data-testid="pano-export">
              <Icon name="export" /> Export {project.pages.length} slides
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

/** The whole photo with the carousel's frame on top. Drag the frame to reframe. */
function Loupe({ src, slides, pageW, pageH, crop, onCrop }: { src: Source; slides: number; pageW: number; pageH: number; crop: Crop; onCrop(c: Crop): void }) {
  const box = useRef<HTMLDivElement>(null);
  const [cw, setCw] = useState(800);
  const drag = useRef<{ x: number; y: number; crop: Crop } | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setCw(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const { width: iw, height: ih } = src.asset;
  const k = cw / iw; // display px per image px
  const r = fitMedia(iw, ih, slides * pageW, pageH, 'cover', crop);
  const s = r.width / iw;
  const win = { x: -r.x / s, y: -r.y / s, w: (slides * pageW) / s, h: pageH / s };

  const onDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, crop };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.x) / k;
    const dy = (e.clientY - d.y) / k;
    const spanX = iw - win.w;
    const spanY = ih - win.h;
    onCrop({
      ...d.crop,
      focusX: spanX > 0.5 ? clamp01(d.crop.focusX + dx / spanX) : 0.5,
      focusY: spanY > 0.5 ? clamp01(d.crop.focusY + dy / spanY) : 0.5,
    });
  };
  const onUp = () => (drag.current = null);

  return (
    <div className="loupe" ref={box} style={{ height: ih * k }} data-testid="loupe">
      <div className="loupe__clip">
        <img src={src.url} alt="Your panorama" />
        <motion.div
          className="loupe__window"
          style={{ left: win.x * k, top: win.y * k, width: win.w * k, height: win.h * k }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          role="slider"
          aria-label="Carousel frame position"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(crop.focusX * 100)}
          tabIndex={0}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 0.1 : 0.02;
            if (e.key === 'ArrowLeft') onCrop({ ...crop, focusX: clamp01(crop.focusX - step) });
            if (e.key === 'ArrowRight') onCrop({ ...crop, focusX: clamp01(crop.focusX + step) });
            if (e.key === 'ArrowUp') onCrop({ ...crop, focusY: clamp01(crop.focusY - step) });
            if (e.key === 'ArrowDown') onCrop({ ...crop, focusY: clamp01(crop.focusY + step) });
          }}
        >
          {Array.from({ length: slides }, (_, i) => (
            <div key={i} className="loupe__slice">
              <span className="mono">{String(i + 1).padStart(2, '0')}</span>
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}

function PageCanvas({ project, index, bitmap }: { project: Project; index: number; bitmap: ImageBitmap }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let alive = true;
    void fontsReady().then(() => {
      const cv = ref.current;
      if (!cv || !alive) return;
      const scale = 0.4;
      cv.width = Math.round(project.canvas.pageWidth * scale);
      cv.height = Math.round(project.canvas.pageHeight * scale);
      drawPage(cv.getContext('2d')!, project, index, 0, { image: () => bitmap, video: () => null }, { scale });
    });
    return () => {
      alive = false;
    };
  }, [project, index, bitmap]);
  return <canvas ref={ref} aria-label={`Slide ${index + 1}`} />;
}

function clamp01(v: number) {
  return Math.min(1, Math.max(0, v));
}
