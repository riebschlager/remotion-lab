import assert from 'node:assert/strict';
import {test} from 'node:test';
import {z} from 'zod';
import {font} from '../src/assets';
import {getBeatState} from '../src/beat/timing';
import {defineSketch} from '../src/sketches/define';
import {fitType} from '../src/type/layout';
import {activeUnits, sampleTypeUnit, splitType, typeIssues, type TypeSettings} from '../src/type/model';
const ref = font('test', 'BBH Bogle');
const variable = {...ref, faces: [{...ref.faces[0], axes: {wght: {name: 'Weight', min: 100, default: 400, max: 900}}}]};
const timing = {bpm: 120, bars: 2, beatsPerBar: 4, fps: 120};
const base: TypeSettings = {text: 'A B', split: 'word', mode: 'all', division: '1/4'};
const sample = (p: TypeSettings, beat: number, index = 0, count = 2, meter = 4) => sampleTypeUnit(p, index, count,
  {time: getBeatState(beat * 60, {...timing, beatsPerBar: meter}), division: p.division, offsetBeats: 0, seed: (s) => s});

test('type splits preserve lines, whitespace and repeated-unit source identities', () => {
  const units = splitType('A  A\n\nB', 'word');
  assert.deepEqual(units.map((u) => [u.text, u.line]), [['A', 0], ['  ', 0], ['A', 0], ['', 1], ['B', 2]]);
  assert.equal(new Set(units.map((u) => u.id)).size, units.length);
  assert.equal(activeUnits(units).length, 3);
  assert.deepEqual(splitType('AA\nB', 'letter').map((u) => u.id), ['letter:0', 'letter:1', 'letter:3']);
  assert.deepEqual(splitType('A\nB', 'line').map((u) => u.text), ['A', 'B']);
});

test('pure layout shrinks to both box dimensions, preserves lines, and supports alignment', () => {
  const units = splitType('AA\nA', 'line');
  const metrics = [{left: 0, top: -1, width: 2, height: 1.25}, {left: 0, top: -1, width: 1, height: 1.25}];
  for (const [w, h] of [[100, 400], [400, 100], [16, 16]]) {
    const fit = fitType(units, metrics, w, h, 200);
    for (const u of fit.units) {
      assert(u.x >= 0 && u.y >= -1e-9 && u.x + u.width <= w + 1e-9 && u.y + u.height <= h + 1e-9);
    }
  }
  assert.equal(fitType(units, metrics, 400, 400, 100, 'left').units[1].x, 0);
  assert.equal(fitType(units, metrics, 400, 400, 100, 'right').units[1].x, 300);
  assert.throws(() => fitType(units, metrics, 0, 400, 100), /type.box/);
});

test('all mode uses accents, skips rests and keeps tails across the seam', () => {
  const p: TypeSettings = {...base, pattern: {steps: [0, 0.4, 0, 1]}, decay: 2};
  assert.equal(sample(p, 1).energy, 0.4);
  assert.equal(sample(p, 2).energy, 0.1);
  assert.equal(sample(p, 0).energy, 0.25); // previous loop's final full hit
  assert.deepEqual(sample(p, 3), sample(p, 3, 1));
  assert.equal(sample({...p, pattern: {steps: [0]}}, 0).energy, 0);
});

test('sequence counts active hits, not rests; complete unit rounds close at the seam', () => {
  const p: TypeSettings = {...base, mode: 'sequence', division: '1/8', pattern: {steps: [1, 0, 0.4, 0]}, decay: 0.5};
  assert.equal(sample(p, 0, 0).energy, 1);
  assert.equal(sample(p, 0, 1).energy, 0);
  assert.equal(sample(p, 1, 1).energy, 0.4);
  assert.equal(sample(p, 2, 0).energy, 1);
  assert.match(typeIssues(ref, {...p, text: 'A B C'}, timing).join(), /type.mode.*divisible/);
  assert.equal(sample(p, -1 / 60, 1).energy, 0);
  assert.equal(sample(p, 8, 0).energy, 1);
});

