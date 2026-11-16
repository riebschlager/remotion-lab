import assert from 'node:assert/strict';
import {test} from 'node:test';
import {clip} from '../src/assets';
import {clipPlaybackIssues, sampleClip, type ClipPlayback} from '../src/assets/clipPlayback';
import {getBeatState} from '../src/beat/timing';
import {defineSketch} from '../src/sketches/define';
import {z} from 'zod';

const source = {...clip('test', 'Art Animation GIF by Mr Tronch.gif'), frameCount: 8};
const timing = {bpm: 120, bars: 2, beatsPerBar: 4, fps: 120};
const sample = (p: ClipPlayback, beat: number, meter = 4) => {
  const time = getBeatState(beat * 60, {...timing, beatsPerBar: meter});
  return sampleClip(source, p, {time, division: '1/4', offsetBeats: 0, seed: (s) => s});
};

test('fit beats, bars, negative offsets and odd meters select exact frames', () => {
  const p: ClipPlayback = {mode: 'fit', duration: {beats: 2}, offsetBeats: -0.5};
  assert.deepEqual([0, 0.25, 1, 1.5].map((b) => sample(p, b).frame), [2, 3, 6, 0]);
  assert.equal(sample({mode: 'fit', duration: {bars: 1}}, 1.5, 3).frame, 4);
  assert.match(clipPlaybackIssues(source, {mode: 'fit', duration: {beats: 3}}, timing).join(), /playback.duration/);
});

test('retrigger preserves last hit through rests, swing, negative offset and the seam', () => {
  const p: ClipPlayback = {mode: 'retrigger', division: '1/8', durationBeats: 2,
    pattern: {steps: [0, 0.4, 0, 1], swing: 0.5}, offsetBeats: -0.25, cut: 'allow'};
  // Hits .5 (soft), 1.5 (full), 2.5, 3.5 ... 7.5. Rest at beat 0 carries 7.5.
  assert.equal(sample(p, 0).frame, 2);
  assert.equal(sample(p, 0).strength, 1);
  assert.equal(sample(p, 0.5).frame, 0);
  assert.equal(sample(p, 0.5).strength, 0.4);
  assert.equal(sample(p, 1).frame, 2);
  assert.equal(sample(p, 1.5).strength, 1);
  const held: ClipPlayback = {...p, pattern: {steps: [1, 0, 0, 0]}, durationBeats: 0.25};
  assert.equal(sample(held, 1).frame, 7);
  assert.equal(sample({...p, pattern: {steps: [0, 0]}}, 3).opacity, 0);
});

test('step counts active hits, holds through rests, wraps negative jumps and validates closure', () => {
  const p: ClipPlayback = {mode: 'step', division: '1/8', pattern: {steps: [1, 0, 0.5, 0], swing: 0.3}};
  assert.deepEqual([0, 0.5, 1, 1.5, 2, 7.9].map((b) => sample(p, b).frame), [0, 0, 1, 1, 2, 7]);
  assert.equal(sample({...p, jump: -1}, 1).frame, 7);
  assert.equal(sample({...p, offsetBeats: -0.5}, 0).frame, 0);
  const bad: ClipPlayback = {mode: 'step', division: '1/4'};
  assert.match(clipPlaybackIssues({...source, frameCount: 7}, bad, timing).join(), /playback.jump/);
  assert.deepEqual(clipPlaybackIssues({...source, frameCount: 7}, {...bad, seam: 'wrap'}, timing), []);
  assert.deepEqual(clipPlaybackIssues(source, {mode: 'step', division: '1/4', jump: 4}, {...timing, beatsPerBar: 3}), []);
});

test('scrub uses normalized modulation and clamps endpoint 1 to the last source frame', () => {
  const p: ClipPlayback = {mode: 'scrub', division: '1/4', signal: {type: 'lfo', shape: 'triangle'}};
  assert.deepEqual([0, 2, 4, 6].map((b) => sample(p, b).frame), [0, 3, 7, 3]);
  assert.equal(sample({...p, signal: {type: 'beat'}, cut: 'allow'}, 0).frame, 7);
  assert.equal(sample({...p, signal: [{type: 'lfo', cycles: 0, weight: 0}]}, 2).frame, 0);
  assert.match(clipPlaybackIssues(source, {...p, signal: {type: 'lfo', cycles: 0.5}}, timing).join(), /signal.cycles/);
  assert.match(clipPlaybackIssues(source, {...p, signal: {type: 'beat', division: '4 bars'}}, timing).join(), /signal.division/);
  assert.match(clipPlaybackIssues(source, {...p, signal: {type: 'lfo', shape: 'saw'}}, timing).join(), /playback.cut/);
});

