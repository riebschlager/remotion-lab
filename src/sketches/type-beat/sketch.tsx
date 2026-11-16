import React from 'react';
import {AbsoluteFill} from 'remotion';
import {z} from 'zod';
import {font} from '../../assets';
import {Type} from '../../type/Type';
import {typeSettingsSchema} from '../../type/model';
import {useCanvas} from '../canvas';
import {defineSketch} from '../define';

const bogle = font('test', 'BBH Bogle');
const schema = z.object({headline: typeSettingsSchema, signature: typeSettingsSchema});
const Poster: React.FC<z.output<typeof schema>> = ({headline, signature}) => {
  const {vmin} = useCanvas();
  return <AbsoluteFill style={{background: '#090d1c'}}>
    <Type font={bogle} settings={headline} channel="headline"
      x={0.08} y={0.13} width={0.84} height={0.6} fontSize={40}
      unitStyle={({energy}) => ({color: energy > 0.25 ? '#dfff3f' : '#f6f0df',
        opacity: 0.8 + 0.2 * energy, scale: 1 - 0.08 * energy, translate: `0 ${-0.5 * vmin * energy}px`})} />
    <div style={{position: 'absolute', left: '12%', top: '78%', width: '76%', height: 0.2 * vmin, background: '#626770'}} />
    <Type font={bogle} settings={signature} channel="signature" color="#a9afbd"
      x={0.12} y={0.8} width={0.76} height={0.1} fontSize={7}
      unitStyle={({energy}) => ({color: energy > 0.1 ? '#dfff3f' : '#a9afbd', opacity: 0.6 + 0.4 * energy})} />
  </AbsoluteFill>;
};
export default defineSketch({
  id: 'type-beat', title: 'Type Beat', description: 'A traveling letter rhythm and an alternating signature in BBH Bogle.',
  schema,
  defaults: {
    headline: {text: 'MAKE\nIT MOVE', split: 'letter', mode: 'stagger', division: '1/4',
      pattern: {steps: [1, 0, 0.45, 0]}, staggerBeats: 0.125, decay: 0.7},
    signature: {text: 'BEAT LOCKED', split: 'word', mode: 'sequence', division: '1/2', decay: 0.7},
  },
  Component: Poster, assets: [bogle],
  types: (p) => [{font: bogle, settings: p.headline, field: 'headline'}, {font: bogle, settings: p.signature, field: 'signature'}],
});
