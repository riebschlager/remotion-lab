import React from 'react';
import {AbsoluteFill} from 'remotion';
import {zColor} from '@remotion/zod-types';
import {z} from 'zod';
import {useBeat} from '../../beat/BeatContext';
import {bump, loopNoise, step} from '../../beat/envelopes';
import {useCanvas} from '../canvas';
import {defineSketch, useSketch} from '../define';

const schema = z.object({
  indigo: zColor(), peach: zColor(), warmLight: zColor(),
  formSize: z.number().min(32).max(60),
  breathBars: z.number().int().min(1).max(4),
  breathDepth: z.number().min(0).max(0.18),
  answerDelay: z.number().min(0).max(6).step(0.25),
  answerStrength: z.number().min(0.2).max(1),
});

const DuskTide: React.FC<z.output<typeof schema>> = ({
  indigo, peach, warmLight, formSize, breathBars, breathDepth, answerDelay, answerStrength,
}) => {
  const {beat, totalBeats, beatsPerBar, loopPhase} = useBeat();
  const {width, height, vmin} = useCanvas();
  const {seed} = useSketch();
  const phrase = breathBars * beatsPerBar;
  const breath = bump(step(beat, phrase, totalBeats).phase);
  const answer = bump(step(beat, phrase, totalBeats, answerDelay).phase);
  const drift = loopNoise(seed('suspension'), loopPhase, 0.45);
  const size = formSize * vmin;
  const cx = width * 0.5 + drift * vmin;
  const cy = height * 0.47 - 7 * vmin + drift * 1.1 * vmin;
  const scale = size * (1 + breathDepth * breath) / 100;
  const waterY = cy + size * 0.58;
  return (
    <AbsoluteFill style={{backgroundColor: indigo}}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <defs>
          <radialGradient id="dusk-field"><stop stopColor="#393453" stopOpacity="0.6"/><stop offset="1" stopColor={indigo} stopOpacity="0"/></radialGradient>
          <linearGradient id="dusk-shell" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#b67e80"/><stop offset="0.6" stopColor={peach}/><stop offset="1" stopColor="#b77f84"/></linearGradient>
          <linearGradient id="dusk-answer"><stop stopColor={peach} stopOpacity="0"/><stop offset="0.45" stopColor={peach}/><stop offset="0.65" stopColor={warmLight}/><stop offset="1" stopColor={peach} stopOpacity="0"/></linearGradient>
        </defs>
        <ellipse cx={width * 0.5} cy={height * 0.48} rx={60 * vmin} ry={65 * vmin} fill="url(#dusk-field)"/>
        <g transform={`translate(${cx} ${cy}) rotate(${-12 + drift * 2}) scale(${scale})`}>
          <path d="M -40 -30 C -57 -4 -49 34 -17 45 C 15 57 46 32 47 4 C 37 29 12 33 -8 24 C -30 15 -39 -7 -40 -30 Z" fill="url(#dusk-shell)"/>
          <path d="M -31 29 C -15 43 10 46 30 30" fill="none" stroke={warmLight} strokeWidth="0.8" opacity={0.45 + breath * 0.23} strokeLinecap="round"/>
        </g>
        {[0, 1, 2].map((i) => {
          const spread = (15 + i * 5 + answer * (6 - i)) * vmin;
          const y = waterY + i * 3.3 * vmin - answer * 1.6 * vmin;
          return <path key={i} d={`M ${cx - spread} ${y} Q ${cx} ${y + (2.5 + answer * 1.3) * vmin} ${cx + spread} ${y}`}
            fill="none" stroke="url(#dusk-answer)" strokeWidth={(0.32 - i * 0.035) * vmin}
            opacity={(0.36 + answer * 0.58) * answerStrength * (1 - i * 0.17)} strokeLinecap="round"/>;
        })}
      </svg>
    </AbsoluteFill>
  );
};

export default defineSketch({
  id: 'dusk-tide', title: 'Dusk Tide',
  description: 'A suspended peach crescent breathes over an answering ripple in indigo dusk.',
  schema,
  defaults: {indigo: '#171b35', peach: '#ce9b91', warmLight: '#f2cf9c', formSize: 47,
    breathBars: 2, breathDepth: 0.12, answerDelay: 1.5, answerStrength: 0.85},
  timing: {bpm: 84, bars: 4, beatsPerBar: 3},
  Component: DuskTide,
  validate: (props, timing) => [
    ...(timing.bars % props.breathBars === 0 ? [] : ['breathBars: complete breaths must fit the loop']),
    ...(props.answerDelay < props.breathBars * timing.beatsPerBar ? [] : ['answerDelay: must be shorter than one breath']),
  ],
});
