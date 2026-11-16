import React from 'react';
import {z} from 'zod';
import {clip} from '../../assets';
import {Clip} from '../../assets/Clip';
import {clipPlaybackSchema} from '../../assets/clipPlayback';
import {useCanvas} from '../canvas';
import {defineSketch, useAsset} from '../define';

const bust = clip('test', 'Art Animation GIF by Mr Tronch.gif');
const tunnel = clip('test', 'slapchop-video-20260824-205001-10s.mp4');
const schema = z.object({portrait: clipPlaybackSchema, backdrop: clipPlaybackSchema});
const Duet: React.FC<z.output<typeof schema>> = ({portrait, backdrop}) => {
  const canvas = useCanvas();
  const size = 72 * canvas.vmin;
  return <>
    <Clip clip={useAsset(tunnel)} playback={backdrop} fit="cover" channel="tunnel"
      style={({strength}) => ({opacity: 0.12 + 0.2 * strength})} />
    <Clip clip={useAsset(bust)} playback={portrait} channel="bust"
      x={(canvas.width - size) / 2 / canvas.width} y={(canvas.height - size) / 2 / canvas.height}
      width={size / canvas.width} height={size / canvas.height}
      style={{outline: `${0.25 * canvas.vmin}px solid #965aff`}} />
  </>;
};
export default defineSketch({
  id: 'clip-duet', title: 'Clip Duet', description: 'A bar-locked rainbow portrait above a syncopated collage tunnel.',
  schema,
  defaults: {
    portrait: {mode: 'fit', duration: {bars: 1}},
    backdrop: {mode: 'retrigger', division: '1/8', pattern: {steps: [1, 0, 0.45, 0, 0.75, 0, 0, 0.35], swing: 0.25}, durationBeats: 2, cut: 'fade'},
  },
  Component: Duet, assets: [bust, tunnel],
  clips: (p) => [{clip: bust, playback: p.portrait, field: 'portrait'}, {clip: tunnel, playback: p.backdrop, field: 'backdrop'}],
});
