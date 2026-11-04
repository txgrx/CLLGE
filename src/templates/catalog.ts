import { newId } from '../model/ids';
import { createProject } from '../model/project';
import type { Asset, ImageLayer, Layer, Project, ShapeLayer, SlotKind, TextLayer } from '../model/types';
import * as art from './art';
import { sampleBlob } from './samples';

export type TemplateFamily = 'panorama' | 'video' | 'film' | 'editorial';

export const FAMILY_LABEL: Record<TemplateFamily, string> = {
  panorama: 'Panorama',
  video: 'Video window',
  film: 'Film',
  editorial: 'Magazine & scrapbook',
};

export interface BuildOptions {
  /** Resolution factor for the sample art (thumbnails use ~0.25). */
  artScale?: number;
}

export interface TemplateSpec {
  id: string;
  family: TemplateFamily;
  name: string;
  /** One line: the idea, not the instructions. */
  idea: string;
  pages: number;
  build(opts?: BuildOptions): Promise<{ project: Project; blobs: Map<string, Blob> }>;
}

const W = 1080;
const H = 1350;
const SERIF = '"Instrument Serif", Georgia, serif';
const MONO = '"JetBrains Mono", ui-monospace, monospace';
const HAND = 'Caveat, "Segoe Print", cursive';

/** Small builder: keeps assets, blobs and layers together while composing a template. */
class Composer {
  project: Project;
  blobs = new Map<string, Blob>();
  constructor(
    title: string,
    pages: number,
    background: string,
    /** Resolution of the generated art; < 1 for quick thumbnails. */
    private artScale = 1,
  ) {
    this.project = createProject({ title, pages, pageWidth: W, pageHeight: H, background });
  }
  private push(l: Layer) {
    this.project.layers.push(l);
    return l;
  }
  private async asset(name: string, blob: Blob | Promise<Blob>, w: number, h: number): Promise<Asset> {
    const b = await blob;
    const a: Asset = { id: newId('a_'), type: 'image', name, mime: b.type, width: w, height: h };
    this.project.assets.push(a);
    this.blobs.set(a.id, b);
    return a;
  }
  /**
   * A slot filled with sample art that asks for the user's photo or clip. Uses the
   * cyanotype sample image(s) `sample` from public/art when present, otherwise the
   * code-drawn `art`.
   */
  async slot(kind: SlotKind, name: string, rect: Box, art: (w: number, h: number) => Promise<Blob>, extra: Partial<ImageLayer> = {}, sample?: string | string[]) {
    const aw = Math.max(8, Math.round(Math.min(2400, rect.width * 1.1) * this.artScale));
    const ah = Math.round((aw * rect.height) / rect.width);
    const photo = sample ? await sampleBlob(sample, Math.max(aw, Math.round(ah * 3)), 0.16, 0.02) : null;
    const a = photo ? await this.asset(`${name}.jpg`, photo.blob, photo.width, photo.height) : await this.asset(`${name}.jpg`, art(aw, ah), aw, ah);
    return this.push({ ...base(rect), type: 'image', name, assetId: a.id, fit: 'cover', crop: { focusX: 0.5, focusY: 0.5, zoom: 1 }, radius: 0, slot: kind, ...extra } as ImageLayer);
  }
  /** Decoration drawn by code (PNG with transparency). */
  async decor(name: string, rect: Box, draw: (scale: number) => Promise<Blob>, pw: number, ph: number, extra: Partial<ImageLayer> = {}) {
    const a = await this.asset(`${name}.png`, draw(this.artScale), pw, ph);
    return this.push({ ...base(rect), type: 'image', name, assetId: a.id, fit: 'contain', crop: { focusX: 0.5, focusY: 0.5, zoom: 1 }, radius: 0, ...extra } as ImageLayer);
  }
  shape(name: string, rect: Box, fill: string, extra: Partial<ShapeLayer> = {}) {
    return this.push({ ...base(rect), type: 'shape', name, fill, radius: 0, ...extra } as ShapeLayer);
  }
  text(name: string, rect: Box, text: string, style: Partial<TextLayer>) {
    return this.push({
      ...base(rect),
      type: 'text',
      name,
      text,
      fontFamily: SERIF,
      fontSize: 80,
      fontWeight: 400,
      color: '#EDEBE6',
      align: 'left',
      lineHeight: 1.05,
      ...style,
    } as TextLayer);
  }
  done() {
    return { project: this.project, blobs: this.blobs };
  }
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
}

function base(b: Box) {
  return { id: newId('l_'), x: b.x, y: b.y, width: b.width, height: b.height, rotation: b.rotation ?? 0, opacity: 1, visible: true, locked: false };
}

/**
 * Place a child box in a rotated parent's frame: (dx, dy) is the child's top-left
 * relative to the parent's top-left before rotation. Keeps both rotating together.
 */
