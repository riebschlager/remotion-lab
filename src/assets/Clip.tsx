import React from 'react';
import {useBeat} from '../beat/BeatContext';
import {useCanvas} from '../sketches/canvas';
import {useSketch} from '../sketches/define';
import {ClipFrame} from './ClipFrame';
import {sampleClip, type ClipPlayback, type ClipSample} from './clipPlayback';
import type {ClipRef} from './index';

/** Exposes the latest hit's strength for sketch paint/transforms without effects or callbacks. */
export const useClipPlayback = (clip: ClipRef, playback: ClipPlayback, channel = 'clip'): ClipSample => {
  const time = useBeat();
  const {seed} = useSketch();
  return sampleClip(clip, playback, {time, seed: (name) => seed(`${channel}:${name}`), division: '1/4', offsetBeats: 0});
};

type ClipStyle = Omit<React.CSSProperties, 'opacity'> & {opacity?: number};

/** Relative box: x/y/width/height are canvas fractions. Defaults cover the canvas. */
export const Clip: React.FC<{
  clip: ClipRef & {src: string}; playback: ClipPlayback; channel?: string;
  x?: number; y?: number; width?: number; height?: number;
  fit?: 'contain' | 'cover' | 'fill';
  style?: ClipStyle | ((sample: ClipSample) => ClipStyle);
}> = ({clip, playback, channel, x = 0, y = 0, width = 1, height = 1, fit = 'contain', style}) => {
  const canvas = useCanvas();
  const sample = useClipPlayback(clip, playback, channel);
  const paint = typeof style === 'function' ? style(sample) : style;
  return <div style={{position: 'absolute', left: x * canvas.width, top: y * canvas.height,
    width: width * canvas.width, height: height * canvas.height, ...paint,
    opacity: sample.opacity * (paint?.opacity ?? 1)}}>
    <ClipFrame clip={clip} frame={sample.frame} width={width * canvas.width} height={height * canvas.height} fit={fit} />
  </div>;
};
