/**
 * Renders the stills used by the demo film (video/) from the app's own art and
 * renderer, so the film shows exactly what the app produces.
 */
import { normalizeProject } from '../../src/model/project';
import type { Project } from '../../src/model/types';
import { buildPanoramaProject } from '../../src/panorama/split';
import { drawPage, drawRegion } from '../../src/render/drawWindow';
import { coast, dunes } from '../../src/templates/art';
import { TEMPLATES } from '../../src/templates/catalog';
import { fontsReady } from '../../src/ui/fonts';

async function toDataUrl(b: Blob): Promise<string> {
  return new Promise((res) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result));
    fr.readAsDataURL(b);
  });
}

async function bitmaps(blobs: Map<string, Blob>) {
  const m = new Map<string, ImageBitmap>();
  for (const [id, b] of blobs) m.set(id, await createImageBitmap(b));
  return m;
}

async function strip(project: Project, blobs: Map<string, Blob>, scale: number, type: 'image/png' | 'image/jpeg') {
  const bm = await bitmaps(blobs);
  const N = project.pages.length;
  const { pageWidth: W, pageHeight: H } = project.canvas;
  const c = new OffscreenCanvas(Math.round(N * W * scale), Math.round(H * scale));
  drawRegion(c.getContext('2d')!, project, { x: 0, y: 0, width: N * W, height: H }, 0, { image: (id) => bm.get(id), video: () => null }, { scale });
  return toDataUrl(await c.convertToBlob(type === 'image/jpeg' ? { type, quality: 0.9 } : { type }));
}

export async function filmAssets(): Promise<Record<string, string>> {
  await fontsReady();
  const out: Record<string, string> = {};

  // 1. The panorama (same seed as the home demo).
  const pano = await coast(3600, 1500, 11);
  out['pano.jpg'] = await toDataUrl(pano);

  // 2. Its three slides, exactly as exported.
  const p = buildPanoramaProject({
    asset: { id: 'pano', type: 'image', name: 'pano', mime: 'image/jpeg', width: 3600, height: 1500 },
    slides: 3,
    pageWidth: 1080,
    pageHeight: 1350,
    crop: { focusX: 0.5, focusY: 0.5, zoom: 1 },
  });
  const pb = await createImageBitmap(pano);
  for (let i = 0; i < 3; i++) {
    const c = new OffscreenCanvas(756, 945);
    drawPage(c.getContext('2d')!, p, i, 0, { image: () => pb, video: () => null }, { scale: 0.7 });
    out[`slide-${i + 1}.jpg`] = await toDataUrl(await c.convertToBlob({ type: 'image/jpeg', quality: 0.9 }));
  }

  // 3. "Doorway" without its clip slot, on a transparent background: the film
  //    animates a clip underneath, framed by the arch.
  const door = TEMPLATES.find((t) => t.id === 'doorway')!;
  const built = await door.build();
  const noSlot = normalizeProject({
    ...built.project,
    canvas: { ...built.project.canvas, background: 'rgba(0,0,0,0)' },
    layers: built.project.layers.filter((l) => !((l.type === 'image' || l.type === 'video') && l.slot === 'video')),
  });
  out['doorway.png'] = await strip(noSlot, built.blobs, 0.5, 'image/png');
  out['clip.jpg'] = await toDataUrl(await dunes(900, 1040, 31));
  out['clip-b.jpg'] = await toDataUrl(await coast(900, 1040, 23));

  // 4. First page of every template, for the closing montage.
  for (const t of TEMPLATES) {
    const { project, blobs } = await t.build({ artScale: 0.5 });
    const bm = await bitmaps(blobs);
    const c = new OffscreenCanvas(432, 540);
    drawPage(c.getContext('2d')!, project, 0, 0, { image: (id) => bm.get(id), video: () => null }, { scale: 0.4 });
    out[`tpl-${t.id}.jpg`] = await toDataUrl(await c.convertToBlob({ type: 'image/jpeg', quality: 0.88 }));
  }
  return out;
}
