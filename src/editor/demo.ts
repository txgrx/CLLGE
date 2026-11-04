import { addAsset, addLayer, createProject, layerForAsset, textLayer } from '../model/project';
import { newId } from '../model/ids';
import type { ImageAsset, Project } from '../model/types';

/**
 * A local demo for people without photos at hand: a generated panorama that spans
 * three pages (a horizon and a ruler that must line up across seams) plus a title.
 * Nothing is downloaded.
 */
export async function createDemoProject(): Promise<{ project: Project; blobs: Map<string, Blob> }> {
  const W = 3600;
  const H = 1500;
  const c = new OffscreenCanvas(W, H);
  const ctx = c.getContext('2d')!;
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#f6c9a8');
  sky.addColorStop(0.55, '#f9e3c9');
  sky.addColorStop(0.56, '#7aa6a1');
  sky.addColorStop(1, '#2f5d62');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#ffdf9e';
  ctx.beginPath();
  ctx.arc(W * 0.62, H * 0.42, 150, 0, Math.PI * 2);
  ctx.fill();
  // Hills: one continuous path across the whole panorama.
  ctx.fillStyle = '#e9b38f';
  ctx.beginPath();
  ctx.moveTo(0, H * 0.56);
  for (let x = 0; x <= W; x += 20) ctx.lineTo(x, H * 0.5 - Math.sin(x / 260) * 60 - Math.sin(x / 90) * 14);
  ctx.lineTo(W, H * 0.56);
  ctx.closePath();
  ctx.fill();
  // White-washed houses.
  for (let i = 0; i < 26; i++) {
    const x = 120 + i * 135 + ((i * 53) % 40);
    const h = 70 + ((i * 37) % 60);
    ctx.fillStyle = '#fbf7f0';
    ctx.fillRect(x, H * 0.5 - h, 90, h + 40);
    ctx.fillStyle = '#c96f53';
    ctx.fillRect(x - 6, H * 0.5 - h - 14, 102, 16);
  }
  // A diagonal and a ruler: easy to check seams by eye.
  ctx.strokeStyle = '#1d3b3f';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(0, H * 0.95);
  ctx.lineTo(W, H * 0.62);
  ctx.stroke();
  ctx.fillStyle = '#1d3b3f';
  ctx.font = '28px system-ui, sans-serif';
  for (let x = 0; x < W; x += 100) {
    ctx.fillRect(x, H - 60, 3, x % 500 === 0 ? 60 : 30);
    if (x % 500 === 0) ctx.fillText(String(x), x + 8, H - 30);
  }
  const blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.9 });

  let project = createProject({ title: 'Demo — a walk by the sea', pages: 3 });
  const asset: ImageAsset = { id: newId('a_'), type: 'image', name: 'panorama.jpg', mime: 'image/jpeg', width: W, height: H };
  project = addAsset(project, asset);
  project = addLayer(project, layerForAsset(project, asset, 0));
  const title = { ...textLayer(project, 0), text: 'A walk\nby the sea', y: 120, height: 260, color: '#1d3b3f', fontSize: 110 };
  project = addLayer(project, title);
  return { project, blobs: new Map([[asset.id, blob]]) };
}
