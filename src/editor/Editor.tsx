import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { probeCapabilities } from '../capabilities/probe';
import { importFiles, type ImportedMedia } from '../media/importMedia';
import { library } from '../media/library';
import { pageIndexAt } from '../model/geometry';
import { newId } from '../model/ids';
import { addAsset, addLayer, duplicateLayer, fillSlot, layerForAsset, removeLayers, reorderLayer, unfilledSlots, updateLayer } from '../model/project';
import { saveProject } from '../storage/db';
import { ensureFonts } from '../ui/fonts';
import { Icon, type IconName } from '../ui/Icon';
import { spring } from '../ui/motion';
import { addShape, straddleBox } from './actions';
import { AutoCollage, type MediaItem } from './AutoCollage';
import { BottomSheet } from './BottomSheet';
import { ExportDialog } from './ExportDialog';
import { Filmstrip } from './Filmstrip';
import { Inspector, ProjectInspector } from './Inspector';
import { LayersPanel } from './LayersPanel';
import { LivePhone } from './LivePhone';
import { AddGrid, BridgePanel, DrawPanel, PanelHead, StickerSheet, TextPanel, type AddAction } from './panels';
import { Preview } from './Preview';
import { SeamGuard } from './SeamGuard';
import { Stage } from './Stage';
import { flushSave, useEditor, type SaveStatus } from './store';
import { stagePad, useMobile, useUi, type Tray } from './ui';

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

