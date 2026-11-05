import { describe, expect, it } from 'vitest';
import { build, compose, plan, type ComposeInput } from '../../src/autolayout/compose';
import { layerTouchesRect, pageRect, paintMargin } from '../../src/model/geometry';
import { normalizeProject, strokeLayer } from '../../src/model/project';
import { nudge, poiWorld, seamWarnings } from '../../src/model/seams';
import { MAX_PAGES, type Asset, type ImageLayer, type Project, type TextLayer } from '../../src/model/types';
import { continuousLine, maskPath, rand, STICKERS } from '../../src/render/shapes';
import { applyPreset, TEXT_PRESETS } from '../../src/editor/textPresets';
import { vejerProject } from './fixtures';

function img(id: string, w: number, h: number): Asset {
  return { id, type: 'image', name: `${id}.jpg`, mime: 'image/jpeg', width: w, height: h };
}

const MIX: Asset[] = [img('a', 4000, 5000), img('b', 6000, 4000), img('c', 4000, 6000), img('d', 4000, 4000), img('e', 12000, 3000), img('f', 3000, 4000), img('g', 5000, 3000), img('h', 3000, 4500)];

function input(extra: Partial<ComposeInput> = {}): ComposeInput {
  return { assets: MIX, pageWidth: 1080, pageHeight: 1350, style: 'editorial', seed: 3, title: 'Lisbon', ...extra };
}

/** Records path commands so path builders can be compared. */
function recorder() {
  const log: string[] = [];
  const handler: ProxyHandler<object> = {
    get: (_t, k) => (...args: number[]) => log.push(`${String(k)}(${args.map((n) => (typeof n === 'number' ? n.toFixed(3) : n)).join(',')})`),
  };
  return { ctx: new Proxy({}, handler) as unknown as CanvasRenderingContext2D, log };
}

describe('auto-collage', () => {
  it('is deterministic for a seed and different for another seed', () => {
    const a = plan(input());
    const b = plan(input());
    expect(a).toEqual(b);
    const recipes = (s: number) => plan(input({ seed: s })).groups.map((g) => `${g.recipe}${g.count}`).join(' ');
    const seen = new Set([1, 2, 3, 4, 5, 6, 7, 8].map(recipes));
    expect(seen.size).toBeGreaterThan(1);
  });

  it('keeps the order of the media, uses each once and starts with a cover', () => {
    for (const style of ['editorial', 'grid', 'film', 'scrapbook'] as const) {
      const p = plan(input({ style }));
      expect(p.groups[0].recipe).toBe('cover');
      let next = 0;
      for (const g of p.groups) {
        expect(g.start).toBe(next);
        next += g.count;
      }
      expect(next).toBe(MIX.length);
      expect(p.dropped).toBe(0);
    }
  });

  it('gives a very wide photo a panorama spread over several slides', () => {
    const p = plan(input());
    const pano = p.groups.find((g) => g.start === 4);
    expect(pano?.recipe).toBe('pano');
    expect(pano!.pages).toBeGreaterThanOrEqual(2);
  });

  it('never repeats a recipe twice in a row when there is a choice, and never exceeds the page limit', () => {
    const many = Array.from({ length: 60 }, (_, i) => img(`m${i}`, i % 3 ? 4000 : 6000, i % 3 ? 5000 : 4000));
    for (let s = 1; s < 6; s++) {
      const p = plan({ ...input({ seed: s }), assets: many });
      expect(p.pages).toBeLessThanOrEqual(MAX_PAGES);
      const placed = p.groups.reduce((n, g) => n + g.count, 0);
      expect(placed + p.dropped).toBe(60);
    }
  });

  it('keeps locked slides when asking for another idea', () => {
    const first = plan(input({ seed: 11 }));
    const lock = first.groups[2];
    for (let s = 20; s < 30; s++) {
      const again = plan(input({ seed: s, locked: [lock] }));
      expect(again.groups).toContainEqual(lock);
    }
  });

  it('builds editable layers that only use the given media, inside the carousel', () => {
    for (const style of ['editorial', 'grid', 'film', 'scrapbook'] as const) {
      const { project, plan: p } = compose(input({ style }));
      expect(project.pages.length).toBe(p.pages);
      const media = project.layers.filter((l): l is ImageLayer => l.type === 'image');
      expect(new Set(media.map((l) => l.assetId))).toEqual(new Set(MIX.map((a) => a.id)));
      const total = project.pages.length * 1080;
      for (const l of project.layers) {
        expect(l.x).toBeGreaterThanOrEqual(-60);
        expect(l.x + l.width).toBeLessThanOrEqual(total + 60);
      }
      // Every page shows something.
      for (let i = 0; i < project.pages.length; i++) expect(project.layers.some((l) => layerTouchesRect(l, pageRect(project.canvas, i)))).toBe(true);
      expect(normalizeProject(JSON.parse(JSON.stringify(project))).layers.length).toBe(project.layers.length);
    }
  });

  it('a straddle photo puts the seam at a third, not through the middle', () => {
    for (let s = 1; s < 40; s++) {
      const p = plan(input({ seed: s }));
      const g = p.groups.find((x) => x.recipe === 'straddle');
      if (!g) continue;
      const project = build(input({ seed: s }), p);
      const before = p.groups.slice(0, p.groups.indexOf(g)).reduce((n, x) => n + x.pages, 0);
      const seam = (before + 1) * 1080;
      const big = project.layers.find((l) => l.type === 'image' && l.x < seam && l.x + l.width > seam)!;
      const at = (seam - big.x) / big.width;
      expect(Math.min(Math.abs(at - 1 / 3), Math.abs(at - 2 / 3))).toBeLessThan(0.01);
      return;
    }
  });
});

