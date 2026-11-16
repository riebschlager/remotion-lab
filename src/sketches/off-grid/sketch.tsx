import React from 'react';
import {AbsoluteFill} from 'remotion';
import {z} from 'zod';
import {font} from '../../assets';
import {useBeat} from '../../beat/BeatContext';
import {divisionBeats} from '../../beat/envelopes';
import {patternPulse} from '../../beat/patterns';
import {Type} from '../../type/Type';
import {typeSettingsSchema} from '../../type/model';
import {useCanvas} from '../canvas';
import {defineSketch} from '../define';

const bogle = font('test', 'BBH Bogle');
const schema = z.object({call: typeSettingsSchema, response: typeSettingsSchema,
  paper: z.string(), coral: z.string()});

const Poster: React.FC<z.output<typeof schema>> = ({call, response, paper, coral}) => {
  const {aspect, vmin} = useCanvas();
  const time = useBeat();
  const wide = aspect > 1.2;
  const answer = patternPulse(time.beat, divisionBeats(response.division, time.beatsPerBar),
    time.totalBeats, response.pattern ?? {steps: [1]}, response.offsetBeats ?? 0,
    {attack: response.attack ?? 0, decay: response.decay ?? 0.5, curve: response.curve ?? 2});
  return <AbsoluteFill style={{background: '#101010'}}>
    <div style={{position: 'absolute', left: wide ? '5%' : '7%', top: '6%',
      width: wide ? '39%' : '86%', height: 0.55 * vmin, background: paper,
      rotate: '-3deg'}} />
    <div style={{position: 'absolute', left: wide ? '53%' : '13%', top: wide ? '12%' : '58%',
      width: wide ? '42%' : '80%', height: wide ? '77%' : '34%', background: coral,
      translate: `0 ${-0.7 * vmin * answer}px`}} />
    <div style={{position: 'absolute', left: wide ? '52%' : '11%', top: wide ? '10%' : '56%',
      width: 1.5 * vmin, height: wide ? '8%' : '4%', background: paper}} />
    <div style={{position: 'absolute', inset: 0, rotate: '-3deg'}}>
      <Type font={bogle} settings={call} channel="call" align="left"
        x={wide ? 0.06 : 0.08} y={wide ? 0.14 : 0.115}
        width={wide ? 0.405 : 0.84} height={wide ? 0.70 : 0.385} fontSize={60}
        color={paper} unitStyle={({energy}) => ({scale: (wide ? 1.45 : 1.65) - 0.15 * energy,
          translate: `${0.6 * vmin * energy}px 0`, transformOrigin: 'left center'})} />
    </div>
    <Type font={bogle} settings={response} channel="response" align="left"
      x={wide ? 0.57 : 0.19} y={wide ? 0.19 : 0.615}
      width={wide ? 0.34 : 0.68} height={wide ? 0.61 : 0.265} fontSize={48}
      color="#101010" unitStyle={({energy}) => ({scale: 1.65 - 0.15 * energy,
        translate: `0 ${-0.7 * vmin * energy}px`, transformOrigin: 'left center'})} />
    <div style={{position: 'absolute', left: '7%', bottom: '4%', width: wide ? '18%' : '26%',
      height: 0.55 * vmin, background: paper}} />
    <div style={{position: 'absolute', right: '7%', bottom: '4%', width: 4 * vmin,
      height: 0.55 * vmin, background: coral}} />
  </AbsoluteFill>;
};

export default defineSketch({id: 'off-grid', title: 'Off Grid',
  description: 'A defiant declaration and a coral answer, with space between the hits.',
  schema,
  timing: {bpm: 132, bars: 4, beatsPerBar: 4, fps: 30},
  defaults: {
    call: {text: 'OFF\nGRID', split: 'line', mode: 'all', division: '1/4',
      pattern: {steps: [1, 0, 0, 0, 0, 0, 0, 0]}, attack: 0, decay: 0.65, curve: 2},
    response: {text: 'ON\nBEAT', split: 'line', mode: 'all', division: '1/4',
      pattern: {steps: [0, 0, 0, 1, 0, 0, 0, 0]}, attack: 0, decay: 0.65, curve: 2},
    paper: '#F4F0E6', coral: '#FF574F',
  },
  Component: Poster, assets: [bogle],
  types: p => [{font: bogle, settings: p.call, field: 'call'},
    {font: bogle, settings: p.response, field: 'response'}],
});
