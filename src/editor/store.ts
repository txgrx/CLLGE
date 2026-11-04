import { create } from 'zustand';
import { beginGesture, emptyHistory, endGesture, record, redo, undo, type History } from '../model/history';
import type { Project } from '../model/types';
import { touch } from '../model/project';
import { library } from '../media/library';
import { RevisionConflictError, saveProject } from '../storage/db';

export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error' | 'conflict';

interface EditorState {
  project: Project | null;
  history: History<Project>;
  selection: string[];
  zoom: number;
  saveStatus: SaveStatus;
  saveError: string | null;
  /** Revision last confirmed in storage. */
  savedRevision: number | null;
  open(project: Project, savedRevision: number | null): void;
  close(): void;
  /** Apply an edit that becomes one undo step (unless a gesture is in progress). */
  apply(fn: (p: Project) => Project): void;
  /** Gesture: many transient edits, one undo step. */
  beginGesture(): void;
  endGesture(): void;
  undo(): void;
  redo(): void;
  select(ids: string[]): void;
  setZoom(z: number): void;
}

export const useEditor = create<EditorState>((set, get) => ({
  project: null,
  history: emptyHistory(),
  selection: [],
  zoom: 0.4,
  saveStatus: 'saved',
  saveError: null,
  savedRevision: null,
  open(project, savedRevision) {
    set({ project, history: emptyHistory(), selection: [], saveStatus: 'saved', saveError: null, savedRevision });
  },
  close() {
    set({ project: null, history: emptyHistory(), selection: [] });
  },
  apply(fn) {
    const { project, history } = get();
    if (!project) return;
    const next = touch(fn(project));
    set({
      project: next,
      history: history.gestureStart ? history : record(history, project),
      saveStatus: 'unsaved',
    });
    scheduleSave();
  },
  beginGesture() {
    const { project, history } = get();
    if (project) set({ history: beginGesture(history, project) });
  },
  endGesture() {
    const { project, history } = get();
    if (project) set({ history: endGesture(history, project) });
  },
  undo() {
    const { project, history } = get();
    if (!project) return;
    const r = undo(history, project);
    if (!r) return;
    set({ project: keepRevision(r.value, project), history: r.history, saveStatus: 'unsaved', selection: validSelection(r.value, get().selection) });
    scheduleSave();
  },
  redo() {
    const { project, history } = get();
    if (!project) return;
    const r = redo(history, project);
    if (!r) return;
    set({ project: keepRevision(r.value, project), history: r.history, saveStatus: 'unsaved', selection: validSelection(r.value, get().selection) });
    scheduleSave();
  },
  select(ids) {
    set({ selection: ids });
  },
  setZoom(z) {
    set({ zoom: Math.min(4, Math.max(0.05, z)) });
  },
}));

/** Undo restores content, but the revision keeps increasing so storage ordering stays monotonic. */
function keepRevision(value: Project, current: Project): Project {
  return { ...value, revision: current.revision + 1, updatedAt: Date.now() };
}

function validSelection(p: Project, ids: string[]): string[] {
  const set = new Set(p.layers.map((l) => l.id));
  return ids.filter((id) => set.has(id));
}

let timer: ReturnType<typeof setTimeout> | null = null;
let saving: Promise<void> | null = null;

export function scheduleSave(delay = 600): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void flushSave(), delay);
}

/** Write the current revision; resolves when it is durable in IndexedDB. */
export async function flushSave(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (saving) await saving;
  const { project, savedRevision, history } = useEditor.getState();
  if (!project || history.gestureStart) return;
  if (savedRevision !== null && project.revision === savedRevision) return;
  useEditor.setState({ saveStatus: 'saving' });
  saving = (async () => {
    try {
      await saveProject(project, (id) => library.blob(id), savedRevision);
      const current = useEditor.getState().project;
      useEditor.setState({
        savedRevision: project.revision,
        saveStatus: current && current.revision === project.revision ? 'saved' : 'unsaved',
        saveError: null,
      });
    } catch (e) {
      if (e instanceof RevisionConflictError) useEditor.setState({ saveStatus: 'conflict', saveError: e.message });
      else useEditor.setState({ saveStatus: 'error', saveError: e instanceof Error ? e.message : String(e) });
    } finally {
      saving = null;
    }
  })();
  await saving;
  if (useEditor.getState().saveStatus === 'unsaved') scheduleSave();
}
