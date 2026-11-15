import React from 'react';
import {CalculateMetadataFunction, Composition, Folder} from 'remotion';
import {getLoopDurationInFrames} from './beat/timing';
import {LoopComposition} from './LoopComposition';
import {getLoopMetadata, getSeamMetadata, getPresetMetadata, getPresetSeamMetadata} from './metadata';
import {LoopInput, loopSchema} from './schema';
import {PresetComposition, PresetSeamComposition} from './PresetComposition';
import {presetSchema, type PresetInput} from './presets';

const presetMetadata: CalculateMetadataFunction<PresetInput> = ({props}) => getPresetMetadata(props);
const presetSeamMetadata: CalculateMetadataFunction<PresetInput> = ({props}) => getPresetSeamMetadata(props);

/** Loop length is derived from the music, never typed in by hand. */
const loopMetadata: CalculateMetadataFunction<LoopInput> = ({props}) => getLoopMetadata(props);

/** SeamCheck: 1s before the loop point → 1s after it. Watch for any jump. */
const SEAM_SECONDS = 1;
const seamMetadata: CalculateMetadataFunction<LoopInput> = ({props}) => getSeamMetadata(props);

const SeamCheck: React.FC<LoopInput> = (props) => {
  const loop = getLoopDurationInFrames(props);
  const lead = Math.min(Math.floor(loop / 2), props.fps * SEAM_SECONDS);
  return <LoopComposition {...props} frameOffset={loop - lead} />;
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="BeatLoop"
        component={LoopComposition}
        schema={loopSchema}
        defaultProps={{
          bpm: 120,
          bars: 4,
          beatsPerBar: 4,
          fps: 30,
          timingMode: 'visual',
          debug: {
            enabled: false,
          },
        }}
        calculateMetadata={loopMetadata}
        width={1080}
        height={1920}
        fps={30}
        durationInFrames={1}
      />
      <Composition
        id="SeamCheck"
        component={SeamCheck}
        schema={loopSchema}
        defaultProps={{
          bpm: 120,
          bars: 4,
          beatsPerBar: 4,
          fps: 30,
          timingMode: 'visual',
          debug: {
            enabled: false,
          },
        }}
        calculateMetadata={seamMetadata}
        width={1080}
        height={1920}
        fps={30}
        durationInFrames={1}
      />
      <Folder name="Presets">
        <Composition
          id="PresetLoop"
          component={PresetComposition}
          schema={presetSchema}
          defaultProps={{preset: 'neon-orbit', overrides: {}}}
          calculateMetadata={presetMetadata}
          width={1080}
          height={1920}
          fps={30}
          durationInFrames={1}
        />
        <Composition
          id="PresetSeamCheck"
          component={PresetSeamComposition}
          schema={presetSchema}
          defaultProps={{preset: 'neon-orbit', overrides: {}}}
          calculateMetadata={presetSeamMetadata}
          width={1080}
          height={1920}
          fps={30}
          durationInFrames={1}
        />
      </Folder>
    </>
  );
};
