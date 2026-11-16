/**
 * Walk asset collections and describe them for agents that cannot watch a clip.
 *
 * Media lives in public/assets/<collection>/ and is not in git. For each
 * collection this writes collections/<collection>/manifest.json plus one
 * filmstrip image per clip, which are committed. Measurements come from
 * Remotion's bundled ffprobe/ffmpeg, so no system install is needed.
 */
import {existsSync} from 'node:fs';
import {mkdir, readdir, readFile, rm, stat, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {RenderInternals} from '@remotion/renderer';
import * as fontkit from 'fontkit';
import {PNG} from 'pngjs';
import {collectionNamePattern, collectionSchema, manifestVersion,
  type ClipEntry, type CollectionManifest, type FontEntry, type FontFace} from '../../src/assets/manifest';
// Nothing here may import collections/index.ts, directly or not: this is what repairs it when it is stale.
import {fill, stamp} from './pixels';

const clipFormats = new Set(['gif', 'mp4', 'm4v', 'mov', 'webm']);
const fontFormats = new Set(['ttf', 'otf', 'woff', 'woff2']);
/** Longest side of a filmstrip cell, and the size frames are compared at. */
const THUMB = 160;
const FILMSTRIP_FRAMES = 6;

/** Run Remotion's bundled ffmpeg or ffprobe. Paths must be absolute: it runs from its own folder. */
export const ff = (bin: 'ffmpeg' | 'ffprobe', args: string[], options: Record<string, unknown> = {}) =>
  RenderInternals.callFf({bin, args, indent: false, logLevel: 'error', binariesDirectory: null,
    cancelSignal: undefined, options: options as never});

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a));
const fraction = (value: string | undefined): [number, number] | null => {
  const [n, d] = (value ?? '').split('/').map(Number);
  return Number.isFinite(n) && Number.isFinite(d) && n > 0 && d > 0 ? [n, d] : null;
};
const round = (value: number, places: number) => Number(value.toFixed(places));

export type Timing = Pick<ClipEntry, 'fps' | 'fpsRational' | 'durationSeconds' | 'timing' | 'frameStarts'>;

/**
 * Decide whether a clip's frames are evenly spaced, from their exact
 * timestamps. `ticks` are presentation times in units of `timeBase` seconds.
 *
 * Evenly spaced frames give an exact rational frame rate. Containers that
 * store milliseconds (WebM) cannot hold 1/30 s exactly, so timestamps within
 * one tick of the nominal rate also count as constant. Anything else, such
 * as a GIF with per-frame delays, keeps every frame's start time.
 */
export const analyseTiming = (ticks: number[], lastDuration: number | null,
  timeBase: [number, number], nominalRate: [number, number] | null): Timing => {
  const [tbNum, tbDen] = timeBase;
  const seconds = (value: number) => (value * tbNum) / tbDen;
  const n = ticks.length;
  const constant = (num: number, den: number): Timing => {
    const divisor = gcd(num, den);
    const rational: [number, number] = [num / divisor, den / divisor];
    return {fps: round(rational[0] / rational[1], 6), fpsRational: rational,
      durationSeconds: round((n * rational[1]) / rational[0], 6), timing: 'constant'};
  };
  const deltas = ticks.slice(1).map((tick, i) => tick - ticks[i]);
  if (n === 1) {
    if (lastDuration && lastDuration > 0) return constant(tbDen, lastDuration * tbNum);
    return nominalRate ? constant(...nominalRate) : constant(1, 1);
  }
  if (deltas.some((delta) => !(delta > 0))) {
    throw new Error('frame timestamps are missing or do not increase');
  }
  if (deltas.every((delta) => delta === deltas[0]) && (!lastDuration || lastDuration === deltas[0])) {
    return constant(tbDen, deltas[0] * tbNum);
  }
  if (nominalRate) {
    const [num, den] = nominalRate;
    const tolerance = seconds(1) + 1e-9;
    const onGrid = ticks.every((tick, i) => Math.abs(seconds(tick - ticks[0]) - (i * den) / num) <= tolerance);
    // A final frame held longer than the rest (common in GIFs) changes the clip's length.
    const evenEnd = !lastDuration || Math.abs(seconds(lastDuration) - den / num) <= tolerance;
    if (onGrid && evenEnd) return constant(num, den);
  }
  const last = lastDuration && lastDuration > 0 ? lastDuration : deltas[deltas.length - 1];
  const durationSeconds = seconds(ticks[n - 1] - ticks[0] + last);
  return {fps: round(n / durationSeconds, 6), fpsRational: null, durationSeconds: round(durationSeconds, 6),
    timing: 'variable', frameStarts: ticks.map((tick) => round(seconds(tick - ticks[0]), 6))};
};

