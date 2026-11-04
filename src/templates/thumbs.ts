import type { Project } from '../model/types';
import { drawPage } from '../render/drawWindow';
import { fontsReady } from '../ui/fonts';
import { TEMPLATES } from './catalog';

/** Render every page of a project to small image URLs (for cards and previews). */
export async function renderPages(project: Project, blobs: Map<string, Blob>, pageHeightPx: number): Promise<string[]> {
  await fontsReady();
  const bitmaps = new Map<string, ImageBitmap>();
  for (const [id, b] of blobs) bitmaps.set(id, await createImageBitmap(b));
  const { pageWidth: W, pageHeight: H } = project.canvas;
  const scale = pageHeightPx / H;
  const c = new OffscreenCanvas(Math.round(W * scale), Math.round(H * scale));
  const ctx = c.getContext('2d')!;
  const urls: string[] = [];
  for (let i = 0; i < project.pages.length; i++) {
    drawPage(ctx, project, i, 0, { image: (id) => bitmaps.get(id), video: () => null }, { scale });
    urls.push(URL.createObjectURL(await c.convertToBlob({ type: 'image/jpeg', quality: 0.82 })));
  }
  for (const b of bitmaps.values()) b.close();
  return urls;
}

const cache = new Map<string, Promise<string[]>>();

export function templateThumbs(id: string): Promise<string[]> {
  let p = cache.get(id);
  if (!p) {
    const spec = TEMPLATES.find((t) => t.id === id);
    if (!spec) return Promise.resolve([]);
    p = spec.build({ artScale: 0.3 }).then(({ project, blobs }) => renderPages(project, blobs, 340));
    cache.set(id, p);
  }
  return p;
}
