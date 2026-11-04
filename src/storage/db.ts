import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { normalizeProject } from '../model/project';
import type { Project } from '../model/types';

/**
 * Local, on-device storage (IndexedDB). Nothing leaves the browser.
 * Order of writes: media blobs first, then the project revision that references
 * them, both in one transaction, so "Saved" never points at missing media.
 */
interface Schema extends DBSchema {
  projects: { key: string; value: Project };
  blobs: { key: string; value: { projectId: string; assetId: string; blob: Blob } };
}

let dbp: Promise<IDBPDatabase<Schema>> | null = null;

function db(): Promise<IDBPDatabase<Schema>> {
  dbp ??= openDB<Schema>('cllge', 1, {
    upgrade(d) {
      d.createObjectStore('projects', { keyPath: 'id' });
      d.createObjectStore('blobs');
    },
  });
  return dbp;
}

const blobKey = (projectId: string, assetId: string) => `${projectId}/${assetId}`;

export interface ProjectSummary {
  id: string;
  title: string;
  pages: number;
  updatedAt: number;
  pageWidth: number;
  pageHeight: number;
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const all = await (await db()).getAll('projects');
  return all
    .map((p) => ({ id: p.id, title: p.title, pages: p.pages.length, updatedAt: p.updatedAt, pageWidth: p.canvas.pageWidth, pageHeight: p.canvas.pageHeight }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export class RevisionConflictError extends Error {
  constructor(public stored: number) {
    super('This project was changed in another tab.');
  }
}

/**
 * Save a revision. Fails with RevisionConflictError if another tab stored a newer
 * revision, so neither copy is silently lost.
 */
export async function saveProject(project: Project, blobs: (assetId: string) => Blob | undefined, baseRevision: number | null): Promise<void> {
  const d = await db();
  const tx = d.transaction(['projects', 'blobs'], 'readwrite');
  const projects = tx.objectStore('projects');
  const blobStore = tx.objectStore('blobs');
  const stored = await projects.get(project.id);
  if (stored && baseRevision !== null && stored.revision > baseRevision) {
    tx.abort();
    await tx.done.catch(() => undefined);
    throw new RevisionConflictError(stored.revision);
  }
  for (const a of project.assets) {
    const key = blobKey(project.id, a.id);
    if (await blobStore.getKey(key)) continue;
    const blob = blobs(a.id);
    if (!blob) {
      tx.abort();
      await tx.done.catch(() => undefined);
      throw new Error(`Missing media "${a.name}"`);
    }
    await blobStore.put({ projectId: project.id, assetId: a.id, blob }, key);
  }
  // Drop blobs no longer referenced.
  const keep = new Set(project.assets.map((a) => blobKey(project.id, a.id)));
  let cursor = await blobStore.openCursor(IDBKeyRange.bound(`${project.id}/`, `${project.id}/￿`));
  while (cursor) {
    if (!keep.has(String(cursor.key))) await cursor.delete();
    cursor = await cursor.continue();
  }
  await projects.put(project);
  await tx.done;
}

export async function loadProject(id: string): Promise<{ project: Project; blobs: Map<string, Blob> } | null> {
  const d = await db();
  const raw = await d.get('projects', id);
  if (!raw) return null;
  const project = normalizeProject(raw);
  const blobs = new Map<string, Blob>();
  for (const a of project.assets) {
    const rec = await d.get('blobs', blobKey(id, a.id));
    if (rec) blobs.set(a.id, rec.blob);
  }
  return { project, blobs };
}

export async function deleteProject(id: string): Promise<void> {
  const d = await db();
  const tx = d.transaction(['projects', 'blobs'], 'readwrite');
  await tx.objectStore('projects').delete(id);
  await tx.objectStore('blobs').delete(IDBKeyRange.bound(`${id}/`, `${id}/￿`));
  await tx.done;
}

/** Ask the browser not to evict our data under storage pressure. */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
