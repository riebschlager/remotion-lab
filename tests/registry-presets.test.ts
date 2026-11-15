import assert from 'node:assert/strict';
import {test} from 'node:test';
import {baseLayerSchema} from '../src/layers/base';
import {defineLayer} from '../src/layers/definition';
import {configuredLayers, layerNames, layerRegistry} from '../src/layers/registry';
import {createLoopDefaults, loopSchema} from '../src/schema';
import {getLoopMetadata, getPresetMetadata, getPresetSeamMetadata} from '../src/metadata';
import {loopOverridesSchema, loopPresets, presetNames, resolvePreset} from '../src/presets';
import {validateLoopProps} from '../src/validation';
import {fixture} from './fixtures';

test('registry supplies complete, independent defaults for every registered layer', () => {
  const a = createLoopDefaults();
  const b = createLoopDefaults();
  assert.deepEqual(a, fixture, 'Registry migration must preserve the original look');
  assert.deepEqual(configuredLayers(a).map(({name}) => name), layerNames);
  for (const name of layerNames) {
    assert.deepEqual(a[name], layerRegistry[name].defaults);
    assert.notEqual(a[name], b[name]);
    assert.notEqual(a[name], layerRegistry[name].defaults);
  }
  a.rings.color = '#ffffff';
  assert.equal(b.rings.color, '#7fe7ff');
  assert.equal(createLoopDefaults().rings.color, '#7fe7ff');
});

test('omitted layers receive defaults; incomplete explicit legacy layers still fail', () => {
  const minimal = {bpm: 120, bars: 4, beatsPerBar: 4, fps: 30, debug: {enabled: false}};
  assert.deepEqual(validateLoopProps(minimal), fixture);
  assert.throws(() => validateLoopProps({...minimal, rings: {enabled: true}}), /rings/);
});

test('layer ordering is configurable and requires every registered name exactly once', () => {
  const reversed = [...layerNames].reverse();
  const props = validateLoopProps({...fixture, layerOrder: reversed});
  assert.deepEqual(configuredLayers(props).map(({name}) => name), reversed);
  for (const order of [[], ['background'], ['background', 'background'], ['background', 'typo']]) {
    assert.throws(() => validateLoopProps({...fixture, layerOrder: order}), /layerOrder/);
  }
});

test('layer definitions support local constraints and skip musical checks when disabled', () => {
  const definition = defineLayer({
    schema: baseLayerSchema,
    defaults: fixture.background,
    Component: () => null,
    validate: (props, timing) => props.offsetBeats > timing.beatsPerBar ? ['offsetBeats: outside this layer’s supported range'] : [],
  });
  assert.deepEqual(definition.validate({...fixture.background, offsetBeats: 4}, {...fixture, beatsPerBar: 3}),
    ['offsetBeats: outside this layer’s supported range']);
  assert.deepEqual(definition.validate({...fixture.background, enabled: false, division: '4 bars'}, {...fixture, bars: 1}), []);
  assert.throws(() => defineLayer({schema: baseLayerSchema,
    defaults: {...fixture.background, opacity: 2}, Component: () => null}), /opacity/);
});

test('every named preset resolves to valid clean config and matching loop/seam metadata', () => {
  for (const preset of presetNames) {
    const props = resolvePreset({preset});
    assert.deepEqual(loopSchema.parse(props), props);
    assert.equal(props.debug.enabled, false);
    assert.deepEqual(getPresetMetadata({preset}), {
      fps: props.fps, durationInFrames: getLoopMetadata(props).durationInFrames,
    });
    assert.equal(getPresetSeamMetadata({preset}).durationInFrames,
      Math.min(getPresetMetadata({preset}).durationInFrames, props.fps * 2));
  }
  assert.deepEqual(resolvePreset({preset: 'neon-orbit'}), fixture);
  assert.equal(resolvePreset({preset: 'amber-echo'}).bpm, 100);
  assert.equal(resolvePreset({preset: 'midnight-drift'}).rings.enabled, false);
});

test('preset overrides merge individual layer fields with the selected look', () => {
  const saved = resolvePreset({preset: 'amber-echo'});
  const customized = resolvePreset({preset: 'amber-echo', overrides: {
    bpm: 128, bars: 16, fps: 60, rings: {thickness: 20}, debug: {enabled: true},
    layerOrder: ['rings', 'background'],
  }});
  assert.equal(customized.rings.thickness, 20);
  assert.equal(customized.rings.color, saved.rings.color);
  assert.equal(customized.rings.division, saved.rings.division);
  assert.equal(customized.background.colorA, saved.background.colorA);
  assert.equal(customized.debug.enabled, true);
  assert.equal(getPresetMetadata({preset: 'amber-echo', overrides: {bpm: 128, bars: 16, fps: 60}}).durationInFrames, 1800);
  assert.deepEqual(customized.layerOrder, ['rings', 'background']);
  assert.equal(resolvePreset({preset: 'amber-echo'}).rings.thickness, 10);
  assert.equal(loopPresets['amber-echo'].overrides.rings.color, '#ffc76b');
});

test('empty layer override objects keep all saved preset parameters', () => {
  const saved = resolvePreset({preset: 'amber-echo'});
  assert.deepEqual(resolvePreset({preset: 'amber-echo', overrides: {rings: {}, background: {}}}), saved);
  // The object-level {} default used by Studio does not fill optional fields.
  assert.deepEqual(loopOverridesSchema.parse({rings: {}}).rings, {});
});

test('preset errors reject unknown names, misspelled overrides and invalid musical combinations', () => {
  for (const input of [
    {preset: 'unknown'},
    {preset: 'neon-orbit', overrides: {bpm: '128'}},
    {preset: 'neon-orbit', overrides: {ring: {color: '#ffffff'}}},
    {preset: 'neon-orbit', overrides: {rings: {thikness: 20}}},
    {preset: 'neon-orbit', overrides: {rings: null}},
    {preset: 'neon-orbit', overrides: {bpm: 127, timingMode: 'exact'}},
    {preset: 'neon-orbit', overrides: {bars: 1, rings: {division: '4 bars'}}},
  ]) assert.throws(() => resolvePreset(input), /Invalid .* configuration/);
  assert.doesNotThrow(() => resolvePreset({preset: 'neon-orbit', overrides: {
    bars: 1, rings: {enabled: false, division: '4 bars'},
  }}));
});
