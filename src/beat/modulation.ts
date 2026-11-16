import {z} from 'zod';
import {zColor} from '@remotion/zod-types';
import {interpolateColors} from 'remotion';
import {divisionBeats, divisionFitsLoop, divisionSchema, type Division} from './divisions';
import {lfo, loopNoise, pulse, step} from './envelopes';
import {beatPatternSchema, patternIssues, patternPulse, type BeatPattern} from './patterns';
import {getTotalBeats, type BeatState, type TimingConfig} from './timing';

const weight = z.number().min(0).optional();
export const modulationSourceSchema = z.discriminatedUnion('type', [
  z.object({type: z.literal('beat'), weight,
    division: divisionSchema.optional(), offsetBeats: z.number().optional(),
    pattern: beatPatternSchema.nullable().optional(),
    attack: z.number().min(0).optional(), decay: z.number().min(0).optional(),
    curve: z.number().positive().optional(),
  }).strict(),
  z.object({type: z.literal('lfo'), weight,
    cycles: z.number().int().min(0).optional(),
    shape: z.enum(['sine', 'triangle', 'saw', 'square']).optional(),
    phaseOffset: z.number().optional(),
  }).strict(),
  z.object({type: z.literal('noise'), weight,
    channel: z.string().min(1).optional(), radius: z.number().min(0).optional(),
    z: z.number().optional(),
  }).strict(),
]);
export type ModulationSource = z.infer<typeof modulationSourceSchema>;
export const modulationSignalSchema = z.union([modulationSourceSchema, z.array(modulationSourceSchema).min(1)]);
export type ModulationSignal = z.infer<typeof modulationSignalSchema>;

export const numberModulationSchema = z.object({
  signal: modulationSignalSchema, range: z.tuple([z.number(), z.number()]),
}).strict();
export const colorModulationSchema = z.object({
  signal: modulationSignalSchema, range: z.tuple([zColor(), zColor()]),
}).strict();
export const displacementModulationSchema = z.object({
  x: numberModulationSchema.optional(), y: numberModulationSchema.optional(),
}).strict();
export const modulationSchema = z.object({
  scale: numberModulationSchema.extend({range: z.tuple([z.number().min(0), z.number().min(0)])}).optional(),
  rotation: numberModulationSchema.optional(),
  color: colorModulationSchema.optional(),
  displacement: displacementModulationSchema.optional(),
}).strict();
export type NumberModulation = z.infer<typeof numberModulationSchema>;
export type ColorModulation = z.infer<typeof colorModulationSchema>;
export type DisplacementModulation = z.infer<typeof displacementModulationSchema>;
export type Modulation = z.infer<typeof modulationSchema>;

export type LayerRhythm = {division: Division; offsetBeats: number; pattern?: BeatPattern | null};
export type ModulationContext = LayerRhythm & {
  time: BeatState;
  /** Instance-namespaced seed channel, normally from useLayerInstance(). */
  seed: (channel: string) => string;
};

const clamp01 = (value: number) => {
  if (!Number.isFinite(value)) throw new Error('Modulation values must be finite');
  return Math.max(0, Math.min(1, value));
};
const sourcesOf = (signal: ModulationSignal): ModulationSource[] => Array.isArray(signal) ? signal : [signal];

const rhythmFor = (source: Extract<ModulationSource, {type: 'beat'}>, layer: LayerRhythm) => ({
  division: source.division ?? layer.division,
  offsetBeats: source.offsetBeats ?? layer.offsetBeats,
  pattern: source.pattern === undefined ? layer.pattern : source.pattern,
});

/** Reusable beat/pattern envelope, including the layer's inherited rhythm. */
export const beatSignal = (context: ModulationContext,
  source: Omit<Extract<ModulationSource, {type: 'beat'}>, 'type' | 'weight'> = {}) => {
  const rhythm = rhythmFor({type: 'beat', ...source}, context);
  const stepBeats = divisionBeats(rhythm.division, context.time.beatsPerBar);
  const options = {attack: source.attack, decay: source.decay, curve: source.curve};
  return rhythm.pattern
    ? patternPulse(context.time.beat, stepBeats, context.time.totalBeats, rhythm.pattern, rhythm.offsetBeats, options)
    : pulse(step(context.time.beat, stepBeats, context.time.totalBeats, rhythm.offsetBeats).phase, options);
};

