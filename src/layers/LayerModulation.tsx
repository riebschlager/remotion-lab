import React, {createContext, useContext} from 'react';
import {AbsoluteFill} from 'remotion';
import {useBeat} from '../beat/BeatContext';
import {resolveModulation, type ModulationState} from '../beat/modulation';
import type {BaseLayerProps} from './base';
import {useLayerInstance} from './InstanceContext';

const ModulationContext = createContext<ModulationState>({
  scale: 1, rotation: 0, color: undefined, displacement: {x: 0, y: 0},
});
export const useLayerModulation = () => useContext(ModulationContext);

const ActiveModulation: React.FC<{layer: BaseLayerProps; children: React.ReactNode}> = ({layer, children}) => {
  const time = useBeat();
  const {seed} = useLayerInstance();
  const state = resolveModulation(layer.modulation, {time, seed,
    division: layer.division, offsetBeats: layer.offsetBeats, pattern: layer.pattern});
  const transforms = layer.modulation?.scale || layer.modulation?.rotation || layer.modulation?.displacement;
  return (
    <ModulationContext.Provider value={state}>
      {transforms ? (
        <AbsoluteFill style={{translate: `${state.displacement.x}px ${state.displacement.y}px`,
          rotate: `${state.rotation}deg`, scale: state.scale, transformOrigin: '50% 50%'}}>
          {children}
        </AbsoluteFill>
      ) : children}
    </ModulationContext.Provider>
  );
};

/** No extra DOM or subscriptions for layers without modulation. */
export const LayerModulation: React.FC<{layer: BaseLayerProps; children: React.ReactNode}> = ({layer, children}) =>
  layer.modulation ? <ActiveModulation layer={layer}>{children}</ActiveModulation> : <>{children}</>;
