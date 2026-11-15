import React, {useMemo} from 'react';
import {getLoopDurationInFrames} from './beat/timing';
import {LoopComposition} from './LoopComposition';
import {resolvePreset, type PresetInput} from './presets';

/** Presets are data-driven; edit their named definitions or composition props. */
export const PresetComposition: React.FC<PresetInput> = (input) => {
  const props = useMemo(() => resolvePreset(input), [input.preset, input.overrides]);
  return <LoopComposition {...props} />;
};

export const PresetSeamComposition: React.FC<PresetInput> = (input) => {
  const props = useMemo(() => resolvePreset(input), [input.preset, input.overrides]);
  const loop = getLoopDurationInFrames(props);
  const lead = Math.min(Math.floor(loop / 2), props.fps);
  return <LoopComposition {...props} frameOffset={loop - lead} />;
};