const TRAY_TITLE: Record<Tray, string> = {
  add: 'Add',
  edit: 'Edit',
  slides: 'Slides',
  stickers: 'Stickers & doodles',
  text: 'Text styles',
  draw: 'Draw',
  bridge: 'Bridges between slides',
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
  const tray = useUi((s) => s.tray);
  const tool = useUi((s) => s.tool);
  const phone = useUi((s) => s.phone);
  const setUi = useUi((s) => s.set);
  const mobile = useMobile();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [panel, setPanel] = useState<'none' | 'preview' | 'export' | 'auto'>(exportOnOpen ? 'export' : 'none');
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const slotInput = useRef<HTMLInputElement>(null);
  const slotTarget = useRef<string | null>(null);
  const fillInput = useRef<HTMLInputElement>(null);
  const straddleInput = useRef<HTMLInputElement>(null);
  const straddleSeam = useRef(1);
  const insertPage = useRef(0);

  const toast = useCallback((text: string, tone: Toast['tone'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'info' ? 3200 : 8000);
  }, []);

  useEffect(() => {
    if (useEditor.getState().savedRevision === null) void flushSave();
    setUi({ tray: null, tool: 'select', crop: false, ignored: [], warnings: [], page: 0, phone: !window.matchMedia('(max-width: 760px)').matches });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Canvas only draws a web font once it is loaded: load the faces in use, then redraw.
  const fontKey = useMemo(
    () =>
      project.layers
        .map((l) => (l.type === 'text' ? `${l.fontFamily}|${l.fontWeight}|${l.italic ? 1 : 0}|${l.ransom ? 1 : 0}` : l.type === 'sticker' ? 'sticker' : ''))
        .filter(Boolean)
        .sort()
        .join(';'),
    [project.layers],
  );
  useEffect(() => {
    void ensureFonts(useEditor.getState().project!.layers).then(() => library.touch());
  }, [fontKey]);

  const scroller = () => document.querySelector('.stage__scroller') as HTMLElement | null;
  const visiblePage = () => {
    const sc = scroller();
    if (!sc) return 0;
    const ox = (sc.querySelector('.stage__world') as HTMLElement | null)?.offsetLeft ?? 0;
    const center = (sc.scrollLeft + sc.clientWidth / 2 - stagePad() - ox) / useEditor.getState().zoom;
    return pageIndexAt(project.canvas, center, project.pages.length);
  };
  const currentPage = useUi((s) => s.page);
  useEffect(() => {
    const sc = scroller();
    if (!sc) return;
    const on = () => {
      const i = visiblePage();
      if (i !== useUi.getState().page) setUi({ page: i });
    };
    on();
    sc.addEventListener('scroll', on, { passive: true });
    return () => sc.removeEventListener('scroll', on);
  });

  const goToPage = (i: number) => {
    const sc = scroller();
    if (!sc) return;
    const z = useEditor.getState().zoom;
    const W = project.canvas.pageWidth;
    const ox = (sc.querySelector('.stage__world') as HTMLElement | null)?.offsetLeft ?? 0;
    sc.scrollTo({ left: ox + stagePad() + (i * W + W / 2) * z - sc.clientWidth / 2, behavior: 'smooth' });
    setUi({ page: i });
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

  /** "Photo across the seam" bridge: import one photo and place it straddling the cut. */
  const placeStraddle = async (files: File[]) => {
    const ok = await readFiles(files.slice(0, 1));
    const m = ok[0];
    if (!m) return;
    let id = '';
    apply((p) => {
      const withAsset = addAsset(p, m.asset);
      const base = layerForAsset(withAsset, m.asset, 0);
      const box = straddleBox(p, straddleSeam.current, m.asset.width / m.asset.height);
      id = base.id;
      return addLayer(withAsset, { ...base, ...box, crop: { focusX: 0.5, focusY: 0.5, zoom: 1 } });
    });
    select([id]);
    toast('The cut falls at a third of the photo, so a centred subject stays whole.');
  };

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
        setUi({ crop: false, tool: 'select', tray: null });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flushSave();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, []);

  // Leaving the draw panel leaves draw mode.
  useEffect(() => {
    if (tray !== 'draw' && tool === 'draw') setUi({ tool: 'select' });
  }, [tray, tool, setUi]);

  // Phone: a new selection opens the Edit sheet (low, so the slide stays visible);
  // clearing the selection closes it.
  const prevSel = useRef<string>('');
  useEffect(() => {
    const key = selection.join(',');
    if (!mobile || key === prevSel.current) return;
    prevSel.current = key;
    const t = useUi.getState().tray;
    if (selection.length === 1 && (t === null || t === 'add')) setUi({ tray: 'edit' });
    if (selection.length === 0 && t === 'edit') setUi({ tray: null });
  }, [mobile, selection, setUi]);

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
  const openTray = (t: Tray | null) => setUi({ tray: t, tool: t === 'draw' ? 'draw' : 'select' });

  const pickMedia = () => {
    insertPage.current = visiblePage();
    fileInput.current?.click();
  };

  const addActions: AddAction[] = [
    { id: 'media', icon: 'media', label: 'Photo / clip', run: pickMedia },
    { id: 'auto', icon: 'auto', label: 'Auto collage', run: () => setPanel('auto'), accent: true },
    { id: 'text', icon: 'text', label: 'Text', run: () => openTray('text') },
    { id: 'stickers', icon: 'sticker', label: 'Sticker', run: () => openTray('stickers') },
    { id: 'draw', icon: 'pen', label: 'Draw', run: () => openTray('draw') },
    { id: 'bridge', icon: 'bridge', label: 'Bridge', run: () => openTray('bridge') },
    { id: 'shape', icon: 'shape', label: 'Shape', run: () => addShape() },
    ...(emptySlots > 0 ? [{ id: 'fill', icon: 'fill' as IconName, label: `Fill ${emptySlots} slots`, run: () => fillInput.current?.click(), accent: true }] : []),
  ];

  const trayBody = (t: Tray) => {
    const done = () => setUi({ tray: mobile && useEditor.getState().selection.length ? 'edit' : null, tool: 'select' });
    switch (t) {
      case 'add':
        return <AddGrid actions={addActions} />;
      case 'edit':
        return (
          <Inspector
            onReplace={(id) => {
              slotTarget.current = id;
              slotInput.current?.click();
            }}
          />
        );
      case 'slides':
        return (
          <>
            <Filmstrip current={currentPage} onPick={goToPage} />
            <div className="inspector">
              <ProjectInspector project={project} />
            </div>
          </>
        );
      case 'stickers':
        return <StickerSheet onDone={done} />;
      case 'text':
        return <TextPanel onDone={done} />;
      case 'draw':
        return <DrawPanel onDone={() => openTray(null)} />;
      case 'bridge':
        return (
          <BridgePanel
            onPhoto={(k) => {
              straddleSeam.current = k;
              straddleInput.current?.click();
            }}
            onDone={done}
          />
        );
    }
  };

  const Tool = ({ icon, label, onClick, active, tone, testid }: { icon: IconName; label: string; onClick(): void; active?: boolean; tone?: 'danger' | 'accent'; testid?: string }) => (
    <motion.button layout="position" transition={spring} className={`tool ${active ? 'is-active' : ''} ${tone ? `tool--${tone}` : ''}`} onClick={onClick} aria-pressed={active} data-testid={testid}>
      <Icon name={icon} size={22} />
      {label}
    </motion.button>
  );

  const sideTray = !mobile && tray && tray !== 'add' && tray !== 'edit' && tray !== 'slides' ? tray : null;

  return (
    <div className={`editor ${mobile ? 'editor--mobile' : ''}`}>
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
        {!mobile && (
          <>
            <div className="zoom" role="group" aria-label="Zoom">
              <button className="btn btn--icon btn--ghost btn--sm" onClick={() => setZoom(zoom / 1.25)} aria-label="Zoom out">
                <Icon name="zoomOut" size={18} />
              </button>
              <span className="mono">{Math.round(zoom * 100)}%</span>
              <button className="btn btn--icon btn--ghost btn--sm" onClick={() => setZoom(zoom * 1.25)} aria-label="Zoom in">
                <Icon name="zoomIn" size={18} />
              </button>
            </div>
            <button className={`btn btn--icon btn--ghost ${phone ? 'is-on' : ''}`} onClick={() => setUi({ phone: !phone })} aria-pressed={phone} aria-label="Live phone preview" title="Live phone preview">
              <Icon name="phone" />
            </button>
            <button className="btn" onClick={() => setPanel('preview')} aria-label="Preview">
              <Icon name="swipe" /> <span className="topbar__label">Preview</span>
            </button>
          </>
        )}
        <button className="btn btn--primary" onClick={() => setPanel('export')} data-testid="open-export">
          <Icon name="export" /> Export
        </button>
      </header>

      <div className="workspace">
        {!mobile && (
          <nav className="toolbar" aria-label="Tools">
            <Tool icon="media" label="Media" onClick={pickMedia} testid="tool-media" />
            {emptySlots > 0 && <Tool icon="fill" label={`Fill ${emptySlots}`} tone="accent" onClick={() => fillInput.current?.click()} testid="fill-slots" />}
            <Tool icon="auto" label="Auto" onClick={() => setPanel('auto')} testid="tool-auto" />
            <span className="tool__sep" />
            <Tool icon="text" label="Text" active={tray === 'text'} onClick={() => openTray(tray === 'text' ? null : 'text')} testid="tool-text" />
            <Tool icon="sticker" label="Sticker" active={tray === 'stickers'} onClick={() => openTray(tray === 'stickers' ? null : 'stickers')} testid="tool-stickers" />
            <Tool icon="pen" label="Draw" active={tool === 'draw'} onClick={() => openTray(tray === 'draw' ? null : 'draw')} testid="tool-draw" />
            <Tool icon="bridge" label="Bridge" active={tray === 'bridge'} onClick={() => openTray(tray === 'bridge' ? null : 'bridge')} testid="tool-bridge" />
            <Tool icon="shape" label="Shape" onClick={() => addShape()} />
          </nav>
        )}

        <div className="stage-col">
          <main className="stage-wrap">
            <Stage
              onDropFiles={(f, i, slotId) => void (slotId ? fillSlots(f, slotId) : importAndPlace(f, i))}
              onSlot={(id) => {
                slotTarget.current = id;
                slotInput.current?.click();
              }}
              onLongPress={(id, x, y) => setMenu({ id, x, y })}
            />
            {project.layers.length === 0 && (
              <div className="coach">
                <p>Drop photos or a clip here.</p>
                <button className="btn btn--primary" onClick={() => setPanel('auto')} data-testid="coach-auto">
                  <Icon name="auto" /> Lay them out for me
                </button>
              </div>
            )}
            {tool === 'draw' && (
              <motion.div className="draw-banner" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
                <Icon name="pen" size={16} /> Drawing — drag across the slides
                <button className="btn btn--sm" onClick={() => openTray(null)}>
                  Done
                </button>
              </motion.div>
            )}
            <SeamGuard />
            <LivePhone onPick={goToPage} />
            <AnimatePresence>
              {busy && (
                <motion.div className="busy" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={spring}>
                  <span className="lamp" /> {busy}
                </motion.div>
              )}
            </AnimatePresence>
          </main>
          {!mobile && <Filmstrip current={currentPage} onPick={goToPage} />}
        </div>

        {!mobile && (
          <div className="side">
            <AnimatePresence mode="wait" initial={false}>
              {sideTray ? (
                <motion.div key={sideTray} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={spring}>
                  <PanelHead title={TRAY_TITLE[sideTray]} onClose={() => openTray(null)} />
                  {trayBody(sideTray)}
                </motion.div>
              ) : (
                <motion.div key="inspect" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <Inspector
                    onReplace={(id) => {
                      slotTarget.current = id;
                      slotInput.current?.click();
                    }}
                  />
                  <LayersPanel />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {mobile && (
        <>
          <BottomSheet open={!!tray} title={tray ? TRAY_TITLE[tray] : ''} sheetKey={tray ?? 'none'} onClose={() => openTray(null)} initial={tray === 'draw' || tray === 'edit' ? 'peek' : 'half'} bottom={64}>
            {tray && trayBody(tray)}
          </BottomSheet>
          <nav className="dock" aria-label="Editor">
            {(
              [
                { t: 'add', icon: 'plus', label: 'Add' },
                { t: 'edit', icon: 'sliders', label: 'Edit' },
                { t: 'slides', icon: 'pages', label: 'Slides' },
              ] as { t: Tray; icon: IconName; label: string }[]
            ).map((d) => (
              <button key={d.t} className={`dock__tab ${tray === d.t ? 'is-active' : ''}`} disabled={d.t === 'edit' && !sel} onClick={() => openTray(tray === d.t ? null : d.t)} aria-pressed={tray === d.t} data-testid={`dock-${d.t}`}>
                {tray === d.t && <motion.span layoutId="dock-pill" className="dock__pill" transition={spring} />}
                <Icon name={d.icon} size={22} />
                <span>{d.label}</span>
                {d.t === 'edit' && sel && <i className="dock__dot" aria-hidden />}
              </button>
            ))}
            <button className="dock__tab" onClick={() => setPanel('preview')} data-testid="dock-preview">
              <Icon name="swipe" size={22} />
              <span>Preview</span>
            </button>
          </nav>
        </>
      )}

      <AnimatePresence>
        {menu && (
          <LayerMenu
            key="menu"
            x={menu.x}
            y={menu.y}
            onClose={() => setMenu(null)}
            actions={[
              { label: 'Edit', run: () => openTray('edit') },
              { label: 'Duplicate', run: () => duplicate(menu.id) },
              { label: 'Bring forward', run: () => apply((p) => reorderLayer(p, menu.id, 'up')) },
              { label: 'Send backward', run: () => apply((p) => reorderLayer(p, menu.id, 'down')) },
              { label: 'Lock', run: () => apply((p) => updateLayer(p, menu.id, { locked: true })) },
              {
                label: 'Delete',
                danger: true,
                run: () => {
                  apply((p) => removeLayers(p, [menu.id]));
                  select([]);
                },
              },
            ]}
          />
        )}
      </AnimatePresence>

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
      <input
        ref={straddleInput}
        type="file"
        accept="image/*,video/*"
        hidden
        data-testid="straddle-input"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          void placeStraddle(files);
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
        {panel === 'auto' && (
          <AutoCollage
            key="auto"
            media={project.assets.flatMap((a): MediaItem[] => {
              const blob = library.blob(a.id);
              const used = project.layers.some((l) => 'assetId' in l && l.assetId === a.id && !l.slot);
              return blob && used ? [{ asset: a, blob }] : [];
            })}
            title={project.title}
            size={{ width: project.canvas.pageWidth, height: project.canvas.pageHeight }}
            applyLabel="Apply to this carousel"
            onClose={() => setPanel('none')}
            onApply={(built) => {
              apply((p) => ({ ...built, id: p.id, title: p.title, createdAt: p.createdAt, revision: p.revision, updatedAt: p.updatedAt }));
              select([]);
              setPanel('none');
              setUi({ ignored: [] });
              setTimeout(() => goToPage(0), 60);
              toast(`Laid out ${built.pages.length} slides. Everything stays editable — Undo brings back the previous layout.`);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function LayerMenu({ x, y, actions, onClose }: { x: number; y: number; actions: { label: string; run(): void; danger?: boolean }[]; onClose(): void }) {
  const left = Math.min(window.innerWidth - 196, Math.max(12, x - 90));
  const top = Math.min(window.innerHeight - actions.length * 46 - 24, Math.max(12, y - 20));
  return (
    <motion.div className="menu-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.ul className="layer-menu" role="menu" style={{ left, top }} initial={{ opacity: 0, scale: 0.9, y: -6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} transition={spring} onClick={(e) => e.stopPropagation()}>
        {actions.map((a) => (
          <li key={a.label}>
            <button
              role="menuitem"
              className={a.danger ? 'is-danger' : ''}
              onClick={() => {
                a.run();
                onClose();
              }}
            >
              {a.label}
            </button>
          </li>
        ))}
      </motion.ul>
    </motion.div>
  );
}
