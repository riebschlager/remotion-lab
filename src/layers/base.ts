import {z} from 'zod';
import {beatPatternSchema} from '../beat/patterns';

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
  /** Optional rhythmic strengths and swing. null clears an inherited pattern. */
  pattern: beatPatternSchema.nullable().optional(),
});

export type BaseLayerProps = z.infer<typeof baseLayerSchema>;

