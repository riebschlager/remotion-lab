import type {Sketch} from './define';
import pulseGrid from './pulse-grid/sketch';

/**
 * Every sketch folder is listed here once. `npm run sketch:new` adds the two
 * lines for you, and tests/sketches.test.ts fails if a folder is missing.
 */
export const sketches: Sketch[] = [
  pulseGrid,
];

export const findSketch = (id: string) => sketches.find((sketch) => sketch.id === id);
