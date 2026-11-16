import React from 'react';
import {AbsoluteFill, interpolateColors} from 'remotion';
import {zColor} from '@remotion/zod-types';
import {z} from 'zod';
import {useBeat} from '../../beat/BeatContext';
import {divisionBeats, loopNoise, pulse, step, stepRandom} from '../../beat/envelopes';
import {divisionSchema} from '../../beat/divisions';
import {useCanvas} from '../canvas';
import {defineSketch, divisionIssues, useSketch} from '../define';
import {UseLayer} from '../UseLayer';

const schema = z.object({
  division: divisionSchema,
  /** Cells across the shorter side of the canvas. */
  density: z.number().int().min(3).max(24),
  /** Beats the hit takes to travel from the center to the farthest corner. */
  rippleBeats: z.number().min(0).max(4).step(0.25),
  color: zColor(),
  accentColor: zColor(),
  /** Share of cells that flash the accent color on any given hit. */
  accentChance: z.number().min(0).max(1).step(0.01),
  backdropA: zColor(),
  backdropB: zColor(),
});

/** A grid of tiles that swell on each hit, rippling outward from a drifting center. */
const PulseGrid: React.FC<z.output<typeof schema>> = ({
  division, density, rippleBeats, color, accentColor, accentChance, backdropA, backdropB,
}) => {
  const {beat, totalBeats, beatsPerBar, loopPhase} = useBeat();
  const {width, height, vmin} = useCanvas();
  const {seed} = useSketch();

  const cell = Math.min(width, height) / density;
  const columns = Math.ceil(width / cell);
  const rows = Math.ceil(height / cell);
  const left = (width - columns * cell) / 2;
  const top = (height - rows * cell) / 2;
  // The ripple's origin wanders on looping noise, so it returns home at the seam.
  const originX = width / 2 + loopNoise(seed('origin-x'), loopPhase, 0.7) * 18 * vmin;
  const originY = height / 2 + loopNoise(seed('origin-y'), loopPhase, 0.7) * 18 * vmin;
  const reach = Math.hypot(width, height) / 2;
  const stepLen = divisionBeats(division, beatsPerBar);

  const tiles = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const x = left + (column + 0.5) * cell;
      const y = top + (row + 0.5) * cell;
      const distance = Math.min(1, Math.hypot(x - originX, y - originY) / reach);
      // Delaying a cell is an offset on its own wrapped grid: hits that leave
      // the center before the seam still arrive at the edges after it.
      const hit = step(beat, stepLen, totalBeats, distance * rippleBeats);
      const energy = pulse(hit.phase, {decay: 0.85, curve: 2.5});
      const accent = stepRandom(seed('accent'), hit.index, row * columns + column) < accentChance;
      const size = cell * (0.12 + 0.74 * energy);
      tiles.push(
        <rect key={`${row}-${column}`} x={x - size / 2} y={y - size / 2} width={size} height={size}
          rx={size * 0.22} opacity={0.25 + 0.75 * energy}
          fill={accent ? interpolateColors(energy, [0, 1], [color, accentColor]) : color} />,
      );
    }
  }

  return (
    <AbsoluteFill>
      <UseLayer id="backdrop" type="background"
        props={{colorA: backdropA, colorB: backdropB, division, pulseAmount: 0.35}} />
      <AbsoluteFill style={{mixBlendMode: 'screen'}}>
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>{tiles}</svg>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export default defineSketch({
  id: 'pulse-grid',
  title: 'Pulse Grid',
  description: 'Tiles swell on every hit and ripple outward from a drifting center.',
  schema,
  defaults: {
    division: '1/4', density: 9, rippleBeats: 1, color: '#58e6ff', accentColor: '#ff5fa8',
    accentChance: 0.18, backdropA: '#05071a', backdropB: '#2a1458',
  },
  Component: PulseGrid,
  validate: (props, timing) => divisionIssues('division', props.division, timing),
  debugDivisions: (props) => [props.division],
});
