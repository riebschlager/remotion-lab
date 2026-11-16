import assert from 'node:assert/strict';
import {readFile, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {after, before, test} from 'node:test';
import type {PNG} from 'pngjs';
import {openSession, type Session} from '../../scripts/lib/render';
import {scanAssets} from '../../scripts/lib/scan';
import type {CollectionManifest} from '../../src/assets/manifest';
import {buildFixtureCollection, encodeGif, fixtureLevels} from '../asset-fixtures';

// The collection is generated, scanned and served from out/, so nothing here needs media from git.
const root = path.resolve('out/asset-fixtures');
const artifacts = path.resolve('out/loop-tests/assets');
let session: Session;
let manifest: CollectionManifest;

before(async () => {
  await rm(root, {recursive: true, force: true});
  const dir = await buildFixtureCollection(path.join(root, 'public/assets'));
  // In the manifest but gone from disk by the time anything renders.
  await writeFile(path.join(dir, 'ghost.gif'), encodeGif(16, 16, [{level: 90, delay: 10}, {level: 180, delay: 10}]));
  const {reports} = await scanAssets({assetsDir: path.join(root, 'public/assets'), manifestsDir: path.join(root, 'collections')});
  assert.deepEqual(reports[0].failed, []);
  await rm(path.join(dir, 'ghost.gif'));
  manifest = JSON.parse(await readFile(path.join(root, 'collections/fixture/manifest.json'), 'utf8'));
  // Two overlapping faces in one family: Type must pin the selected file,
  // rather than letting CSS choose the last matching static/variable face.
  manifest.fonts['Lab Overlap'] = {description: 'Overlapping fixture faces', tags: [],
    faces: [manifest.fonts['Lab Static'].faces[0], manifest.fonts['Lab Block'].faces[0]]};
  await writeFile(path.join(root, 'manifests.json'), JSON.stringify({fixture: manifest}));
  session = await openSession({entryPoint: path.resolve('tests/visual/assets-entry.tsx'),
    publicDir: path.join(root, 'public'), alias: {'asset-fixture-manifests': path.join(root, 'manifests.json')}});
}, {timeout: 180_000});
after(async () => { await session?.close(); });

const render = async (props: Record<string, unknown>, label: string) => {
  const composition = await session.select('asset-probe', props);
  return session.still(composition, 0, path.join(artifacts, `${label}.png`), 0.2);
};
// The probe is three equal bands: GIF, video, type.
const gray = (png: PNG, band: number, x = 0.25) => {
  const i = (Math.round(png.height * (band + 0.5) / 3) * png.width + Math.round(png.width * x)) * 4;
  return png.data[i];
};
const nearest = (levels: readonly number[], value: number) =>
  levels.reduce((best, level, index) => (Math.abs(level - value) < Math.abs(levels[best] - value) ? index : best), 0);

test('a GIF shows exactly the source frame the manifest timing asks for', async () => {
  for (const name of ['steps.gif', 'pulse.gif', 'uneven.gif'] as const) {
    assert.equal(manifest.clips[name].frameCount, fixtureLevels[name].length);
    for (let frame = 0; frame < manifest.clips[name].frameCount; frame++) {
      const png = await render({gif: name, gifFrame: frame}, `gif-${name}-${frame}`);
      assert.equal(gray(png, 0), fixtureLevels[name][frame], `${name} frame ${frame}`);
    }
  }
});

test('a video shows exactly the source frame the manifest timing asks for', async () => {
  for (const name of ['clips/count.mp4', 'clips/ntsc.mp4', 'clips/cutout.webm'] as const) {
    assert.equal(manifest.clips[name].frameCount, fixtureLevels[name].length);
    for (let frame = 0; frame < manifest.clips[name].frameCount; frame++) {
      const png = await render({video: name, videoFrame: frame}, `video-${name.replace('/', '-')}-${frame}`);
      assert.equal(nearest(fixtureLevels[name], gray(png, 1)), frame, `${name} frame ${frame} rendered gray ${gray(png, 1)}`);
    }
  }
});

test('frame numbers past either end wrap around the clip', async () => {
  const levels = fixtureLevels['steps.gif'];
  assert.equal(gray(await render({gif: 'steps.gif', gifFrame: levels.length + 2}, 'gif-wrap'), 0), levels[2]);
  const video = fixtureLevels['clips/count.mp4'];
  assert.equal(nearest(video, gray(await render({video: 'clips/count.mp4', videoFrame: video.length + 3}, 'video-wrap'), 1)), 3);
});

test('a clip longer than the loop still shows its later frames', async () => {
  // Remotion clamps the frame clock to the composition's length. In a 15-frame loop, a clip addressed
  // through that clock could show nothing later than 14/30 s: about source frame 5 of either fixture.
  const props = {bpm: 120, bars: 1, beatsPerBar: 1, gif: 'steps.gif', video: 'clips/count.mp4'};
  for (const [gifFrame, videoFrame] of [[7, 11], [6, 8], [1, 2]]) {
    const composition = await session.select('asset-probe', {...props, gifFrame, videoFrame});
    assert.equal(composition.durationInFrames, 15);
    for (const at of [0, 14]) {
      const png = await session.still(composition, at, path.join(artifacts, `short-loop-${gifFrame}-${at}.png`), 0.2);
      assert.equal(gray(png, 0), fixtureLevels['steps.gif'][gifFrame], `GIF frame ${gifFrame} at loop frame ${at}`);
      assert.equal(nearest(fixtureLevels['clips/count.mp4'], gray(png, 1)), videoFrame, `video frame ${videoFrame} at loop frame ${at}`);
    }
  }
});

test('transparency reported by the scan is transparency in the render', async () => {
  assert.equal(manifest.clips['uneven.gif'].hasAlpha, true);
  assert.equal(manifest.clips['clips/cutout.webm'].hasAlpha, true);
  const png = await render({gif: 'uneven.gif', gifFrame: 2, video: 'clips/cutout.webm', videoFrame: 3}, 'alpha');
  // The right half of both clips is clear, so the black backdrop shows through.
  assert.equal(gray(png, 0, 0.75), 0);
  assert(gray(png, 1, 0.75) < 8);
  assert(gray(png, 1, 0.25) > 100);
});

test('collection fonts are loaded before the frame is captured, with their variable axes', async () => {
  // Each fixture glyph is a solid block whose width in font units is known.
  const blockWidth = async (props: Record<string, unknown>, label: string) => {
    const png = await render(props, label);
    const row = Math.round(png.height * 2.5 / 3) * png.width * 4;
    let width = 0;
    while (width < png.width && png.data[row + width * 4] > 127) width++;
    return {width, em: png.height / 3};
  };
  const cases = [
    {props: {family: 'Lab Block', weight: 100}, units: 100},
    {props: {family: 'Lab Block', weight: 400}, units: 400},
    {props: {family: 'Lab Block', weight: 900}, units: 900},
    {props: {family: 'Lab Static', weight: 400}, units: 500},
    {props: {family: 'Lab Static', weight: 700, italic: true}, units: 800},
  ];
  for (const {props, units} of cases) {
    const {width, em} = await blockWidth(props, `font-${props.family.replace(' ', '-')}-${props.weight}`);
    assert(Math.abs(width - (units / 1000) * em) <= 1.5,
      `${props.family} at ${props.weight}: block is ${width}px wide, expected about ${(units / 1000) * em}`);
  }
});

test('a declared asset that is missing from disk fails before rendering, by name', async () => {
  await assert.rejects(session.select('asset-probe', {gif: 'ghost.gif'}),
    /Invalid sketch "asset-probe": assets: public\/assets\/fixture\/ghost\.gif is missing \(clip "ghost\.gif" in collection "fixture"\).*not in git/);
});

test('an asset that is not in the manifest fails before rendering, with what is available', async () => {
  await assert.rejects(session.select('asset-probe', {gif: 'nope.gif'}),
    /assets: No clip "nope\.gif" in collection "fixture"\. Its manifest lists: .*"steps\.gif".*assets:scan/);
  await assert.rejects(session.select('asset-probe', {family: 'Comic Sans'}), /No font family "Comic Sans" in collection "fixture"/);
});

test('reading an asset the sketch did not declare is an error, not a broken frame', async () => {
  const composition = await session.select('asset-probe', {undeclared: true});
  await assert.rejects(session.still(composition, 0, path.join(artifacts, 'undeclared.png'), 0.2),
    /uses clip "pulse\.gif" from collection "fixture" without declaring it/);
});

test('Clip modes decode exact GIF and video frames at chosen beats, out of order', async () => {
  // Eight beats at 120 BPM/60fps. Each explicit expectation is independent of sampleClip.
  const cases = [
    {playback: {mode: 'fit', duration: {beats: 2}, cut: 'allow'}, beats: [1.5, 0, 0.5, 239 / 30], gif: [6, 0, 2, 7], video: [9, 0, 3, 11]},
    {playback: {mode: 'fit', duration: {beats: 2}, direction: 'ping-pong'}, beats: [1, 0.5, 1.5], gif: [7, 3, 4], video: [11, 5, 6]},
    {playback: {mode: 'retrigger', division: '1/8', pattern: {steps: [0, 0.4, 0, 1], swing: 0.5},
      offsetBeats: -0.25, durationBeats: 2, cut: 'allow'}, beats: [0, 0.5, 1, 1.5, 239 / 30], gif: [2, 0, 2, 0, 1], video: [3, 0, 3, 0, 2]},
    {playback: {mode: 'step', division: '1/8', pattern: {steps: [1, 0, 0.5, 0]}, jump: 3, seam: 'wrap', cut: 'allow'},
      beats: [2, 0, 0.5, 1, 7.5, 239 / 30], gif: [6, 0, 0, 3, 5, 5], video: [6, 0, 0, 3, 9, 9]},
    {playback: {mode: 'scrub', division: '1/4', signal: {type: 'lfo', shape: 'triangle'}},
      beats: [4, 0, 2, 6, 239 / 30], gif: [7, 0, 3, 3, 0], video: [11, 0, 5, 5, 0]},
  ];
  for (const [index, c] of cases.entries()) {
    const composition = await session.select('asset-probe', {bars: 2, fps: 60, playback: c.playback});
    for (const [i, beat] of c.beats.entries()) {
      const png = await session.still(composition, Math.round(beat * 30), path.join(artifacts, `playback-${index}-${beat}.png`), 0.2);
      assert.equal(gray(png, 0), fixtureLevels['steps.gif'][c.gif[i]], `GIF ${JSON.stringify(c.playback)} at ${beat}`);
      assert.equal(nearest(fixtureLevels['clips/count.mp4'], gray(png, 1)), c.video[i], `video ${index} at ${beat}`);
    }
  }
  // Scrub reaches the final source frames inside a 15-frame composition: clip length is no limit.
  const short = await session.select('asset-probe', {bars: 1, beatsPerBar: 1,
    playback: {mode: 'scrub', division: '1/4', signal: {type: 'lfo', cycles: 0, phaseOffset: 0.25}}});
  const png = await session.still(short, 0, path.join(artifacts, 'playback-short.png'), 0.2);
  assert.equal(gray(png, 0), fixtureLevels['steps.gif'][7]);
  assert.equal(nearest(fixtureLevels['clips/count.mp4'], gray(png, 1)), 11);
});

test('Clip playback fails metadata before media is decoded', async () => {
  await assert.rejects(session.select('asset-probe', {playback: {mode: 'fit', duration: {beats: 3}}}), /gifPlayback.duration/);
  await assert.rejects(session.select('asset-probe', {playback: {mode: 'fit', duration: {beats: 4}}}), /gifPlayback.cut/);
  await assert.rejects(session.select('asset-probe', {playback: {mode: 'step', division: '1\/4', cut: 'allow', jump: 1}}), /videoPlayback.jump/);
});

test('Clip fades hide a non-looping source reset on the actual rendered seam', async () => {
  for (const playback of [
    {mode: 'fit', duration: {beats: 2}, cut: 'fade'},
    {mode: 'retrigger', division: '1/2', durationBeats: 2, cut: 'fade'},
  ]) {
    const composition = await session.select('asset-probe', {bars: 2, playback, fps: 60});
    for (const frame of [239, 0, 1, 30]) {
      const png = await session.still(composition, frame, path.join(artifacts, `fade-${playback.mode}-${frame}.png`), 0.2);
      if (frame === 30) { assert(gray(png, 0) > 100); assert(gray(png, 1) > 100); }
      else { assert(gray(png, 0) <= 1); assert(gray(png, 1) <= 1); }
    }
  }
});

// Columns of actual painted pixels: no DOM assertions can accidentally bless a fallback font.
const inkColumns = (png: PNG) => {
  const columns = Array.from({length: png.width}, (_, x) => {
    let max = 0;
    for (let y = 0; y < png.height; y++) max = Math.max(max, png.data[(y * png.width + x) * 4]);
    return max;
  });
  const runs: Array<{x: number; width: number; level: number; coverage: number}> = [];
  columns.forEach((value, x) => {
    if (value < 10) return;
    if (x === 0 || columns[x - 1] < 10) runs.push({x, width: 1, level: value, coverage: value / 255});
    else { const run = runs[runs.length - 1]; run.width++; run.coverage += value / 255; run.level = Math.max(run.level, value); }
  });
  return runs;
};
const typeFrame = async (props: Record<string, unknown>, frame: number, label: string) => {
  const composition = await session.select('type-probe', props);
  return session.still(composition, frame, path.join(artifacts, `type-${label}.png`), 0.2);
};

test('Type uses the loaded collection face, with exact fixture glyph proportions', async () => {
  const png = await typeFrame({}, 0, 'collection-face');
  const runs = inkColumns(png);
  assert.equal(runs.length, 2);
  // 20 vmin = 216 composition pixels. Lab Static's A has exactly half-em ink width.
  for (const run of runs) assert(Math.abs(run.coverage - 216 * 0.2 * 0.5) <= 1, JSON.stringify(runs));
  // A browser fallback A is neither a solid rectangle nor exactly this half-em width.
  const rows = [];
  for (let y = 0; y < png.height; y++) {
    if (png.data[(y * png.width + runs[0].x + 2) * 4] > 200) rows.push(y);
  }
  assert(Math.abs(rows.length - 216 * 0.2) <= 1.5);
});

test('Type animates a variable axis between beats while unit slots stay fixed', async () => {
  const settings = {text: 'A A', split: 'word', mode: 'all', division: '1/2',
    axes: {wght: {signal: {type: 'beat'}, range: [100, 900]}}};
  const peak = inkColumns(await typeFrame({family: 'Lab Block', settings}, 0, 'axis-peak'));
  const rest = inkColumns(await typeFrame({family: 'Lab Block', settings}, 45, 'axis-rest'));
  assert.equal(peak.length, 2); assert.equal(rest.length, 2);
  for (let i = 0; i < 2; i++) {
    assert.equal(peak[i].x, rest[i].x);
    assert(Math.abs(peak[i].coverage - 216 * 0.2 * 0.9) <= 1);
    assert(Math.abs(rest[i].coverage - 216 * 0.2 * 0.1) <= 1);
  }
  const repeated = await typeFrame({family: 'Lab Block', settings}, 0, 'axis-repeated');
  assert.deepEqual(inkColumns(repeated), peak);
});

test('Type shows sequential active hits and leaves a rest silent', async () => {
  const settings = {text: 'A A', split: 'word', mode: 'sequence', division: '1/2', pattern: {steps: [1, 0, 0.5, 0]}};
  const first = inkColumns(await typeFrame({settings, showEnergy: true}, 0, 'first-hit'));
  const rest = inkColumns(await typeFrame({settings, showEnergy: true}, 60, 'rest'));
  const second = inkColumns(await typeFrame({settings, showEnergy: true}, 120, 'second-hit'));
  assert.equal(first.length, 1); assert.equal(second.length, 1); assert.equal(rest.length, 0);
  assert(second[0].x > first[0].x);
  assert(Math.abs(second[0].level - 128) <= 1);
});

test('Type fits explicit lines inside its box on tall and wide canvases', async () => {
  for (const canvas of ['portrait', 'landscape']) {
    const png = await typeFrame({canvas, settings: {text: 'A A A A A\nA A A A A', split: 'letter', mode: 'stagger', division: '1/4'}}, 0, `fit-${canvas}`);
    let ink = 0;
    for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) {
      if (png.data[(y * png.width + x) * 4] < 10) continue;
      ink++;
      assert(x >= png.width * 0.1 - 1 && x <= png.width * 0.9 + 1 && y >= png.height * 0.25 - 1 && y <= png.height * 0.75 + 1);
    }
    assert(ink > 50);
  }
});

