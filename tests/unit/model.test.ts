import { describe, expect, it } from 'vitest';
import { fitMedia, layerBounds, layerTouchesRect, pageRect } from '../../src/model/geometry';
import { beginGesture, emptyHistory, endGesture, record, redo, undo } from '../../src/model/history';
import { planPages, summarizePlan } from '../../src/model/plan';
import {
  addPageAtEnd,
  createProject,
  duplicateLayer,
  layerForAsset,
  parseProject,
  removeLastPage,
  removeLayers,
  reorderLayer,
  serializeProject,
} from '../../src/model/project';
import { clipEndMs, frameCount, sourceTimeMs } from '../../src/model/timing';
import type { Project, VideoLayer } from '../../src/model/types';
import { vejerProject } from './fixtures';

const clip = (o: Partial<VideoLayer['clip']> = {}): VideoLayer['clip'] => ({ inMs: 0, outMs: 3000, startMs: 0, gain: 1, endMode: 'hold', ...o });

function withVideo(p: Project, id: string, x: number, width: number, c = clip(), order = 0, hasAudio = true): Project {
  const assetId = 'a_' + id;
  return {
    ...p,
    assets: [...p.assets, { id: assetId, type: 'video', name: id, mime: 'video/mp4', width: 1280, height: 720, durationMs: 10000, hasAudio }],
    layers: [
      ...p.layers,
      {
        id,
        type: 'video',
        assetId,
        x,
        y: 100,
        width,
        height: 300,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
        fit: 'cover',
        crop: { focusX: 0.5, focusY: 0.5, zoom: 1 },
        radius: 0,
        clip: c,
        audioOrder: order,
      },
    ],
  };
}

describe('document', () => {
  it('serialize → parse returns identical layers, timings and crops', () => {
    const p = vejerProject();
    const again = parseProject(serializeProject(p));
    expect(again).toEqual(p);
  });

  it('applies defaults to the hand-written guide example', () => {
    const p = vejerProject();
    const clipLayer = p.layers[1] as VideoLayer;
    expect(clipLayer.rotation).toBe(0);
    expect(clipLayer.opacity).toBe(1);
    expect(clipLayer.visible).toBe(true);
    expect(clipLayer.crop).toEqual({ focusX: 0.5, focusY: 0.5, zoom: 1 });
  });

  it('rejects unknown schema versions', () => {
    expect(() => parseProject('{"schemaVersion":2}')).toThrow(/schema/);
  });

  it('pages: add at end, remove last, limits 1..20', () => {
    let p = createProject({ pages: 19 });
    p = addPageAtEnd(p);
    expect(p.pages).toHaveLength(20);
    expect(addPageAtEnd(p).pages).toHaveLength(20);
    let q = createProject({ pages: 1 });
    q = removeLastPage(q);
    expect(q.pages).toHaveLength(1);
  });

  it('removing a layer drops its unused asset and resets a page audio choice', () => {
    let p = withVideo(createProject(), 'v', 100, 300);
    p = { ...p, pages: p.pages.map((pg, i) => (i === 0 ? { ...pg, audioLayerId: 'v' } : pg)) };
    p = removeLayers(p, ['v']);
    expect(p.assets).toHaveLength(0);
    expect(p.pages[0].audioLayerId).toBeUndefined();
  });

  it('duplicate and reorder keep back-to-front order', () => {
    let p = withVideo(withVideo(createProject(), 'a', 0, 100), 'b', 0, 100, clip(), 1);
    const d = duplicateLayer(p, 'a');
    p = d.project;
    expect(p.layers.map((l) => l.id)).toEqual(['a', d.newId, 'b']);
    p = reorderLayer(p, 'a', 'top');
    expect(p.layers.at(-1)!.id).toBe('a');
    expect((p.layers.find((l) => l.id === d.newId) as VideoLayer).audioOrder).toBe(2);
  });

  it('a panorama spans pages; a portrait photo fills one', () => {
    const p = createProject({ pages: 3 });
    const pano = layerForAsset(p, { id: 'x', type: 'image', name: 'x', mime: '', width: 3600, height: 1500 }, 0);
    expect(pano.width).toBe(3240);
    const photo = layerForAsset(p, { id: 'y', type: 'image', name: 'y', mime: '', width: 3000, height: 4000 }, 1);
    expect(photo).toMatchObject({ x: 1080, width: 1080, height: 1350 });
  });
});

