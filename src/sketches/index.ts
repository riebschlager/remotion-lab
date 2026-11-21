import offGrid from './off-grid/sketch';
import happyStatic from './happy-static/sketch';
import duskTide from './dusk-tide/sketch';
import type {Sketch} from './define';
import pulseGrid from './pulse-grid/sketch';
import stickerSlap from './sticker-slap/sketch';
import clipDuet from './clip-duet/sketch';
import typeBeat from './type-beat/sketch';
import randoWando from './rando-wando/sketch';
import milhouseSlices from './milhouse-slices/sketch';
import milhousePortalDive from './milhouse-portal-dive/sketch';
import milhouseChunks from './milhouse-chunks/sketch';
import infiniteBloom from './infinite-bloom/sketch';
import milhouseInfiniteBloom from './milhouse-infinite-bloom/sketch';
import milhouseBreakingNews from './milhouse-breaking-news/sketch';

/**
 * Every sketch folder is listed here once. `npm run sketch:new` adds the two
 * lines for you, and tests/sketches.test.ts fails if a folder is missing.
 */
export const sketches: Sketch[] = [
  duskTide,
  offGrid,
  happyStatic,
  pulseGrid,
  stickerSlap,
  clipDuet,
  typeBeat,
  randoWando,
  milhouseSlices,
  milhousePortalDive,
  milhouseChunks,
  infiniteBloom,
  milhouseInfiniteBloom,
  milhouseBreakingNews,
];

export const findSketch = (id: string) => sketches.find((sketch) => sketch.id === id);
