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
export const loadCollectionFont = (ref: FontRef) => Promise.all(facesToLoad(ref).map((face) => {
  const url = staticFile(`assets/${ref.collection}/${face.file}`);
  let pending = loading.get(url);
  if (!pending) {
    pending = loadFont({family: `${ref.collection}/${ref.family}`, url, ...faceDescriptors(face)});
    pending.catch(() => loading.delete(url));
    loading.set(url, pending);
  }
  return pending;
}));
