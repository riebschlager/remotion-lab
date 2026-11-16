import offGrid from './off-grid/sketch';
import happyStatic from './happy-static/sketch';
import duskTide from './dusk-tide/sketch';
import type {Sketch} from './define';
import pulseGrid from './pulse-grid/sketch';
import stickerSlap from './sticker-slap/sketch';
import clipDuet from './clip-duet/sketch';
import typeBeat from './type-beat/sketch';

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
];

export const findSketch = (id: string) => sketches.find((sketch) => sketch.id === id);
