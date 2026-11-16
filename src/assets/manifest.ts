import {z} from 'zod';

/**
 * The shape of collections/<collection>/manifest.json.
 *
 * `npm run assets:scan` writes every field except `description` and `tags`,
 * which people and agents edit by hand and which survive a re-scan.
 */
export const manifestVersion = 1;

const count = z.number().int().positive();
const notes = {
  /** Hand-written: what this shows and how it might be used. Kept on re-scan. */
  description: z.string(),
  /** Hand-written keywords. Kept on re-scan. */
  tags: z.array(z.string()),
};

export const clipSchema = z.object({
  ...notes,
  /** Container, from the file extension: gif, mp4, mov, m4v or webm. */
  format: z.string(),
  codec: z.string(),
  /** Display size in pixels, after any rotation stored in the file. */
  width: count,
  height: count,
  /** Exact number of source frames. Valid source frames are 0..frameCount-1. */
  frameCount: count,
  /** Native frames per second. The average when `timing` is "variable". */
  fps: z.number().positive(),
  /** `fps` as an exact fraction [numerator, denominator]; null when `timing` is "variable". */
  fpsRational: z.tuple([count, count]).nullable(),
  /** Time from the start of the first frame to the end of the last. */
  durationSeconds: z.number().positive(),
  /** "constant": frame i starts at i / fps. "variable": use `frameStarts`. */
  timing: z.enum(['constant', 'variable']),
  /** Start of each frame in seconds from the first; present only when `timing` is "variable". */
  frameStarts: z.array(z.number().min(0)).optional(),
  /** True when at least one decoded pixel is not fully opaque. */
  hasAlpha: z.boolean(),
  hasAudio: z.boolean(),
  loop: z.object({
    /** True when stepping from the last frame to the first is no bigger than an ordinary step in the clip. */
    seamless: z.boolean(),
    /** Change from the last frame to the first, 0..1. */
    seamDifference: z.number().min(0),
    /** An ordinary step: the upper quartile of the change between consecutive frames across the clip, 0..1. */
    neighborDifference: z.number().min(0),
  }).strict(),
  filmstrip: z.object({
    /** Image path relative to the manifest's folder. */
    file: z.string(),
    /** The source frame shown in each cell, left to right. */
    frames: z.array(z.number().int().min(0)).min(1),
  }).strict(),
  bytes: count,
}).strict();

export const fontFaceSchema = z.object({
  /** Path relative to public/assets/<collection>/. */
  file: z.string(),
  format: z.enum(['ttf', 'otf', 'woff', 'woff2']),
  /** The face's own style name, e.g. "Bold Italic". */
  subfamily: z.string(),
  /** CSS weight of the face. For a variable font, its default; see `axes.wght` for the range. */
  weight: z.number().int().min(1).max(1000),
  style: z.enum(['normal', 'italic']),
  /** Variable axes by tag. Empty for a static face. */
  axes: z.record(z.string(), z.object({
    name: z.string(), min: z.number(), default: z.number(), max: z.number(),
  }).strict()),
  /** Named instances of a variable font: name → axis values. */
  instances: z.record(z.string(), z.record(z.string(), z.number())),
  glyphCount: z.number().int().min(0),
  /** Printable ASCII characters the face cannot draw; "" when it covers them all. */
  missingAscii: z.string(),
  bytes: count,
}).strict();

export const fontSchema = z.object({
  ...notes,
  /** One entry per file, ordered by weight, then style. */
  faces: z.array(fontFaceSchema).min(1),
}).strict();

export const collectionSchema = z.object({
  version: z.literal(manifestVersion),
  /** Folder name under public/assets/. */
  collection: z.string(),
  ...notes,
  /** Animated GIFs and videos, keyed by file path relative to the collection folder. */
  clips: z.record(z.string(), clipSchema),
  /** Font families, keyed by family name. */
  fonts: z.record(z.string(), fontSchema),
}).strict();

export type ClipEntry = z.output<typeof clipSchema>;
export type FontFace = z.output<typeof fontFaceSchema>;
export type FontEntry = z.output<typeof fontSchema>;
export type CollectionManifest = z.output<typeof collectionSchema>;

/** Collection folder names double as import names and URL segments. */
export const collectionNamePattern = /^[a-z0-9][a-z0-9-]*$/;