type Probe = {
  codec: string; width: number; height: number; hasAudio: boolean;
  /** The container says there is an alpha channel; pixels decide whether it is used. */
  declaresAlpha: boolean;
  /** Decoder that can read the alpha plane, when ffmpeg's default one cannot. */
  decoder: string | null;
  timing: Timing; frameCount: number;
};

const probeClip = async (file: string): Promise<Probe> => {
  const {stdout} = await ff('ffprobe', ['-v', 'error', '-show_entries',
    'stream=index,codec_type,codec_name,width,height,pix_fmt,r_frame_rate,avg_frame_rate,time_base:stream_tags=alpha_mode:stream_side_data=rotation',
    '-of', 'json', file]);
  type Stream = {codec_type: string; codec_name: string; width: number; height: number; pix_fmt?: string;
    r_frame_rate?: string; avg_frame_rate?: string; time_base?: string;
    tags?: Record<string, string>; side_data_list?: Array<{rotation?: number}>};
  const streams = (JSON.parse(stdout).streams ?? []) as Stream[];
  const video = streams.find((stream) => stream.codec_type === 'video');
  if (!video) throw new Error('no video stream');
  const timeBase = fraction(video.time_base);
  if (!timeBase) throw new Error('no time base');

  const frames = await ff('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'frame=best_effort_timestamp,duration', '-of', 'csv=p=0', file]);
  const rows = frames.stdout.split('\n').map((line) => line.trim()).filter(Boolean)
    .map((line) => line.split(',').map(Number));
  if (!rows.length) throw new Error('no decodable frames');
  const ticks = rows.map(([timestamp]) => timestamp);
  const lastDuration = rows[rows.length - 1][1];

  const alphaTag = Object.entries(video.tags ?? {}).some(([key, value]) => key.toLowerCase() === 'alpha_mode' && value === '1');
  const rotation = Math.abs(video.side_data_list?.find((data) => data.rotation !== undefined)?.rotation ?? 0);
  const sideways = rotation % 180 === 90;
  return {
    codec: video.codec_name,
    width: sideways ? video.height : video.width,
    height: sideways ? video.width : video.height,
    hasAudio: streams.some((stream) => stream.codec_type === 'audio'),
    declaresAlpha: alphaTag || /^(yuva|rgba|bgra|argb|abgr|gbrap|ya\d|pal8)/.test(video.pix_fmt ?? ''),
    // ffmpeg's own VP8/VP9 decoders drop the alpha plane that WebM stores on the side.
    decoder: alphaTag ? ({vp9: 'libvpx-vp9', vp8: 'libvpx'}[video.codec_name] ?? null) : null,
    timing: analyseTiming(ticks, Number.isFinite(lastDuration) ? lastDuration : null, timeBase,
      fraction(video.r_frame_rate) ?? fraction(video.avg_frame_rate)),
    frameCount: rows.length,
  };
};

/** Decode every frame at thumbnail size, calling back with RGBA pixels in presentation order. */
export const decodeFrames = (file: string, width: number, height: number, decoder: string | null,
  onFrame: (index: number, rgba: Buffer) => void) => new Promise<number>((resolve, reject) => {
  const task = ff('ffmpeg', ['-v', 'error', ...(decoder ? ['-c:v', decoder] : []), '-i', file, '-map', '0:v:0',
    '-vf', `scale=${width}:${height}:flags=area`, '-fps_mode', 'passthrough',
    '-f', 'image2pipe', '-c:v', 'rawvideo', '-pix_fmt', 'rgba', '-'], {buffer: false, encoding: null});
  const size = width * height * 4;
  let frame = Buffer.allocUnsafe(size);
  let filled = 0;
  let index = 0;
  let stderr = '';
  task.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
  task.stdout?.on('data', (chunk: Buffer) => {
    let offset = 0;
    while (offset < chunk.length) {
      const copied = chunk.copy(frame, filled, offset, Math.min(chunk.length, offset + size - filled));
      filled += copied;
      offset += copied;
      if (filled === size) {
        onFrame(index++, frame);
        frame = Buffer.allocUnsafe(size);
        filled = 0;
      }
    }
  });
  task.then(() => resolve(index), (error: Error) => reject(new Error(stderr.trim() || error.message)));
});

/** Mean absolute difference of premultiplied RGBA, 0..1. */
const frameDifference = (a: Buffer, b: Buffer) => {
  let sum = 0;
  for (let i = 0; i < a.length; i += 4) {
    const alphaA = a[i + 3] / 255;
    const alphaB = b[i + 3] / 255;
    sum += Math.abs(a[i] * alphaA - b[i] * alphaB) + Math.abs(a[i + 1] * alphaA - b[i + 1] * alphaB)
      + Math.abs(a[i + 2] * alphaA - b[i + 2] * alphaB) + Math.abs(a[i + 3] - b[i + 3]);
  }
  return sum / (a.length * 255);
};

/**
 * Whether a clip loops on its own: stepping from its last frame back to its
 * first is no bigger than an ordinary step inside it.
 *
 * `steps` are the changes between consecutive frames across the whole clip.
 * Their upper quartile stands for an ordinary step, because the frames next
 * to the loop point say little by themselves: animation drawn on twos or
 * threes and exported at a higher rate repeats frames, so the pair on either
 * side of the seam is often a hold with no motion at all.
 */
export const loopVerdict = (seamDifference: number, steps: number[]) => {
  const sorted = [...steps].sort((a, b) => a - b);
  const at = 0.75 * (sorted.length - 1);
  const neighborDifference = sorted.length
    ? sorted[Math.floor(at)] + (sorted[Math.ceil(at)] - sorted[Math.floor(at)]) * (at % 1) : 0;
  return {
    // The same allowance the sketch seam check uses: a loop point may move twice as much as ordinary motion.
    seamless: seamDifference <= Math.max(2 * neighborDifference, 0.01),
    seamDifference: round(seamDifference, 4),
    neighborDifference: round(neighborDifference, 4),
  };
};

/** Labelled frames side by side; transparency shows as a checkerboard. */
const filmstripImage = (cells: Array<{frame: number; rgba: Buffer}>, width: number, height: number) => {
  const gap = 4;
  const label = 14;
  const sheet = new PNG({width: gap + cells.length * (width + gap), height: gap + label + height + gap});
  fill(sheet, 0, 0, sheet.width, sheet.height, [38, 38, 44]);
  cells.forEach((cell, c) => {
    const x0 = gap + c * (width + gap);
    const y0 = gap + label;
    stamp(sheet, `F${cell.frame}`, x0, gap, 2);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const from = (y * width + x) * 4;
        const to = ((y0 + y) * sheet.width + x0 + x) * 4;
        const alpha = cell.rgba[from + 3] / 255;
        const ground = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 ? 150 : 105;
        for (let k = 0; k < 3; k++) sheet.data[to + k] = Math.round(cell.rgba[from + k] * alpha + ground * (1 - alpha));
      }
    }
  });
  return sheet;
};

