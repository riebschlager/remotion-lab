import React from 'react';
import {Video} from '@remotion/media';
import {AnimatedImage, Freeze, useVideoConfig} from 'remotion';
import {clipFrameTime, type ClipRef} from './index';

/**
 * Draws exactly one source frame of a clip.
 *
 * Remotion's `<AnimatedImage>` and `<Video>` follow the composition's frame
 * clock, which a beat-locked loop must not do. This pins that clock to the
 * requested source frame instead, so what is drawn depends only on `frame`.
 * Derive `frame` from `useBeat()`; for example, to play a clip once every
 * four beats:
 *
 *   const {beat} = useBeat();
 *   <ClipFrame clip={spin} frame={Math.floor(((beat / 4) % 1) * spin.frameCount)} width={w} height={h} />
 *
 * `frame` is floored and wraps around the clip, so any number is valid.
 */
export const ClipFrame: React.FC<{
  /** From `useAsset(clip(...))`. */
  clip: ClipRef & {src: string};
  /** Source frame, 0-based. */
  frame: number;
  /** Box to draw into, in composition pixels. */
  width: number;
  height: number;
  fit?: 'contain' | 'cover' | 'fill';
  style?: React.CSSProperties;
}> = ({clip, frame, width, height, fit = 'contain', style}) => {
  const {fps} = useVideoConfig();
  const count = clip.frameCount;
  const sourceFrame = ((Math.floor(frame) % count) + count) % count;
  return (
    <Freeze frame={clipFrameTime(clip, sourceFrame) * fps}>
      {clip.format === 'gif'
        ? <AnimatedImage src={clip.src} width={width} height={height} fit={fit} style={style} />
        : <Video src={clip.src} muted objectFit={fit} style={{width, height, ...style}} />}
    </Freeze>
  );
};
