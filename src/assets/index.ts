import {manifests} from '../../collections';
import type {ClipEntry, CollectionManifest, FontEntry} from './manifest';

/**
 * Typed access to asset collections.
 *
 * Media lives in public/assets/<collection>/ and is not in git; what a
 * collection contains is recorded in collections/<collection>/manifest.json,
 * which is. `clip()` and `font()` look an asset up in the manifest, so its
 * measurements are available without touching the file. A sketch lists the
 * references it uses in `defineSketch({assets})` and reads the playable form
 * with `useAsset()`.
 */
export type ClipRef = ClipEntry & {
  kind: 'clip';
  collection: string;
  /** Manifest key: the file path relative to the collection folder. */
  name: string;
  /** Path relative to public/, as `staticFile()` expects. */
  publicPath: string;
};

export type FontRef = FontEntry & {
  kind: 'font';
  collection: string;
  family: string;
};

export type CollectionFileRef = {
  kind: 'file';
  collection: string;
  name: string;
  publicPath: string;
};

export type AssetRef = ClipRef | FontRef | CollectionFileRef;

type ManifestShape = {clips: Record<string, unknown>; fonts: Record<string, unknown>};

const list = (names: string[]) => (names.length
  ? `${names.slice(0, 12).map((name) => `"${name}"`).join(', ')}${names.length > 12 ? `, and ${names.length - 12} more` : ''}`
  : 'none');

/** Bind the helpers to a set of manifests. Tests pass their own; sketches use the exports below. */
export const createAssets = <M extends Record<string, ManifestShape>>(source: M) => {
  const all = source as unknown as Record<string, CollectionManifest>;
  const collectionOf = (collection: string) => {
    if (!Object.hasOwn(all, collection)) {
      throw new Error(`Unknown asset collection "${collection}". Collections with a manifest: ${list(Object.keys(all))}. `
        + `Add media to public/assets/${collection}/ and run npm run assets:scan.`);
    }
    return all[collection];
  };
  const rescan = (collection: string) =>
    `If the file was added after the last scan, run npm run assets:scan -- ${collection}.`;

  return {
    /** A collection file that uses a sketch-specific loader, such as an FBX model. */
    collectionFile: <C extends keyof M & string>(collection: C, name: string): CollectionFileRef => {
      collectionOf(collection);
      return {kind: 'file', collection, name, publicPath: `assets/${collection}/${name}`};
    },
    /** A GIF or video by its path inside the collection, e.g. `clip('retro', 'loops/spin.gif')`. */
    clip: <C extends keyof M & string>(collection: C, name: keyof M[C]['clips'] & string): ClipRef => {
      const {clips} = collectionOf(collection);
      if (!Object.hasOwn(clips, name)) {
        throw new Error(`No clip "${name}" in collection "${collection}". Its manifest lists: ${list(Object.keys(clips))}. ${rescan(collection)}`);
      }
      return {...clips[name], kind: 'clip', collection, name, publicPath: `assets/${collection}/${name}`};
    },
    /** A font family by name, e.g. `font('retro', 'Chunk Five')`. */
    font: <C extends keyof M & string>(collection: C, family: keyof M[C]['fonts'] & string): FontRef => {
      const {fonts} = collectionOf(collection);
      if (!Object.hasOwn(fonts, family)) {
        throw new Error(`No font family "${family}" in collection "${collection}". Its manifest lists: ${list(Object.keys(fonts))}. ${rescan(collection)}`);
      }
      return {...fonts[family], kind: 'font', collection, family};
    },
    /** Clip names in a collection, for building a `z.enum` param. */
    clipNames: <C extends keyof M & string>(collection: C) =>
      Object.keys(collectionOf(collection).clips) as Array<keyof M[C]['clips'] & string>,
    fontFamilies: <C extends keyof M & string>(collection: C) =>
      Object.keys(collectionOf(collection).fonts) as Array<keyof M[C]['fonts'] & string>,
  };
};

export const {clip, font, collectionFile, clipNames, fontFamilies} = createAssets(manifests);

/** Stable identity of a reference, used to match declared assets with used ones. */
export const assetKey = (ref: AssetRef) =>
  `${ref.kind}:${ref.collection}/${ref.kind === 'font' ? ref.family : ref.name}`;

/** Every file a reference needs, relative to public/. */
export const assetFiles = (ref: AssetRef) => (ref.kind === 'font'
  ? ref.faces.map((face) => `assets/${ref.collection}/${face.file}`) : [ref.publicPath]);

export const assetLabel = (ref: AssetRef) => `${ref.kind} "${ref.kind === 'font' ? ref.family : ref.name}"`;

/**
 * One message per file that `exists` cannot find. The caller supplies the
 * lookup: the browser asks Remotion for the public folder's contents, and
 * Node scripts check the disk.
 */
export const missingAssets = (refs: AssetRef[], exists: (publicPath: string) => boolean) =>
  refs.flatMap((ref) => assetFiles(ref).filter((file) => !exists(file)).map((file) =>
    `public/${file} is missing (${assetLabel(ref)} in collection "${ref.collection}")`));

export const missingAssetsHint = 'Collection media is not in git: copy the collection into public/assets/, or re-scan if a file was renamed.';

/**
 * The source frame a possibly fractional, possibly out-of-range frame number
 * selects: floored and wrapped around the clip.
 *
 * Beat math is floating point, so a position meant to be exactly frame 6
 * often arrives as 5.999999999999979 (`step(...).phase * frameCount` does
 * this on most frames when the clip's cycle is a whole number of rendered
 * frames). A plain floor would show the previous frame, so a value within a
 * millionth of the next whole frame counts as that frame.
 */
export const sourceFrameIndex = (frame: number, frameCount: number) => {
  if (!Number.isFinite(frame)) throw new Error(`Clip frame must be a finite number; got ${frame}`);
  return ((Math.floor(frame + 1e-6) % frameCount) + frameCount) % frameCount;
};

/**
 * The time, in seconds from the clip's start, to ask a player for so that it
 * shows exactly one source frame.
 *
 * The two players choose frames differently. `<AnimatedImage>` shows the
 * frame whose start is nearest the requested time, so a GIF is addressed by
 * the frame's start. `<Video>` shows the frame that contains the time, so a
 * video is addressed by the frame's middle, clear of rounding at either edge.
 * tests/visual/assets.test.ts renders every frame of each fixture this way.
 */
export const clipFrameTime = (ref: ClipRef, sourceFrame: number) => {
  if (!Number.isInteger(sourceFrame) || sourceFrame < 0 || sourceFrame >= ref.frameCount) {
    throw new Error(`Clip "${ref.name}" has frames 0..${ref.frameCount - 1}; got ${sourceFrame}`);
  }
  const start = (frame: number) => {
    if (ref.timing === 'variable') return ref.frameStarts![frame] ?? ref.durationSeconds;
    return ref.fpsRational ? (frame * ref.fpsRational[1]) / ref.fpsRational[0] : frame / ref.fps;
  };
  return ref.format === 'gif' ? start(sourceFrame) : (start(sourceFrame) + start(sourceFrame + 1)) / 2;
};
