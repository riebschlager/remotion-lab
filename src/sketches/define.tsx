import React, {createContext, useContext, useMemo} from 'react';
import {AbsoluteFill} from 'remotion';
import {z} from 'zod';
import {BeatProvider} from '../beat/BeatContext';
import {divisionBeats, divisionFitsLoop, type Division} from '../beat/divisions';
import {getBeatState, getLoopDurationInFrames, getTotalBeats, isFrameExact, type TimingConfig} from '../beat/timing';
import {BeatDebug} from '../layers/BeatDebug';
import {debugSchema, timingSchema} from '../schema';
import {canvasSchema, customSizeSchema, resolveCanvas, type CanvasPreset} from './canvas';

/** Controls every sketch gets. A sketch's own schema may not reuse these names. */
export const sketchBaseSchema = timingSchema.extend({
  canvas: canvasSchema,
  /** Only read when canvas is "custom". */
  customSize: customSizeSchema.optional(),
  /** Omit the black backdrop, for alpha-capable exports and downstream compositing. */
  transparent: z.boolean(),
  /** Re-rolls every seeded choice in the sketch without touching its design. */
  variant: z.number().int().min(0).max(9999),
  debug: debugSchema,
});
export type SketchBaseProps = z.output<typeof sketchBaseSchema>;
const reserved = new Set(Object.keys(sketchBaseSchema.shape));

const baseDefaults: SketchBaseProps = {
  bpm: 120, bars: 4, beatsPerBar: 4, fps: 30, timingMode: 'visual',
  canvas: 'portrait', transparent: false, variant: 0, debug: {enabled: false},
};

type SketchState = {id: string; variant: number; seed: (channel: string) => string};
const SketchContext = createContext<SketchState | null>(null);

/** Stable identity for seeded randomness: `stepRandom(seed('scatter'), index)`. */
export const useSketch = () => {
  const sketch = useContext(SketchContext);
  if (!sketch) throw new Error('useSketch() must be used inside a sketch');
  return sketch;
};

/** Field-prefixed message when a division cannot repeat evenly in the loop. */
export const divisionIssues = (field: string, division: Division, timing: TimingConfig): string[] =>
  divisionFitsLoop(divisionBeats(division, timing.beatsPerBar), getTotalBeats(timing)) ? []
    : [`${field}: "${division}" must fit a whole number of times in ${timing.bars} bars (${getTotalBeats(timing)} beats)`];

export type Sketch = {
  id: string;
  title: string;
  description: string;
  schema: z.ZodObject;
  defaultProps: Record<string, unknown>;
  Loop: React.FC<Record<string, unknown>>;
  Seam: React.FC<Record<string, unknown>>;
  resolve: (input: unknown) => SketchBaseProps & Record<string, unknown>;
  metadata: (input: unknown) => {props: Record<string, unknown>; fps: number; durationInFrames: number; width: number; height: number};
  seamMetadata: (input: unknown) => {props: Record<string, unknown>; fps: number; durationInFrames: number; width: number; height: number};
};

/** Frames shown on either side of the loop point by a sketch's seam view. */
export const seamLead = (loopFrames: number, fps: number) => Math.min(Math.floor(loopFrames / 2), fps);

/**
 * One self-contained animation idea. The definition supplies its own params;
 * timing, canvas, validation, derived duration and a seam view come for free.
 * Components use `useBeat()`, `useCanvas()` and `useSketch()`, never the
 * frame clock, so the shared loop rules in README.md apply unchanged.
 */
