import {loadFont} from '@remotion/fonts';
import {staticFile} from 'remotion';
import type {FontFace} from './manifest';
import type {FontRef} from './index';

/**
 * The CSS family a collection font is registered under. It is namespaced by
 * collection so it can never resolve to a font installed on the machine: a
 * font that failed to load shows as fallback type instead of rendering
 * differently on someone else's computer.
 */
export const cssFontFamily = (ref: Pick<FontRef, 'collection' | 'family'>) => `"${ref.collection}/${ref.family}"`;

/** Type pins the exact selected file so overlapping static/variable faces cannot win CSS matching. */
export const fontFaceFamily = (ref: Pick<FontRef, 'collection' | 'family'>, face: Pick<FontFace, 'file'>) =>
  `${ref.collection}/${ref.family}/${face.file}`;
export const cssFontFaceFamily = (ref: Pick<FontRef, 'collection' | 'family'>, face: Pick<FontFace, 'file'>) =>
  JSON.stringify(fontFaceFamily(ref, face));

const formatRank = ['woff2', 'woff', 'otf', 'ttf'];

/** One file per distinct face, preferring the smallest format when a face ships in several. */
export const facesToLoad = (ref: Pick<FontRef, 'faces'>) => {
  const chosen = new Map<string, FontFace>();
  for (const face of ref.faces) {
    const signature = JSON.stringify([face.weight, face.style, face.axes]);
    const current = chosen.get(signature);
    if (!current || formatRank.indexOf(face.format) < formatRank.indexOf(current.format)) chosen.set(signature, face);
  }
  return [...chosen.values()];
};

/** CSS `@font-face` descriptors for a face. Variable axes become ranges so every value is reachable. */
export const faceDescriptors = (face: FontFace) => ({
  weight: face.axes.wght ? `${Math.max(1, face.axes.wght.min)} ${Math.min(1000, face.axes.wght.max)}` : String(face.weight),
  style: face.style,
  ...(face.axes.wdth ? {stretch: `${face.axes.wdth.min}% ${face.axes.wdth.max}%`} : {}),
});

const loading = new Map<string, Promise<void>>();

/**
 * Register every face of a family. `loadFont` holds the render while each
 * file loads and cancels it if one fails. Safe to call repeatedly.
 */
export const loadCollectionFont = (ref: FontRef) => Promise.all([
  ...facesToLoad(ref).map((face) => ({face, family: `${ref.collection}/${ref.family}`})),
  ...ref.faces.map((face) => ({face, family: fontFaceFamily(ref, face)})),
].map(({face, family}) => {
  const url = staticFile(`assets/${ref.collection}/${face.file}`);
  const key = JSON.stringify([family, url]);
  let pending = loading.get(key);
  if (!pending) {
    pending = loadFont({family, url, ...faceDescriptors(face)});
    pending.catch(() => loading.delete(key));
    loading.set(key, pending);
  }
  return pending;
}));
