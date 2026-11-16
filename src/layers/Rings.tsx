import React from 'react';
import {AbsoluteFill, useVideoConfig} from 'remotion';
import {z} from 'zod';
import {useBeat} from '../beat/BeatContext';
import {
  divisionBeats,
  easeOutCubic,
  loopNoise,
  mod,
  pulse,
  step,
  stepRandom,
} from '../beat/envelopes';
import {zColor} from '@remotion/zod-types';
import {baseLayerSchema} from './base';
import {defineLayer} from './definition';
import {useLayerInstance} from './InstanceContext';

export const ringsSchema = baseLayerSchema.extend({
  color: zColor(),
  accentColor: zColor(),
  /** Every Nth ring uses the accent color (0 = never) */
  accentEvery: z.number().int().min(0).max(16),
  /** How long each ring lives, in steps */
  lifeSteps: z.number().int().min(1).max(16),
  maxRadius: z.number().min(100).max(1400).step(10),
  thickness: z.number().min(1).max(80).step(1),
  /** How far the center wanders, in px (loopable noise) */
  drift: z.number().min(0).max(300).step(1),
});

type Props = z.infer<typeof ringsSchema>;

/**
 * Example layer 2: a ring is born on every step and expands for `lifeSteps`
 * steps. Rings born near the end of the loop keep expanding after the seam,
 * because age is computed from wrapped beat position, not from a counter.
 */
export const Rings: React.FC<Props> = ({
  color,
  accentColor,
  accentEvery,
  lifeSteps,
  maxRadius,
  thickness,
  drift,
  division,
  offsetBeats,
}) => {
  const {width, height} = useVideoConfig();
  const {seed} = useLayerInstance();
  const {beat, totalBeats, beatsPerBar, loopPhase} = useBeat();

  const stepLen = divisionBeats(division, beatsPerBar);
  const s = step(beat, stepLen, totalBeats, offsetBeats);

  // Loopable drift of the emitter center.
  const cx = width / 2 + loopNoise(seed('x'), loopPhase, 0.8) * drift;
  const cy = height / 2 + loopNoise(seed('y'), loopPhase, 0.8) * drift;

  const rings = [];
  for (let k = 0; k < lifeSteps; k++) {
    // k = 0 is the ring born this step, k = 1 the previous one, etc.
    const ageSteps = s.phase + k; // 0 → lifeSteps
    const life = ageSteps / lifeSteps; // 0 → 1
    const bornIndex = mod(s.index - k, s.stepsPerLoop);

    const r = easeOutCubic(life) * maxRadius;
    const fade = 1 - life;
    const isAccent = accentEvery > 0 && bornIndex % accentEvery === 0;

    // Seeded per-ring variation — same ring, same values, every loop.
    const squash = 0.85 + stepRandom(seed('squash'), bornIndex) * 0.3;
    const rot = stepRandom(seed('rot'), bornIndex) * 180;

    rings.push(
      <ellipse
        key={k}
        cx={cx}
        cy={cy}
        rx={r}
        ry={r * squash}
        transform={`rotate(${rot} ${cx} ${cy})`}
        fill="none"
        stroke={isAccent ? accentColor : color}
        strokeWidth={thickness * (0.4 + 0.6 * fade)}
        opacity={fade}
      />,
    );
  }

  // A core that punches on each step.
  const core = pulse(s.phase, {decay: 0.5, curve: 2});

  return (
    <AbsoluteFill>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {rings}
        <circle cx={cx} cy={cy} r={30 + core * 50} fill={color} opacity={0.4 + core * 0.6} />
      </svg>
    </AbsoluteFill>
  );
};

export const ringsLayer = defineLayer({
  schema: ringsSchema,
  defaults: {
    enabled: true, opacity: 1, blendMode: 'screen', division: '1/4', offsetBeats: 0,
    color: '#7fe7ff', accentColor: '#ff4fa3', accentEvery: 4, lifeSteps: 3,
    maxRadius: 900, thickness: 14, drift: 80,
  },
  Component: Rings,
});