export function attach(parent: Box, dx: number, dy: number, w: number, h: number): Box {
  const a = ((parent.rotation ?? 0) * Math.PI) / 180;
  const pcx = parent.x + parent.width / 2;
  const pcy = parent.y + parent.height / 2;
  const ox = dx + w / 2 - parent.width / 2;
  const oy = dy + h / 2 - parent.height / 2;
  const cx = pcx + ox * Math.cos(a) - oy * Math.sin(a);
  const cy = pcy + ox * Math.sin(a) + oy * Math.cos(a);
  return { x: cx - w / 2, y: cy - h / 2, width: w, height: h, rotation: parent.rotation };
}

export const TEMPLATES: TemplateSpec[] = [
  {
    id: 'horizon-line',
    family: 'panorama',
    name: 'Horizon line',
    idea: 'One wide photo, three swipes, a caption that keeps walking.',
    pages: 3,
    async build(o) {
      const c = new Composer('Horizon line', 3, '#0E0E0F', o?.artScale);
      await c.slot('image', 'Your panorama', { x: 0, y: 0, width: 3 * W, height: H }, (w, h) => art.coast(w, h, 11), {}, ['world-1', 'world-2']);
      c.shape('Rule', { x: 80, y: 1206, width: 3 * W - 160, height: 2 }, '#FF3B2F');
      c.text('Caption', { x: 80, y: 1228, width: 3 * W - 160, height: 60 }, '36°16′N  ·  5°55′W   ——   18:42   ——   the long way round   ——   keep swiping', {
        fontFamily: MONO,
        fontSize: 30,
        color: '#EDEBE6',
      });
      c.text('Title', { x: 80, y: 90, width: 900, height: 160 }, 'the long\nway round', { fontSize: 120, lineHeight: 0.92 });
      return c.done();
    },
  },
  {
    id: 'postcard',
    family: 'panorama',
    name: 'Postcard',
    idea: 'A stamped cover, then the view opens up behind it.',
    pages: 4,
    async build(o) {
      const c = new Composer('Postcard', 4, '#E9E2D3', o?.artScale);
      await c.slot('image', 'Your panorama', { x: W, y: 0, width: 3 * W, height: H }, (w, h) => art.dunes(w, h, 7), {}, ['postcard-a', 'postcard-b']);
      c.text('Greeting', { x: 90, y: 150, width: 900, height: 80 }, 'Greetings from', { fontFamily: SERIF, fontSize: 64, color: '#1D1B1A', fontWeight: 400 });
      c.text('Place', { x: 80, y: 220, width: 940, height: 260 }, 'Somewhere\nwarm', { fontFamily: SERIF, fontSize: 170, color: '#1D1B1A', lineHeight: 0.9 });
      const stamp = { x: 560, y: 700, width: 380, height: 460, rotation: -5 };
      await c.decor('Stamp', stamp, (s) => art.stampFrame(380 * s, 460 * s), 380, 460);
      await c.slot('image', 'Stamp photo', attach(stamp, 30, 30, 320, 400), (w, h) => art.roofline(w, h, 3), {}, 'stamp');
      // The postmark's wavy lines run off the cover into the panorama.
      await c.decor('Postmark', { x: 380, y: 980, width: 1100, height: 260, rotation: -3 }, (s) => art.postmark(1100 * s, 260 * s, 'NOV 26'), 1100, 260, { opacity: 0.85 });
      c.text('Note', { x: 90, y: 1180, width: 600, height: 60 }, 'swipe for the view  →', { fontFamily: MONO, fontSize: 26, color: '#5A554C' });
      return c.done();
    },
  },
  {
    id: 'window-seat',
    family: 'video',
    name: 'Window seat',
    idea: 'A still night outside, and one window that moves.',
    pages: 3,
    async build(o) {
      const c = new Composer('Window seat', 3, '#05060C', o?.artScale);
      await c.slot('image', 'Background', { x: 0, y: 0, width: 3 * W, height: H }, (w, h) => art.nightSky(w, h, 5), {}, 'clouds-b');
      c.shape('Window frame', { x: W + 170, y: 270, width: 740, height: 900 }, '#1F1F22', { radius: 230 });
      await c.slot('video', 'Your clip', { x: W + 200, y: 300, width: 680, height: 840 }, (w, h) => art.coast(w, h, 23), { radius: 200 }, 'window-view');
      c.text('Title', { x: 90, y: 1080, width: 900, height: 200 }, 'window\nseat', { fontSize: 130, lineHeight: 0.9 });
      c.text('Seat', { x: 2 * W + 90, y: 1200, width: 900, height: 60 }, 'SEAT 14A  ·  01:12 LOCAL', { fontFamily: MONO, fontSize: 28, color: '#8C8981', align: 'right' });
      return c.done();
    },
  },
  {
    id: 'doorway',
    family: 'video',
    name: 'Doorway',
    idea: 'A clip that stands in the seam: swipe and walk through it.',
    pages: 3,
    async build(o) {
      const c = new Composer('Doorway', 3, '#0C1F42', o?.artScale);
      await c.slot('video', 'Your clip', { x: 690, y: 300, width: 780, height: 900 }, (w, h) => art.dunes(w, h, 31), {}, 'doorway-view');
      await c.decor('Door frame', { x: 650, y: 260, width: 860, height: 940 }, (s) => art.archFrame(860 * s, 940 * s, 40 * s, '#E9E2D3'), 860, 940);
      c.shape('Floor', { x: 0, y: 1199, width: 3 * W, height: 2 }, '#2A4A7F');
      c.text('Entry', { x: 650, y: 1225, width: 860, height: 50 }, 'ENTRY  ·  02', { fontFamily: MONO, fontSize: 24, color: '#8C8981', align: 'center' });
      c.text('Title', { x: 90, y: 110, width: 520, height: 300 }, 'step\nthrough', { fontSize: 140, lineHeight: 0.88 });
      c.text('Folio', { x: 2 * W + 90, y: 110, width: 900, height: 60 }, '01 — 02 — 03', { fontFamily: MONO, fontSize: 28, color: '#8C8981', align: 'right' });
      const polaroid = { x: 2 * W + 380, y: 640, width: 520, height: 620, rotation: 4 };
      c.shape('Polaroid', polaroid, '#F4F1EA');
      await c.slot('image', 'Photo', attach(polaroid, 30, 30, 460, 460), (w, h) => art.botanical(w, h, 9), {}, 'polaroid-2');
      c.text('Polaroid note', attach(polaroid, 30, 510, 460, 80), 'the other side', { fontFamily: HAND, fontSize: 52, color: '#2A2724', align: 'center' });
      return c.done();
    },
  },
  {
    id: 'contact-sheet',
    family: 'film',
    name: 'Contact sheet',
    idea: 'Six frames on one roll, and the one you circled.',
    pages: 3,
    async build(o) {
      const c = new Composer('Contact sheet', 3, '#0B0B0B', o?.artScale);
      const stripY = 420;
      const stripH = 520;
      await c.decor('Film strip', { x: 0, y: stripY, width: 3 * W, height: stripH }, (s) => art.filmStrip(3 * W * s, stripH * s, 6, 24), 3 * W, stripH);
      for (let i = 0; i < 6; i++) {
        // Offset so frames 2 and 4 sit across the seams.
        await c.slot('image', `Frame ${24 + i}`, { x: 160 + i * 520, y: stripY + 90, width: 480, height: 340 }, (w, h) => art.still(w, h, 100 + i), { radius: 6 }, `frame-${i + 1}`);
      }
      await c.decor('Pick', { x: 1690, y: stripY + 40, width: 540, height: 440 }, (s) => art.greaseCircle(540 * s, 440 * s, 4), 540, 440);
      c.text('Roll', { x: 90, y: 150, width: 900, height: 60 }, 'ROLL 03  ·  ISO 400  ·  PUSH +1', { fontFamily: MONO, fontSize: 28, color: '#8C8981' });
      c.text('Title', { x: 90, y: 1040, width: 900, height: 200 }, 'contact\nsheet', { fontSize: 120, lineHeight: 0.9 });
      c.text('Keep', { x: 2 * W - 60, y: 990, width: 400, height: 80 }, 'keep ↑', { fontFamily: HAND, fontSize: 64, color: '#FF3B2F' });
      return c.done();
    },
  },
  {
    id: 'drying-line',
    family: 'film',
    name: 'Drying line',
    idea: 'Prints pegged on a string that sags from slide to slide.',
    pages: 3,
    async build(o) {
      const c = new Composer('Drying line', 3, '#17100E', o?.artScale);
      const lw = 3 * W;
      const lh = 420;
      const sag = 140;
      const centers = [300, 960, 1620, 2250, 2920];
      await c.decor('Line', { x: 0, y: 80, width: lw, height: lh }, (s) => art.dryingLine(lw * s, lh * s, centers.map((x) => x * s), sag * s), lw, lh);
      const tilts = [-4, 3, -2, 5, -3];
      for (let i = 0; i < centers.length; i++) {
        const top = 80 + art.dryingLineY(centers[i], lw, lh, sag) + 10;
        await c.slot('image', `Print ${i + 1}`, { x: centers[i] - 210, y: top, width: 420, height: 540, rotation: tilts[i] }, (w, h) => art.still(w, h, 300 + i), i === 4 ? { crop: { focusX: 0.62, focusY: 0.5, zoom: 1 } } : {}, `print-${i + 1}`);
      }
      c.text('Title', { x: 2 * W + 90, y: 1090, width: 900, height: 160 }, 'still drying', { fontSize: 120, align: 'right', color: '#EDEBE6' });
      c.text('Note', { x: 90, y: 1180, width: 800, height: 60 }, 'DEV 7:30  ·  STOP 0:30  ·  FIX 5:00', { fontFamily: MONO, fontSize: 26, color: '#8C8981' });
      return c.done();
    },
  },
  {
    id: 'issue-01',
    family: 'editorial',
    name: 'Issue 01',
    idea: 'A masthead too big for one page.',
    pages: 3,
    async build(o) {
      const c = new Composer('Issue 01', 3, '#EDEBE6', o?.artScale);
      const ink = '#141414';
      for (let i = 0; i < 3; i++)
        c.text(`Folio ${i + 1}`, { x: i * W + 70, y: 60, width: W - 140, height: 40 }, `ISSUE 01  —  NOV 2026  —  ${String(i + 1).padStart(2, '0')}`, { fontFamily: MONO, fontSize: 22, color: ink });
      c.text('Masthead', { x: 50, y: 110, width: 2200, height: 460 }, 'Field Days', { fontSize: 430, color: ink, lineHeight: 1 });
      c.shape('Rule', { x: 70, y: 560, width: 2 * W - 140, height: 6 }, '#E2462C');
      await c.slot('image', 'Lead photo', { x: 70, y: 620, width: 760, height: 660 }, (w, h) => art.botanical(w, h, 21), {}, 'issue-lead');
      await c.slot('image', 'Across the fold', { x: 870, y: 760, width: 520, height: 420, rotation: -2 }, (w, h) => art.still(w, h, 41), {}, 'issue-detail');
      await c.slot('image', 'Tall photo', { x: W + 400, y: 620, width: 610, height: 660 }, (w, h) => art.roofline(w, h, 12), {}, 'issue-tall');
      await c.slot('image', 'Closing photo', { x: 2 * W + 420, y: 0, width: 660, height: H }, (w, h) => art.dunes(w, h, 19), { crop: { focusX: 0.78, focusY: 0.5, zoom: 1 } }, 'issue-closing');
      c.text('Pull quote', { x: 2 * W + 60, y: 300, width: 340, height: 600 }, '“We went\nfor the light\nand stayed\nfor the\nnoise.”', { fontSize: 66, color: ink, lineHeight: 1.04 });
      c.text('Byline', { x: 2 * W + 60, y: 1180, width: 340, height: 60 }, 'words & photos — you', { fontFamily: MONO, fontSize: 20, color: '#5A554C' });
      return c.done();
    },
  },
  {
    id: 'field-notes',
    family: 'editorial',
    name: 'Field notes',
    idea: 'Taped polaroids and a torn page, wandering across the seams.',
    pages: 3,
    async build(o) {
      const c = new Composer('Field notes', 3, '#CFC2A8', o?.artScale);
      await c.decor('Scrap', { x: 640, y: 150, width: 900, height: 560, rotation: -3 }, (s) => art.tornPaper(900 * s, 560 * s, '#F6F0E2', 8), 900, 560);
      c.text('Note', { x: 720, y: 230, width: 760, height: 380, rotation: -3 }, 'the blue house,\nagain. third summer.\nbring the good film.', {
        fontFamily: HAND,
        fontSize: 70,
        color: '#2A2724',
        lineHeight: 1.2,
      });
      const polas = [
        { x: 90, y: 560, width: 520, height: 620, rotation: -6 },
        { x: 1380, y: 640, width: 520, height: 620, rotation: 5 },
        { x: 2000, y: 180, width: 520, height: 620, rotation: -4 },
        { x: 2560, y: 700, width: 480, height: 580, rotation: 7 },
      ];
      for (let i = 0; i < polas.length; i++) {
        const p = polas[i];
        c.shape(`Polaroid ${i + 1}`, p, '#F4F1EA');
        await c.slot('image', `Photo ${i + 1}`, attach(p, 26, 26, p.width - 52, p.width - 52), (w, h) => (i % 2 ? art.still(w, h, 500 + i) : art.botanical(w, h, 600 + i)), i === 2 ? { crop: { focusX: 0.08, focusY: 0.5, zoom: 1 } } : {}, `polaroid-${i + 1}`);
        await c.decor(`Tape ${i + 1}`, attach(p, p.width / 2 - 110, -34, 220, 70), (s) => art.tape(220 * s, 70 * s, 70 + i), 220, 70);
      }
      c.text('Date', { x: 90, y: 110, width: 600, height: 50 }, '07.08 — 21.08', { fontFamily: MONO, fontSize: 28, color: '#3B362E' });
      return c.done();
    },
  },
];

export function templateById(id: string): TemplateSpec | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
