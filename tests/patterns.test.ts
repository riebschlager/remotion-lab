import assert from 'node:assert/strict';
import {test} from 'node:test';
import {beatPatterns, patternEvents, patternHits, patternIssues, patternPulse} from '../src/beat/patterns';
import {configuredLayers} from '../src/layers/registry';
import {getLoopMetadata, getSeamMetadata} from '../src/metadata';
import {resolvePreset} from '../src/presets';
import {validateLoopProps} from '../src/validation';
import {fixture} from './fixtures';

const near = (a: number, b: number) => assert(Math.abs(a - b) < 1e-8, `${a} ≈ ${b}`);

test('rests remove hits while accents preserve strength and original grid identity', () => {
  const hits = patternHits({steps: [1, 0, 0.4, 0]}, 0.5, 4);
  assert.deepEqual(hits.map(({index, beat, strength}) => [index, beat, strength]),
    [[0, 0, 1], [2, 1, 0.4], [4, 2, 1], [6, 3, 0.4]]);
  assert.deepEqual(hits.map(({patternIndex}) => patternIndex), [0, 2, 0, 2]);
});

test('swing delays alternate slots, preserves pair length, and repeats at 2:1 timing', () => {
  const hits = patternHits({steps: [1, 1, 1, 1], swing: 1 / 3}, 0.5, 2);
  [0, 2 / 3, 1, 5 / 3].forEach((beat, i) => near(hits[i].beat, beat));
  near(hits[2].beat - hits[0].beat, 1);
  const pattern = {steps: [0, 1, 0, 0], swing: 1 / 3};
  // Frame 10 at 120 BPM / 30fps is exactly this musical position. Floating
  // arithmetic must not postpone the attack by an entire rendered frame.
  near(patternPulse(2 / 3, 0.5, 16, pattern), 1);
  assert.equal(patternPulse(2 / 3 - 1e-5, 0.5, 16, pattern), 0);
});

test('weighted envelopes peak on hits, skip rests, and preserve previous tails', () => {
  const pattern = {steps: [0.25, 0, 1, 0]};
  near(patternPulse(0, 1, 4, pattern), 0.25);
  near(patternPulse(2, 1, 4, pattern), 1);
  assert.equal(patternPulse(1, 1, 4, pattern), 0);
  near(patternPulse(0.2, 1, 4, pattern), 0.25 * (1 - 0.2 / 0.6) ** 2);
  near(patternPulse(1, 1, 4, {steps: [1, 0.1, 0, 0]}, 0, {decay: 2}), 0.25);
});

test('all-rest patterns have no events or pulse; zero swing is straight timing', () => {
  assert.deepEqual(patternHits({steps: [0, 0]}, 0.5, 4), []);
  assert.deepEqual(patternEvents(0, 0.5, 4, {steps: [0, 0]}, 0, 12), []);
  assert.equal(patternPulse(0, 0.5, 4, {steps: [0, 0]}), 0);
  assert.deepEqual(patternHits({steps: [1, 0.5], swing: 0}, 1, 4), patternHits({steps: [1, 0.5]}, 1, 4));
});

test('events continue through rests and the seam, with previous loop generations for long tails', () => {
  const pattern = {steps: [0, 1]};
  const before = patternEvents(4 - 1e-7, 0.5, 4, pattern, 0, 1)[0];
  const after = patternEvents(0, 0.5, 4, pattern, 0, 1)[0];
  assert.equal(before.index, 7);
  assert.equal(after.index, 7);
  near(before.age + 1e-7, after.age);
  near(after.age, 0.5);
  const living = patternEvents(0.5, 1, 2, {steps: [1, 0]}, 0, 5);
  assert.deepEqual(living.map(({index, age, generation}) => [index, age, generation]),
    [[0, 0.5, 0], [0, 2.5, 1], [0, 4.5, 2]]);
  near(patternEvents(1.2, 0.5, 2, {steps: [1, 0, 0, 0]}, 0, 2)[0].age, 1.2);
});

