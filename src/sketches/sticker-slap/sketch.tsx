import React from 'react';
import {AbsoluteFill} from 'remotion';
import {zColor} from '@remotion/zod-types';
import {z} from 'zod';
import {clip, font} from '../../assets';
import {ClipFrame} from '../../assets/ClipFrame';
import {useBeat} from '../../beat/BeatContext';
import {divisionBeats, pulse, step, stepRandom} from '../../beat/envelopes';
import {divisionSchema} from '../../beat/divisions';
import {useCanvas} from '../canvas';
import {defineSketch, divisionIssues, useAsset, useSketch} from '../define';

const tunnel = clip('test', 'slapchop-video-20260824-205001-10s.mp4');
const face = clip('test', 'Fun Love Sticker by Tarver.gif');
const bogle = font('test', 'BBH Bogle');

const schema = z.object({
  /** The sticker swells on this grid; the word answers half a step later. */
  division: divisionSchema,
  /** The sticker's wobble plays once per step of this grid. */
  wobbleDivision: divisionSchema,
  /** The backdrop cuts to another part of the video on this grid. */
  cutDivision: divisionSchema,
  word: z.string().min(1).max(10),
  wordColor: zColor(),
});

/** A wobbling sticker and one word over a collage video that cuts on the bar. */
const StickerSlap: React.FC<z.output<typeof schema>> = ({division, wobbleDivision, cutDivision, word, wordColor}) => {
  const {beat, totalBeats, beatsPerBar, effectiveBpm} = useBeat();
  const {width, height, vmin, cx, cy} = useCanvas();
  const {seed} = useSketch();
  const backdrop = useAsset(tunnel);
  const sticker = useAsset(face);
  const type = useAsset(bogle);

  // Backdrop: each cut starts somewhere new in the video and plays forward at
  // its native speed. The video does not loop, so its cut is placed on a hit.
  const cutBeats = divisionBeats(cutDivision, beatsPerBar);
  const cut = step(beat, cutBeats, totalBeats);
  const span = cutBeats * (60 / effectiveBpm) * backdrop.fps;
  const start = Math.floor(stepRandom(seed('cut'), cut.index) * Math.max(1, backdrop.frameCount - Math.ceil(span)));

  // Sticker: the wobble loops on its own, so it simply cycles with the beat.
  const stepBeats = divisionBeats(division, beatsPerBar);
  const wobble = step(beat, divisionBeats(wobbleDivision, beatsPerBar), totalBeats);
  const hit = pulse(step(beat, stepBeats, totalBeats).phase, {decay: 0.6});
  const answer = pulse(step(beat, stepBeats, totalBeats, stepBeats / 2).phase, {decay: 0.5});

  const box = 56 * vmin;
  const fontSize = 18 * vmin;
  const top = cy - (box + 3 * vmin + fontSize) / 2;
  return (
    <AbsoluteFill>
      <ClipFrame clip={backdrop} frame={start + cut.phase * span} width={width} height={height} fit="cover" />
      <div style={{position: 'absolute', left: cx - box / 2, top, width: box, height: box,
        transform: `scale(${0.82 + 0.18 * hit})`}}>
        <ClipFrame clip={sticker} frame={wobble.phase * sticker.frameCount} width={box} height={box} />
      </div>
      <div style={{position: 'absolute', left: 0, width, top: top + box + 3 * vmin, textAlign: 'center',
        fontFamily: type.fontFamily, fontSize, lineHeight: 1, color: wordColor, whiteSpace: 'nowrap',
        WebkitTextStroke: `${0.6 * vmin}px black`, paintOrder: 'stroke fill',
        transform: `scale(${1 + 0.16 * answer})`}}>
        {word}
      </div>
    </AbsoluteFill>
  );
};

export default defineSketch({
  id: 'sticker-slap',
  title: 'Sticker Slap',
  description: 'A wobbling smiley sticker and one word in BBH Bogle over a collage video that cuts on the bar.',
  schema,
  defaults: {division: '1/4', wobbleDivision: '1/2', cutDivision: '1 bar', word: 'LOVE', wordColor: '#fff200'},
  Component: StickerSlap,
  assets: [tunnel, face, bogle],
  validate: (props, timing) => {
    const [regular] = bogle.faces;
    const unset = [...new Set(props.word)].filter((character) =>
      character !== ' ' && (character < '!' || character > '~' || regular.missingAscii.includes(character)));
    return [
      ...divisionIssues('division', props.division, timing),
      ...divisionIssues('wobbleDivision', props.wobbleDivision, timing),
      ...divisionIssues('cutDivision', props.cutDivision, timing),
      ...(unset.length ? [`word: ${bogle.family} cannot draw ${unset.map((character) => `"${character}"`).join(', ')}`] : []),
    ];
  },
  debugDivisions: (props) => [props.division, props.wobbleDivision, props.cutDivision],
});