test('non-looping media requires an explicit cut choice; ping-pong and fades conceal resets', () => {
  const cut = {...source, loop: {...source.loop, seamless: false}};
  const fit: ClipPlayback = {mode: 'fit', duration: {beats: 2}};
  assert.match(clipPlaybackIssues(cut, fit, timing).join(), /cut.*does not loop/);
  for (const p of [{...fit, direction: 'ping-pong'}, {...fit, cut: 'fade'}, {...fit, cut: 'allow'}] as ClipPlayback[]) {
    assert.deepEqual(clipPlaybackIssues(cut, p, timing), []);
  }
  const bounce: ClipPlayback = {...fit, direction: 'ping-pong'};
  assert.deepEqual([0, 0.5, 1, 1.5].map((b) => sample(bounce, b).frame), [0, 3, 7, 4]);
  assert.equal(sample({...fit, cut: 'fade'}, 0).opacity, 0);
  const trigger: ClipPlayback = {mode: 'retrigger', division: '1/2', durationBeats: 1, cut: 'fade'};
  assert.equal(sample(trigger, 0).opacity, 0);
  assert(sample(trigger, 1.99).opacity < 0.001);
});

test('all modes are periodic out of order, including odd meters, offsets and smooth scrub seams', () => {
  const modes: ClipPlayback[] = [
    {mode: 'fit', duration: {bars: 1}, offsetBeats: -0.75, direction: 'ping-pong'},
    {mode: 'retrigger', division: '1/8', pattern: {steps: [0, 1, 0.3]}, durationBeats: 1, offsetBeats: -0.75, cut: 'fade'},
    {mode: 'step', division: '1/8', pattern: {steps: [1, 0, 0.4]}, offsetBeats: -0.75},
    {mode: 'scrub', division: '1/4', signal: {type: 'noise', channel: 'playhead'}},
    {mode: 'scrub', division: '1/4', signal: {type: 'lfo', shape: 'sine'}},
  ];
  for (const p of modes) for (const beat of [5.9, 0, 3.25, -0.25, 1]) {
    assert.deepEqual(sample(p, beat, 3), sample(p, beat + 6, 3), JSON.stringify(p));
  }
  for (const p of modes.slice(3)) assert.equal(sample(p, -1 / 60, 3).frame, sample(p, 0, 3).frame);
});

test('declarative bindings reject invalid settings in both metadata paths before rendering', () => {
  const sketch = defineSketch({id: 'clip-validation', title: '', description: '', schema: z.object({beats: z.number()}),
    defaults: {beats: 4}, Component: () => null,
    clips: (p) => [{clip: source, playback: {mode: 'fit', duration: {beats: p.beats}}, field: 'hero'}]});
  for (const metadata of [sketch.metadata, sketch.seamMetadata]) {
    assert.throws(() => metadata({...sketch.defaultProps, beats: 3}), /hero.duration/);
  }
});

test('seam neighbors preserve source progression, held events and fade limits', () => {
  const fit: ClipPlayback = {mode: 'fit', duration: {beats: 2}, direction: 'ping-pong'};
  assert.equal(sample(fit, -1 / 60).frame, 1);
  assert.equal(sample(fit, 0).frame, 0);
  const stepped: ClipPlayback = {mode: 'step', division: '1/4'};
  assert.equal(sample(stepped, -1 / 60).frame, 7);
  assert.equal(sample(stepped, 0).frame, 0); // the expected next source frame
  const held: ClipPlayback = {mode: 'retrigger', division: '1/2', durationBeats: 4, offsetBeats: -1, cut: 'fade'};
  assert.equal(sample(held, -1 / 60).frame, 1);
  assert.equal(sample(held, 0).frame, 2);
  assert(Math.abs(sample(held, -1 / 60).opacity - sample(held, 0).opacity) < 0.001);
  assert.equal(sample({...fit, cut: 'fade'}, 0).opacity, 0);
  assert(sample({...fit, cut: 'fade'}, -1 / 60).opacity < 0.001);
});

test('swung step hits use delayed onsets, and ping-pong retrigger returns then holds zero', () => {
  const swung: ClipPlayback = {mode: 'step', division: '1/8', pattern: {steps: [1, 0.4], swing: 0.5}};
  assert.deepEqual([0.5, 0.75, 1, 1.5, 1.75].map((b) => sample(swung, b).frame), [0, 1, 2, 2, 3]);
  const bounce: ClipPlayback = {mode: 'retrigger', division: '1/2', durationBeats: 1, direction: 'ping-pong', cut: 'allow'};
  assert.equal(sample(bounce, 0.5).frame, 7);
  assert.equal(sample(bounce, 1).frame, 0);
  assert.equal(sample(bounce, 1.5).frame, 0);
  const one = {...source, frameCount: 1};
  assert.deepEqual(clipPlaybackIssues(one, {mode: 'step', division: '1/4', direction: 'ping-pong'}, timing), []);
});

test('inactive scrub beat sources skip musical checks while source structure stays validated', () => {
  const p: ClipPlayback = {mode: 'scrub', division: '4 bars', signal: [{type: 'beat', weight: 0}, {type: 'noise'}]};
  assert.deepEqual(clipPlaybackIssues(source, p, timing), []);
  assert.match(clipPlaybackIssues(source, {...p, signal: {type: 'beat'}}, timing).join(), /signal.division/);
});