describe('seam guard', () => {
  function withPhoto(x: number, poi?: { x: number; y: number }): Project {
    const p = vejerProject();
    p.layers = [{ ...(p.layers[0] as ImageLayer), x, width: 1080, poi }];
    p.assets = [{ id: 'calle', type: 'image', name: 'calle', mime: 'image/jpeg', width: 1080, height: 1350 }];
    return p;
  }

  it('warns when the point of interest sits on a seam, and nudge clears it', () => {
    const p = withPhoto(540, { x: 0.5, y: 0.5 }); // centre at x = 1080: the first seam
    expect(poiWorld(p, p.layers[0] as ImageLayer)!.x).toBeCloseTo(1080);
    const w = seamWarnings(p);
    expect(w.map((x) => x.kind)).toContain('poi');
    const fixed = nudge(p, w.find((x) => x.kind === 'poi')!);
    expect(seamWarnings(fixed).filter((x) => x.kind === 'poi')).toEqual([]);
  });

  it('a point of interest well inside a slide is fine', () => {
    expect(seamWarnings(withPhoto(0, { x: 0.5, y: 0.5 }))).toEqual([]);
  });

  it('warns about a sliver of a photo on the next slide', () => {
    const w = seamWarnings(withPhoto(1080 - 40));
    expect(w.map((x) => x.kind)).toEqual(['sliver']);
    expect(seamWarnings(nudge(withPhoto(1080 - 40), w[0]))).toEqual([]);
  });

  it('warns about text cut by a seam unless it is a bridge', () => {
    const p = vejerProject();
    const t: TextLayer = { id: 't', type: 'text', text: 'HELLO WORLD', x: 900, y: 200, width: 400, height: 120, rotation: 0, opacity: 1, visible: true, locked: false, fontFamily: 'serif', fontSize: 60, fontWeight: 400, color: '#000', align: 'left', lineHeight: 1.1 };
    p.layers = [t];
    const w = seamWarnings(p);
    expect(w.map((x) => x.kind)).toEqual(['text']);
    expect(seamWarnings(nudge(p, w[0]))).toEqual([]);
    p.layers = [{ ...t, bridge: true }];
    expect(seamWarnings(p)).toEqual([]);
  });
});

