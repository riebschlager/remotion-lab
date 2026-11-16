import {getLoopDurationInFrames} from '../src/beat/timing';
import {sketches} from '../src/sketches';

console.table(sketches.map((sketch) => {
  const props = sketch.resolve(sketch.defaultProps);
  return {sketch: sketch.id, title: sketch.title, bpm: props.bpm, bars: props.bars,
    canvas: props.canvas, frames: getLoopDurationInFrames(props)};
}));
for (const sketch of sketches) console.log(`${sketch.id}: ${sketch.description}`);
