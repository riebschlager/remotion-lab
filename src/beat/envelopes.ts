/**
 * Beat-locked motion vocabulary. Every function here is pure: given beat
 * position (or loop phase) it returns a value. No state, no randomness that
 * isn't seeded — Remotion renders frames in parallel and out of order.
 */
import {random} from 'remotion';
import {noise3D} from '@remotion/noise';
import {mod} from './timing';
import {divisionFitsLoop} from './divisions';

export {mod};

// ---------------------------------------------------------------------------
// Divisions
// ---------------------------------------------------------------------------

export {DIVISIONS, divisionBeats, divisionFitsLoop} from './divisions';
export type {Division} from './divisions';

// ---------------------------------------------------------------------------
// Step clock — the workhorse
// ---------------------------------------------------------------------------

export type Step = {
  /** 0 → 1 inside the current step */
  phase: number;
  /** Which step of the loop we're in, 0 → stepsPerLoop - 1 */
  index: number;
  stepsPerLoop: number;
  /** Beats elapsed since the current step started */
  age: number;
};

/**
 * Divide the loop into steps of `stepBeats`, shifted by `offsetBeats`.
 * Offsets wrap around the loop, so a step that starts before the seam
 * continues after it.
 */
export const step = (
  beat: number,
  stepBeats: number,
  totalBeats: number,
  offsetBeats = 0,
): Step => {
  if (!divisionFitsLoop(stepBeats, totalBeats)) {
    throw new Error(`Step length ${stepBeats} must fit a whole number of times in ${totalBeats} beats.`);
  }
  const local = mod(beat - offsetBeats, totalBeats);
  const stepsPerLoop = Math.max(1, Math.round(totalBeats / stepBeats));
  const index = Math.floor(local / stepBeats) % stepsPerLoop;
  const age = local - index * stepBeats;
  return {phase: age / stepBeats, index, stepsPerLoop, age};
};

// ---------------------------------------------------------------------------
// Envelopes (input 0 → 1, output 0 → 1)
// ---------------------------------------------------------------------------

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Attack/decay hit. `attack` and `decay` are fractions of the step.
 * attack = 0 (default) means the hit is at full strength ON the beat frame;
 * any attack > 0 makes the peak land after the beat.
 * `curve` > 1 makes the tail snappier, < 1 makes it linger.
 */
export const pulse = (
  phase: number,
  {attack = 0, decay = 0.6, curve = 2}: {attack?: number; decay?: number; curve?: number} = {},
) => {
  if (phase < attack) return attack <= 0 ? 1 : phase / attack;
  const t = clamp01((phase - attack) / Math.max(decay, 1e-6));
  return Math.pow(1 - t, curve);
};

/**
 * Decay measured in beats since a hit at `hitBeat`, wrapped across the loop.
 * Use for tails longer than one step (e.g. a crash that rings for 3 beats).
 * A single-hit envelope cannot exceed the loop; use overlapping events (as
 * Rings does) when multiple generations must be alive at the same time.
 */
export const decaySince = (
  beat: number,
  hitBeat: number,
  lengthBeats: number,
  totalBeats: number,
  curve = 2,
) => {
  if (!Number.isFinite(lengthBeats) || !Number.isFinite(totalBeats) || lengthBeats <= 0 || totalBeats <= 0 || lengthBeats > totalBeats) {
    throw new Error('decaySince lengthBeats must be positive and no longer than totalBeats; use overlapping events for longer tails.');
  }
  if (!Number.isFinite(curve) || curve <= 0) throw new Error('decaySince curve must be positive and finite.');
  const since = mod(beat - hitBeat, totalBeats);
  return since >= lengthBeats ? 0 : Math.pow(1 - since / lengthBeats, curve);
};

/** Smooth 0 → 1 → 0 bump. */
export const bump = (phase: number) => 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);
export const easeInOutSine = (t: number) => 0.5 - 0.5 * Math.cos(clamp01(t) * Math.PI);

// ---------------------------------------------------------------------------
// LFOs — whole cycles per loop only
// ---------------------------------------------------------------------------

export type LfoShape = 'sine' | 'triangle' | 'saw' | 'square';

/**
 * Periodic motion locked to the loop. Require whole, nonnegative cycle counts
 * instead of silently changing the requested motion. Zero holds a constant.
 * Saw/square waves intentionally jump; periodic does not mean continuous.
 * Output range: -1 → 1.
 */
export const lfo = (loopPhase: number, cycles = 1, shape: LfoShape = 'sine', phaseOffset = 0) => {
  if (!Number.isInteger(cycles) || cycles < 0) throw new Error('lfo cycles must be a nonnegative integer.');
  const p = mod(loopPhase * cycles + phaseOffset, 1);
  switch (shape) {
    case 'sine':
      return Math.sin(p * Math.PI * 2);
    case 'triangle':
      return 1 - 4 * Math.abs(p - 0.5);
    case 'saw':
      return p * 2 - 1;
    case 'square':
      return p < 0.5 ? 1 : -1;
  }
};

// ---------------------------------------------------------------------------
// Loopable noise + seeded randomness
// ---------------------------------------------------------------------------

/**
 * Noise that loops: samples 3D noise around a circle so phase 0 and phase 1
 * hit the same point. `radius` controls how much the noise wanders over the
 * loop (higher = busier). `z` lets you pull independent channels.
 * Output range: roughly -1 → 1.
 */
export const loopNoise = (seed: string, loopPhase: number, radius = 1, z = 0) => {
  const a = loopPhase * Math.PI * 2;
  return noise3D(seed, Math.cos(a) * radius, Math.sin(a) * radius, z);
};

/**
 * Deterministic random value for a given step. Wrap your index into the loop
 * (e.g. Step.index) so the same step always gets the same value.
 * Output range: 0 → 1.
 */
export const stepRandom = (seed: string, index: number, channel = 0) =>
  random(`${seed}-${index}-${channel}`);
