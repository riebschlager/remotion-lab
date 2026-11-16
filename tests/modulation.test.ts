import assert from 'node:assert/strict';
import {test} from 'node:test';
import {beatSignal, mapColor, mapRange, modulateColor, modulateDisplacement, modulateNumber,
  resolveModulation, sampleSignal, type Modulation, type ModulationContext} from '../src/beat/modulation';
import {getBeatState} from '../src/beat/timing';
import {configuredLayers} from '../src/layers/registry';
import {instanceSeed} from '../src/layers/InstanceContext';
import {getLoopMetadata, getSeamMetadata} from '../src/metadata';
import {resolvePreset} from '../src/presets';
import {validateLoopProps} from '../src/validation';
import {fixture} from './fixtures';

const near = (a: number, b: number, tolerance = 1e-8) => assert(Math.abs(a - b) < tolerance, `${a} ≈ ${b}`);
const context = (frame = 0, id = 'rings'): ModulationContext => ({
  time: getBeatState(frame, fixture), division: '1/4', offsetBeats: 0,
  seed: (channel) => instanceSeed('rings', id, channel),
});

test('LFO signals normalize bipolar values to 0..1 and support constant zero-cycle motion', () => {
  near(sampleSignal({type: 'lfo'}, context(0)), 0.5);
  near(sampleSignal({type: 'lfo'}, context(60)), 1);
  near(sampleSignal({type: 'lfo'}, context(180)), 0);
  near(sampleSignal({type: 'lfo', cycles: 0, phaseOffset: 0.25}, context(123)), 1);
  assert.equal(sampleSignal({type: 'lfo', shape: 'square'}, context(0)), 1);
});

test('beat sources inherit patterns and offsets, with independent rhythm overrides and exact swing onsets', () => {
  const inherited = {...context(), pattern: {steps: [0, 1, 0, 0]}};
  assert.equal(beatSignal(inherited), 0);
  assert.equal(beatSignal({...inherited, time: context(15).time}), 1);
  assert.equal(beatSignal(inherited, {pattern: null}), 1);
  near(beatSignal(context(15), {offsetBeats: 0.5}), (1 - 0.5 / 0.6) ** 2);
  near(sampleSignal({type: 'beat', division: '1/8', pattern: {steps: [0, 1, 0, 0], swing: 1 / 3}}, context(10)), 1);
  near(beatSignal({...context(), pattern: {steps: [0.25, 0, 1, 0]}}), 0.25);
});

test('looping noise is deterministic, instance-namespaced, and continuous across the wrap', () => {
  const source = {type: 'noise', channel: 'position', radius: 0.8} as const;
  const first = sampleSignal(source, context(73, 'a'));
  assert(first >= 0 && first <= 1);
  for (const frame of [120, 0, 239, 73]) sampleSignal(source, context(frame, 'a'));
  assert.equal(sampleSignal(source, context(73, 'a')), first);
  assert.notEqual(sampleSignal(source, context(73, 'b')), first);
  const atStart = context(0, 'a');
  near(sampleSignal(source, {...atStart, time: {...atStart.time, loopPhase: 1 - 1e-9}}), sampleSignal(source, atStart), 1e-6);
  near(sampleSignal(source, context(0, 'a')), sampleSignal(source, context(240, 'a')));
});

test('signals combine by weighted mean, tolerate large weights, and mute zero-weight sources', () => {
  const high = {type: 'lfo', cycles: 0, phaseOffset: 0.25, weight: 1} as const;
  const low = {type: 'lfo', cycles: 0, phaseOffset: 0.75, weight: 3} as const;
  near(sampleSignal([high, low], context()), 0.25);
  near(sampleSignal([{...high, weight: Number.MAX_VALUE}, {...low, weight: Number.MAX_VALUE}], context()), 0.5);
  assert.equal(sampleSignal({type: 'beat', division: '4 bars', weight: 0}, {...context(), time: getBeatState(0, {...fixture, bars: 1})}), 0);
  assert.equal(sampleSignal([{...high, weight: 0}, {...low, weight: 0}], context()), 0);
  assert.throws(() => sampleSignal({...high, weight: -1}, context()), /nonnegative/);
});

test('numeric and color mapping clamp endpoints, allow reversed ranges, and reject nonfinite values', () => {
  assert.equal(mapRange(-1, [10, 20]), 10);
  assert.equal(mapRange(2, [10, 20]), 20);
  assert.equal(mapRange(0.25, [10, -10]), 5);
  assert.equal(mapRange(0.5, [-Number.MAX_VALUE, Number.MAX_VALUE]), 0);
  assert.equal(mapColor(0.5, ['#000000', '#ffffff']), 'rgba(128, 128, 128, 1)');
  assert.equal(mapColor(-1, ['#000000', '#ffffff']), 'rgba(0, 0, 0, 1)');
  assert.equal(mapColor(2, ['#000000', '#ffffff']), 'rgba(255, 255, 255, 1)');
  assert.throws(() => mapRange(NaN, [0, 1]), /finite/);
  assert.throws(() => mapRange(0, [0, Infinity]), /finite/);
});

