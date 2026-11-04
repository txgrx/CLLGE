import { normalizeProject } from '../../src/model/project';
import type { Project } from '../../src/model/types';

/** The "Vejer" document from the product guide (§8): photo – video – photo. */
export function vejerProject(): Project {
  return normalizeProject({
    schemaVersion: 1,
    id: 'vejer',
    revision: 7,
    title: 'Un paseo por Vejer',
    canvas: { pageWidth: 1080, pageHeight: 1350, background: '#F5F1E8' },
    pages: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }],
    assets: [
      { id: 'calle', type: 'image', path: 'media/calle.jpg', width: 3600, height: 1500 },
      { id: 'plaza', type: 'video', path: 'media/plaza.mp4', width: 1280, height: 720, durationMs: 8000, hasAudio: true },
    ],
    layers: [
      { id: 'fondo', type: 'image', assetId: 'calle', x: 0, y: 0, width: 3240, height: 1350, fit: 'cover' },
      {
        id: 'clip',
        type: 'video',
        assetId: 'plaza',
        x: 1250,
        y: 430,
        width: 720,
        height: 405,
        fit: 'cover',
        clip: { inMs: 1000, outMs: 7000, startMs: 0, gain: 1, endMode: 'hold' },
      },
    ],
  });
}
