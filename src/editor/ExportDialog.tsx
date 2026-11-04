import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { probeCapabilities, type Capabilities } from '../capabilities/probe';
import { canShareFiles, downloadBlob, exportBlocker, exportCarousel, piecesAsFiles, zipPieces, type ExportedPiece, type StillFormat } from '../export/exporter';
import { library } from '../media/library';
import { planPages, summarizePlan } from '../model/plan';
import { unfilledSlots } from '../model/project';
import { Seg } from '../ui/controls';
import { fontsReady } from '../ui/fonts';
import { Icon } from '../ui/Icon';
import { blurSwap, spring } from '../ui/motion';
import { useEditor } from './store';

type Phase = 'setup' | 'running' | 'done' | 'error';

export function ExportDialog({ onClose }: { onClose(): void }) {
  const project = useEditor((s) => s.project)!;
  const plans = useMemo(() => planPages(project), [project]);
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [format, setFormat] = useState<StillFormat>('jpeg');
  const [photosOnly, setPhotosOnly] = useState(false);
  const [allowSilent, setAllowSilent] = useState(false);
  const [phase, setPhase] = useState<Phase>('setup');
  const [progress, setProgress] = useState<{ page: number; total: number; fraction: number; label: string } | null>(null);
  const [pieces, setPieces] = useState<ExportedPiece[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [zip, setZip] = useState<Blob | null>(null);
  const abort = useRef<AbortController | null>(null);
  // Finished pages of this revision survive a cancel or a failure, so a retry resumes.
  const done = useRef<{ revision: number; key: string; pieces: Map<number, ExportedPiece> }>({ revision: -1, key: '', pieces: new Map() });
  const { pageWidth: W, pageHeight: H } = project.canvas;
  const samples = unfilledSlots(project).length;

  useEffect(() => {
    void probeCapabilities(W, H).then(setCaps);
  }, [W, H]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && phase !== 'running') onClose();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose, phase]);

  const hasVideo = plans.some((p) => p.kind === 'video');
  const blocker = caps ? exportBlocker(plans, { caps, photosOnly, allowSilent }) : null;

  const start = async () => {
    if (!caps) return;
    const key = `${format}|${photosOnly}|${allowSilent}`;
    if (done.current.revision !== project.revision || done.current.key !== key) done.current = { revision: project.revision, key, pieces: new Map() };
    abort.current = new AbortController();
    setPhase('running');
    setError(null);
    setZip(null);
    try {
      await Promise.all([library.ready(), fontsReady()]);
      const result = await exportCarousel({
        project,
        blobs: (id) => library.blob(id),
        images: (id) => library.imageBitmap(id),
        caps,
        stillFormat: format,
        photosOnly,
        allowSilent,
        previous: done.current.pieces,
        signal: abort.current.signal,
        onProgress: setProgress,
      });
      setPieces(result);
      setPhase('done');
    } catch (e) {
      const cancelled = e instanceof DOMException && e.name === 'AbortError';
      setError(cancelled ? `Cancelled. ${done.current.pieces.size} finished slide(s) are kept; Retry continues from there.` : e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  };

  const files = useMemo(() => piecesAsFiles(pieces), [pieces]);
  const shareable = phase === 'done' && canShareFiles(files);
  const fraction = progress ? (progress.page + progress.fraction) / progress.total : 0;

  const makeZip = async () => {
    const z = await zipPieces(pieces);
    setZip(z);
    downloadBlob(z, `${slug(project.title)}.zip`);
  };

  return (
    <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => phase !== 'running' && onClose()}>
      <motion.div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-h"
        initial={{ y: 40, opacity: 0, scale: 0.98 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 20, opacity: 0, scale: 0.98 }}
        transition={spring}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet__head">
          <div>
            <p className="mono">
              {W}×{H} · {plans.length} slide{plans.length === 1 ? '' : 's'}
            </p>
            <h2 className="sheet__title" id="export-h">
              Export
            </h2>
          </div>
          <button className="btn btn--icon btn--ghost" disabled={phase === 'running'} onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>

        <p className="hint" style={{ marginBottom: 12 }} data-testid="export-summary">
          {summarizePlan(plans)}, in carousel order.
        </p>
        <motion.ol className="export__plan" initial="initial" animate="animate" variants={{ animate: { transition: { staggerChildren: 0.03 } } }}>
          {plans.map((p) => {
            const asVideo = p.kind === 'video' && !photosOnly;
            const ext = asVideo ? 'mp4' : format === 'png' ? 'png' : 'jpg';
            const piece = pieces.find((x) => x.name.startsWith(p.baseName + '.'));
            const running = phase === 'running' && progress?.page === p.index;
            return (
              <motion.li key={p.pageId} data-testid={`plan-${p.baseName}`} variants={{ initial: { opacity: 0, x: -8 }, animate: { opacity: 1, x: 0 } }}>
                <span className={`badge badge--${asVideo ? 'video' : 'image'}`}>{asVideo ? 'Video' : 'Photo'}</span>
                <strong>
                  {p.baseName}.{ext}
                </strong>
                {asVideo && (
                  <span className="hint">
                    {(p.durationMs / 1000).toFixed(1)} s{p.audioLayer && caps?.audioCodec ? ' · sound' : ' · silent'}
                  </span>
                )}
                {running && <span className="lamp" aria-label="Rendering" />}
                {piece && (
                  <button className="link" onClick={() => downloadBlob(piece.blob, piece.name)}>
                    Save · {(piece.blob.size / 1024 / 1024).toFixed(1)} MB
                  </button>
                )}
              </motion.li>
            );
          })}
        </motion.ol>

        <AnimatePresence initial={false}>
          {phase !== 'done' && (
            <motion.div className="export__options" variants={blurSwap} initial="initial" animate="animate" exit="exit">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="mono">Photo slides as</span>
                <Seg<StillFormat>
                  label="Photo format"
                  value={format}
                  onChange={setFormat}
                  options={[
                    { value: 'jpeg', label: 'JPEG' },
                    { value: 'png', label: 'PNG' },
                  ]}
                />
              </div>
              {samples > 0 && (
                <p className="notice notice--warn">
                  {samples} slot{samples === 1 ? '' : 's'} still show{samples === 1 ? 's' : ''} sample art. Tap “Fill” in the toolbar to use your own photos.
                </p>
              )}
              {caps === null && hasVideo && <p className="hint">Checking what this device can encode…</p>}
              {caps?.notes.map((n) => (
                <p key={n} className="notice notice--warn">
                  {n}
                </p>
              ))}
              {hasVideo && caps && !caps.videoCodec && (
                <label className="check">
                  <input type="checkbox" checked={photosOnly} onChange={(e) => setPhotosOnly(e.target.checked)} /> Export video slides as photos (no motion, no sound)
                </label>
              )}
              {hasVideo && caps?.videoCodec && !caps.audioCodec && plans.some((p) => p.audioLayer) && (
                <label className="check">
                  <input type="checkbox" checked={allowSilent} onChange={(e) => setAllowSilent(e.target.checked)} /> Export videos without sound
                </label>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {error && (
          <p className="notice notice--error" role="alert" style={{ marginTop: 12 }}>
            {error}
          </p>
        )}

        <div className="row" style={{ marginTop: 18, justifyContent: 'space-between' }}>
          {/* One control that morphs: Export → progress pill → done. */}
          <motion.button
            layout
            transition={spring}
            className={`go ${phase === 'running' ? 'go--running' : phase === 'done' ? 'go--done' : ''}`}
            disabled={phase === 'setup' || phase === 'error' ? !caps || !!blocker : false}
            onClick={() => {
              if (phase === 'setup' || phase === 'error') void start();
              else if (phase === 'running') abort.current?.abort();
            }}
            data-testid="export-start"
            aria-live="polite"
          >
            {phase === 'running' && <motion.span className="go__fill" initial={{ width: 0 }} animate={{ width: `${fraction * 100}%` }} transition={{ type: 'tween', duration: 0.2 }} />}
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={phase} className="go__label" variants={blurSwap} initial="initial" animate="animate" exit="exit">
                {phase === 'running' ? (
                  <>
                    <span className="mono" style={{ color: 'inherit' }}>
                      {Math.round(fraction * 100)}%
                    </span>
                    {progress?.label ?? 'Starting'} · Cancel
                  </>
                ) : phase === 'done' ? (
                  <>
                    <Icon name="check" /> Files ready
                  </>
                ) : phase === 'error' ? (
                  'Retry'
                ) : (
                  <>
                    <Icon name="export" /> Export {plans.length} file{plans.length === 1 ? '' : 's'}
                  </>
                )}
              </motion.span>
            </AnimatePresence>
          </motion.button>
          {blocker && phase !== 'done' && <span className="hint">{blocker}</span>}
        </div>

        <AnimatePresence>
          {phase === 'done' && (
            <motion.div data-testid="export-done" variants={blurSwap} initial="initial" animate="animate" exit="exit" style={{ marginTop: 16 }}>
              <p className="sr-only">Files ready: {pieces.length} pieces in carousel order.</p>
              <div className="row">
                {shareable && (
                  <button className="btn btn--primary" onClick={() => void navigator.share({ files, title: project.title }).catch(() => undefined)}>
                    <Icon name="share" /> Share…
                  </button>
                )}
                <button className="btn" onClick={() => void makeZip()}>
                  Download ZIP
                </button>
                <button className="btn" onClick={() => pieces.forEach((p, i) => setTimeout(() => downloadBlob(p.blob, p.name), i * 400))}>
                  Save each file
                </button>
              </div>
              {zip && <p className="hint" style={{ marginTop: 8 }}>Unzip before posting: Instagram needs the separate files.</p>}
              <details className="howto" open>
                <summary>Post it on Instagram</summary>
                <ol>
                  <li>Save the files to your phone's gallery.</li>
                  <li>Instagram → Create → Select multiple.</li>
                  <li>
                    Pick {pieces.map((p) => p.name.split('.')[0]).join(', ')} <strong>in this order</strong>.
                  </li>
                  <li>Keep the original crop. Video slides should move and play sound in the preview.</li>
                </ol>
              </details>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

function slug(s: string): string {
  return (
    s
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .toLowerCase() || 'carousel'
  );
}
