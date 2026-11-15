import assert from 'node:assert/strict';
import {test} from 'node:test';
import {decaySince, divisionBeats, divisionFitsLoop, lfo, loopNoise, mod, pulse, step, stepRandom} from '../src/beat/envelopes';
import {getBeatState, getLoopDurationInFrames, isFrameExact} from '../src/beat/timing';
import {getLoopMetadata, getSeamMetadata} from '../src/metadata';
import {validateLoopProps} from '../src/validation';
import {fixture} from './fixtures';

const near = (a: number, b: number, tolerance = 1e-8) =>
  assert(Math.abs(a - b) < tolerance, `Expected ${a} ≈ ${b}`);

test('known tempos derive duration, beat position and effective tempo', () => {
  assert.equal(getLoopDurationInFrames(fixture), 240);
  const beat = getBeatState(15, fixture);
  assert.equal(beat.beat, 1);
  assert.equal(beat.beatPhase, 0);
  assert.equal(beat.effectiveBpm, 120);
  assert.equal(getLoopDurationInFrames({...fixture, bpm: 128, bars: 16}), 900);
  assert(isFrameExact({...fixture, bpm: 128, bars: 16}));
  assert(!isFrameExact({...fixture, bpm: 127}));
  near(getBeatState(0, {...fixture, bpm: 127}).effectiveBpm, 126.87224669603525);
});

test('the clock wraps negative frames and supports nonsequential evaluation', () => {
  const duration = getLoopDurationInFrames(fixture);
  const expected = getBeatState(17, fixture);
  for (const frame of [duration - 1, 0, 113, -1, 17 + duration * 3, 1]) getBeatState(frame, fixture);
  assert.deepEqual(getBeatState(17, fixture), expected);
  assert.deepEqual(getBeatState(-1, fixture), getBeatState(duration - 1, fixture));
  assert.deepEqual(getBeatState(duration, fixture), getBeatState(0, fixture));
  assert.equal(getBeatState(duration - 1, fixture).frame, duration - 1);
});

test('bar divisions scale with meter; incompatible and nonfinite divisions fail', () => {
  assert.equal(divisionBeats('1 bar', 3), 3);
  assert.equal(divisionBeats('2 bars', 7), 14);
  assert.equal(divisionBeats('1/8', 3), 0.5);
  for (const [division, total] of [[2, 3], [0, 16], [-1, 16], [1, 0], [NaN, 16], [1, Infinity]]) {
    assert(!divisionFitsLoop(division, total));
    assert.throws(() => step(0, division, total), /whole number/);
  }
});

test('offsets wrap event identity and age continuously across the loop boundary', () => {
  const before = step(16 - 1e-7, 1, 16, 0.5);
  const after = step(0, 1, 16, 0.5);
  assert.equal(before.index, 15);
  assert.equal(after.index, 15);
  near(after.age - before.age, 1e-7);
  near(after.phase, 0.5);
  assert.deepEqual(step(0, 1, 16, -0.5), step(0, 1, 16, 15.5));
  assert.deepEqual(step(0, 1, 16, 0.5), step(0, 1, 16, 32.5));
});

test('ring generations retain their birth randomness as the step changes', () => {
  // A live ring moves from k=0 to k=1 at the next hit; its seed must not change.
  const before = step(15.99999, 1, 16);
  const after = step(0, 1, 16);
  const birthBefore = mod(before.index, before.stepsPerLoop);
  const birthAfter = mod(after.index - 1, after.stepsPerLoop);
  assert.equal(birthBefore, birthAfter);
  assert.equal(stepRandom('ring', birthBefore), stepRandom('ring', birthAfter));
  near(after.phase + 1 - before.phase, 0.00001);
});

test('single-hit decay continues across the seam and rejects unsupported long tails', () => {
  near(decaySince(0, 15, 3, 16), (2 / 3) ** 2);
  near(decaySince(16 - 1e-7, 15, 3, 16), decaySince(0, 15, 3, 16), 1e-6);
  assert.equal(decaySince(2, 15, 3, 16), 0);
  near(decaySince(16 - 1e-7, 0, 16, 16), 0);
  for (const length of [0, -1, 17, Infinity, NaN]) {
    assert.throws(() => decaySince(0, 0, length, 16), /no longer than/);
  }
  assert.throws(() => decaySince(0, 0, 1, 16, 0), /curve/);
});

test('smooth LFOs and circular noise approach the same value from both sides', () => {
  for (const offset of [0, 0.17, -0.25]) {
    for (const shape of ['sine', 'triangle'] as const) {
      near(lfo(1 - 1e-8, 3, shape, offset), lfo(0, 3, shape, offset), 1e-6);
    }
  }
  for (const seed of ['x', 'y']) {
    near(loopNoise(seed, 1 - 1e-8), loopNoise(seed, 0), 1e-6);
    assert.equal(loopNoise(seed, 0.37), loopNoise(seed, 0.37));
  }
  assert.equal(lfo(0.25, 0), 0);
  for (const cycles of [0.5, -1, NaN, Infinity]) assert.throws(() => lfo(0, cycles), /integer/);
});

test('a zero-attack pulse deliberately peaks at the beat and decays to zero', () => {
  assert.equal(pulse(0), 1);
  assert.equal(pulse(0.9), 0);
  assert(pulse(0.2) > pulse(0.3));
  assert.equal(pulse(0, {attack: 0.1}), 0);
  assert.equal(pulse(0.1, {attack: 0.1}), 1);
});

test('both metadata paths reject malformed CLI props and invalid enabled divisions', () => {
  for (const metadata of [getLoopMetadata, getSeamMetadata]) {
    for (const input of [{...fixture, bpm: 0}, {...fixture, fps: NaN}, {...fixture, bars: 1.5}, {...fixture, rings: {enabled: true}}]) {
      assert.throws(() => metadata(input), /Invalid loop configuration/);
    }
    assert.throws(() => metadata({...fixture, bars: 1, rings: {...fixture.rings, division: '4 bars'}}), /rings.division/);
    assert.doesNotThrow(() => metadata({...fixture, bars: 1, rings: {...fixture.rings, enabled: false, division: '4 bars'}}));
  }
});

test('visual mode allows rounding, exact mode rejects it, and older props default to visual', () => {
  assert.equal(validateLoopProps({...fixture, bpm: 127}).timingMode, 'visual');
  assert.throws(() => getLoopMetadata({...fixture, bpm: 127, timingMode: 'exact'}), /exact requires a whole-frame loop/);
  assert.doesNotThrow(() => getLoopMetadata({...fixture, bpm: 128, bars: 16, timingMode: 'exact'}));
  const oldProps: Partial<typeof fixture> = {...fixture};
  delete oldProps.timingMode;
  assert.equal(getLoopMetadata(oldProps).props.timingMode, 'visual');
});

test('seam metadata caps duration without using the diagnostic duration as loop length', () => {
  assert.equal(getLoopMetadata(fixture).durationInFrames, 240);
  assert.equal(getSeamMetadata(fixture).durationInFrames, 60);
  const short = {...fixture, bars: 1, beatsPerBar: 1, bpm: 220};
  assert.equal(getSeamMetadata(short).durationInFrames, getLoopMetadata(short).durationInFrames);
});
