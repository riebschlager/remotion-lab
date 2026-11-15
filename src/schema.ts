/**
 * The composition's props. Remotion Studio turns this schema into a live
 * parameter panel — think TouchDesigner custom parameters.
 */
import {z} from 'zod';
import {zColor} from '@remotion/zod-types';

export const divisionSchema = z.enum(['1/16', '1/8', '1/4', '1/2', '1 bar', '2 bars', '4 bars']);

export const blendModeSchema = z.enum([
  'normal',
  'screen',
  'plus-lighter',
  'multiply',
  'overlay',
  'difference',
  'lighten',
]);

/** Every layer gets these. */
export const baseLayerSchema = z.object({
  enabled: z.boolean(),
  opacity: z.number().min(0).max(1).step(0.01),
  blendMode: blendModeSchema,
  /** How often the layer "hits" */
  division: divisionSchema,
  /** Shift the layer's grid in beats (0.5 = offbeat) */
  offsetBeats: z.number().min(-4).max(4).step(0.25),
});

export type BaseLayerProps = z.infer<typeof baseLayerSchema>;

export const backgroundSchema = baseLayerSchema.extend({
  colorA: zColor(),
  colorB: zColor(),
  /** How far the pulse pushes from A toward B */
  pulseAmount: z.number().min(0).max(1).step(0.01),
  /** Gradient rotations per loop (whole numbers only) */
  rotationsPerLoop: z.number().int().min(0).max(8),
});

export const ringsSchema = baseLayerSchema.extend({
  color: zColor(),
  accentColor: zColor(),
  /** Every Nth ring uses the accent color (0 = never) */
  accentEvery: z.number().int().min(0).max(16),
  /** How long each ring lives, in steps */
  lifeSteps: z.number().int().min(1).max(16),
  maxRadius: z.number().min(100).max(1400).step(10),
  thickness: z.number().min(1).max(80).step(1),
  /** How far the center wanders, in px (loopable noise) */
  drift: z.number().min(0).max(300).step(1),
});

export const debugSchema = z.object({
  enabled: z.boolean(),
});

export const loopSchema = z.object({
  bpm: z.number().min(40).max(220).step(0.5),
  bars: z.number().int().min(1).max(32),
  beatsPerBar: z.number().int().min(1).max(8),
  fps: z.number().int().min(24).max(60),
  background: backgroundSchema,
  rings: ringsSchema,
  debug: debugSchema,
});

export type LoopProps = z.infer<typeof loopSchema>;

export const defaultLoopProps: LoopProps = {
  bpm: 120,
  bars: 4,
  beatsPerBar: 4,
  fps: 30,
  background: {
    enabled: true,
    opacity: 1,
    blendMode: 'normal',
    division: '1/4',
    offsetBeats: 0,
    colorA: '#0b0b1a',
    colorB: '#3a1d6e',
    pulseAmount: 0.6,
    rotationsPerLoop: 1,
  },
  rings: {
    enabled: true,
    opacity: 1,
    blendMode: 'screen',
    division: '1/4',
    offsetBeats: 0,
    color: '#7fe7ff',
    accentColor: '#ff4fa3',
    accentEvery: 4,
    lifeSteps: 3,
    maxRadius: 900,
    thickness: 14,
    drift: 80,
  },
  debug: {
    enabled: true,
  },
};
