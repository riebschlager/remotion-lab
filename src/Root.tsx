import React from 'react';
import {CalculateMetadataFunction, Composition} from 'remotion';
import {getLoopDurationInFrames} from './beat/timing';
import {LoopComposition} from './LoopComposition';
import {defaultLoopProps, LoopProps, loopSchema} from './schema';

const WIDTH = 1080;
const HEIGHT = 1920;

/** Loop length is derived from the music, never typed in by hand. */
const loopMetadata: CalculateMetadataFunction<LoopProps> = ({props}) => ({
  fps: props.fps,
  durationInFrames: getLoopDurationInFrames(props),
});

/** SeamCheck: 1s before the loop point → 1s after it. Watch for any jump. */
const SEAM_SECONDS = 1;
const seamMetadata: CalculateMetadataFunction<LoopProps> = ({props}) => ({
  fps: props.fps,
  durationInFrames: Math.min(getLoopDurationInFrames(props), props.fps * SEAM_SECONDS * 2),
});

const SeamCheck: React.FC<LoopProps> = (props) => {
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
        defaultProps={defaultLoopProps}
        calculateMetadata={loopMetadata}
        width={WIDTH}
        height={HEIGHT}
        fps={defaultLoopProps.fps}
        durationInFrames={1}
      />
      <Composition
        id="SeamCheck"
        component={SeamCheck}
        schema={loopSchema}
        defaultProps={defaultLoopProps}
        calculateMetadata={seamMetadata}
        width={WIDTH}
        height={HEIGHT}
        fps={defaultLoopProps.fps}
        durationInFrames={1}
      />
    </>
  );
};