test('Type rejects missing characters and invalid axes before rendering', async () => {
  const settings = {text: 'B', split: 'letter', mode: 'all', division: '1/4'};
  await assert.rejects(session.select('type-probe', {settings}), /label.text.*"B"/);
  await assert.rejects(session.select('type-probe', {family: 'Lab Block', settings: {...settings, text: 'A',
    axes: {wght: {signal: {type: 'beat'}, range: [100, 901]}}}}), /label.axes.wght.range/);
});

test('Type variable axes follow one-word-per-hit assignment', async () => {
  const settings = {text: 'A A', split: 'word', mode: 'sequence', division: '1/4',
    axes: {wght: {signal: {type: 'beat'}, range: [100, 900]}}};
  const first = inkColumns(await typeFrame({family: 'Lab Block', settings}, 0, 'axis-sequence-first'));
  const second = inkColumns(await typeFrame({family: 'Lab Block', settings}, 30, 'axis-sequence-second'));
  assert.equal(first.length, 2); assert.equal(second.length, 2);
  assert(first[0].coverage > first[1].coverage * 5);
  assert(second[1].coverage > second[0].coverage * 5);
  assert.deepEqual(first.map((r) => r.x), second.map((r) => r.x));
});


test('Type pins the chosen file when static and variable faces overlap', async () => {
  const settings = {text: 'A A', split: 'word', mode: 'all', division: '1/2'};
  const fixed = inkColumns(await typeFrame({family: 'Lab Overlap', settings}, 0, 'overlap-static'));
  const varied = inkColumns(await typeFrame({family: 'Lab Overlap', settings: {...settings,
    axes: {wght: {signal: {type: 'beat'}, range: [100, 900]}}}}, 0, 'overlap-variable'));
  assert.equal(fixed.length, 2); assert.equal(varied.length, 2);
  assert(Math.abs(fixed[0].coverage - 216 * 0.2 * 0.5) <= 1);
  assert(Math.abs(varied[0].coverage - 216 * 0.2 * 0.9) <= 1);
});
