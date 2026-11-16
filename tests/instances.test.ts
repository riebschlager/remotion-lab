import assert from 'node:assert/strict';
import {test} from 'node:test';
import {stepRandom} from '../src/beat/envelopes';
import {instanceSeed} from '../src/layers/InstanceContext';
import {configuredLayers, type LayerInstanceInput} from '../src/layers/registry';
import {getLoopMetadata, getSeamMetadata} from '../src/metadata';
import {resolvePreset} from '../src/presets';
import {validateLoopProps} from '../src/validation';
import {fixture} from './fixtures';

const instances: LayerInstanceInput[] = [
  {id: 'pink', type: 'rings', props: {color: '#ff6699', division: '1/2', offsetBeats: 0.5,
    blendMode: 'screen', opacity: 0.6}},
  {id: 'cyan', type: 'rings', props: {color: '#55ddff', division: '1/8', offsetBeats: -0.25,
    blendMode: 'plus-lighter', opacity: 0.3}},
];

test('repeated layers keep independent props, defaults, IDs and array order', () => {
  const props = validateLoopProps({...fixture, layers: instances});
  const layers = configuredLayers(props);
  assert.deepEqual(layers.map(({id, type}) => [id, type]), [['pink', 'rings'], ['cyan', 'rings']]);
  assert.deepEqual(layers[0].props, {...fixture.rings, ...instances[0].props});
  assert.deepEqual(layers[1].props, {...fixture.rings, ...instances[1].props});
  assert.notEqual(layers[0].props, layers[1].props);
  layers[0].props.opacity = 0.1;
  assert.equal(layers[1].props.opacity, 0.3);
  assert.equal(fixture.rings.opacity, 1);
  const reversed = configuredLayers(validateLoopProps({...fixture, layers: [...instances].reverse(),
    layerOrder: ['rings', 'background']}));
  assert.deepEqual(reversed.map(({id}) => id), ['cyan', 'pink']);
});

test('the instance stack replaces the legacy stack, including an intentionally empty stack', () => {
  assert.deepEqual(configuredLayers(validateLoopProps({...fixture, layers: []})), []);
  assert.deepEqual(configuredLayers(fixture).map(({id}) => id), ['background', 'rings']);
  assert.deepEqual(configuredLayers(validateLoopProps({...fixture, layers: [{id: 'only', type: 'rings'}]}))
    .map(({type}) => type), ['rings']);
  const backgroundCopies = validateLoopProps({...fixture, layers: [
    {id: 'dark', type: 'background'}, {id: 'light', type: 'background', props: {opacity: 0.5}},
  ]});
  assert.equal(configuredLayers(backgroundCopies).length, 2);
});

test('type-level controls provide defaults without replacing explicit instance settings', () => {
  const result = resolvePreset({preset: 'amber-echo', overrides: {
    rings: {thickness: 20, color: '#ffffff'}, layers: instances,
  }});
  const layers = configuredLayers(result);
  assert.deepEqual(layers[0].props, {...result.rings, ...instances[0].props});
  assert.deepEqual(layers[1].props, {...result.rings, ...instances[1].props});
});

test('instance errors identify malformed entries, unknown types and duplicate IDs', () => {
  for (const layers of [
    [{id: '', type: 'rings'}],
    [{id: 'not valid', type: 'rings'}],
    [{id: 'x', type: 'missing'}],
    [{id: 'x', type: 'rings', props: {thikness: 10}}],
    [{id: 'x', type: 'background', props: {thickness: 10}}],
    [{id: 'x', type: 'rings', props: {opacity: 2}}],
    [{id: 'x', type: 'rings'}, {id: 'x', type: 'background'}],
    [{id: 'x', type: 'rings'}, {id: 'x', type: 'rings', props: {enabled: false}}],
  ]) {
    assert.throws(() => getLoopMetadata({...fixture, layers}), /layers/);
    assert.throws(() => getSeamMetadata({...fixture, layers}), /layers/);
  }
});

test('musical validation names the specific instance and ignores disabled musical constraints', () => {
  const layers: LayerInstanceInput[] = [
    {id: 'valid', type: 'rings'},
    {id: 'too-slow', type: 'rings', props: {division: '4 bars'}},
  ];
  assert.throws(() => validateLoopProps({...fixture, bars: 1, layers}), /layers.1\(too-slow\).props.division/);
  layers[1].props = {...layers[1].props, enabled: false};
  assert.doesNotThrow(() => validateLoopProps({...fixture, bars: 1, layers}));
  // Unused legacy timing templates may be superseded by a valid instance.
  assert.doesNotThrow(() => validateLoopProps({...fixture, bars: 1,
    rings: {...fixture.rings, division: '4 bars'},
    layers: [{id: 'valid', type: 'rings', props: {division: '1/4'}}]}));
});

test('instance seeds are distinct, stable under reorder, and preserve the original default seeds', () => {
  assert.equal(instanceSeed('rings', 'rings', 'x'), 'rings-x');
  assert.equal(instanceSeed('rings', 'rings', 'squash'), 'rings-squash');
  const seeds = Object.fromEntries(instances.map(({id, type}) => [id, instanceSeed(type, id, 'x')]));
  for (const {id, type} of [...instances].reverse()) assert.equal(instanceSeed(type, id, 'x'), seeds[id]);
  assert.notEqual(seeds.pink, seeds.cyan);
  assert.notEqual(stepRandom(seeds.pink, 3), stepRandom(seeds.cyan, 3));
  assert.notEqual(instanceSeed('rings', 'a-b', 'c'), instanceSeed('rings', 'a', 'b-c'));
});

test('Prism Stack has three independent rings and array overrides replace it without mutating the preset', () => {
  const prism = resolvePreset({preset: 'prism-stack'});
  const rings = configuredLayers(prism).filter(({type}) => type === 'rings');
  assert.equal(rings.length, 3);
  assert.equal(new Set(rings.map(({props}) => props.division)).size, 3);
  assert.equal(new Set(rings.map(({id}) => id)).size, 3);
  assert.equal(resolvePreset({preset: 'prism-stack', overrides: {layers: []}}).layers?.length, 0);
  const replacement = resolvePreset({preset: 'prism-stack', overrides: {layers: [instances[0]]}});
  assert.deepEqual(configuredLayers(replacement).map(({id}) => id), ['pink']);
  replacement.layers![0].id = 'changed';
  assert.equal(resolvePreset({preset: 'prism-stack'}).layers![0].id, 'backdrop');
});
