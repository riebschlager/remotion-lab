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
import {patternEvents, patternPulse} from '../beat/patterns';

export const ringsSchema = baseLayerSchema.extend({
  color: zColor(),
  accentColor: zColor(),
  /** Fixed-grid mode: every Nth ring uses accentColor (0 = never).
   * Patterns instead use accentColor for full-strength (1) hits. */
  accentEvery: z.number().int().min(0).max(16),
  /** Lifetime in base divisions, including rests; swing does not stretch it. */
  lifeSteps: z.number().int().min(1).max(16),
  maxRadius: z.number().min(100).max(1400).step(10),
  thickness: z.number().min(1).max(80).step(1),
  /** How far the center wanders, in px (loopable noise) */
  drift: z.number().min(0).max(300).step(1),
});

type Props = z.infer<typeof ringsSchema>;

/**
 * A ring is born on each active rhythm hit and expands for `lifeSteps`
 * base divisions. Rings born near the end keep expanding after the seam,
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
  pattern,
}) => {
  const {width, height} = useVideoConfig();
  const {seed} = useLayerInstance();
  const {beat, totalBeats, beatsPerBar, loopPhase} = useBeat();

  const stepLen = divisionBeats(division, beatsPerBar);
  const s = pattern ? null : step(beat, stepLen, totalBeats, offsetBeats);
  const events = pattern
    ? patternEvents(beat, stepLen, totalBeats, pattern, offsetBeats, lifeSteps * stepLen)
      .map((event) => ({key: `${event.index}-${event.generation}`, ageSteps: event.age / stepLen,
        bornIndex: event.index, strength: event.strength}))
    : Array.from({length: lifeSteps}, (_, k) => ({key: `${k}`, ageSteps: s!.phase + k,
      bornIndex: mod(s!.index - k, s!.stepsPerLoop), strength: 1}));

  // Loopable drift of the emitter center.
  const cx = width / 2 + loopNoise(seed('x'), loopPhase, 0.8) * drift;
  const cy = height / 2 + loopNoise(seed('y'), loopPhase, 0.8) * drift;

  const rings = [];
  for (const {key, ageSteps, bornIndex, strength} of events) {
    const life = ageSteps / lifeSteps; // 0 → 1

    const r = easeOutCubic(life) * maxRadius;
    const fade = 1 - life;
    const isAccent = pattern ? strength === 1 : accentEvery > 0 && bornIndex % accentEvery === 0;

    // Seeded per-ring variation — same ring, same values, every loop.
    const squash = 0.85 + stepRandom(seed('squash'), bornIndex) * 0.3;
    const rot = stepRandom(seed('rot'), bornIndex) * 180;

    rings.push(
      <ellipse
        key={key}
        cx={cx}
        cy={cy}
        rx={r}
        ry={r * squash}
        transform={`rotate(${rot} ${cx} ${cy})`}
        fill="none"
        stroke={isAccent ? accentColor : color}
        strokeWidth={thickness * (0.4 + 0.6 * fade)}
        opacity={fade * strength}
      />,
    );
  }

  // A core that punches on each step.
  const core = pattern
    ? patternPulse(beat, stepLen, totalBeats, pattern, offsetBeats, {decay: 0.5, curve: 2})
    : pulse(s!.phase, {decay: 0.5, curve: 2});

  return (
    <AbsoluteFill>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {rings}
        <circle cx={cx} cy={cy} r={30 + core * 50} fill={color} opacity={pattern ? core : 0.4 + core * 0.6} />
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
