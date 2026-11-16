/**
 * Export planning: options, profiles, output names and the tempo sidecar.
 * Pure, with no renderer imports, so the default test suite covers it.
 */
import path from 'node:path';
import {parseArgs} from 'node:util';
import {getLoopDurationInFrames, getTotalBeats, type TimingConfig} from '../../src/beat/timing';
import {resolvePreset} from '../../src/presets';
import {canvasPresets, customSizeSchema, type CanvasPreset} from '../../src/sketches/canvas';

/**
 * What each profile asks of Remotion. The alpha settings follow the checked-in
 * remotion-render skill (transparent-videos.md): PNG frames in both cases,
 * ProRes 4444 in yuva444p10le for editors, VP9 in yuva420p for browsers.
 */
export const exportProfiles = {
  social: {
    codec: 'h264', extension: 'mp4', pixelFormat: 'yuv420p', imageFormat: 'jpeg', jpegQuality: 95,
    crf: 18, proResProfile: null, alpha: false, ffprobePixelFormat: 'yuv420p',
    summary: 'H.264 MP4 for social posts; opaque',
  },
  prores: {
    codec: 'prores', extension: 'mov', pixelFormat: 'yuva444p10le', imageFormat: 'png', jpegQuality: null,
    crf: null, proResProfile: '4444', alpha: true,
    // ProRes 4444 has no 10-bit alpha variant on disk: decoders report 12 bits.
    ffprobePixelFormat: 'yuva444p12le',
    summary: 'ProRes 4444 MOV with alpha for editors and compositors; large',
  },
  webm: {
    codec: 'vp9', extension: 'webm', pixelFormat: 'yuva420p', imageFormat: 'png', jpegQuality: null,
    crf: 28, proResProfile: null, alpha: true,
    // WebM keeps alpha beside the picture (ALPHA_MODE=1). ffmpeg's own VP9 decoder ignores it;
    // only libvpx-vp9 and browsers decode yuva420p.
    ffprobePixelFormat: 'yuv420p',
    summary: 'VP9 WebM with alpha for Chrome and Firefox; small, slow to encode',
  },
} as const;
export type ProfileName = keyof typeof exportProfiles;
export const profileNames = Object.keys(exportProfiles) as ProfileName[];
/** Every profile is tagged and converted as BT.709, the standard for HD. */
export const exportColorSpace = 'bt709';
const profileAliases: Record<string, ProfileName[]> = {downstream: ['prores', 'webm'], all: profileNames};

export const exportUsage = `Usage: npm run export -- <composition-id> [options]
  --props=<json|file>     same props as npm run preview
  --profile=<list>        ${profileNames.join(', ')}, downstream (prores,webm) or all; default social
  --canvas=<list>         sketches only: ${Object.keys(canvasPresets).join(', ')}, <W>x<H> or all
  --repeat=<n>            play the loop n whole times in the file; default 1
  --tag=<text>            extra suffix for the file name, e.g. v2
  --out=<dir>             default out/export
  --test-render           mark the render as not production (verification renders)`;

export type CanvasSpec = {canvas: CanvasPreset} | {canvas: 'custom'; customSize?: {width: number; height: number}};
export type ExportOptions = {
  id: string;
  /** Inline JSON or a file path, as given. */
  props: string | undefined;
  profiles: ProfileName[];
  /** Null keeps whatever canvas the props or the composition choose. */
  canvases: CanvasSpec[] | null;
  repeat: number;
  tag: string | undefined;
  outDir: string;
  production: boolean;
};

const list = (value: string) => value.split(',').map((item) => item.trim()).filter(Boolean);
const unique = <T,>(items: T[]) => [...new Map(items.map((item) => [JSON.stringify(item), item])).values()];

export const parseProfiles = (value: string): ProfileName[] => {
  const names = list(value);
  if (!names.length) throw new Error('--profile: name at least one profile');
  return unique(names.flatMap((name) => {
    if (name in exportProfiles) return [name as ProfileName];
    if (name in profileAliases) return profileAliases[name];
    throw new Error(`--profile: unknown profile "${name}". Use ${profileNames.join(', ')}, downstream or all`);
  }));
};

