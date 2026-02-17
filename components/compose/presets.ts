import type { ComposeAspectRatio, ComposePresetId } from '@/types';

export const ASPECT_RATIO_DIMENSIONS: Record<ComposeAspectRatio, { width: number; height: number }> = {
  '9:16': { width: 1080, height: 1920 },
  '16:9': { width: 1920, height: 1080 },
  '1:1':  { width: 1080, height: 1080 },
  '4:5':  { width: 1080, height: 1350 },
};

type SlotPosition = { x: number; y: number; width: number; height: number };

export const PRESETS: Record<ComposePresetId, {
  label: string;
  description: string;
  slots: number;
  getPositions: () => SlotPosition[];
}> = {
  '2up-vertical': {
    label: '2-Up Vertical',
    description: 'Top / bottom split',
    slots: 2,
    getPositions: () => [
      { x: 0, y: 0, width: 1, height: 0.5 },
      { x: 0, y: 0.5, width: 1, height: 0.5 },
    ],
  },
  'side-by-side': {
    label: 'Side by Side',
    description: 'Left / right split',
    slots: 2,
    getPositions: () => [
      { x: 0, y: 0, width: 0.5, height: 1 },
      { x: 0.5, y: 0, width: 0.5, height: 1 },
    ],
  },
  'pip': {
    label: 'Picture in Picture',
    description: 'Large bg + small corner overlay',
    slots: 2,
    getPositions: () => [
      { x: 0, y: 0, width: 1, height: 1 },
      { x: 0.75, y: 0.75, width: 0.2, height: 0.2 },
    ],
  },
  'grid-2x2': {
    label: '2x2 Grid',
    description: '4 equal quadrants',
    slots: 4,
    getPositions: () => [
      { x: 0, y: 0, width: 0.5, height: 0.5 },
      { x: 0.5, y: 0, width: 0.5, height: 0.5 },
      { x: 0, y: 0.5, width: 0.5, height: 0.5 },
      { x: 0.5, y: 0.5, width: 0.5, height: 0.5 },
    ],
  },
  '3-panel': {
    label: '3-Panel',
    description: '1 large left + 2 stacked right',
    slots: 3,
    getPositions: () => [
      { x: 0, y: 0, width: 0.6, height: 1 },
      { x: 0.6, y: 0, width: 0.4, height: 0.5 },
      { x: 0.6, y: 0.5, width: 0.4, height: 0.5 },
    ],
  },
  'free-canvas': {
    label: 'Free Canvas',
    description: 'Place layers freely',
    slots: 0,
    getPositions: () => [],
  },
};
