import {useVideoConfig} from 'remotion';
import {z} from 'zod';

/** Named output sizes. Sketches lay out in relative units so each one works on all of them. */
export const canvasPresets = {
  portrait: {width: 1080, height: 1920},
  'portrait-4x5': {width: 1080, height: 1350},
  square: {width: 1080, height: 1080},
  landscape: {width: 1920, height: 1080},
} as const;

export type CanvasPreset = keyof typeof canvasPresets;
export const canvasNames = ['portrait', 'portrait-4x5', 'square', 'landscape', 'custom'] as const satisfies readonly (CanvasPreset | 'custom')[];
export const canvasSchema = z.enum(canvasNames);

// H.264 needs even dimensions; keep custom sizes exportable by default.
const side = z.number().int().min(16).max(4096).refine((value) => value % 2 === 0, 'Use an even number of pixels');
export const customSizeSchema = z.object({width: side, height: side}).strict();

export const resolveCanvas = (canvas: CanvasPreset | 'custom', customSize?: {width: number; height: number}) => {
  if (canvas !== 'custom') return {...canvasPresets[canvas]};
  if (!customSize) throw new Error('customSize: required when canvas is "custom", e.g. {"width":1280,"height":720}');
  return {...customSize};
};

/**
 * Resolution-independent layout. Size things in `vmin` (1% of the shorter
 * side) or as fractions of width/height rather than literal pixels.
 */
export const useCanvas = () => {
  const {width, height} = useVideoConfig();
  const vmin = Math.min(width, height) / 100;
  const vmax = Math.max(width, height) / 100;
  return {width, height, vmin, vmax, cx: width / 2, cy: height / 2, aspect: width / height};
};
