import React from 'react';
import {AbsoluteFill} from 'remotion';

type Props = {
  enabled: boolean;
  opacity?: number;
  blendMode?: React.CSSProperties['mixBlendMode'];
  children: React.ReactNode;
};

/**
 * Shared wrapper for every layer: on/off, opacity, blend mode.
 * Layers stack in the order they appear in LoopComposition.
 */
export const Layer: React.FC<Props> = ({enabled, opacity = 1, blendMode = 'normal', children}) => {
  if (!enabled || opacity <= 0) return null;
  return <AbsoluteFill style={{opacity, mixBlendMode: blendMode}}>{children}</AbsoluteFill>;
};
