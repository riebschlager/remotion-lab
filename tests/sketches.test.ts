import assert from 'node:assert/strict';
import {existsSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {z} from 'zod';
import {canvasPresets} from '../src/sketches/canvas';
import {defineSketch, divisionIssues} from '../src/sketches/define';
import {divisionSchema} from '../src/beat/divisions';
import {findSketch, sketches} from '../src/sketches';

const root = path.resolve('src/sketches');
const folders = readdirSync(root, {withFileTypes: true}).filter((entry) => entry.isDirectory()).map((entry) => entry.name);

const probe = (overrides: Partial<Parameters<typeof defineSketch>[0]> = {}) => defineSketch({
  id: 'probe', title: 'Probe', description: 'Test sketch',
  schema: z.object({division: divisionSchema, amount: z.number().min(0).max(1)}),
  defaults: {division: '1/4', amount: 0.5},
  Component: () => null,
  validate: (props, timing) => divisionIssues('division', (props as {division: z.output<typeof divisionSchema>}).division, timing),
  ...overrides,
});

test('every sketch folder is registered once, with a brief, under its folder name', () => {
  assert.deepEqual(sketches.map((sketch) => sketch.id).sort(), [...folders].sort());
  for (const folder of folders) {
    assert(existsSync(path.join(root, folder, 'sketch.tsx')), `${folder}: missing sketch.tsx`);
    assert(existsSync(path.join(root, folder, 'brief.md')), `${folder}: missing brief.md`);
    assert.equal(findSketch(folder)?.id, folder);
  }
});

test('registered defaults are complete, clean and valid on every canvas', () => {
  for (const sketch of sketches) {
    const props = sketch.resolve(sketch.defaultProps);
    assert.equal(props.debug.enabled, false, `${sketch.id}: diagnostics must be off by default`);
    assert.equal(props.transparent, false);
    for (const [canvas, size] of Object.entries(canvasPresets)) {
      const metadata = sketch.metadata({...sketch.defaultProps, canvas});
      assert.equal(metadata.width, size.width);
      assert.equal(metadata.height, size.height);
      assert(metadata.durationInFrames > 1);
    }
  }
});

test('timing, canvas and duration derive from props', () => {
  const sketch = probe({timing: {bpm: 128, bars: 16}, canvas: 'square'});
  assert.deepEqual(sketch.metadata(sketch.defaultProps), {
    props: sketch.defaultProps, fps: 30, durationInFrames: 900, width: 1080, height: 1080});
  assert.equal(sketch.seamMetadata(sketch.defaultProps).durationInFrames, 60);
  assert.equal(sketch.seamMetadata({...sketch.defaultProps, bpm: 220, bars: 1, beatsPerBar: 1}).durationInFrames, 8);
  const custom = sketch.metadata({...sketch.defaultProps, canvas: 'custom', customSize: {width: 1280, height: 720}});
  assert.deepEqual([custom.width, custom.height], [1280, 720]);
});

test('invalid sketch props fail before rendering with field-specific messages', () => {
  const sketch = probe();
  const base = sketch.defaultProps;
  assert.throws(() => sketch.resolve({...base, amount: 2}), /Invalid sketch "probe": amount/);
  assert.throws(() => sketch.resolve({...base, amuont: 0.2}), /amuont/);
  assert.throws(() => sketch.resolve({...base, bpm: 0}), /bpm/);
  assert.throws(() => sketch.resolve({...base, canvas: 'custom'}), /customSize: required/);
  assert.throws(() => sketch.resolve({...base, canvas: 'custom', customSize: {width: 1281, height: 720}}), /customSize.width/);
  assert.throws(() => sketch.resolve({...base, bars: 1, division: '4 bars'}), /division: "4 bars" must fit/);
  assert.throws(() => sketch.resolve({...base, bpm: 127, timingMode: 'exact'}), /exact requires a whole-frame loop/);
});

test('definitions reject bad ids, reserved param names and incomplete defaults', () => {
  assert.throws(() => probe({id: 'Not Kebab'}), /kebab-case/);
  assert.throws(() => probe({schema: z.object({bpm: z.number()}), defaults: {bpm: 1}}), /redefines shared controls: bpm/);
  assert.throws(() => probe({defaults: {division: '1/4'}}), /amount/);
});
