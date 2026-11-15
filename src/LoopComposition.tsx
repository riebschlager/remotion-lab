import React from 'react';
import {AbsoluteFill} from 'remotion';
import {BeatProvider} from './beat/BeatContext';
import {BeatDebug} from './layers/BeatDebug';
import {Layer} from './layers/Layer';
import {configuredLayers} from './layers/registry';
import type {LoopInput} from './schema';

type Props = LoopInput & {
  /** Internal: used by SeamCheck to start partway through the loop. */
  frameOffset?: number;
};

/** Procedural layers are configured through registry-derived composition props. */
export const LoopComposition: React.FC<Props> = (props) => {
  const layers = configuredLayers(props);
  return (
    <BeatProvider bpm={props.bpm} bars={props.bars} beatsPerBar={props.beatsPerBar}
      fps={props.fps} frameOffset={props.frameOffset ?? 0}>
      <AbsoluteFill style={{backgroundColor: 'black'}}>
        {layers.map(({name, definition, props: layer}) => (
          <Layer key={name} enabled={layer.enabled} opacity={layer.opacity} blendMode={layer.blendMode}>
            {definition.render(layer)}
          </Layer>
        ))}
        <Layer enabled={props.debug.enabled}>
          <BeatDebug divisions={layers.filter(({props: layer}) => layer.enabled)
            .map(({props: layer}) => layer.division)} />
        </Layer>
      </AbsoluteFill>
    </BeatProvider>
  );
};