test('offsets wrap swung events deterministically, including negative beat positions', () => {
  const pattern = beatPatterns.shuffle;
  const a = patternEvents(0, 0.5, 4, pattern, -0.25, 2);
  const b = patternEvents(4, 0.5, 4, pattern, 3.75, 2);
  assert.deepEqual(a.map(({index}) => index), b.map(({index}) => index));
  a.forEach((event, i) => near(event.age, b[i].age));
  const negative = patternEvents(-0.1, 0.5, 4, pattern, -0.25, 2);
  const wrapped = patternEvents(3.9, 0.5, 4, pattern, -0.25, 2);
  negative.forEach((event, i) => near(event.age, wrapped[i].age));
  for (const beat of [2, 0, 3, -1, 0.2]) patternEvents(beat, 0.5, 4, pattern, -0.25, 2);
  assert.deepEqual(patternEvents(0, 0.5, 4, pattern, -0.25, 2), a);
});

test('pattern length must fit the loop; swing needs complete pairs while straight odd meters work', () => {
  assert.deepEqual(patternIssues({steps: [1, 0.5, 0]}, 1, 3), []);
  assert(patternIssues({steps: [1, 0.5, 0], swing: 0.2}, 1, 3).some((message) => /even/.test(message)));
  assert(patternIssues({steps: [1, 0, 0, 1]}, 0.5, 3).some((message) => /whole number/.test(message)));
  for (const pattern of [{steps: []}, {steps: [-0.1, 1]}, {steps: [NaN]}, {steps: [2]},
    {steps: [1, 0], swing: 1}, {steps: [1, 0], swing: -0.1}]) {
    assert.throws(() => patternHits(pattern, 1, 4), /pattern/);
  }
  assert.throws(() => patternEvents(NaN, 1, 4, {steps: [1]}), /finite/);
});

test('shared validation covers pattern schemas, loop compatibility and per-instance paths', () => {
  for (const metadata of [getLoopMetadata, getSeamMetadata]) {
    for (const pattern of [{steps: []}, {steps: [1.5]}, {steps: [1, 0], swing: 1}, {steps: [1, 0], typo: true}]) {
      assert.throws(() => metadata({...fixture, rings: {...fixture.rings, pattern}}), /rings.pattern/);
    }
    assert.throws(() => metadata({...fixture, bars: 1, layers: [{id: 'bad', type: 'rings', props: {
      pattern: {steps: [1, 0, 0, 0, 0, 0, 0, 0]},
    }}]}), /bad.*pattern.steps/);
    assert.doesNotThrow(() => metadata({...fixture, bars: 1, layers: [{id: 'disabled', type: 'rings', props: {
      enabled: false, pattern: {steps: [1, 0, 0, 0, 0, 0, 0, 0]},
    }}]}));
  }
});

test('each instance can override or clear an inherited pattern without mutating shared defaults', () => {
  const props = validateLoopProps({...fixture, rings: {...fixture.rings, pattern: beatPatterns.shuffle}, layers: [
    {id: 'inherited', type: 'rings'}, {id: 'straight', type: 'rings', props: {pattern: null}},
    {id: 'custom', type: 'rings', props: {pattern: {steps: [0, 1]}}},
  ]});
  const layers = configuredLayers(props);
  assert.deepEqual(layers[0].props.pattern, beatPatterns.shuffle);
  assert.equal(layers[1].props.pattern, null);
  assert.deepEqual(layers[2].props.pattern, {steps: [0, 1]});
  const preset = resolvePreset({preset: 'swing-session'});
  const shuffle = configuredLayers(preset).find(({id}) => id === 'shuffle')!;
  shuffle.props.pattern!.steps[0] = 0;
  assert.equal(configuredLayers(resolvePreset({preset: 'swing-session'})).find(({id}) => id === 'shuffle')!.props.pattern!.steps[0], 1);
  assert.equal(beatPatterns.shuffle.steps[0], 1);
});