const writeJpeg = async (image: PNG, output: string) => {
  await mkdir(path.dirname(output), {recursive: true});
  await ff('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-c:v', 'png', '-i', '-', '-frames:v', '1',
    '-update', '1', '-q:v', '4', '-pix_fmt', 'yuvj444p', output], {input: PNG.sync.write(image)});
};

/** Which source frames a filmstrip of a clip with `frameCount` frames shows. */
export const filmstripFrames = (frameCount: number) => {
  const cells = Math.min(FILMSTRIP_FRAMES, frameCount);
  return Array.from({length: cells}, (_, i) => (cells === 1 ? 0 : Math.round((i * (frameCount - 1)) / (cells - 1))));
};

type Notes = {description: string; tags: string[]};

const scanClip = async (file: string, name: string, filmstripDir: string, warn: (message: string) => void):
  Promise<Omit<ClipEntry, keyof Notes>> => {
  const probe = await probeClip(file);
  const scale = Math.min(1, THUMB / Math.max(probe.width, probe.height));
  const width = Math.max(2, Math.round(probe.width * scale));
  const height = Math.max(2, Math.round(probe.height * scale));

  const wanted = filmstripFrames(probe.frameCount);
  const kept = new Map<number, Buffer>();
  let first: Buffer | null = null;
  let last: Buffer | null = null;
  const steps: number[] = [];
  let transparent = false;
  const decoded = await decodeFrames(file, width, height, probe.decoder, (index, rgba) => {
    if (wanted.includes(index)) kept.set(index, rgba);
    if (last) steps.push(frameDifference(last, rgba));
    first ??= rgba;
    last = rgba;
    if (probe.declaresAlpha && !transparent) {
      // Area scaling blends edge pixels, so allow for rounding before calling a frame transparent.
      for (let i = 3; i < rgba.length; i += 4) if (rgba[i] < 250) { transparent = true; break; }
    }
  });
  if (decoded !== probe.frameCount) {
    throw new Error(`ffprobe counted ${probe.frameCount} frames but ffmpeg decoded ${decoded}; the file may be damaged`);
  }
  if (probe.timing.timing === 'variable' && probe.frameCount > 2000) {
    warn(`${name}: ${probe.frameCount} unevenly timed frames make a large manifest entry; consider re-encoding at a constant frame rate`);
  }

  const filmstrip = `filmstrips/${name}.jpg`;
  await writeJpeg(filmstripImage(wanted.map((frame) => ({frame, rgba: kept.get(frame)!})), width, height),
    path.join(filmstripDir, `${name}.jpg`));

  return {
    format: path.extname(file).slice(1).toLowerCase(),
    codec: probe.codec,
    width: probe.width,
    height: probe.height,
    frameCount: probe.frameCount,
    fps: probe.timing.fps,
    fpsRational: probe.timing.fpsRational,
    durationSeconds: probe.timing.durationSeconds,
    timing: probe.timing.timing,
    ...(probe.timing.frameStarts ? {frameStarts: probe.timing.frameStarts} : {}),
    hasAlpha: transparent,
    hasAudio: probe.hasAudio,
    loop: loopVerdict(frameDifference(last!, first!), steps),
    filmstrip: {file: filmstrip, frames: wanted},
    bytes: (await stat(file)).size,
  };
};

