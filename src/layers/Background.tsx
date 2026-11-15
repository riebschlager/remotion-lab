import React from 'react';
import {AbsoluteFill, interpolateColors} from 'remotion';
import {z} from 'zod';
import {useBeat} from '../beat/BeatContext';
import {divisionBeats, pulse, step} from '../beat/envelopes';
import {backgroundSchema} from '../schema';

type Props = z.infer<typeof backgroundSchema>;

/**
 * Example layer 1: a gradient that pulses from colorA toward colorB on every
 * step and rotates a whole number of times per loop.
 */
export const Background: React.FC<Props> = ({
  colorA,
  colorB,
  pulseAmount,
  rotationsPerLoop,
  division,
  offsetBeats,
}) => {
  const {beat, totalBeats, beatsPerBar, loopPhase} = useBeat();

  const s = step(beat, divisionBeats(division, beatsPerBar), totalBeats, offsetBeats);
  const hit = pulse(s.phase, {decay: 0.7, curve: 3}) * pulseAmount;

  const center = interpolateColors(hit, [0, 1], [colorA, colorB]);
  const angle = loopPhase * 360 * rotationsPerLoop;

  return (
    <AbsoluteFill
      style={{
        background: `
          radial-gradient(circle at 50% 50%, ${center} 0%, transparent 70%),
          linear-gradient(${angle}deg, ${colorA}, ${colorB} 140%)
        `,
      }}
    />
  );
};