export const parseCanvases = (value: string): CanvasSpec[] => {
  const names = list(value);
  if (!names.length) throw new Error('--canvas: name at least one canvas');
  return unique(names.flatMap((name): CanvasSpec[] => {
    if (name === 'all') return (Object.keys(canvasPresets) as CanvasPreset[]).map((canvas) => ({canvas}));
    if (name in canvasPresets) return [{canvas: name as CanvasPreset}];
    // The size comes from customSize in --props.
    if (name === 'custom') return [{canvas: 'custom'}];
    const size = /^(\d+)x(\d+)$/.exec(name);
    if (!size) {
      throw new Error(`--canvas: unknown canvas "${name}". Use ${Object.keys(canvasPresets).join(', ')}, <W>x<H> or all`);
    }
    const parsed = customSizeSchema.safeParse({width: Number(size[1]), height: Number(size[2])});
    if (!parsed.success) {
      throw new Error(`--canvas: "${name}": ${parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`);
    }
    return [{canvas: 'custom', customSize: parsed.data}];
  }));
};

export const parseExportArgs = (argv: string[]): ExportOptions => {
  const {values, positionals} = parseArgs({args: argv, allowPositionals: true, options: {
    props: {type: 'string'}, profile: {type: 'string'}, canvas: {type: 'string'}, repeat: {type: 'string'},
    tag: {type: 'string'}, out: {type: 'string'}, 'test-render': {type: 'boolean'},
  }});
  if (positionals.length !== 1) throw new Error('Name exactly one composition id');
  const [id] = positionals;
  if (/(-seam|SeamCheck)$/.test(id)) {
    throw new Error(`"${id}" is a seam view, not a loop. Export "${id.replace(/-seam$/, '').replace('SeamCheck', 'Loop').replace(/^Loop$/, 'BeatLoop')}" instead`);
  }
  const repeat = Number(values.repeat ?? 1);
  if (!Number.isInteger(repeat) || repeat < 1 || repeat > 1000) {
    throw new Error('--repeat: use a whole number of loops from 1 to 1000');
  }
  if (values.tag !== undefined && !/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(values.tag)) {
    throw new Error('--tag: use letters, digits and hyphens');
  }
  return {
    id, props: values.props?.trim() || undefined,
    profiles: parseProfiles(values.profile ?? 'social'),
    canvases: values.canvas === undefined ? null : parseCanvases(values.canvas),
    repeat, tag: values.tag, outDir: values.out ?? 'out/export',
    production: !values['test-render'],
  };
};

/**
 * Input props for one output. Alpha profiles turn on a sketch's `transparent`
 * prop unless the caller set it; the opaque profile refuses it, because H.264
 * would silently flatten the transparency to black.
 */
export const jobProps = ({id, isSketch, inputProps, profile, canvas}: {
  id: string; isSketch: boolean; inputProps: Record<string, unknown>; profile: ProfileName; canvas: CanvasSpec | null;
}): Record<string, unknown> => {
  if (!isSketch) {
    if (canvas) throw new Error(`--canvas: only sketches have a canvas; "${id}" renders at its registered size`);
    return inputProps;
  }
  const {alpha} = exportProfiles[profile];
  if (!alpha && inputProps.transparent === true) {
    throw new Error(`--profile: "${profile}" has no alpha channel, so transparent: true would flatten to black. `
      + 'Use prores or webm, or drop transparent');
  }
  return {...inputProps, ...canvas, ...(alpha && inputProps.transparent === undefined ? {transparent: true} : {})};
};

/** Musical settings of a composition's resolved props; preset compositions are resolved first. */
export const loopTiming = (id: string, props: Record<string, unknown>): TimingConfig => {
  const source = ('preset' in props ? resolvePreset(props) : props) as Record<string, unknown>;
  const timing = {bpm: source.bpm, bars: source.bars, beatsPerBar: source.beatsPerBar, fps: source.fps};
  for (const [key, value] of Object.entries(timing)) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      throw new Error(`"${id}" has no usable ${key} in its props, so its tempo is unknown; export a loop, sketch or preset composition`);
    }
  }
  return timing as TimingConfig;
};

