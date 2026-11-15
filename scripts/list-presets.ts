import {loopPresets, presetNames, resolvePreset} from '../src/presets';
import {getLoopDurationInFrames} from '../src/beat/timing';

console.table(presetNames.map((preset) => {
  const props = resolvePreset({preset});
  return {preset, title: loopPresets[preset].title, bpm: props.bpm, bars: props.bars,
    fps: props.fps, frames: getLoopDurationInFrames(props)};
}));
for (const name of presetNames) console.log(`${name}: ${loopPresets[name].description}`);
