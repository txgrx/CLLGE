import { useEffect, useState } from 'react';
import { create } from 'zustand';
import type { SeamWarning } from '../model/seams';
import type { StrokeLayer } from '../model/types';

/** Panels that can open in the side panel (desktop) or the bottom sheet (mobile). */
export type Tray = 'add' | 'edit' | 'slides' | 'stickers' | 'text' | 'draw' | 'bridge';

export interface Pen {
  style: StrokeLayer['style'];
  color: string;
  width: number;
}

interface UiState {
  /** "draw": drags on the stage draw a line instead of moving layers. */
  tool: 'select' | 'draw';
  pen: Pen;
  tray: Tray | null;
  /** Seam the bridge sheet is about (1 … pages − 1). */
  seam: number;
  warnings: SeamWarning[];
  /** Warnings the user chose to ignore (by key). */
  ignored: string[];
  phone: boolean;
  /** Slide currently centred in the stage. */
  page: number;
  /** Crop mode: drags move the media inside its frame; double-tap marks the point of interest. */
  crop: boolean;
  set(patch: Partial<Omit<UiState, 'set'>>): void;
}

export const useUi = create<UiState>((set) => ({
  tool: 'select',
  pen: { style: 'marker', color: '#FF3B2F', width: 14 },
  tray: null,
  seam: 1,
  warnings: [],
  ignored: [],
  phone: true,
  page: 0,
  crop: false,
  set: (patch) => set(patch),
}));

export const MOBILE_QUERY = '(max-width: 760px)';

export function isMobile(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches;
}

export function useMobile(): boolean {
  const [m, setM] = useState(isMobile);
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return m;
}

export function isCoarse(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
}

/** Space around the strip in the stage (less on phones, where every pixel counts). */
export function stagePad(): number {
  return isMobile() ? 14 : 48;
}