/** Trailing zeros dropped: 120 → "120", 127.5 → "127.5". */
const formatBpm = (bpm: number) => String(Number(bpm.toFixed(3)));

/** `<id>_<canvas>_<bpm>bpm[_x<repeat>][_<tag>]`, with the requested tempo. */
export const exportStem = ({id, canvasName, bpm, repeat, tag}: {
  id: string; canvasName: string; bpm: number; repeat: number; tag?: string;
}) => [id, canvasName, `${formatBpm(bpm)}bpm`, ...(repeat > 1 ? [`x${repeat}`] : []), ...(tag ? [tag] : [])].join('_');

/** Video and sidecar paths: `<outDir>/<id>/<stem>.<ext>` and the same plus `.json`. */
export const exportPaths = (outDir: string, id: string, stem: string, profile: ProfileName) => {
  const video = path.join(outDir, id, `${stem}.${exportProfiles[profile].extension}`);
  return {video, sidecar: `${video}.json`};
};

export const sidecarVersion = 1;

/**
 * Everything a downstream tool needs to place the file on a beat grid.
 * Throws when the composition is not exactly one loop of its own tempo.
 */
export const buildSidecar = ({id, profile, inputProps, composition, repeat, tag, outDir = 'out/export'}: {
  id: string; profile: ProfileName;
  /** Props as passed to the composition, before its defaults were merged in. */
  inputProps: Record<string, unknown>;
  /** The selected composition: resolved props and derived size, rate and length. */
  composition: {props: Record<string, unknown>; fps: number; durationInFrames: number; width: number; height: number};
  repeat: number; tag?: string; outDir?: string;
}) => {
  const timing = loopTiming(id, composition.props);
  const loopFrames = getLoopDurationInFrames(timing);
  if (loopFrames !== composition.durationInFrames || timing.fps !== composition.fps) {
    throw new Error(`"${id}" renders ${composition.durationInFrames} frames at ${composition.fps} fps, but one loop of its tempo is `
      + `${loopFrames} frames at ${timing.fps} fps. Only whole loops can be exported`);
  }
  const {codec, extension, pixelFormat, ffprobePixelFormat, imageFormat, jpegQuality, crf, proResProfile, alpha} = exportProfiles[profile];
  const {canvas} = composition.props;
  const canvasName = typeof canvas === 'string' && canvas !== 'custom' ? canvas : `${composition.width}x${composition.height}`;
  const totalBeats = getTotalBeats(timing);
  const loopSeconds = loopFrames / timing.fps;
  const stem = exportStem({id, canvasName, bpm: timing.bpm, repeat, tag});
  const paths = exportPaths(outDir, id, stem, profile);
  const seconds = (value: number) => Number(value.toFixed(6));
  return {
    paths,
    sidecar: {
      sidecarVersion,
      file: path.basename(paths.video),
      compositionId: id,
      profile,
      inputProps,
      props: composition.props,
      requestedBpm: timing.bpm,
      /** Tempo of the rendered frames: the loop is rounded to whole frames. */
      effectiveBpm: Number(((totalBeats * 60) / loopSeconds).toFixed(6)),
      bars: timing.bars,
      beatsPerBar: timing.beatsPerBar,
      totalBeats,
      fps: timing.fps,
      repeat,
      loopFrameCount: loopFrames,
      loopDurationSeconds: seconds(loopSeconds),
      /** Whole file: loopFrameCount × repeat. */
      frameCount: loopFrames * repeat,
      durationSeconds: seconds(loopSeconds * repeat),
      canvas: {name: canvasName, width: composition.width, height: composition.height},
      codec, container: extension,
      /** What the encoder was given. */
      pixelFormat,
      /** What ffprobe's default decoder reports for the file; see README "Transparent formats". */
      ffprobePixelFormat,
      proResProfile, crf,
      colorSpace: exportColorSpace,
      frameImageFormat: imageFormat, jpegQuality,
      /** The file has an alpha channel. */
      alpha,
      /** A sketch's `transparent` prop was on. Whether pixels are transparent is measured: see alphaSample. */
      transparent: alpha && composition.props.transparent === true,
    },
  };
};
export type ExportSidecar = ReturnType<typeof buildSidecar>['sidecar'];