const scanFont = (file: string, name: string, bytes: number): {family: string; face: FontFace} => {
  const opened = fontkit.openSync(file);
  if ('fonts' in opened) throw new Error('font collections (.ttc) are not supported; use one file per face');
  // The published typings lag the library; describe only what is read here.
  const font = opened as unknown as {
    familyName?: string; subfamilyName?: string; italicAngle: number; numGlyphs: number;
    getName: (key: string, language?: string) => string | null;
    hasGlyphForCodePoint: (code: number) => boolean;
    'OS/2'?: {usWeightClass?: number; fsSelection?: {italic?: boolean}};
    variationAxes?: Record<string, {name: string; min: number; default: number; max: number}>;
    namedVariations?: Record<string, Record<string, number>>;
  };
  const named = (key: string) => {
    try { return font.getName(key) || null; } catch { return null; }
  };
  const os2 = font['OS/2'];
  const axes: FontFace['axes'] = {};
  for (const [tag, axis] of Object.entries(font.variationAxes ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    axes[tag] = {name: axis.name, min: round(axis.min, 4), default: round(axis.default, 4), max: round(axis.max, 4)};
  }
  const instances: FontFace['instances'] = {};
  for (const [instance, settings] of Object.entries(font.namedVariations ?? {})) {
    instances[instance] = Object.fromEntries(Object.entries(settings).map(([tag, value]) => [tag, round(value, 4)]));
  }
  let missingAscii = '';
  for (let code = 0x21; code <= 0x7e; code++) {
    if (!font.hasGlyphForCodePoint(code)) missingAscii += String.fromCharCode(code);
  }
  const family = named('preferredFamily') ?? font.familyName;
  if (!family) throw new Error('no family name');
  return {family, face: {
    file: name,
    format: path.extname(file).slice(1).toLowerCase() as FontFace['format'],
    subfamily: named('preferredSubfamily') ?? font.subfamilyName ?? '',
    weight: Math.min(1000, Math.max(1, Math.round(os2?.usWeightClass ?? 400))),
    style: os2?.fsSelection?.italic || font.italicAngle !== 0 ? 'italic' : 'normal',
    axes, instances,
    glyphCount: font.numGlyphs,
    missingAscii,
    bytes,
  }};
};

const walk = async (dir: string, prefix = ''): Promise<string[]> => {
  const files: string[] = [];
  for (const entry of (await readdir(dir, {withFileTypes: true})).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith('.')) continue;
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await walk(path.join(dir, entry.name), relative));
    else if (entry.isFile()) files.push(relative);
  }
  return files;
};