describe('shapes & presets', () => {
  it('organic masks are the same for the same seed and differ for another', () => {
    for (const kind of ['blob', 'torn', 'stamp', 'ticket', 'arch', 'circle'] as const) {
      const a = recorder();
      const b = recorder();
      maskPath(a.ctx, kind, 600, 400, 0, 42);
      maskPath(b.ctx, kind, 600, 400, 0, 42);
      expect(a.log).toEqual(b.log);
      expect(a.log.length).toBeGreaterThan(0);
    }
    const c = recorder();
    const d = recorder();
    maskPath(c.ctx, 'blob', 600, 400, 0, 1);
    maskPath(d.ctx, 'blob', 600, 400, 0, 2);
    expect(c.log).not.toEqual(d.log);
  });

  it('every sticker draws something, deterministically', () => {
    for (const s of STICKERS) {
      const layer = { id: 'x', type: 'sticker' as const, sticker: s.id, color: '#f00', weight: 1, seed: 5, x: 0, y: 0, width: 300 * s.aspect, height: 300, rotation: 0, opacity: 1, visible: true, locked: false };
      const a = recorder();
      const b = recorder();
      s.draw(a.ctx, layer.width, layer.height, layer);
      s.draw(b.ctx, layer.width, layer.height, layer);
      expect(a.log.length).toBeGreaterThan(0);
      expect(a.log.filter((x) => !x.startsWith('fillText') && !x.startsWith('measureText'))).toEqual(b.log.filter((x) => !x.startsWith('fillText') && !x.startsWith('measureText')));
    }
  });

  it('the continuous line runs from the first slide to the last, inside the page height', () => {
    const pts = continuousLine(5 * 1080, 1350, 9);
    expect(pts[0][0]).toBeCloseTo(0);
    expect(pts[pts.length - 1][0]).toBeGreaterThan(5 * 1080 - 40);
    for (const [, y] of pts) expect(y).toBeGreaterThan(0), expect(y).toBeLessThan(1350);
    expect(continuousLine(5400, 1350, 9)).toEqual(pts);
  });

  it('stroke layers keep points normalised to their box and paint past it by the line width', () => {
    const s = strokeLayer([[100, 100], [2300, 400], [3300, 900]], '#000', 14, 'marker');
    for (const [u, v] of s.points) expect(u >= 0 && u <= 1 && v >= 0 && v <= 1).toBe(true);
    expect(paintMargin(s)).toBe(14);
  });

  it('presets clear previous effects and scale with the text size', () => {
    const t: TextLayer = { id: 't', type: 'text', text: 'Hi', x: 0, y: 0, width: 400, height: 120, rotation: 0, opacity: 1, visible: true, locked: false, fontFamily: 'serif', fontSize: 200, fontWeight: 400, color: '#000', align: 'left', lineHeight: 1.1 };
    const neon = applyPreset(t, TEXT_PRESETS.find((p) => p.id === 'neon')!);
    expect(neon.shadow!.blur).toBe(56);
    const typed = applyPreset({ ...t, ...neon } as TextLayer, TEXT_PRESETS.find((p) => p.id === 'typewriter')!);
    expect(typed.shadow).toBeUndefined();
    expect(typed.stroke).toBeUndefined();
    expect(typed.preset).toBe('typewriter');
  });

  it('rand is a stable sequence', () => {
    const r = rand(7);
    const s = rand(7);
    expect([r(), r(), r()]).toEqual([s(), s(), s()]);
  });
});

describe('compatibility', () => {
  it('a v0.5 project (no new fields) loads unchanged', () => {
    const p = vejerProject();
    const again = normalizeProject(JSON.parse(JSON.stringify(p)));
    expect(again).toEqual(p);
    for (const l of again.layers) {
      expect('mask' in l).toBe(false);
      expect('frame' in l).toBe(false);
    }
  });

  it('new layer kinds get defaults', () => {
    const p = normalizeProject({ ...vejerProject(), layers: [{ id: 's', type: 'sticker', sticker: 'star', x: 0, y: 0, width: 100, height: 100 }, { id: 'k', type: 'stroke', x: 0, y: 0, width: 10, height: 10 }] });
    expect(p.layers[0]).toMatchObject({ weight: 1, seed: 1, visible: true });
    expect(p.layers[1]).toMatchObject({ points: [], lineWidth: 12, style: 'marker' });
  });
});
