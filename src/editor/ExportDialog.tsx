import { useEffect, useMemo, useRef, useState } from 'react';
import { probeCapabilities, type Capabilities } from '../capabilities/probe';
import { canShareFiles, downloadBlob, exportBlocker, exportCarousel, piecesAsFiles, zipPieces, type ExportedPiece, type StillFormat } from '../export/exporter';
import { library } from '../media/library';
import { planPages, summarizePlan } from '../model/plan';
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

  useEffect(() => {
    void probeCapabilities(W, H).then(setCaps);
  }, [W, H]);

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
      await library.ready();
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
      setError(cancelled ? `Cancelled. ${done.current.pieces.size} finished page(s) are kept; Retry continues from there.` : e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  };

  const files = useMemo(() => piecesAsFiles(pieces), [pieces]);
  const shareable = phase === 'done' && canShareFiles(files);

  const makeZip = async () => {
    const z = await zipPieces(pieces);
    setZip(z);
    downloadBlob(z, `${slug(project.title)}.zip`);
  };

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Export">
      <div className="modal__panel export">
        <header className="modal__head">
          <h2>Export carousel</h2>
          <button className="btn btn--ghost" onClick={() => (phase === 'running' ? abort.current?.abort() : onClose())}>
            {phase === 'running' ? 'Cancel' : 'Close'}
          </button>
        </header>

        <p className="export__summary" data-testid="export-summary">
          {summarizePlan(plans)}, {W} × {H}
        </p>
        <ol className="export__plan">
          {plans.map((p) => {
            const asVideo = p.kind === 'video' && !photosOnly;
            const ext = asVideo ? 'mp4' : format === 'png' ? 'png' : 'jpg';
            const piece = pieces.find((x) => x.name.startsWith(p.baseName + '.'));
            return (
              <li key={p.pageId} data-testid={`plan-${p.baseName}`}>
                <span className={`badge badge--${asVideo ? 'video' : 'image'}`}>{asVideo ? 'Video' : 'Photo'}</span>
                <strong>
                  {p.baseName}.{ext}
                </strong>
                {asVideo && (
                  <span>
                    {(p.durationMs / 1000).toFixed(1)} s{p.audioLayer && caps?.audioCodec ? ' · audio' : ' · silent'}
                  </span>
                )}
                {piece && (
                  <a
                    className="link"
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      downloadBlob(piece.blob, piece.name);
                    }}
                  >
                    Save · {(piece.blob.size / 1024 / 1024).toFixed(1)} MB
                  </a>
                )}
              </li>
            );
          })}
        </ol>

        {phase !== 'done' && (
          <div className="export__options">
            <label className="field field--inline">
              <span>Photo pages as</span>
              <select value={format} onChange={(e) => setFormat(e.target.value as StillFormat)} disabled={phase === 'running'}>
                <option value="jpeg">JPEG (smaller)</option>
                <option value="png">PNG (lossless)</option>
              </select>
            </label>
            {caps === null && hasVideo && <p className="hint">Checking what this device can encode…</p>}
            {caps?.notes.map((n) => (
              <p key={n} className="notice notice--warn">
                {n}
              </p>
            ))}
            {hasVideo && caps && !caps.videoCodec && (
              <label className="check">
                <input type="checkbox" checked={photosOnly} onChange={(e) => setPhotosOnly(e.target.checked)} /> Export video pages as photos (no motion, no sound)
              </label>
            )}
            {hasVideo && caps?.videoCodec && !caps.audioCodec && plans.some((p) => p.audioLayer) && (
              <label className="check">
                <input type="checkbox" checked={allowSilent} onChange={(e) => setAllowSilent(e.target.checked)} /> Export videos without sound
              </label>
            )}
          </div>
        )}

        {phase === 'running' && progress && (
          <div className="progress" role="status" aria-live="polite">
            <div className="progress__bar">
              <span style={{ width: `${((progress.page + progress.fraction) / progress.total) * 100}%` }} />
            </div>
            <span>
              {progress.label} — page {progress.page + 1} of {progress.total}
            </span>
          </div>
        )}

        {error && (
          <p className="notice notice--error" role="alert">
            {error}
          </p>
        )}

        {phase === 'done' && (
          <div className="export__done" data-testid="export-done">
            <p className="notice notice--ok">Files ready: {pieces.length} pieces in carousel order.</p>
            <div className="row">
              {shareable && (
                <button
                  className="btn btn--primary"
                  onClick={() => {
                    void navigator.share({ files, title: project.title }).catch(() => undefined);
                  }}
                >
                  Share…
                </button>
              )}
              <button className={`btn ${shareable ? '' : 'btn--primary'}`} onClick={() => void makeZip()}>
                Download ZIP
              </button>
              <button
                className="btn"
                onClick={() => {
                  pieces.forEach((p, i) => setTimeout(() => downloadBlob(p.blob, p.name), i * 400));
                }}
              >
                Save each file
              </button>
            </div>
            {zip && <p className="hint">ZIP saved. Unzip it before posting: Instagram needs the individual files.</p>}
            <details className="howto" open>
              <summary>Post it on Instagram</summary>
              <ol>
                <li>Save the files to your phone's gallery (Share → Save, or download and unzip).</li>
                <li>In Instagram: Create post → Select multiple.</li>
                <li>
                  Pick {pieces.map((p) => p.name.split('.')[0]).join(', ')} <strong>in this order</strong>.
                </li>
                <li>Check the preview: movement and sound should show on the video pages. Keep the original crop (4:5 or 1:1).</li>
              </ol>
            </details>
          </div>
        )}

        <footer className="row">
          {(phase === 'setup' || phase === 'error') && (
            <button className="btn btn--primary" disabled={!caps || !!blocker} onClick={() => void start()} data-testid="export-start">
              {phase === 'error' ? 'Retry' : `Export ${plans.length} file${plans.length === 1 ? '' : 's'}`}
            </button>
          )}
          {blocker && <span className="hint">{blocker}</span>}
        </footer>
      </div>
    </div>
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
