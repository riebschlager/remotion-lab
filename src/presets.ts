import {z} from 'zod';
import {layerInstancesSchema, layerNames, layerOrderSchema, layerOverrideShape} from './layers/registry';
import {createLoopDefaults, debugSchema, timingSchema} from './schema';
import {validateLoopProps} from './validation';
import {beatPatterns} from './beat/patterns';

/** Explicit two-level overrides: merge individual layer parameters, replace
 * arrays wholesale, reject misspellings instead of silently ignoring them.
 */
export const loopOverridesSchema = timingSchema.partial().extend({
  ...layerOverrideShape,
  layerOrder: layerOrderSchema.optional(),
  layers: layerInstancesSchema.optional(),
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
  'prism-stack': {
    title: 'Prism Stack',
    description: 'Three independent pink, cyan and gold ring layers on different beat divisions.',
    overrides: {
      background: {colorA: '#05091c', colorB: '#261049', pulseAmount: 0.25, offsetBeats: 0.5},
      layers: [
        {id: 'backdrop', type: 'background'},
        {id: 'slow-rings', type: 'rings', props: {
          color: '#ff6ca8', accentColor: '#ffbbdb', division: '1/2', offsetBeats: 0.5,
          blendMode: 'screen', opacity: 0.65, lifeSteps: 4, thickness: 12, maxRadius: 1100, drift: 100,
        }},
        {id: 'offbeat-rings', type: 'rings', props: {
          color: '#58e6ff', accentColor: '#a2f3ff', division: '1/4', offsetBeats: -0.5,
          blendMode: 'plus-lighter', opacity: 0.4, lifeSteps: 3, thickness: 10, maxRadius: 900, drift: 70,
        }},
        {id: 'fast-rings', type: 'rings', props: {
          color: '#ffcf69', accentColor: '#fff1b8', division: '1/8', offsetBeats: 0.25,
          blendMode: 'screen', opacity: 0.5, lifeSteps: 3, thickness: 6, maxRadius: 600, drift: 140,
        }},
      ],
    },
  },
  'swing-session': {
    title: 'Swing Session',
    description: 'Soft shuffled cyan hits and accented amber backbeats, with rests and wrapped tails.',
    overrides: {
      background: {colorA: '#070b1e', colorB: '#35234f', division: '1/4', offsetBeats: 0.5,
        pattern: {steps: [1, 0, 0.4, 0]}, pulseAmount: 0.4},
      layers: [
        {id: 'backdrop', type: 'background'},
        {id: 'shuffle', type: 'rings', props: {color: '#61d8ff', accentColor: '#b5efff',
          division: '1/8', offsetBeats: 0.25, pattern: beatPatterns.shuffle,
          lifeSteps: 5, thickness: 10, opacity: 0.7, blendMode: 'screen'}},
        {id: 'backbeat', type: 'rings', props: {color: '#ffa967', accentColor: '#ffdb99',
          division: '1/4', offsetBeats: 0.5, pattern: {...beatPatterns.backbeat, swing: 0.2},
          lifeSteps: 3, maxRadius: 700, thickness: 18, opacity: 0.7, blendMode: 'plus-lighter'}},
      ],
    },
  },
  'modulation-orbit': {
    title: 'Modulation Orbit',
    description: 'Pattern-driven scale, LFO rotation, mixed colors and looping noise displacement.',
    overrides: {
      background: {colorA: '#060b1b', colorB: '#261334', offsetBeats: 0.5, modulation: {
        color: {signal: [{type: 'noise', channel: 'palette', radius: 0.7, weight: 0.4},
          {type: 'lfo', cycles: 1, phaseOffset: 0.25, weight: 0.6}], range: ['#160d36', '#255b70']},
      }},
      layers: [
        {id: 'backdrop', type: 'background'},
        {id: 'breathing-rings', type: 'rings', props: {
          division: '1/8', offsetBeats: 0.25, pattern: beatPatterns.shuffle,
          color: '#50caff', accentColor: '#ed80d9', opacity: 0.75, drift: 0, modulation: {
            scale: {signal: {type: 'beat'}, range: [0.94, 1.1]},
            rotation: {signal: {type: 'lfo', cycles: 1}, range: [-18, 18]},
            color: {signal: [{type: 'beat', weight: 0.25},
              {type: 'lfo', cycles: 2, phaseOffset: 0.25, weight: 0.75}], range: ['#50caff', '#ed80d9']},
            displacement: {
              x: {signal: {type: 'noise', channel: 'position-x', radius: 0.8}, range: [-80, 80]},
              y: {signal: {type: 'noise', channel: 'position-y', radius: 0.8}, range: [-100, 100]},
            },
          },
        }},
        {id: 'orbit-rings', type: 'rings', props: {
          division: '1/2', offsetBeats: 0.5, color: '#ffb66c', accentColor: '#ffe4ac',
          thickness: 8, opacity: 0.5, blendMode: 'plus-lighter', drift: 0, modulation: {
            scale: {signal: {type: 'lfo', cycles: 2, phaseOffset: 0.25}, range: [0.85, 1.1]},
            rotation: {signal: {type: 'noise', channel: 'turn', radius: 0.6}, range: [-12, 12]},
            displacement: {
              x: {signal: {type: 'lfo', cycles: 1, phaseOffset: 0.25}, range: [-90, 90]},
              y: {signal: {type: 'lfo', cycles: 1}, range: [-60, 60]},
            },
          },
        }},
      ],
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
