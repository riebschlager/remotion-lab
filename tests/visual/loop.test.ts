import assert from 'node:assert/strict';
import {after, before, test} from 'node:test';
import {mkdir, mkdtemp, readFile, rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {bundle} from '@remotion/bundler';
import {openBrowser, renderStill, selectComposition} from '@remotion/renderer';
import {PNG} from 'pngjs';
import {LoopProps} from '../../src/schema';
import {fixture} from '../fixtures';
import {presetNames, resolvePreset} from '../../src/presets';
import type {LayerInstanceInput} from '../../src/layers/registry';

let serveUrl: string;
let bundleDir: string;
let browser: Awaited<ReturnType<typeof openBrowser>> | undefined;
const artifacts = path.resolve('out/loop-tests');

before(async () => {
  await mkdir(artifacts, {recursive: true});
  bundleDir = await mkdtemp(path.join(tmpdir(), 'remotion-loop-tests-'));
  serveUrl = await bundle({entryPoint: path.resolve('src/index.ts'), outDir: bundleDir});
  browser = await openBrowser('chrome');
}, {timeout: 120_000});

after(async () => {
  try { await browser?.close({silent: true}); }
  finally { if (bundleDir) await rm(bundleDir, {recursive: true, force: true}); }
});

const select = (id: string, inputProps: Record<string, unknown> = {}) =>
  selectComposition({serveUrl, id, inputProps, puppeteerInstance: browser});

const expectInvalid = (id: string, inputProps: Record<string, unknown>, message: RegExp) =>
  // Assert the field-specific message survives Remotion's browser error bridge.
  assert.rejects(selectComposition({serveUrl, id, inputProps,
    puppeteerInstance: browser}), message);

const image = async (composition: Awaited<ReturnType<typeof select>>, frame: number, label: string) => {
  const output = path.join(artifacts, `${label}-${frame}.png`);
  await renderStill({serveUrl, composition, frame, output, imageFormat: 'png',
    scale: 0.2, puppeteerInstance: browser, isProduction: false});
  return PNG.sync.read(await readFile(output));
};

/** Mean absolute RGB difference, normalized to 0..1. Compare decoded pixels,
 * not PNG encoding or JPEG noise. Frames are consecutive samples, not equal.
 */
const difference = (a: PNG, b: PNG) => {
  assert.equal(a.width, b.width);
  assert.equal(a.height, b.height);
  let sum = 0;
  for (let i = 0; i < a.data.length; i++) if (i % 4 !== 3) sum += Math.abs(a.data[i] - b.data[i]);
  return sum / (a.width * a.height * 3 * 255);
};

// These offsets place the seam between hits. Test long-lived overlapping
// generations, odd meter, negative offsets, frame rounding and 60fps as well.
const cases: Array<{name: string; props: LoopProps}> = [
  {name: 'smooth-background', props: {...fixture,
    background: {...fixture.background, pulseAmount: 0},
    rings: {...fixture.rings, enabled: false}}},
  {name: 'offset-tails', props: {...fixture,
    background: {...fixture.background, offsetBeats: 0.5},
    rings: {...fixture.rings, offsetBeats: 0.5}}},
  {name: 'short-odd-meter', props: {...fixture, bars: 1, beatsPerBar: 3,
    background: {...fixture.background, offsetBeats: -0.25},
    rings: {...fixture.rings, offsetBeats: -0.25, lifeSteps: 8}}},
  {name: 'rounded-60fps', props: {...fixture, bpm: 127, fps: 60, bars: 2,
    background: {...fixture.background, offsetBeats: 0.5},
    rings: {...fixture.rings, offsetBeats: 0.5}}},
];

for (const {name, props} of cases) {
  test(`rendered seam has ordinary neighboring motion: ${name}`, async (t) => {
    const composition = await select('BeatLoop', props);
    const n = composition.durationInFrames;
    // Render deliberately out of order; retain the source PNGs for inspection.
    const first = await image(composition, 0, name);
    const penultimate = await image(composition, n - 2, name);
    const last = await image(composition, n - 1, name);
    const second = await image(composition, 1, name);
    const seam = difference(last, first);
    const neighbors = (difference(penultimate, last) + difference(first, second)) / 2;
    t.diagnostic(`seam=${seam.toFixed(6)}, neighboring motion=${neighbors.toFixed(6)}`);
    assert(neighbors > 0.00001, 'Fixture must contain visible motion');
    // Small rasterization floor plus a bounded multiple accommodates curvature
    // and antialiasing. This is a fixture regression heuristic, not a proof.
    assert(seam <= neighbors * 2 + 0.001, `Unexpected seam jump in ${name}`);
    const repeated = await image(composition, 0, `${name}-repeat`);
    assert.equal(difference(first, repeated), 0, 'Frame changed after out-of-order rendering');
  });
}

test('an intentional beat attack at the seam matches an interior beat attack', async () => {
  const props = {...fixture,
    background: {...fixture.background, rotationsPerLoop: 0},
    rings: {...fixture.rings, enabled: false}};
  const composition = await select('BeatLoop', props);
  const last = await image(composition, composition.durationInFrames - 1, 'attack');
  const first = await image(composition, 0, 'attack');
  const preHit = await image(composition, 14, 'attack');
  const hit = await image(composition, 15, 'attack');
  assert(difference(last, first) > 0.001, 'Fixture must contain a visible beat attack');
  assert.equal(difference(last, preHit), 0);
  assert.equal(difference(first, hit), 0);
});

test('actual registered defaults are clean and both entry points enforce validation', async () => {
  const loop = await select('BeatLoop');
  const seam = await select('SeamCheck');
  assert.deepEqual(loop.props, seam.props, 'Both views must start with the same authored defaults');
  assert.equal((loop.props as LoopProps).debug.enabled, false);
  assert.equal(loop.durationInFrames, 240);
  assert.equal(seam.durationInFrames, 60);
  for (const id of ['BeatLoop', 'SeamCheck']) {
    await expectInvalid(id, {bpm: 0}, /bpm/);
    await expectInvalid(id, {rings: {enabled: true}}, /rings/);
    await expectInvalid(id, {bars: 1, rings: {...fixture.rings, division: '4 bars'}}, /rings.division/);
    await expectInvalid(id, {bpm: 127, timingMode: 'exact'}, /exact requires a whole-frame loop/);
  }
  const explicitClean = await select('BeatLoop', {debug: {enabled: false}});
  const diagnostic = await select('BeatLoop', {debug: {enabled: true}});
  const cleanImage = await image(loop, 0, 'default-clean');
  assert.equal(difference(cleanImage, await image(explicitClean, 0, 'explicit-clean')), 0);
  assert(difference(cleanImage, await image(diagnostic, 0, 'debug')) > 0.001);
});

test('SeamCheck shows the same boundary frames as BeatLoop, including a short loop', async () => {
  for (const [name, input] of [
    ['normal', {}],
    ['short', {bars: 1, beatsPerBar: 1, bpm: 220}],
  ] as const) {
    const loop = await select('BeatLoop', input);
    const seam = await select('SeamCheck', input);
    const lead = Math.min(Math.floor(loop.durationInFrames / 2), loop.fps);
    assert.equal(difference(
      await image(loop, loop.durationInFrames - 1, `${name}-loop`),
      await image(seam, lead - 1, `${name}-seam`)), 0);
    assert.equal(difference(
      await image(loop, 0, `${name}-loop`),
      await image(seam, lead, `${name}-seam`)), 0);
  }
});

for (const preset of presetNames) {
  test(`preset renders the resolved look and closes its seam: ${preset}`, async () => {
    // Put the boundary between hits to assess continuity separately from attacks.
    const input = {preset, overrides: {
      background: {offsetBeats: 0.5}, rings: {offsetBeats: 0.5},
    }};
    const expected = resolvePreset(input);
    const loop = await select('PresetLoop', input);
    const direct = await select('BeatLoop', expected);
    const seam = await select('PresetSeamCheck', input);
    assert.equal(loop.fps, expected.fps);
    assert.equal(loop.durationInFrames, direct.durationInFrames);
    const n = loop.durationInFrames;
    const first = await image(loop, 0, preset);
    const last = await image(loop, n - 1, preset);
    const before = await image(loop, n - 2, preset);
    const second = await image(loop, 1, preset);
    const neighboringMotion = (difference(before, last) + difference(first, second)) / 2;
    assert(neighboringMotion > 0.00001);
    assert(difference(last, first) <= neighboringMotion * 2 + 0.001);
    assert.equal(difference(first, await image(direct, 0, `${preset}-direct`)), 0);
    const lead = Math.min(Math.floor(n / 2), loop.fps);
    assert.equal(difference(first, await image(seam, lead, `${preset}-seam`)), 0);
    assert.equal(difference(last, await image(seam, lead - 1, `${preset}-seam`)), 0);
    assert.equal(difference(first, await image(loop, 0, `${preset}-repeat`)), 0);
  });
}

test('preset controls reject invalid selection and overrides through both metadata entry points', async () => {
  const initial = await select('PresetLoop');
  const initialSeam = await select('PresetSeamCheck');
  assert.deepEqual(initial.props, {preset: 'neon-orbit', overrides: {}});
  assert.deepEqual(initial.props, initialSeam.props);
  for (const id of ['PresetLoop', 'PresetSeamCheck']) {
    await expectInvalid(id, {preset: 'missing'}, /preset/);
    await expectInvalid(id, {preset: 'amber-echo', overrides: {rings: {thikness: 10}}}, /overrides.rings/);
    await expectInvalid(id, {preset: 'amber-echo', overrides: {bars: 1, rings: {division: '4 bars'}}}, /rings.division/);
  }
});

test('registry layerOrder changes the rendered stacking order', async () => {
  const normal = await select('BeatLoop');
  const reversed = await select('BeatLoop', {layerOrder: ['rings', 'background']});
  assert(difference(await image(normal, 0, 'order-normal'), await image(reversed, 0, 'order-reversed')) > 0.001);
});

test('explicit default instances preserve legacy pixels and do not depend on unused layerOrder', async () => {
  const legacy = await select('BeatLoop');
  const explicit = await select('BeatLoop', {layers: [
    {id: 'background', type: 'background'}, {id: 'rings', type: 'rings'},
  ], layerOrder: ['rings', 'background']});
  for (const frame of [0, 23]) assert.equal(difference(
    await image(legacy, frame, 'legacy-instance'), await image(explicit, frame, 'explicit-instance')), 0);
});

test('each repeated ring contributes independent color, timing and blending to the rendered stack', async () => {
  const layers: LayerInstanceInput[] = [
    {id: 'back', type: 'background'},
    {id: 'pink', type: 'rings', props: {color: '#ff6699', division: '1/2', offsetBeats: 0.5, opacity: 0.7}},
    {id: 'cyan', type: 'rings', props: {color: '#55ddff', division: '1/8', offsetBeats: 0.25, opacity: 0.7}},
  ];
  const full = await image(await select('BeatLoop', {layers}), 9, 'multiple-rings');
  for (const index of [1, 2]) {
    const disabled = layers.map((layer, i) => i === index ? {...layer, props: {...layer.props, enabled: false}} : layer);
    assert(difference(full, await image(await select('BeatLoop', {layers: disabled}), 9, `without-${index}`)) > 0.0001);
  }
  for (const [label, patch] of [
    ['color', {color: '#ffff00'}], ['timing', {division: '1/4', offsetBeats: -0.5}], ['blend', {blendMode: 'multiply'}],
  ] as const) {
    const modified: LayerInstanceInput[] = layers.map((layer) => layer.id === 'cyan' && layer.type === 'rings'
      ? {...layer, props: {...layer.props, ...patch}} : layer);
    assert(difference(full, await image(await select('BeatLoop', {layers: modified}), 9, `instance-${label}`)) > 0.0001);
  }
  const covered = [layers[1], layers[2], layers[0]];
  assert(difference(full, await image(await select('BeatLoop', {layers: covered}), 9, 'instance-order')) > 0.0001);
});

test('ring identity is independent of position in the array and produces distinct drift per ID', async () => {
  const ring: LayerInstanceInput = {id: 'stable', type: 'rings', props: {offsetBeats: 0.5}};
  const first = await image(await select('BeatLoop', {layers: [ring]}), 23, 'stable-ring');
  const disabled: LayerInstanceInput = {id: 'disabled', type: 'rings', props: {enabled: false}};
  for (const layers of [[disabled, ring], [ring, disabled]]) {
    assert.equal(difference(first, await image(await select('BeatLoop', {layers}), 23, `stable-${layers[0].id}`)), 0);
  }
  const other = await image(await select('BeatLoop', {layers: [{...ring, id: 'other'}]}), 23, 'other-ring');
  assert(difference(first, other) > 0.0001);
});

test('all entry points reject duplicate IDs and per-instance division errors', async () => {
  const duplicates = [{id: 'same', type: 'rings'}, {id: 'same', type: 'rings'}];
  const invalid = [{id: 'too-slow', type: 'rings', props: {division: '4 bars'}}];
  for (const id of ['BeatLoop', 'SeamCheck']) {
    await expectInvalid(id, {layers: duplicates}, /Duplicate layer ID/);
    await expectInvalid(id, {bars: 1, layers: invalid}, /too-slow.*division/);
  }
  for (const id of ['PresetLoop', 'PresetSeamCheck']) {
    await expectInvalid(id, {preset: 'prism-stack', overrides: {layers: duplicates}}, /Duplicate layer ID/);
    await expectInvalid(id, {preset: 'prism-stack', overrides: {bars: 1, layers: invalid}}, /too-slow.*division/);
  }
});