/** Hand-written notes from a previous manifest. Read leniently so an older format still carries over. */
const previousNotes = async (file: string) => {
  const notes = (value: unknown): Notes => {
    const {description, tags} = (value ?? {}) as Partial<Notes>;
    return {description: typeof description === 'string' ? description : '',
      tags: Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === 'string') : []};
  };
  let existing: {clips?: Record<string, unknown>; fonts?: Record<string, unknown>} = {};
  if (existsSync(file)) {
    try {
      existing = JSON.parse(await readFile(file, 'utf8'));
    } catch (error) {
      throw new Error(`${file} is not valid JSON, so its descriptions and tags cannot be carried over. Fix or delete it, then scan again. (${(error as Error).message})`);
    }
  }
  return {
    exists: existsSync(file),
    collection: notes(existing),
    clip: (name: string) => notes(existing.clips?.[name]),
    font: (family: string) => notes(existing.fonts?.[family]),
    names: [...Object.keys(existing.clips ?? {}).map((name) => `clip ${name}`),
      ...Object.keys(existing.fonts ?? {}).map((family) => `font ${family}`)],
  };
};

// Keep lists of numbers on one line: a clip with uneven timing has one start time per frame.
const serialize = (manifest: CollectionManifest) => `${JSON.stringify(manifest, null, 2)
  .replace(/\[\n\s+(-?[\d.e+-]+(?:,\n\s+-?[\d.e+-]+)*)\n\s+\]/g, (_, body: string) => `[${body.split(/,\s+/).join(', ')}]`)}\n`;

export type CollectionReport = {
  collection: string;
  status: 'created' | 'updated' | 'unchanged';
  manifest: string;
  clips: number;
  fonts: number;
  /** Files that are not a supported clip or font. */
  skipped: string[];
  /** Supported files that could not be read, with the reason. */
  failed: string[];
  /** Entries in the previous manifest whose files are gone. */
  removed: string[];
  warnings: string[];
};

export type ScanOptions = {
  /** Where collections of media live. Default public/assets. */
  assetsDir?: string;
  /** Where manifests and filmstrips are written. Default collections. */
  manifestsDir?: string;
  /** Limit the scan to these collections. */
  only?: string[];
  log?: (message: string) => void;
};

