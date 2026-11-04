import { ALL_FORMATS, BlobSource, Input } from 'mediabunny';
import { newId } from '../model/ids';
import type { Asset, ImageAsset, VideoAsset } from '../model/types';

export interface ImportedMedia {
  asset: Asset;
  blob: Blob;
  /** Non-fatal notes shown next to the file (e.g. "audio track cannot be decoded"). */
  warnings: string[];
}

export interface ImportFailure {
  name: string;
  reason: string;
}

export function isVideoFile(file: File): boolean {
  return file.type.startsWith('video/') || /\.(mp4|mov|m4v|webm|mkv)$/i.test(file.name);
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|avif|heic|heif|bmp)$/i.test(file.name);
}

/** Import files one by one; a failing file is reported and the rest continue. */
export async function importFiles(files: File[]): Promise<{ ok: ImportedMedia[]; failed: ImportFailure[] }> {
  const ok: ImportedMedia[] = [];
  const failed: ImportFailure[] = [];
  for (const file of files) {
    try {
      if (isVideoFile(file)) ok.push(await importVideo(file));
      else if (isImageFile(file)) ok.push(await importImage(file));
      else failed.push({ name: file.name, reason: 'Not an image or video file' });
    } catch (e) {
      failed.push({ name: file.name, reason: e instanceof Error ? e.message : String(e) });
    }
  }
  return { ok, failed };
}

export async function importImage(file: Blob & { name?: string }): Promise<ImportedMedia> {
  let bitmap: ImageBitmap;
  try {
    // EXIF orientation is applied, so width/height are what the user sees.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    const heic = /\.hei[cf]$/i.test(file.name ?? '') || /hei[cf]/.test(file.type);
    throw new Error(heic ? 'This browser cannot read HEIC photos. Export them as JPEG first.' : 'This browser cannot decode this image');
  }
  const asset: ImageAsset = {
    id: newId('a_'),
    type: 'image',
    name: file.name ?? 'image',
    mime: file.type || 'image/*',
    width: bitmap.width,
    height: bitmap.height,
  };
  bitmap.close();
  return { asset, blob: file, warnings: [] };
}

export async function importVideo(file: Blob & { name?: string }): Promise<ImportedMedia> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const video = await input.getPrimaryVideoTrack();
    if (!video) throw new Error('The file has no video track');
    if (!(await video.canDecode())) {
      throw new Error(`This browser cannot decode ${video.codec ?? 'this'} video. Try another browser or convert it to H.264.`);
    }
    const warnings: string[] = [];
    const audio = await input.getPrimaryAudioTrack();
    let hasAudio = false;
    if (audio) {
      if (await audio.canDecode()) hasAudio = true;
      else warnings.push(`The ${audio.codec ?? 'audio'} track cannot be decoded here; the clip will be silent.`);
    }
    const durationMs = Math.round((await input.computeDuration()) * 1000);
    if (durationMs <= 0) throw new Error('Could not read the video duration');
    const asset: VideoAsset = {
      id: newId('a_'),
      type: 'video',
      name: file.name ?? 'video',
      mime: file.type || 'video/*',
      width: video.displayWidth,
      height: video.displayHeight,
      durationMs,
      hasAudio,
    };
    return { asset, blob: file, warnings };
  } finally {
    input.dispose();
  }
}
