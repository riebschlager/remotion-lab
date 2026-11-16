import {measureText} from '@remotion/layout-utils';
import type {FontRef} from '../assets';
import {cssFontFaceFamily, fontFaceFamily} from '../assets/fonts';
import type {FontFace} from '../assets/manifest';
import type {TypeMetrics} from './layout';

export const variationSettings = (axes: Record<string, number>) => Object.entries(axes)
  .sort(([a], [b]) => a.localeCompare(b)).map(([tag, value]) => `"${tag}" ${value}`).join(', ') || 'normal';
const cache = new Map<string, TypeMetrics>();
/** The sketch shell loads fonts before mounting. Verify that gate before any measurement/cache lookup. */
export const measureType = (font: FontRef, face: FontFace, text: string, axes: Record<string, number>): TypeMetrics => {
  const family = fontFaceFamily(font, face);
  let loaded = false;
  document.fonts.forEach((f) => {
    if (f.family.replace(/^['"]|['"]$/g, '') === family && f.status === 'loaded') loaded = true;
  });
  if (!loaded) throw new Error(`type.font: ${family} must finish loading before text is measured`);
  const variation = variationSettings(axes);
  const key = JSON.stringify([family, face.file, text, variation]);
  const known = cache.get(key);
  if (known) return known;
  const styles = {fontStyle: face.style, fontVariationSettings: variation, fontOpticalSizing: 'none', fontKerning: 'none', fontVariantLigatures: 'none'};
  const advance = measureText({text: text || ' ', fontFamily: cssFontFaceFamily(font, face), fontSize: 100,
    fontWeight: face.weight, validateFontIsLoaded: true, additionalStyles: styles}).width;
  // DOM width excludes italic overhang and ascenders. SVG bounds include actual ink;
  // measuring in SVG coordinates also avoids Studio's preview scale.
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const node = document.createElementNS(svg.namespaceURI, 'text') as SVGTextElement;
  Object.assign(svg.style, {position: 'absolute', visibility: 'hidden'});
  Object.assign(node.style, {...styles, fontFamily: cssFontFaceFamily(font, face), fontSize: '100px', fontWeight: String(face.weight), whiteSpace: 'pre'});
  node.textContent = text;
  svg.appendChild(node);
  document.body.appendChild(svg);
  let bounds: DOMRect;
  try { bounds = node.getBBox(); } finally { svg.remove(); }
  const left = Math.min(0, bounds.x);
  const right = Math.max(text ? advance : 0, bounds.x + bounds.width);
  const top = Math.min(-100, bounds.y);
  const bottom = Math.max(25, bounds.y + bounds.height);
  const result = {left: left / 100, top: top / 100, width: (right - left) / 100, height: (bottom - top) / 100};
  if (cache.size >= 2000) cache.delete(cache.keys().next().value!);
  cache.set(key, result);
  return result;
};