const scanCollection = async (collection: string, assetsDir: string, manifestsDir: string,
  log: (message: string) => void): Promise<CollectionReport> => {
  const source = path.join(assetsDir, collection);
  const target = path.join(manifestsDir, collection);
  const manifestPath = path.join(target, 'manifest.json');
  const previous = await previousNotes(manifestPath);
  const report: CollectionReport = {collection, status: 'unchanged', manifest: manifestPath,
    clips: 0, fonts: 0, skipped: [], failed: [], removed: [], warnings: []};

  const clips: Record<string, ClipEntry> = {};
  const families = new Map<string, FontFace[]>();
  for (const name of await walk(source)) {
    const file = path.join(source, name);
    const extension = path.extname(name).slice(1).toLowerCase();
    try {
      if (clipFormats.has(extension)) {
        log(`  ${collection}/${name}`);
        clips[name] = {...previous.clip(name),
          ...await scanClip(file, name, path.join(target, 'filmstrips'), (message) => report.warnings.push(message))};
      } else if (fontFormats.has(extension)) {
        log(`  ${collection}/${name}`);
        const {family, face} = scanFont(file, name, (await stat(file)).size);
        families.set(family, [...(families.get(family) ?? []), face]);
      } else {
        report.skipped.push(name);
      }
    } catch (error) {
      report.failed.push(`${name}: ${(error as Error).message}`);
    }
  }

  const fonts: Record<string, FontEntry> = {};
  for (const family of [...families.keys()].sort((a, b) => a.localeCompare(b))) {
    fonts[family] = {...previous.font(family), faces: families.get(family)!.sort((a, b) =>
      a.weight - b.weight || a.style.localeCompare(b.style) * -1 || a.file.localeCompare(b.file))};
  }

  const manifest = collectionSchema.parse({
    version: manifestVersion, collection, ...previous.collection, clips, fonts,
  } satisfies CollectionManifest);
  report.clips = Object.keys(clips).length;
  report.fonts = Object.keys(fonts).length;
  const current = new Set([...Object.keys(clips).map((name) => `clip ${name}`),
    ...Object.keys(fonts).map((family) => `font ${family}`)]);
  report.removed = previous.names.filter((name) => !current.has(name));

  // Drop filmstrips whose clips are gone.
  const filmstrips = path.join(target, 'filmstrips');
  if (existsSync(filmstrips)) {
    const wanted = new Set(Object.values(clips).map((clip) => clip.filmstrip.file));
    for (const file of await walk(filmstrips)) {
      if (!wanted.has(`filmstrips/${file}`)) await rm(path.join(filmstrips, file));
    }
  }

  const content = serialize(manifest);
  const before = previous.exists ? await readFile(manifestPath, 'utf8') : null;
  if (before !== content) {
    await mkdir(target, {recursive: true});
    await writeFile(manifestPath, content);
    report.status = before === null ? 'created' : 'updated';
  }
  return report;
};

/** Regenerate collections/index.ts so sketches can import every manifest with literal types. */
export const writeIndex = async (manifestsDir: string) => {
  const names = existsSync(manifestsDir)
    ? (await readdir(manifestsDir, {withFileTypes: true}))
      .filter((entry) => entry.isDirectory() && existsSync(path.join(manifestsDir, entry.name, 'manifest.json')))
      .map((entry) => entry.name).sort()
    : [];
  const content = `// Generated by \`npm run assets:scan\`. Do not edit.
${names.map((name, i) => `import c${i} from './${name}/manifest.json';\n`).join('')}
/** Every committed collection manifest, keyed by collection name. */
export const manifests = {${names.map((name, i) => `\n  '${name}': c${i},`).join('')}${names.length ? '\n' : ''}};
`;
  const file = path.join(manifestsDir, 'index.ts');
  await mkdir(manifestsDir, {recursive: true});
  if (!existsSync(file) || await readFile(file, 'utf8') !== content) await writeFile(file, content);
  return names;
};

/**
 * Scan every collection folder that is present. A manifest whose media
 * folder is absent is left untouched, so scanning on a machine without a
 * collection never erases its manifest.
 */
export const scanAssets = async ({assetsDir = path.resolve('public/assets'),
  manifestsDir = path.resolve('collections'), only, log = () => {}}: ScanOptions = {}) => {
  assetsDir = path.resolve(assetsDir);
  manifestsDir = path.resolve(manifestsDir);
  const present = existsSync(assetsDir)
    ? (await readdir(assetsDir, {withFileTypes: true}))
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.')).map((entry) => entry.name).sort()
    : [];
  const unknown = (only ?? []).filter((name) => !present.includes(name));
  if (unknown.length) {
    throw new Error(`No such collection folder: ${unknown.map((name) => path.join(assetsDir, name)).join(', ')}`);
  }
  const invalid = present.filter((name) => !collectionNamePattern.test(name));
  const reports: CollectionReport[] = [];
  for (const collection of present) {
    if (invalid.includes(collection) || (only?.length && !only.includes(collection))) continue;
    log(`Scanning ${collection}`);
    reports.push(await scanCollection(collection, assetsDir, manifestsDir, log));
  }
  const indexed = await writeIndex(manifestsDir);
  return {reports, indexed, invalid,
    /** Committed manifests whose media is not on this machine. */
    absent: indexed.filter((name) => !present.includes(name))};
};