export const defineSketch = <S extends z.ZodObject>(definition: {
  /** Kebab-case; must match the sketch's folder name. */
  id: string;
  title: string;
  description: string;
  schema: S;
  /** Complete values for the sketch's own params. */
  defaults: z.input<S>;
  timing?: Partial<Pick<SketchBaseProps, 'bpm' | 'bars' | 'beatsPerBar' | 'fps' | 'timingMode'>>;
  canvas?: CanvasPreset;
  Component: React.ComponentType<z.output<S>>;
  /** Extra musical checks; return field-prefixed messages. */
  validate?: (props: z.output<S>, timing: TimingConfig) => string[];
  /** Divisions the debug overlay should check against the loop. */
  debugDivisions?: (props: z.output<S>) => Division[];
}): Sketch => {
  if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(definition.id)) {
    throw new Error(`Sketch id "${definition.id}" must be kebab-case`);
  }
  const clashes = Object.keys(definition.schema.shape).filter((key) => reserved.has(key));
  if (clashes.length) {
    throw new Error(`Sketch "${definition.id}" redefines shared controls: ${clashes.join(', ')}`);
  }
  const schema = sketchBaseSchema.extend(definition.schema.shape).strict();
  const label = `Invalid sketch "${definition.id}"`;

  const resolve = (input: unknown) => {
    const result = schema.safeParse(input);
    if (!result.success) {
      throw new Error(`${label}: ${result.error.issues.map((issue) =>
        `${issue.path.join('.') || 'props'}: ${issue.message}`).join('; ')}`);
    }
    const props = result.data as SketchBaseProps & Record<string, unknown>;
    const errors: string[] = [];
    if (props.canvas === 'custom' && !props.customSize) {
      errors.push('customSize: required when canvas is "custom", e.g. {"width":1280,"height":720}');
    }
    if (props.timingMode === 'exact' && !isFrameExact(props)) {
      const {effectiveBpm} = getBeatState(0, props);
      errors.push(`timingMode: exact requires a whole-frame loop. At ${props.fps} fps this would render at ${effectiveBpm.toFixed(6)} BPM instead of ${props.bpm}`);
    }
    errors.push(...(definition.validate?.(props as z.output<S>, props) ?? []));
    if (errors.length) throw new Error(`${label}: ${errors.join('; ')}`);
    return props;
  };

  const metadata = (input: unknown) => {
    const props = resolve(input);
    return {props, fps: props.fps, durationInFrames: getLoopDurationInFrames(props),
      ...resolveCanvas(props.canvas, props.customSize)};
  };

  const Shell: React.FC<{props: Record<string, unknown>; seam: boolean}> = ({props: raw, seam}) => {
    const props = raw as SketchBaseProps & z.output<S>;
    const {id} = definition;
    const state = useMemo(() => ({id, variant: props.variant,
      seed: (channel: string) => JSON.stringify([id, props.variant, channel])}), [id, props.variant]);
    const loop = getLoopDurationInFrames(props);
    return (
      <BeatProvider bpm={props.bpm} bars={props.bars} beatsPerBar={props.beatsPerBar} fps={props.fps}
        frameOffset={seam ? loop - seamLead(loop, props.fps) : 0}>
        <SketchContext.Provider value={state}>
          <AbsoluteFill style={props.transparent ? undefined : {backgroundColor: 'black'}}>
            <definition.Component {...props} />
            {props.debug.enabled ? <BeatDebug divisions={definition.debugDivisions?.(props) ?? []} /> : null}
          </AbsoluteFill>
        </SketchContext.Provider>
      </BeatProvider>
    );
  };

  return {
    id: definition.id,
    title: definition.title,
    description: definition.description,
    schema,
    // Parsed once so a sketch with incomplete or invalid defaults fails on import.
    defaultProps: resolve({...baseDefaults, ...definition.timing,
      canvas: definition.canvas ?? baseDefaults.canvas, ...definition.defaults}),
    Loop: (props) => <Shell props={props} seam={false} />,
    Seam: (props) => <Shell props={props} seam />,
    resolve,
    metadata,
    seamMetadata: (input) => {
      const result = metadata(input);
      return {...result, durationInFrames: 2 * seamLead(result.durationInFrames, result.fps) || 1};
    },
  };
};
