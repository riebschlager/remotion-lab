import {getLoopDurationInFrames} from './beat/timing';
import {validateLoopProps} from './validation';
import {resolvePreset} from './presets';

/** Both composition entry points validate before calculating any metadata. */
export const getLoopMetadata = (input: unknown) => {
  const props = validateLoopProps(input);
  return {props, fps: props.fps, durationInFrames: getLoopDurationInFrames(props)};
};

export const getSeamMetadata = (input: unknown) => {
  const metadata = getLoopMetadata(input);
  return {...metadata, durationInFrames: Math.min(metadata.durationInFrames, metadata.fps * 2)};
};

/** Keep selector/override props intact in Studio; resolve the same musical
 * config in both metadata and rendering, without leaking it into controls.
 */
export const getPresetMetadata = (input: unknown) => {
  const props = resolvePreset(input);
  return {fps: props.fps, durationInFrames: getLoopDurationInFrames(props)};
};

export const getPresetSeamMetadata = (input: unknown) => {
  const metadata = getPresetMetadata(input);
  return {...metadata, durationInFrames: Math.min(metadata.durationInFrames, metadata.fps * 2)};
};
