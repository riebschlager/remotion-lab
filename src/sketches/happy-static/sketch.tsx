import React from 'react';
import {AbsoluteFill} from 'remotion';
import {zColor} from '@remotion/zod-types';
import {z} from 'zod';
import {clip} from '../../assets';
import {Clip} from '../../assets/Clip';
import {clipPlaybackSchema} from '../../assets/clipPlayback';
import {useBeat} from '../../beat/BeatContext';
import {divisionBeats, lfo} from '../../beat/envelopes';
import {divisionSchema} from '../../beat/divisions';
import {beatPatternSchema, patternIssues, patternPulse} from '../../beat/patterns';
import {useCanvas} from '../canvas';
import {defineSketch, divisionIssues, useAsset} from '../define';

const smile = clip('test', 'Fun Love Sticker by Tarver.gif');
const collage = clip('test', 'slapchop-video-20260824-205001-10s.mp4');
const schema = z.object({
  sticker: clipPlaybackSchema, backdrop: clipPlaybackSchema,
  responseDivision: divisionSchema, responsePattern: beatPatternSchema,
  responseOffset: z.number(), characterSize: z.number().min(35).max(65),
  blue: zColor(), yellow: zColor(), ink: zColor(),
});
const HappyStatic: React.FC<z.output<typeof schema>> = (p) => {
  const {beat, totalBeats, beatsPerBar, loopPhase} = useBeat();
  const {width, height, vmin, aspect} = useCanvas();
  const answer = patternPulse(beat, divisionBeats(p.responseDivision, beatsPerBar), totalBeats,
    p.responsePattern, p.responseOffset, {attack: 0.12, decay: 0.85, curve: 1.6});
  const wide = aspect > 1;
  const size = p.characterSize * vmin;
  const cx = width * (wide ? 0.58 : 0.52);
  const cy = height * (wide ? 0.52 : 0.54);
  const sway = lfo(loopPhase, 2, 'sine');
  const drift = lfo(loopPhase, 1, 'sine');
  const windowW = (wide ? 62 : 77) * vmin;
  const windowH = (wide ? 73 : 92) * vmin;
  const windowX = cx - windowW * (wide ? 0.88 : 0.55);
  const windowY = cy - windowH * (wide ? 0.62 : 0.72);
  return <AbsoluteFill style={{backgroundColor: p.ink, overflow: 'hidden'}}>
    <div style={{position: 'absolute', left: windowX, top: windowY, width: windowW,
      height: windowH, backgroundColor: p.blue, rotate: `${-9 + 2 * sway}deg`,
      border: `${0.7 * vmin}px solid ${p.blue}`, overflow: 'hidden',
      borderRadius: `${2 * vmin}px`}}>
      <Clip clip={useAsset(collage)} playback={p.backdrop} channel="collage-call" fit="cover" width={windowW / width} height={windowH / height}
        style={{opacity: 0.78}} />
    </div>
    <div style={{position: 'absolute', left: cx - size * 0.59, top: cy - size * 0.5,
      width: size * 1.17, height: size * 1.05, backgroundColor: p.yellow,
      borderRadius: '44% 55% 48% 42%', rotate: `${9 + 4 * sway}deg`,
      translate: `${2 * drift * vmin}px ${-1.2 * sway * vmin}px`}} />
    <Clip clip={useAsset(smile)} playback={p.sticker} channel="smiley-answer"
      x={(cx - size / 2) / width} y={(cy - size / 2) / height}
      width={size / width} height={size / height}
      style={{translate: `${1.5 * drift * vmin}px ${(-6 * answer - 1.2 * sway) * vmin}px`,
        rotate: `${-6 + 5 * sway + 10 * answer}deg`,
        transform: `scale(${1 + 0.09 * answer}, ${1 - 0.06 * answer})`}} />
    {[0, 1].map((i) => <div key={i} style={{position: 'absolute',
      left: cx + size * (0.56 + i * 0.07), top: cy - size * (0.34 - i * 0.15),
      width: (7 + 3 * answer) * vmin, height: 2.1 * vmin,
      backgroundColor: i ? p.yellow : p.blue, borderRadius: 2 * vmin,
      rotate: `${-35 + i * 42 + 12 * answer}deg`, opacity: 0.7 + 0.3 * answer}} />)}
  </AbsoluteFill>;
};
export default defineSketch({
  id: 'happy-static', title: 'Happy Static',
  description: 'A blue grinning sticker answers a wonky collage window in swung, yellow-and-blue bursts.',
  schema, timing: {bpm: 116, bars: 4, beatsPerBar: 4},
  defaults: {
    sticker: {mode: 'scrub', division: '1/4', signal: {type: 'lfo', cycles: 4, shape: 'sine', phaseOffset: 0.25}},
    backdrop: {mode: 'fit', duration: {bars: 1}, cut: 'fade', offsetBeats: 0.5},
    responseDivision: '1/8', responsePattern: {steps: [0, 1, 0, 0.35, 0, 0.8, 0.5, 0], swing: 0.24},
    responseOffset: 0.25, characterSize: 53, blue: '#173dff', yellow: '#ffe735', ink: '#080c1c',
  },
  Component: HappyStatic, assets: [smile, collage],
  clips: (p) => [{clip: smile, playback: p.sticker, field: 'sticker'}, {clip: collage, playback: p.backdrop, field: 'backdrop'}],
  validate: (p, timing) => [...divisionIssues('responseDivision', p.responseDivision, timing),
    ...patternIssues(p.responsePattern, divisionBeats(p.responseDivision, timing.beatsPerBar), timing.bars * timing.beatsPerBar)
      .map((issue) => `responsePattern.${issue}`)],
  debugDivisions: (p) => [p.responseDivision],
});