test('shared target helpers map scale, rotation, color and independent pixel displacement', () => {
  const high = {type: 'lfo', cycles: 0, phaseOffset: 0.25} as const;
  near(modulateNumber({signal: high, range: [0.8, 1.2]}, context()), 1.2);
  assert.equal(modulateColor({signal: high, range: ['#000000', '#ffffff']}, context()), 'rgba(255, 255, 255, 1)');
  assert.deepEqual(modulateDisplacement({x: {signal: high, range: [-40, 40]}}, context()), {x: 40, y: 0});
  assert.deepEqual(resolveModulation(null, context()), {scale: 1, rotation: 0, color: undefined, displacement: {x: 0, y: 0}});
  assert.deepEqual(resolveModulation({}, context()), resolveModulation(undefined, context()));
});

test('smooth mappings approach the same value across the seam and remain deterministic', () => {
  const mapping: Modulation = {
    scale: {signal: {type: 'lfo', cycles: 2}, range: [0.8, 1.2]},
    rotation: {signal: {type: 'noise', channel: 'turn'}, range: [-30, 30]},
    displacement: {x: {signal: [{type: 'noise'}, {type: 'lfo', cycles: 3}], range: [-100, 100]}},
  };
  const first = resolveModulation(mapping, context());
  const c = context();
  const end = resolveModulation(mapping, {...c, time: {...c.time, loopPhase: 1 - 1e-9}});
  near(first.scale, end.scale, 1e-6);
  near(first.rotation, end.rotation, 1e-6);
  near(first.displacement.x, end.displacement.x, 1e-5);
  resolveModulation(mapping, context(79));
  assert.deepEqual(resolveModulation(mapping, context()), first);
});

test('schema validation rejects malformed sources, targets, ranges and colors', () => {
  for (const modulation of [
    {scale: {signal: {type: 'lfo', cycles: 0.5}, range: [1, 2]}},
    {scale: {signal: {type: 'lfo'}, range: [-1, 2]}},
    {rotation: {signal: [], range: [0, 1]}},
    {rotation: {signal: {type: 'missing'}, range: [0, 1]}},
    {rotation: {signal: {type: 'noise', radius: -1}, range: [0, 1]}},
    {rotation: {signal: {type: 'lfo', weight: -1}, range: [0, 1]}},
    {rotation: {signal: {type: 'beat', curve: 0}, range: [0, 1]}},
    {rotation: {signal: {type: 'lfo'}, range: [0, Infinity]}},
    {color: {signal: {type: 'noise'}, range: ['not-a-color', '#ffffff']}},
    {displacement: {z: {signal: {type: 'lfo'}, range: [0, 1]}}},
  ]) assert.throws(() => getLoopMetadata({...fixture, rings: {...fixture.rings, modulation}}), /rings.modulation/);
});

test('musical validation checks each beat source and reports its target and instance', () => {
  const signal = {type: 'beat', division: '4 bars'};
  for (const metadata of [getLoopMetadata, getSeamMetadata]) {
    assert.throws(() => metadata({...fixture, bars: 1, layers: [{id: 'motion', type: 'rings', props: {
      modulation: {scale: {signal, range: [1, 1.2]}},
    }}]}), /motion.*modulation.scale.signal.division/);
    assert.doesNotThrow(() => metadata({...fixture, bars: 1, layers: [{id: 'motion', type: 'rings', props: {
      modulation: {scale: {signal: {...signal, weight: 0}, range: [1, 1.2]}},
    }}]}));
    assert.throws(() => metadata({...fixture, layers: [{id: 'motion', type: 'rings', props: {
      modulation: {rotation: {signal: {type: 'beat', pattern: {steps: [1, 0, 0]}}, range: [0, 10]}},
    }}]}), /motion.*modulation.rotation.signal.pattern.steps/);
    assert.throws(() => metadata({...fixture, bars: 1, rings: {...fixture.rings, pattern: {steps: [1, 0, 0, 0]},
      modulation: {scale: {signal: {type: 'beat', division: '1/2'}, range: [1, 1.2]}}}}), /modulation.scale.signal.pattern.steps/);
  }
});

test('instance modulation overrides or clears inherited settings; preset resolution stays isolated', () => {
  const inherited = {scale: {signal: {type: 'lfo', cycles: 1}, range: [1, 1.2]}};
  const props = validateLoopProps({...fixture, rings: {...fixture.rings, modulation: inherited}, layers: [
    {id: 'a', type: 'rings'}, {id: 'b', type: 'rings', props: {modulation: null}},
  ]});
  assert.deepEqual(configuredLayers(props)[0].props.modulation, inherited);
  assert.equal(configuredLayers(props)[1].props.modulation, null);
  const preset = resolvePreset({preset: 'modulation-orbit'});
  const layer = configuredLayers(preset).find(({id}) => id === 'breathing-rings')!;
  assert(layer.props.modulation?.scale);
  layer.props.modulation.scale.range[0] = 0;
  assert.equal(configuredLayers(resolvePreset({preset: 'modulation-orbit'}))
    .find(({id}) => id === 'breathing-rings')!.props.modulation!.scale!.range[0], 0.94);
});