describe('geometry', () => {
  it('pages are half-open column ranges', () => {
    const c = { pageWidth: 1080, pageHeight: 1350, background: '#fff' };
    expect(pageRect(c, 1)).toEqual({ x: 1080, y: 0, width: 1080, height: 1350 });
    const touching = { x: 360, y: 0, width: 720, height: 100, rotation: 0 }; // right edge exactly 1080
    expect(layerTouchesRect(touching, pageRect(c, 0))).toBe(true);
    expect(layerTouchesRect(touching, pageRect(c, 1))).toBe(false);
  });

  it('guide table: a photo from x=800 to 1599 gives 280 and 520 columns', () => {
    const c = { pageWidth: 1080, pageHeight: 1350, background: '#fff' };
    const photo = { x: 800, y: 0, width: 800, height: 1350, rotation: 0 };
    const cols = [0, 1, 2].map((i) => {
      const r = pageRect(c, i);
      return Math.max(0, Math.min(photo.x + photo.width, r.x + r.width) - Math.max(photo.x, r.x));
    });
    expect(cols).toEqual([280, 520, 0]);
  });

  it('rotated layer: bounding box reaches a page but real coverage may not', () => {
    const page = { x: 1080, y: 0, width: 1080, height: 1350 };
    // A thin bar rotated 45° whose AABB crosses x=1080 near the top-right corner only.
    const bar = { x: 700, y: 1200, width: 500, height: 20, rotation: -45 };
    expect(layerBounds(bar).x + layerBounds(bar).width).toBeGreaterThan(1080);
    expect(layerTouchesRect(bar, page)).toBe(true);
    const far = { x: 400, y: 1300, width: 600, height: 10, rotation: 45 };
    const b = layerBounds(far);
    expect(b.x + b.width).toBeLessThan(1080);
    expect(layerTouchesRect(far, page)).toBe(false);
  });

  it('fit: guide example 4000×3000 into 600×600', () => {
    const crop = { focusX: 0.5, focusY: 0.5, zoom: 1 };
    expect(fitMedia(4000, 3000, 600, 600, 'cover', crop)).toEqual({ x: -100, y: 0, width: 800, height: 600 });
    expect(fitMedia(4000, 3000, 600, 600, 'contain', crop)).toEqual({ x: 0, y: 75, width: 600, height: 450 });
  });
});

describe('timing', () => {
  it('samples tSource = in + (t − start), holds the last frame before out', () => {
    const c = clip({ inMs: 1000, outMs: 7000, startMs: 500 });
    expect(sourceTimeMs(c, 0)).toBeNull();
    expect(sourceTimeMs(c, 500)).toBe(1000);
    expect(sourceTimeMs(c, 2500)).toBe(3000);
    const hold = sourceTimeMs(c, 9000)!;
    expect(hold).toBeLessThan(7000);
    expect(hold).toBeGreaterThan(6990);
    expect(clipEndMs(c)).toBe(6500);
  });

  it('6 s at 30 fps is 180 frames', () => {
    expect(frameCount(6000)).toBe(180);
  });
});

describe('page plan', () => {
  it('Vejer → JPG, MP4 (6 s, audio), JPG', () => {
    const plans = planPages(vejerProject());
    expect(plans.map((p) => p.kind)).toEqual(['image', 'video', 'image']);
    expect(plans[1].durationMs).toBe(6000);
    expect(plans[1].audioLayer?.id).toBe('clip');
    expect(plans.map((p) => p.baseName)).toEqual(['01', '02', '03']);
    expect(summarizePlan(plans)).toBe('2 photos and 1 video (1 with audio)');
  });

  it('a clip ending exactly at x = 1080 does not turn page 2 into video', () => {
    const p = withVideo(createProject(), 'v', 360, 720);
    expect(planPages(p).map((x) => x.kind)).toEqual(['video', 'image', 'image']);
  });

  it('a clip crossing a seam makes two videos with the same clock', () => {
    const p = withVideo(createProject(), 'v', 800, 600, clip({ outMs: 4000 }));
    const plans = planPages(p);
    expect(plans.map((x) => x.kind)).toEqual(['video', 'video', 'image']);
    expect(plans[0].durationMs).toBe(4000);
    expect(plans[1].durationMs).toBe(4000);
  });

  it('two clips of 3 s and 6 s: page lasts 6 s, first audible by insertion order', () => {
    let p = withVideo(createProject(), 'late', 100, 300, clip({ outMs: 6000 }), 1);
    p = withVideo(p, 'early', 500, 300, clip({ outMs: 3000 }), 0);
    const plan = planPages(p)[0];
    expect(plan.durationMs).toBe(6000);
    expect(plan.audioLayer?.id).toBe('early');
  });

  it('silent page, muted clip and hidden layer', () => {
    let p = withVideo(createProject(), 'v', 100, 300);
    p = { ...p, pages: p.pages.map((pg, i) => (i === 0 ? { ...pg, audioLayerId: null } : pg)) };
    expect(planPages(p)[0]).toMatchObject({ kind: 'video', audioLayer: null });
    const mutedAsset = withVideo(createProject(), 'm', 100, 300, clip(), 0, false);
    expect(planPages(mutedAsset)[0].audioLayer).toBeNull();
    const hidden = { ...p, layers: p.layers.map((l) => ({ ...l, visible: false })) };
    expect(planPages(hidden)[0].kind).toBe('image');
  });

  it('an explicitly chosen audio track can make an otherwise still page a video', () => {
    let p = withVideo(createProject(), 'v', 100, 300, clip({ outMs: 5000 }));
    p = { ...p, pages: p.pages.map((pg, i) => (i === 2 ? { ...pg, audioLayerId: 'v' } : pg)) };
    const plan = planPages(p)[2];
    expect(plan.kind).toBe('video');
    expect(plan.durationMs).toBe(5000);
  });
});

describe('history', () => {
  it('a drag gesture is one undo step', () => {
    let h = emptyHistory<number>();
    h = record(h, 0); // 0 → 1
    h = beginGesture(h, 1);
    h = endGesture(h, 5); // 1 → 5 via many transient updates
    const u1 = undo(h, 5)!;
    expect(u1.value).toBe(1);
    const u2 = undo(u1.history, 1)!;
    expect(u2.value).toBe(0);
    const r = redo(u2.history, 0)!;
    expect(r.value).toBe(1);
  });

  it('a gesture that changes nothing is not recorded', () => {
    let h = emptyHistory<number>();
    h = beginGesture(h, 3);
    h = endGesture(h, 3);
    expect(h.past).toHaveLength(0);
  });
});
