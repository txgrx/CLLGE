import { getFirstEncodableAudioCodec, getFirstEncodableVideoCodec, type AudioCodec, type VideoCodec } from 'mediabunny';
import { AUDIO_SAMPLE_RATE } from '../export/videoPage';

/**
 * What this device can do, recorded separately (guide §9 "Compatibility"):
 * read clips, encode video, encode audio, hand files to the share sheet.
 */
export interface Capabilities {
  webCodecs: boolean;
  videoCodec: VideoCodec | null;
  audioCodec: AudioCodec | null;
  /** True when the audio codec is AAC, the safest choice for social apps. */
  aac: boolean;
  shareFiles: boolean;
  notes: string[];
}

const cache = new Map<string, Promise<Capabilities>>();

export function probeCapabilities(width: number, height: number): Promise<Capabilities> {
  const key = `${width}x${height}`;
  let p = cache.get(key);
  if (!p) {
    p = runProbe(width, height);
    cache.set(key, p);
  }
  return p;
}

async function runProbe(width: number, height: number): Promise<Capabilities> {
  const notes: string[] = [];
  const webCodecs = typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';
  let videoCodec: VideoCodec | null = null;
  let audioCodec: AudioCodec | null = null;
  if (webCodecs) {
    // H.264 only: it is what Instagram and phone galleries accept everywhere.
    videoCodec = await getFirstEncodableVideoCodec(['avc'], { width, height, frameRate: 30 }).catch(() => null);
    if (typeof AudioEncoder !== 'undefined') {
      audioCodec = await getFirstEncodableAudioCodec(['aac', 'opus'], { numberOfChannels: 2, sampleRate: AUDIO_SAMPLE_RATE }).catch(() => null);
    }
  }
  if (!webCodecs) notes.push('This browser has no WebCodecs, so it cannot create MP4 files. Photos still export. Try Chrome, Edge or Safari 17+.');
  else if (!videoCodec) notes.push(`This browser cannot encode H.264 at ${width}×${height}. Photos still export; save the project and export video on another device.`);
  if (videoCodec && !audioCodec) notes.push('Audio cannot be encoded here. Videos can be exported silently if you agree.');
  if (audioCodec === 'opus') notes.push('AAC audio is not available in this browser; audio will be Opus inside MP4. Some apps may not accept it — check the preview before posting.');
  let shareFiles = false;
  try {
    const f = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'probe.jpg', { type: 'image/jpeg' });
    shareFiles = typeof navigator !== 'undefined' && !!navigator.canShare && navigator.canShare({ files: [f] });
  } catch {
    shareFiles = false;
  }
  return { webCodecs, videoCodec, audioCodec, aac: audioCodec === 'aac', shareFiles, notes };
}
