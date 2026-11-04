import { useCallback, useEffect, useRef, useState } from 'react';
import { probeCapabilities } from '../capabilities/probe';
import { importFiles } from '../media/importMedia';
import { library } from '../media/library';
import { pageIndexAt } from '../model/geometry';
import { newId } from '../model/ids';
import { addAsset, addLayer, duplicateLayer, layerForAsset, removeLayers, shapeLayer, textLayer, updateLayer } from '../model/project';
import type { Layer, MediaLayer } from '../model/types';
import { saveProject } from '../storage/db';
import { ExportDialog } from './ExportDialog';
import { Inspector } from './Inspector';
import { LayersPanel } from './LayersPanel';
import { Preview } from './Preview';
import { Stage } from './Stage';
import { flushSave, useEditor, type SaveStatus } from './store';

interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'warn' | 'error';
}

const STATUS_TEXT: Record<SaveStatus, string> = {
  saved: 'Saved',
  saving: 'Saving…',
  unsaved: 'Unsaved changes',
  error: 'Not saved',
  conflict: 'Changed in another tab',
};

export function Editor({ onBack }: { onBack(): void }) {
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
  const [panel, setPanel] = useState<'none' | 'preview' | 'export'>('none');
  const [cropMode, setCropMode] = useState(false);
  const [sheet, setSheet] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<string | null>(null);
  const insertPage = useRef(0);

  const toast = useCallback((text: string, tone: Toast['tone'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'info' ? 3500 : 8000);
  }, []);

  // Save the first revision of a new project right away.
  useEffect(() => {
    if (useEditor.getState().savedRevision === null) void flushSave();
  }, []);

  const visiblePage = () => {
    const sc = document.querySelector('.stage__scroller') as HTMLElement | null;
    if (!sc) return 0;
    const center = (sc.scrollLeft + sc.clientWidth / 2 - 48) / useEditor.getState().zoom;
    return pageIndexAt(project.canvas, center, project.pages.length);
  };

  const importAndPlace = useCallback(
    async (files: File[], pageIndex: number) => {
      if (!files.length) return;
      setBusy(`Reading ${files.length} file${files.length === 1 ? '' : 's'}…`);
      try {
        const { ok, failed } = await importFiles(files);
        for (const f of failed) toast(`${f.name}: ${f.reason}`, 'error');
        let page = pageIndex;
        const added: string[] = [];
        for (const m of ok) {
          library.add(m.asset, m.blob);
          for (const w of m.warnings) toast(`${m.asset.name}: ${w}`, 'warn');
          const target = Math.min(page, useEditor.getState().project!.pages.length - 1);
          let layerId = '';
          let span = 1;
          apply((p) => {
            const withAsset = addAsset(p, m.asset);
            const layer = layerForAsset(withAsset, m.asset, target);
            layerId = layer.id;
            span = Math.max(1, Math.round(layer.width / p.canvas.pageWidth));
            return addLayer(withAsset, layer);
          });
          added.push(layerId);
          // The next item goes on the first page after this one (a panorama covers several).
          page = target + span;
        }
        if (added.length) select([added[added.length - 1]]);
        // Tell people about video support before they invest time in a montage.
        if (ok.some((m) => m.asset.type === 'video')) {
          const { pageWidth: W, pageHeight: H } = useEditor.getState().project!.canvas;
          const caps = await probeCapabilities(W, H);
          for (const n of caps.notes) toast(n, 'warn');
        }
      } finally {
        setBusy(null);
      }
    },
    [apply, select, toast],
  );

  const replaceMedia = useCallback(
    async (file: File) => {
      const id = replaceTarget.current;
      replaceTarget.current = null;
      if (!id) return;
      const { ok, failed } = await importFiles([file]);
      if (failed.length) return toast(`${file.name}: ${failed[0].reason}`, 'error');
      const m = ok[0];
      const target = useEditor.getState().project!.layers.find((l) => l.id === id) as MediaLayer | undefined;
      if (!target) return;
      if ((target.type === 'video') !== (m.asset.type === 'video')) return toast('Replace a photo with a photo and a video with a video.', 'warn');
      library.add(m.asset, m.blob);
      apply((p) => {
        // Keep the frame (position, size, rotation, corners, style); refit the new content around the centre.
        let next = addAsset(p, m.asset);
        const patch: Partial<Layer> = { assetId: m.asset.id, name: m.asset.name, crop: { ...target.crop, focusX: 0.5, focusY: 0.5 } } as Partial<Layer>;
        if (target.type === 'video' && m.asset.type === 'video') {
          (patch as Partial<typeof target>).clip = { ...target.clip, inMs: 0, outMs: m.asset.durationMs, gain: m.asset.hasAudio ? 1 : 0 };
        }
        next = updateLayer(next, id, patch);
        return removeLayers(next, []); // drops the old asset if unused
      });
    },
    [apply, toast],
  );

  // Keyboard shortcuts.
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
        let created: string | null = null;
        st.apply((p) => {
          const r = duplicateLayer(p, sel[0]);
          created = r.newId;
          return r.project;
        });
        if (created) st.select([created]);
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
        st.apply((p) => sel.reduce((pp, id) => {
          const l = pp.layers.find((x) => x.id === id);
          return l && !l.locked ? updateLayer(pp, id, { x: l.x + dx, y: l.y + dy }) : pp;
        }, p));
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

  // Flush on tab hide so a closed tab keeps its last revision.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flushSave();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, []);

  const keepAsCopy = async () => {
    const copy = { ...structuredClone(project), id: newId('prj_'), title: `${project.title} (copy)`, revision: 0 };
    await saveProject(copy, (id) => library.blob(id), null);
    useEditor.getState().open(copy, 0);
    toast('Saved your version as a copy. The other tab’s version is kept too.');
  };

  const sel = selection.length === 1 ? project.layers.find((l) => l.id === selection[0]) : undefined;

  return (
    <div className="editor">
      <header className="topbar">
        <button className="btn btn--ghost" onClick={onBack} aria-label="Back to projects">
          ← <span className="topbar__back-label">Projects</span>
        </button>
        <input className="topbar__title" value={project.title} aria-label="Project title" onChange={(e) => apply((p) => ({ ...p, title: e.target.value }))} />
        <span className={`save save--${saveStatus}`} title={saveError ?? ''} data-testid="save-status">
          {STATUS_TEXT[saveStatus]}
        </span>
        {saveStatus === 'conflict' && (
          <button className="btn" onClick={() => void keepAsCopy()}>
            Keep mine as a copy
          </button>
        )}
        {saveStatus === 'error' && (
          <button className="btn" onClick={() => void flushSave()}>
            Retry save
          </button>
        )}
        <div className="topbar__spacer" />
        <button className="btn btn--ghost" disabled={!canUndo} onClick={undo} aria-label="Undo" title="Undo (Ctrl/Cmd+Z)">
          ↶
        </button>
        <button className="btn btn--ghost" disabled={!canRedo} onClick={redo} aria-label="Redo" title="Redo (Ctrl/Cmd+Shift+Z)">
          ↷
        </button>
        <div className="zoom" role="group" aria-label="Zoom">
          <button className="btn btn--ghost" onClick={() => setZoom(zoom / 1.25)} aria-label="Zoom out">
            −
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button className="btn btn--ghost" onClick={() => setZoom(zoom * 1.25)} aria-label="Zoom in">
            +
          </button>
        </div>
        <button className="btn" onClick={() => setPanel('preview')}>
          Preview
        </button>
        <button className="btn btn--primary" onClick={() => setPanel('export')} data-testid="open-export">
          Export
        </button>
      </header>

      <div className="workspace">
        <nav className="toolbar" aria-label="Add">
          <button
            className="tool"
            onClick={() => {
              insertPage.current = visiblePage();
              fileInput.current?.click();
            }}
          >
            <span aria-hidden>＋</span>Media
          </button>
          <button
            className="tool"
            onClick={() => {
              const l = textLayer(project, visiblePage());
              apply((p) => addLayer(p, l));
              select([l.id]);
            }}
          >
            <span aria-hidden>T</span>Text
          </button>
          <button
            className="tool"
            onClick={() => {
              const l = shapeLayer(project, visiblePage());
              apply((p) => addLayer(p, l));
              select([l.id]);
            }}
          >
            <span aria-hidden>■</span>Shape
          </button>
          {sel && (
            <>
              <button
                className="tool"
                onClick={() => {
                  let created: string | null = null;
                  apply((p) => {
                    const r = duplicateLayer(p, sel.id);
                    created = r.newId;
                    return r.project;
                  });
                  if (created) select([created]);
                }}
              >
                <span aria-hidden>⧉</span>Duplicate
              </button>
              {(sel.type === 'image' || sel.type === 'video') && (
                <button className={`tool ${cropMode ? 'is-active' : ''}`} onClick={() => setCropMode(!cropMode)} aria-pressed={cropMode}>
                  <span aria-hidden>⌗</span>Crop
                </button>
              )}
              <button
                className="tool tool--danger"
                onClick={() => {
                  apply((p) => removeLayers(p, [sel.id]));
                  select([]);
                }}
              >
                <span aria-hidden>✕</span>Delete
              </button>
            </>
          )}
          <button className="tool tool--sheet" onClick={() => setSheet(!sheet)} aria-expanded={sheet}>
            <span aria-hidden>☰</span>
            {sel ? 'Edit' : 'Pages'}
          </button>
        </nav>

        <main className="stage-wrap">
          <Stage onDropFiles={(f, i) => void importAndPlace(f, i)} cropMode={cropMode} setCropMode={setCropMode} />
          {busy && <div className="busy">{busy}</div>}
        </main>

        <div className={`side ${sheet ? 'is-open' : ''}`}>
          <Inspector
            onReplace={(id) => {
              replaceTarget.current = id;
              replaceInput.current?.click();
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
        ref={replaceInput}
        type="file"
        accept="image/*,video/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void replaceMedia(f);
        }}
      />

      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.tone}`}>
            {t.text}
          </div>
        ))}
      </div>

      {panel === 'preview' && <Preview onClose={() => setPanel('none')} startPage={visiblePage()} />}
      {panel === 'export' && <ExportDialog onClose={() => setPanel('none')} />}
    </div>
  );
}
