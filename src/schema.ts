/** Registry-derived controls and configuration types for Remotion Studio. */
import {z} from 'zod';
import {layerNames, layerOrderSchema, layerShape} from './layers/registry';

// Preserve existing imports while layer authoring now lives in each module.
export {baseLayerSchema, blendModeSchema, divisionSchema} from './layers/base';
export type {BaseLayerProps} from './layers/base';
export {backgroundSchema} from './layers/Background';
export {ringsSchema} from './layers/Rings';

export const timingSchema = z.object({
  bpm: z.number().min(40).max(220).step(0.5),
  bars: z.number().int().min(1).max(32),
  beatsPerBar: z.number().int().min(1).max(8),
  fps: z.number().int().min(24).max(60),
  timingMode: z.enum(['visual', 'exact']),
});
export const debugSchema = z.object({enabled: z.boolean()});
export const loopSchema = timingSchema.extend({
  timingMode: timingSchema.shape.timingMode.default('visual'),
  ...layerShape,
  layerOrder: layerOrderSchema.default(() => [...layerNames]),
  debug: debugSchema,
});

export type LoopProps = z.output<typeof loopSchema>;
export type LoopInput = z.input<typeof loopSchema>;

/** Fresh defaults: presets and newly registered layers share one starting point. */
export const createLoopDefaults = (): LoopProps => loopSchema.parse({
  bpm: 120, bars: 4, beatsPerBar: 4, fps: 30, timingMode: 'visual',
  debug: {enabled: false},
});
