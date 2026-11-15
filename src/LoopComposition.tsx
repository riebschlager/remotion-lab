import React from 'react';
import {AbsoluteFill} from 'remotion';
import {BeatProvider} from './beat/BeatContext';
import {Background} from './layers/Background';
import {BeatDebug} from './layers/BeatDebug';
import {Layer} from './layers/Layer';
import {Rings} from './layers/Rings';
import {LoopProps} from './schema';

type Props = LoopProps & {
  /** Internal: used by SeamCheck to start partway through the loop */
  frameOffset?: number;
};

/**
 * The layer stack. Order here = z-order (first is bottom).
 * To add a layer: add its schema in schema.ts, build a component in
 * layers/, and drop it into this stack inside a <Layer>.
 */
export const LoopComposition: React.FC<Props> = ({
  bpm,
  bars,
  beatsPerBar,
  fps,
  frameOffset = 0,
  background,
  rings,
  debug,
}) => {
  return (
    <BeatProvider bpm={bpm} bars={bars} beatsPerBar={beatsPerBar} fps={fps} frameOffset={frameOffset}>
      <AbsoluteFill style={{backgroundColor: 'black'}}>
        <Layer enabled={background.enabled} opacity={background.opacity} blendMode={background.blendMode}>
          <Background {...background} />
        </Layer>

        <Layer enabled={rings.enabled} opacity={rings.opacity} blendMode={rings.blendMode}>
          <Rings {...rings} />
        </Layer>

        <Layer enabled={debug.enabled}>
          <BeatDebug divisions={[background.division, rings.division]} />
        </Layer>
      </AbsoluteFill>
    </BeatProvider>
  );
};
