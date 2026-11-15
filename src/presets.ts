import {z} from 'zod';
import {layerNames, layerOrderSchema, layerOverrideShape} from './layers/registry';
import {createLoopDefaults, debugSchema, timingSchema} from './schema';
import {validateLoopProps} from './validation';

/** Explicit two-level overrides: merge individual layer parameters, replace
 * arrays wholesale, reject misspellings instead of silently ignoring them.
 */
export const loopOverridesSchema = timingSchema.partial().extend({
  ...layerOverrideShape,
  layerOrder: layerOrderSchema.optional(),
  debug: debugSchema.partial().strict().optional(),
}).strict();
export type LoopOverrides = z.input<typeof loopOverridesSchema>;

type PresetDefinition = {title: string; description: string; overrides: LoopOverrides};
export const loopPresets = {
  'neon-orbit': {
    title: 'Neon Orbit',
    description: 'Cyan rings and pink accents over a pulsing violet gradient. The original lab look.',
    overrides: {},
  },
  'amber-echo': {
    title: 'Amber Echo',
    description: 'Warm gold and coral echoes at 100 BPM, with slower rings on the offbeat.',
    overrides: {
      bpm: 100,
      background: {colorA: '#170b05', colorB: '#8c3217', pulseAmount: 0.4},
      rings: {color: '#ffc76b', accentColor: '#ff7657', division: '1/2', offsetBeats: 0.5,
        lifeSteps: 5, maxRadius: 1100, thickness: 10, drift: 120},
    },
  },
  'midnight-drift': {
    title: 'Midnight Drift',
    description: 'A quiet blue gradient turning slowly at 90 BPM, with rings disabled.',
    overrides: {
      bpm: 90, bars: 8,
      background: {colorA: '#030816', colorB: '#164f72', pulseAmount: 0},
      rings: {enabled: false},
    },
  },
} satisfies Record<string, PresetDefinition>;

export type PresetName = keyof typeof loopPresets;
export const presetNames = Object.keys(loopPresets) as [PresetName, ...PresetName[]];
export const presetSchema = z.object({
  preset: z.enum(presetNames),
  overrides: loopOverridesSchema.default({}),
});
export type PresetInput = z.input<typeof presetSchema>;

export const resolvePreset = (input: unknown) => {
  const parsed = presetSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`Invalid preset configuration: ${parsed.error.issues.map((issue) =>
      `${issue.path.join('.')}: ${issue.message}`).join('; ')}`);
  }
  const {preset, overrides} = parsed.data;
  const base = createLoopDefaults();
  const saved: LoopOverrides = loopPresets[preset].overrides;
  const layers = Object.fromEntries(layerNames.map((name) => [name,
    {...base[name], ...saved[name], ...overrides[name]},
  ]));
  return validateLoopProps({...base, ...saved, ...overrides, ...layers,
    debug: {...base.debug, ...saved.debug, ...overrides.debug}});
};
