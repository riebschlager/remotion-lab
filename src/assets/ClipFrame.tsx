import React from 'react';
import {Video} from '@remotion/media';
import {AnimatedImage, Freeze, Sequence, useVideoConfig} from 'remotion';
import {clipFrameTime, sourceFrameIndex, type ClipRef} from './index';

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
 * `frame` is floored and wraps around the clip, so any finite number is valid;
 * see `sourceFrameIndex` for how values a rounding error below a whole frame are treated.
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
  const sourceFrame = sourceFrameIndex(frame, clip.frameCount);
  return (
    // The players read media time from the frame clock. Remotion clamps that clock to the
    // composition's own length, even inside <Freeze>, so a clip longer than the loop could never
    // show its later frames. Holding the clock at 0 and starting the clip that far in the past
    // carries the same time without the limit.
    <Freeze frame={0}>
      <Sequence layout="none" from={-clipFrameTime(clip, sourceFrame) * fps}>
        {clip.format === 'gif'
          ? <AnimatedImage src={clip.src} width={width} height={height} fit={fit} style={style} />
          : <Video src={clip.src} muted objectFit={fit} style={{width, height, ...style}} />}
      </Sequence>
    </Freeze>
  );
};
