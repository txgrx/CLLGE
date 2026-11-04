import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { probeCapabilities } from '../capabilities/probe';
import { importFiles, type ImportedMedia } from '../media/importMedia';
import { library } from '../media/library';
import { pageIndexAt } from '../model/geometry';
import { newId } from '../model/ids';
import { addAsset, addLayer, duplicateLayer, fillSlot, layerForAsset, removeLayers, shapeLayer, textLayer, unfilledSlots, updateLayer } from '../model/project';
import { saveProject } from '../storage/db';
import { Icon, type IconName } from '../ui/Icon';
import { spring } from '../ui/motion';
import { ExportDialog } from './ExportDialog';
import { Filmstrip } from './Filmstrip';
import { Inspector } from './Inspector';
import { LayersPanel } from './LayersPanel';
import { Preview } from './Preview';
import { PAD, Stage } from './Stage';
import { flushSave, useEditor, type SaveStatus } from './store';

interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'warn' | 'error';
}

const STATUS_TEXT: Record<SaveStatus, string> = {
  saved: 'Saved',
  saving: 'Saving',
  unsaved: 'Editing',
  error: 'Not saved',
  conflict: 'Changed in another tab',
};

export function Editor({ onBack, exportOnOpen = false }: { onBack(): void; exportOnOpen?: boolean }) {
  const project = useEditor((s) => s.project)!;
  const zoom = useEditor((s) => s.zoom);
  const selection = useEditor((s) => s.selection);
  const saveStatus = useEditor((s) => s.saveStatus);
  const saveError = useEditor((s) => s.saveError);
  const canUndo = useEditor((s) => s.history.past.length > 0);
  const canRedo = useEditor((s) => s.history.future.length > 0);
  const { apply, undo, redo, select, setZoom } = useEditor.getState();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [panel, setPanel] = useState<'none' | 'preview' | 'export'>(exportOnOpen ? 'export' : 'none');
  const [cropMode, setCropMode] = useState(false);
  const [sheet, setSheet] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const slotInput = useRef<HTMLInputElement>(null);
  const slotTarget = useRef<string | null>(null);
  const fillInput = useRef<HTMLInputElement>(null);
  const insertPage = useRef(0);

  const toast = useCallback((text: string, tone: Toast['tone'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'info' ? 3200 : 8000);
  }, []);

  useEffect(() => {
    if (useEditor.getState().savedRevision === null) void flushSave();
  }, []);

  const scroller = () => document.querySelector('.stage__scroller') as HTMLElement | null;
  const visiblePage = () => {
    const sc = scroller();
    if (!sc) return 0;
    const ox = (sc.querySelector('.stage__world') as HTMLElement | null)?.offsetLeft ?? 0;
    const center = (sc.scrollLeft + sc.clientWidth / 2 - PAD - ox) / useEditor.getState().zoom;
    return pageIndexAt(project.canvas, center, project.pages.length);
  };
  const [currentPage, setCurrentPage] = useState(0);
  useEffect(() => {
    const sc = scroller();
    if (!sc) return;
    const on = () => setCurrentPage(visiblePage());
    sc.addEventListener('scroll', on, { passive: true });
    return () => sc.removeEventListener('scroll', on);
  });

  const goToPage = (i: number) => {
    const sc = scroller();
    if (!sc) return;
    const z = useEditor.getState().zoom;
    const W = project.canvas.pageWidth;
    const ox = (sc.querySelector('.stage__world') as HTMLElement | null)?.offsetLeft ?? 0;
    sc.scrollTo({ left: ox + PAD + (i * W + W / 2) * z - sc.clientWidth / 2, behavior: 'smooth' });
  };

  const readFiles = useCallback(
    async (files: File[]): Promise<ImportedMedia[]> => {
      setBusy(`Reading ${files.length} file${files.length === 1 ? '' : 's'}`);
      try {
        const { ok, failed } = await importFiles(files);
        for (const f of failed) toast(`${f.name}: ${f.reason}`, 'error');
        for (const m of ok) {
          library.add(m.asset, m.blob);
          for (const w of m.warnings) toast(`${m.asset.name}: ${w}`, 'warn');
        }
        if (ok.some((m) => m.asset.type === 'video')) {
          const { pageWidth: W, pageHeight: H } = useEditor.getState().project!.canvas;
          const caps = await probeCapabilities(W, H);
          for (const n of caps.notes) toast(n, 'warn');
        }
        return ok;
      } finally {
        setBusy(null);
      }
    },
    [toast],
  );

  const importAndPlace = useCallback(
    async (files: File[], pageIndex: number) => {
      if (!files.length) return;
      const ok = await readFiles(files);
      let page = pageIndex;
      let last = '';
      for (const m of ok) {
        const target = Math.min(page, useEditor.getState().project!.pages.length - 1);
        let span = 1;
        apply((p) => {
          const withAsset = addAsset(p, m.asset);
          const layer = layerForAsset(withAsset, m.asset, target);
          last = layer.id;
          span = Math.max(1, Math.round(layer.width / p.canvas.pageWidth));
          return addLayer(withAsset, layer);
        });
        page = target + span;
      }
      if (last) select([last]);
    },
    [apply, readFiles, select],
  );

  /** Put files into slots: the given one first, then the remaining empty slots left to right. */
  const fillSlots = useCallback(
    async (files: File[], firstSlot?: string) => {
      if (!files.length) return;
      const ok = await readFiles(files);
      const p0 = useEditor.getState().project!;
      const order = unfilledSlots(p0)
        .slice()
        .sort((a, b) => a.x - b.x || a.y - b.y)
        .map((l) => l.id)
        .filter((id) => id !== firstSlot);
      const targets = firstSlot ? [firstSlot, ...order] : order;
      if (!targets.length && ok.length) return importAndPlace(files, visiblePage());
      let filled = 0;
      apply((p) => {
        let next = p;
        ok.forEach((m, i) => {
          const id = targets[i];
          if (id) {
            next = fillSlot(next, id, m.asset);
            filled++;
          }
        });
        return next;
      });
      if (ok.length > filled) toast(`${ok.length - filled} file(s) left over — all slots are full. Use + Media to add them freely.`, 'warn');
      if (targets[0]) select([targets[0]]);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [apply, readFiles, select, toast, importAndPlace],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (panel !== 'none') return;
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, select, [contenteditable]')) return;
      const mod = e.metaKey || e.ctrlKey;
      const st = useEditor.getState();
      const sel = st.selection;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) st.redo();
        else st.undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        st.redo();
      } else if (mod && e.key.toLowerCase() === 'd' && sel.length === 1) {
        e.preventDefault();
        duplicate(sel[0]);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && sel.length) {
        e.preventDefault();
        st.apply((p) => removeLayers(p, sel));
        st.select([]);
      } else if (e.key === 'Escape') {
        st.select([]);
        setCropMode(false);
      } else if (e.key.startsWith('Arrow') && sel.length) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        st.apply((p) =>
          sel.reduce((pp, id) => {
            const l = pp.layers.find((x) => x.id === id);
            return l && !l.locked ? updateLayer(pp, id, { x: l.x + dx, y: l.y + dy }) : pp;
          }, p),
        );
      } else if ((e.key === '+' || e.key === '=') && mod) {
        e.preventDefault();
        st.setZoom(st.zoom * 1.25);
      } else if (e.key === '-' && mod) {
        e.preventDefault();
        st.setZoom(st.zoom / 1.25);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panel]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flushSave();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, []);

  const duplicate = (id: string) => {
    let created: string | null = null;
    useEditor.getState().apply((p) => {
      const r = duplicateLayer(p, id);
      created = r.newId;
      return r.project;
    });
    if (created) useEditor.getState().select([created]);
  };

  const keepAsCopy = async () => {
    const copy = { ...structuredClone(project), id: newId('prj_'), title: `${project.title} (copy)`, revision: 0 };
    await saveProject(copy, (id) => library.blob(id), null);
    useEditor.getState().open(copy, 0);
    toast('Saved your version as a copy. The other tab’s version is kept too.');
  };

  const sel = selection.length === 1 ? project.layers.find((l) => l.id === selection[0]) : undefined;
  const emptySlots = unfilledSlots(project).length;

  const Tool = ({ icon, label, onClick, active, tone, testid }: { icon: IconName; label: string; onClick(): void; active?: boolean; tone?: 'danger' | 'accent'; testid?: string }) => (
    <motion.button layout="position" transition={spring} className={`tool ${active ? 'is-active' : ''} ${tone ? `tool--${tone}` : ''}`} onClick={onClick} aria-pressed={active} data-testid={testid}>
      <Icon name={icon} size={22} />
      {label}
    </motion.button>
  );

  return (
    <div className="editor">
      <header className="topbar">
        <button className="btn btn--icon btn--ghost" onClick={onBack} aria-label="Back to projects" title="Projects">
          <Icon name="back" />
        </button>
        <input className="topbar__title" value={project.title} aria-label="Project title" onChange={(e) => apply((p) => ({ ...p, title: e.target.value }))} />
        <span className={`save save--${saveStatus} mono`} title={saveError ?? ''} data-testid="save-status">
          {STATUS_TEXT[saveStatus]}
        </span>
        {saveStatus === 'conflict' && (
          <button className="btn btn--sm" onClick={() => void keepAsCopy()}>
            Keep mine as a copy
          </button>
        )}
        {saveStatus === 'error' && (
          <button className="btn btn--sm" onClick={() => void flushSave()}>
            Retry save
          </button>
        )}
        <div className="topbar__spacer" />
        <button className="btn btn--icon btn--ghost" disabled={!canUndo} onClick={undo} aria-label="Undo" title="Undo (Ctrl/Cmd+Z)">
          <Icon name="undo" />
        </button>
        <button className="btn btn--icon btn--ghost" disabled={!canRedo} onClick={redo} aria-label="Redo" title="Redo (Ctrl/Cmd+Shift+Z)">
          <Icon name="redo" />
        </button>
        <div className="zoom" role="group" aria-label="Zoom">
          <button className="btn btn--icon btn--ghost btn--sm" onClick={() => setZoom(zoom / 1.25)} aria-label="Zoom out">
            <Icon name="zoomOut" size={18} />
          </button>
          <span className="mono">{Math.round(zoom * 100)}%</span>
          <button className="btn btn--icon btn--ghost btn--sm" onClick={() => setZoom(zoom * 1.25)} aria-label="Zoom in">
            <Icon name="zoomIn" size={18} />
          </button>
        </div>
        <button className="btn" onClick={() => setPanel('preview')} aria-label="Preview">
          <Icon name="swipe" /> <span className="topbar__label">Preview</span>
        </button>
        <button className="btn btn--primary" onClick={() => setPanel('export')} data-testid="open-export">
          <Icon name="export" /> Export
        </button>
      </header>

      <div className="workspace">
        <nav className="toolbar" aria-label="Tools">
          <Tool
            icon="media"
            label="Media"
            onClick={() => {
              insertPage.current = visiblePage();
              fileInput.current?.click();
            }}
          />
          {emptySlots > 0 && <Tool icon="fill" label={`Fill ${emptySlots}`} tone="accent" onClick={() => fillInput.current?.click()} testid="fill-slots" />}
          <Tool
            icon="text"
            label="Text"
            onClick={() => {
              const l = textLayer(project, visiblePage());
              apply((p) => addLayer(p, { ...l, fontFamily: '"Instrument Serif", Georgia, serif', fontWeight: 400, color: '#EDEBE6' }));
              select([l.id]);
            }}
          />
          <Tool
            icon="shape"
            label="Shape"
            onClick={() => {
              const l = shapeLayer(project, visiblePage());
              apply((p) => addLayer(p, { ...l, fill: '#FF3B2F' }));
              select([l.id]);
            }}
          />
          <AnimatePresence>
            {sel && (
              <motion.div key="sel" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={spring} style={{ display: 'contents' }}>
                <span className="tool__sep" />
                <Tool icon="copy" label="Duplicate" onClick={() => duplicate(sel.id)} />
                {(sel.type === 'image' || sel.type === 'video') && <Tool icon="crop" label="Crop" active={cropMode} onClick={() => setCropMode(!cropMode)} />}
                <Tool
                  icon="trash"
                  label="Delete"
                  tone="danger"
                  onClick={() => {
                    apply((p) => removeLayers(p, [sel.id]));
                    select([]);
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>
          <button className="tool tool--sheet" onClick={() => setSheet(!sheet)} aria-expanded={sheet}>
            <Icon name={sel ? 'sliders' : 'layers'} size={22} />
            {sel ? 'Edit' : 'Pages'}
          </button>
        </nav>

        <div className="stage-col">
          <main className="stage-wrap">
            <Stage
              onDropFiles={(f, i, slotId) => void (slotId ? fillSlots(f, slotId) : importAndPlace(f, i))}
              onSlot={(id) => {
                slotTarget.current = id;
                slotInput.current?.click();
              }}
              cropMode={cropMode}
              setCropMode={setCropMode}
            />
            {project.layers.length === 0 && (
              <div className="coach">
                <p>Drop photos or a clip here.</p>
              </div>
            )}
            <AnimatePresence>
              {busy && (
                <motion.div className="busy" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={spring}>
                  <span className="lamp" /> {busy}
                </motion.div>
              )}
            </AnimatePresence>
          </main>
          <Filmstrip current={currentPage} onPick={goToPage} />
        </div>

        <div className={`side ${sheet ? 'is-open' : ''}`}>
          <button className="side__handle" onClick={() => setSheet(false)} aria-label="Close panel" />
          <Inspector
            onReplace={(id) => {
              slotTarget.current = id;
              slotInput.current?.click();
            }}
          />
          <LayersPanel />
        </div>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        data-testid="file-input"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          void importAndPlace(files, insertPage.current);
        }}
      />
      <input
        ref={slotInput}
        type="file"
        accept="image/*,video/*"
        hidden
        data-testid="slot-input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          const id = slotTarget.current;
          slotTarget.current = null;
          if (f && id) void fillSlots([f], id);
        }}
      />
      <input
        ref={fillInput}
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        data-testid="fill-input"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          void fillSlots(files);
        }}
      />

      <div className="toasts" aria-live="polite">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div key={t.id} layout className={`toast toast--${t.tone}`} initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, transition: { duration: 0.15 } }} transition={spring}>
              {t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {panel === 'preview' && <Preview key="preview" onClose={() => setPanel('none')} startPage={visiblePage()} />}
        {panel === 'export' && <ExportDialog key="export" onClose={() => setPanel('none')} />}
      </AnimatePresence>
    </div>
  );
}
