import React, {createContext, useContext, useEffect, useMemo, useRef, useState} from 'react';
import {getStaticFiles} from '@remotion/studio';
import {AbsoluteFill, staticFile, useDelayRender} from 'remotion';
import {z} from 'zod';
import {clipPlaybackIssues, type ClipBinding} from '../assets/clipPlayback';
import {assetKey, missingAssets, missingAssetsHint, type AssetRef, type ClipRef, type FontRef} from '../assets';
import {cssFontFamily, loadCollectionFont} from '../assets/fonts';
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

type SketchState = {id: string; variant: number; seed: (channel: string) => string; assets: Set<string>};
const SketchContext = createContext<SketchState | null>(null);

/** Stable identity for seeded randomness: `stepRandom(seed('scatter'), index)`. */
export const useSketch = () => {
  const sketch = useContext(SketchContext);
  if (!sketch) throw new Error('useSketch() must be used inside a sketch');
  return sketch;
};

/**
 * The usable form of an asset the sketch declared in `defineSketch({assets})`:
 * a clip gains `src` for `<AnimatedImage>` or `<Video>`, a font gains the
 * `fontFamily` to put in a style. Declared assets are checked against the
 * public folder before rendering, and fonts are loaded before the component
 * mounts, so an undeclared asset is an error instead of a broken frame.
 */
export function useAsset(ref: ClipRef): ClipRef & {src: string};
export function useAsset(ref: FontRef): FontRef & {fontFamily: string};
export function useAsset(ref: AssetRef) {
  const sketch = useSketch();
  if (!sketch.assets.has(assetKey(ref))) {
    const what = ref.kind === 'clip' ? `clip "${ref.name}"` : `font "${ref.family}"`;
    throw new Error(`Sketch "${sketch.id}" uses ${what} from collection "${ref.collection}" without declaring it. `
      + 'List it in `assets` in defineSketch so it is checked and loaded before rendering.');
  }
  return ref.kind === 'clip' ? {...ref, src: staticFile(ref.publicPath)} : {...ref, fontFamily: cssFontFamily(ref)};
}

/** Paths in the public folder, when running in Studio or a render. Node callers check the disk instead. */
const publicFiles = () => {
  if (typeof document === 'undefined' || (window as {remotion_isPlayer?: boolean}).remotion_isPlayer) return null;
  return new Set(getStaticFiles().map((file) => file.name));
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
  /** Collection assets the sketch needs for these resolved props. */
  assets: (props: Record<string, unknown>) => AssetRef[];
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
  /**
   * Every collection asset the component reads with `useAsset()`, from
   * `clip()` and `font()`. Use the function form when a param chooses one.
   */
  assets?: AssetRef[] | ((props: z.output<S>) => AssetRef[]);
  /** Declarative playback bindings: validated before rendering in both metadata paths. */
  clips?: (props: z.output<S>) => ClipBinding[];
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
  const declared = (props: Record<string, unknown>) => (typeof definition.assets === 'function'
    ? definition.assets(props as z.output<S>) : definition.assets ?? []);

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
    try {
      declared(props);
    } catch (error) {
      errors.push(`assets: ${(error as Error).message}`);
    }
    for (const binding of definition.clips?.(props as z.output<S>) ?? []) {
      errors.push(...clipPlaybackIssues(binding.clip, binding.playback, props, binding.field));
    }
    errors.push(...(definition.validate?.(props as z.output<S>, props) ?? []));
    if (errors.length) throw new Error(`${label}: ${errors.join('; ')}`);
    return props;
  };

  const metadata = (input: unknown) => {
    const props = resolve(input);
    // Fail here, before any frame renders, when a collection is not on this machine.
    const files = publicFiles();
    const missing = files ? missingAssets(declared(props), (file) => files.has(file)) : [];
    if (missing.length) throw new Error(`${label}: assets: ${missing.join('; ')}. ${missingAssetsHint}`);
    return {props, fps: props.fps, durationInFrames: getLoopDurationInFrames(props),
      ...resolveCanvas(props.canvas, props.customSize)};
  };

  const Shell: React.FC<{props: Record<string, unknown>; seam: boolean}> = ({props: raw, seam}) => {
    const props = raw as SketchBaseProps & z.output<S>;
    const {id} = definition;
    const refs = declared(props);
    const assetKeys = refs.map(assetKey).join('\n');
    const state = useMemo(() => ({id, variant: props.variant,
      seed: (channel: string) => JSON.stringify([id, props.variant, channel]),
      assets: new Set(assetKeys ? assetKeys.split('\n') : [])}), [id, props.variant, assetKeys]);
    const loop = getLoopDurationInFrames(props);

    // Fonts load once per page, not per frame. The component stays unmounted
    // and the render stays held until they are registered, so text is never
    // measured or drawn in a fallback face.
    const fonts = refs.filter((ref): ref is FontRef => ref.kind === 'font');
    const fontKey = fonts.map(assetKey).join('\n');
    const [loadedFonts, setLoadedFonts] = useState('');
    const fontsReady = loadedFonts === fontKey;
    const {delayRender, continueRender, cancelRender} = useDelayRender();
    const hold = useRef<number | null>(null);
    const release = () => {
      if (hold.current !== null) continueRender(hold.current);
      hold.current = null;
    };
    useEffect(() => {
      if (!fontKey) return undefined;
      let current = true;
      hold.current = delayRender(`Loading fonts for sketch "${id}"`);
      Promise.all(fonts.map(loadCollectionFont)).then(
        () => { if (current) setLoadedFonts(fontKey); },
        (error) => cancelRender(error),
      );
      return () => { current = false; release(); };
    }, [fontKey]);
    // Released only after the commit that mounted the component with its fonts.
    useEffect(() => { if (fontsReady) release(); }, [fontsReady]);
    return (
      <BeatProvider bpm={props.bpm} bars={props.bars} beatsPerBar={props.beatsPerBar} fps={props.fps}
        frameOffset={seam ? loop - seamLead(loop, props.fps) : 0}>
        <SketchContext.Provider value={state}>
          <AbsoluteFill style={props.transparent ? undefined : {backgroundColor: 'black'}}>
            {fontsReady ? <definition.Component {...props} /> : null}
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
    assets: (props) => declared(props),
    metadata,
    seamMetadata: (input) => {
      const result = metadata(input);
      return {...result, durationInFrames: 2 * seamLead(result.durationInFrames, result.fps) || 1};
    },
  };
};