const sampleSource = (source: ModulationSource, context: ModulationContext): number => {
  switch (source.type) {
    case 'beat': return clamp01(beatSignal(context, source));
    case 'lfo': return clamp01((lfo(context.time.loopPhase, source.cycles ?? 1,
      source.shape ?? 'sine', source.phaseOffset ?? 0) + 1) / 2);
    case 'noise': return clamp01((loopNoise(context.seed(`modulation:${source.channel ?? 'noise'}`),
      context.time.loopPhase, source.radius ?? 1, source.z ?? 0) + 1) / 2);
  }
};

/** All sources are normalized to 0..1. Lists form a weighted mean rather than
 * an unbounded sum. All-zero weights yield zero; inactive sources are skipped.
 */
export const sampleSignal = (signal: ModulationSignal, context: ModulationContext): number => {
  const sources = sourcesOf(signal);
  let largestWeight = 0;
  for (const source of sources) {
    const value = source.weight ?? 1;
    if (!Number.isFinite(value) || value < 0) throw new Error('Modulation weights must be finite and nonnegative');
    largestWeight = Math.max(largestWeight, value);
  }
  if (largestWeight === 0) return 0;
  let weighted = 0;
  let totalWeight = 0;
  for (const source of sources) {
    const normalizedWeight = (source.weight ?? 1) / largestWeight;
    if (normalizedWeight === 0) continue;
    weighted += sampleSource(source, context) * normalizedWeight;
    totalWeight += normalizedWeight;
  }
  return clamp01(weighted / totalWeight);
};

/** Clamp the signal, allow reversed output ranges, and interpolate without
 * overflowing the difference between large but finite endpoints.
 */
export const mapRange = (value: number, range: readonly [number, number]): number => {
  if (!range.every(Number.isFinite)) throw new Error('Modulation range endpoints must be finite');
  const t = clamp01(value);
  return (1 - t) * range[0] + t * range[1];
};
export const mapColor = (value: number, range: readonly [string, string]) =>
  interpolateColors(clamp01(value), [0, 1], [...range]);
export const modulateNumber = (mapping: NumberModulation, context: ModulationContext) =>
  mapRange(sampleSignal(mapping.signal, context), mapping.range);
export const modulateColor = (mapping: ColorModulation, context: ModulationContext) =>
  mapColor(sampleSignal(mapping.signal, context), mapping.range);
export const modulateDisplacement = (mapping: DisplacementModulation | undefined, context: ModulationContext) => ({
  x: mapping?.x ? modulateNumber(mapping.x, context) : 0,
  y: mapping?.y ? modulateNumber(mapping.y, context) : 0,
});
export const resolveModulation = (modulation: Modulation | null | undefined, context: ModulationContext) => ({
  scale: modulation?.scale ? modulateNumber(modulation.scale, context) : 1,
  rotation: modulation?.rotation ? modulateNumber(modulation.rotation, context) : 0,
  color: modulation?.color ? modulateColor(modulation.color, context) : undefined,
  displacement: modulateDisplacement(modulation?.displacement, context),
});
export type ModulationState = ReturnType<typeof resolveModulation>;

/** Cross-field constraints are evaluated against each instance's resolved
 * rhythm. Weight zero skips musical checks, but schema validation still runs.
 */
export const modulationIssues = (modulation: Modulation | null | undefined,
  layer: LayerRhythm, timing: TimingConfig): string[] => {
  if (!modulation) return [];
  const errors: string[] = [];
  const total = getTotalBeats(timing);
  const mappings: Array<[string, NumberModulation | ColorModulation | undefined]> = [
    ['scale', modulation.scale], ['rotation', modulation.rotation], ['color', modulation.color],
    ['displacement.x', modulation.displacement?.x], ['displacement.y', modulation.displacement?.y],
  ];
  for (const [target, mapping] of mappings) {
    if (!mapping) continue;
    sourcesOf(mapping.signal).forEach((source, index) => {
      if (source.type !== 'beat' || source.weight === 0) return;
      const rhythm = rhythmFor(source, layer);
      const path = `modulation.${target}.signal${Array.isArray(mapping.signal) ? `.${index}` : ''}`;
      const length = divisionBeats(rhythm.division, timing.beatsPerBar);
      if (!divisionFitsLoop(length, total)) errors.push(`${path}.division: "${rhythm.division}" must fit a whole number of times in ${total} beats`);
      if (rhythm.pattern) errors.push(...patternIssues(rhythm.pattern, length, total).map((issue) => `${path}.${issue}`));
    });
  }
  return errors;
};
