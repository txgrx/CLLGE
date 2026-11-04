import { describe, expect, it } from 'vitest';
import { planPages } from '../../src/model/plan';
import { createProject, fillSlot, unfilledSlots } from '../../src/model/project';
import type { ImageAsset, ImageLayer, VideoAsset, VideoLayer } from '../../src/model/types';
import { buildPanoramaProject, sliceInfo, suggestSlides } from '../../src/panorama/split';

const pano: ImageAsset = { id: 'pano', type: 'image', name: 'pano.jpg', mime: 'image/jpeg', width: 3600, height: 1500 };
const crop = { focusX: 0.5, focusY: 0.5, zoom: 1 };

describe('panorama split', () => {
  it('suggests slides from the aspect ratio', () => {
    expect(suggestSlides(3600, 1500, 1080, 1350)).toBe(3);
    expect(suggestSlides(3600, 1500, 1080, 1080)).toBe(2);
    expect(suggestSlides(12000, 1000, 1080, 1350)).toBe(10);
    expect(suggestSlides(1000, 1500, 1080, 1350)).toBe(2);
  });

  it('places the photo once across all slides', () => {
    const p = buildPanoramaProject({ asset: pano, slides: 3, pageWidth: 1080, pageHeight: 1350, crop });
    expect(p.pages).toHaveLength(3);
    expect(p.layers[0]).toMatchObject({ x: 0, width: 3240, height: 1350, fit: 'cover' });
    expect(planPages(p).map((x) => x.kind)).toEqual(['image', 'image', 'image']);
  });

  it('cover and closing shift the panorama by one page', () => {
    const p = buildPanoramaProject({ asset: pano, slides: 3, pageWidth: 1080, pageHeight: 1350, crop, cover: { title: 'Coast' }, closing: { text: 'fin' } });
    expect(p.pages).toHaveLength(5);
    expect(p.layers[0]).toMatchObject({ x: 1080, width: 3240 });
    const plans = planPages(p);
    expect(plans[0].layers.some((l) => l.type === 'image')).toBe(false);
    expect(plans[4].layers.some((l) => l.type === 'image')).toBe(false);
  });

  it('slice info covers adjacent, non-overlapping source columns', () => {
    const s = sliceInfo(pano, 3, 1080, 1350, crop);
    for (let i = 1; i < s.length; i++) expect(s[i].source.x).toBeCloseTo(s[i - 1].source.x + s[i - 1].source.width, 6);
    // 3600×1500 into 3240×1350: scale 0.9, centred → 0..3600 source columns used in full.
    expect(s[0].source.x).toBeCloseTo(0, 6);
    expect(s[2].source.x + s[2].source.width).toBeCloseTo(3600, 6);
    expect(s[0].upscale).toBeCloseTo(0.9, 6);
  });
});

describe('slots', () => {
  const base = () => {
    const p = createProject();
    const sample: ImageAsset = { id: 'sample', type: 'image', name: 'art', mime: 'image/png', width: 800, height: 600 };
    const slot: ImageLayer = {
      id: 's1',
      type: 'image',
      assetId: 'sample',
      x: 900,
      y: 200,
      width: 400,
      height: 300,
      rotation: 8,
      opacity: 0.9,
      visible: true,
      locked: false,
      fit: 'cover',
      crop: { focusX: 0.2, focusY: 0.8, zoom: 1.5 },
      radius: 24,
      slot: 'video',
    };
    return { ...p, assets: [sample], layers: [slot] };
  };

  it('filling a photo slot keeps the frame, centres the crop and drops the sample', () => {
    const photo: ImageAsset = { id: 'mine', type: 'image', name: 'mine.jpg', mime: 'image/jpeg', width: 4000, height: 3000 };
    const p = fillSlot(base(), 's1', photo);
    const l = p.layers[0] as ImageLayer;
    expect(l).toMatchObject({ type: 'image', x: 900, y: 200, width: 400, height: 300, rotation: 8, opacity: 0.9, radius: 24, assetId: 'mine' });
    expect(l.crop).toEqual({ focusX: 0.5, focusY: 0.5, zoom: 1 });
    expect(l.slot).toBeUndefined();
    expect(p.assets.map((a) => a.id)).toEqual(['mine']);
    expect(unfilledSlots(p)).toHaveLength(0);
  });

  it('a clip turns the slot into a video layer across the seam (two MP4 pages)', () => {
    const clip: VideoAsset = { id: 'v', type: 'video', name: 'v.mp4', mime: 'video/mp4', width: 1280, height: 720, durationMs: 5000, hasAudio: true };
    const p = fillSlot(base(), 's1', clip);
    const l = p.layers[0] as VideoLayer;
    expect(l.type).toBe('video');
    expect(l.clip).toMatchObject({ inMs: 0, outMs: 5000, gain: 1 });
    expect(planPages(p).map((x) => x.kind)).toEqual(['video', 'video', 'image']);
  });
});
