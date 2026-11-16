import React from 'react';
import {CalculateMetadataFunction, Composition, Folder} from 'remotion';
import {getLoopDurationInFrames} from './beat/timing';
import {LoopComposition} from './LoopComposition';
import {getLoopMetadata, getSeamMetadata, getPresetMetadata, getPresetSeamMetadata} from './metadata';
import {LoopInput, loopSchema} from './schema';
import {PresetComposition, PresetSeamComposition} from './PresetComposition';
import {presetSchema, type PresetInput} from './presets';
import {sketches} from './sketches';

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
          // Studio needs literal defaults to display and save nested controls.
          // tests/studio-defaults.test.ts keeps these aligned with the registry.
          background: {
            enabled: true, opacity: 1, blendMode: 'normal', division: '1/4', offsetBeats: 0,
            colorA: '#0b0b1a', colorB: '#3a1d6e', pulseAmount: 0.6, rotationsPerLoop: 1,
          },
          rings: {
            enabled: true, opacity: 1, blendMode: 'screen', division: '1/4', offsetBeats: 0,
            color: '#7fe7ff', accentColor: '#ff4fa3', accentEvery: 4, lifeSteps: 3,
            maxRadius: 900, thickness: 14, drift: 80,
          },
          layerOrder: ['background', 'rings'],
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
          // Studio needs literal defaults to display and save nested controls.
          // tests/studio-defaults.test.ts keeps these aligned with the registry.
          background: {
            enabled: true, opacity: 1, blendMode: 'normal', division: '1/4', offsetBeats: 0,
            colorA: '#0b0b1a', colorB: '#3a1d6e', pulseAmount: 0.6, rotationsPerLoop: 1,
          },
          rings: {
            enabled: true, opacity: 1, blendMode: 'screen', division: '1/4', offsetBeats: 0,
            color: '#7fe7ff', accentColor: '#ff4fa3', accentEvery: 4, lifeSteps: 3,
            maxRadius: 900, thickness: 14, drift: 80,
          },
          layerOrder: ['background', 'rings'],
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
          defaultProps={{preset: 'neon-orbit' as const, overrides: {}}}
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
      {/* Sketches own their defaults in src/sketches/<id>/sketch.tsx. */}
      <Folder name="Sketches">
        {sketches.map((sketch) => (
          <Composition key={sketch.id} id={sketch.id} component={sketch.Loop} schema={sketch.schema}
            defaultProps={sketch.defaultProps} calculateMetadata={({props}) => sketch.metadata(props)}
            width={1080} height={1920} fps={30} durationInFrames={1} />
        ))}
        <Folder name="Seams">
          {sketches.map((sketch) => (
            <Composition key={sketch.id} id={`${sketch.id}-seam`} component={sketch.Seam} schema={sketch.schema}
              defaultProps={sketch.defaultProps} calculateMetadata={({props}) => sketch.seamMetadata(props)}
              width={1080} height={1920} fps={30} durationInFrames={1} />
          ))}
        </Folder>
      </Folder>
    </>
  );
};