test('stagger uses wrapped offsets, including negatives, swing and odd meters', () => {
  const p: TypeSettings = {...base, mode: 'stagger', division: '1/8', offsetBeats: -0.25,
    staggerBeats: 0.5, pattern: {steps: [1, 0.5], swing: 0.5}};
  assert.equal(sample(p, 0.25, 1).energy, 1);
  assert.equal(sample(p, 0.5, 0).energy, 0.5);
  const odd: TypeSettings = {...base, mode: 'stagger', division: '1/4', staggerBeats: -0.25,
    pattern: {steps: [1, 0, 0.4]}, decay: 2};
  assert.deepEqual(typeIssues(ref, odd, {...timing, beatsPerBar: 3}), []);
  for (const b of [-0.25, 0, 1.5, 5.75]) assert.deepEqual(sample(odd, b, 1, 2, 3), sample(odd, b + 6, 1, 2, 3));
});

test('axis ranges, face selection, missing characters and source timing fail before rendering', () => {
  const p: TypeSettings = {...base, axes: {wght: {signal: {type: 'beat'}, range: [100, 900]}}};
  assert.deepEqual(typeIssues(variable, p, timing), []);
  assert.equal(sample(p, 0).axes.wght, 900);
  assert.equal(sample(p, 0.75).axes.wght, 100);
  assert.match(typeIssues(variable, {...p, axes: {wght: {signal: {type: 'noise'}, range: [99, 900]}}}, timing).join(), /axes.wght.range/);
  assert.match(typeIssues(ref, p, timing).join(), /axes.wght/);
  assert.match(typeIssues(ref, {...base, italic: true}, timing).join(), /type.font/);
  assert.match(typeIssues({...ref, faces: [{...ref.faces[0], missingAscii: 'B'}]}, base, timing).join(), /text.*"B"/);
  assert.match(typeIssues(ref, {...base, text: 'CAFÉ'}, timing).join(), /text.*"É"/);
  assert.match(typeIssues(ref, {...base, division: '4 bars'}, timing).join(), /type.division/);
  const sketch = defineSketch({id: 'type-validation', title: '', description: '', schema: z.object({text: z.string()}),
    defaults: {text: 'A'}, Component: () => null, types: (p) => [{font: ref, settings: {...base, text: p.text}, field: 'title'}]});
  for (const metadata of [sketch.metadata, sketch.seamMetadata]) {
    assert.throws(() => metadata({...sketch.defaultProps, text: 'É'}), /title.text/);
  }
});

test('axis beat sources inherit sequence assignment and stagger, with explicit source overrides', () => {
  const p: TypeSettings = {...base, mode: 'sequence', axes: {wght: {signal: {type: 'beat'}, range: [100, 900]}}};
  assert.equal(sample(p, 0, 0).axes.wght, 900);
  assert.equal(sample(p, 0, 1).axes.wght, 100);
  assert.equal(sample(p, 1, 1).axes.wght, 900);
  assert.equal(sample({...p, mode: 'stagger', staggerBeats: 0.5}, 0.5, 1).axes.wght, 900);
  const explicit: TypeSettings = {...p, axes: {wght: {signal: {type: 'beat', pattern: null}, range: [100, 900]}}};
  assert.equal(sample(explicit, 0, 1).axes.wght, 900);
  assert.deepEqual(typeIssues(variable, p, timing), []);
});

test('long sequential tails and smooth axis signals remain deterministic across the seam', () => {
  const tails: TypeSettings = {...base, mode: 'sequence', decay: 20};
  assert(Math.abs(sample(tails, 0, 1).energy - 0.95 ** 2) < 1e-9);
  assert.deepEqual(sample(tails, 0, 1), sample(tails, 8, 1));
  const drifting: TypeSettings = {...base, axes: {wght: {signal: {type: 'noise', channel: 'weight'}, range: [100, 900]}}};
  const first = sample(drifting, 0);
  assert.deepEqual(first, sample(drifting, 8));
  const near = sampleTypeUnit(drifting, 0, 2, {
    time: {...getBeatState(0, timing), beat: 8 - 1e-6, loopPhase: 1 - 1e-6 / 8},
    division: '1/4', offsetBeats: 0, seed: (s) => s,
  });
  assert(Math.abs(first.axes.wght - near.axes.wght) < 0.01);
  assert(first.axes.wght >= 100 && first.axes.wght <= 900);
});
