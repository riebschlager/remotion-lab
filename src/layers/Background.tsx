import React from 'react';
import {AbsoluteFill, interpolateColors} from 'remotion';
import {z} from 'zod';
import {useBeat} from '../beat/BeatContext';
import {zColor} from '@remotion/zod-types';
import {baseLayerSchema} from './base';
import {defineLayer} from './definition';
import {beatSignal} from '../beat/modulation';
import {useLayerInstance} from './InstanceContext';
import {useLayerModulation} from './LayerModulation';

export const backgroundSchema = baseLayerSchema.extend({
  colorA: zColor(),
  colorB: zColor(),
  /** How far the pulse pushes from A toward B */
  pulseAmount: z.number().min(0).max(1).step(0.01),
  /** Gradient rotations per loop (whole numbers only) */
  rotationsPerLoop: z.number().int().min(0).max(8),
});

type Props = z.infer<typeof backgroundSchema>;

/**
 * A gradient that pulses from colorA toward colorB on rhythm hits and rotates
 * a whole number of times per loop.
 */
export const Background: React.FC<Props> = ({
  colorA,
  colorB,
  pulseAmount,
  rotationsPerLoop,
  division,
  offsetBeats,
  pattern,
}) => {
  const time = useBeat();
  const {seed} = useLayerInstance();
  const {color: modulatedColor} = useLayerModulation();
  const hit = beatSignal({time, seed, division, offsetBeats, pattern}, {decay: 0.7, curve: 3}) * pulseAmount;

  const center = modulatedColor ?? interpolateColors(hit, [0, 1], [colorA, colorB]);
  const angle = time.loopPhase * 360 * rotationsPerLoop;

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

export const backgroundLayer = defineLayer({
  schema: backgroundSchema,
  defaults: {
    enabled: true, opacity: 1, blendMode: 'normal', division: '1/4', offsetBeats: 0,
    colorA: '#0b0b1a', colorB: '#3a1d6e', pulseAmount: 0.6, rotationsPerLoop: 1,
  },
  Component: Background,
});
