import assert from 'node:assert/strict';
import {existsSync, readdirSync} from 'node:fs';
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {after, before, test} from 'node:test';
import {z} from 'zod';
import {manifests} from '../collections';
import {missingSketchAssets} from '../scripts/lib/render';
import {analyseTiming, filmstripFrames, loopVerdict, scanAssets} from '../scripts/lib/scan';
import {assetFiles, assetKey, clipFrameTime, createAssets, missingAssets, sourceFrameIndex} from '../src/assets';
import {step} from '../src/beat/envelopes';
import {getBeatState, getLoopDurationInFrames} from '../src/beat/timing';
import {cssFontFamily, faceDescriptors, facesToLoad} from '../src/assets/fonts';
import {collectionSchema, type CollectionManifest} from '../src/assets/manifest';
import {defineSketch} from '../src/sketches/define';
import {buildFixtureCollection, fixtureLevels} from './asset-fixtures';

// Collection media is not in git, so these tests build a small collection and scan that.
let root: string;
let assetsDir: string;
let manifestsDir: string;
let manifest: CollectionManifest;
const manifestPath = () => path.join(manifestsDir, 'fixture/manifest.json');
const read = async () => JSON.parse(await readFile(manifestPath(), 'utf8')) as CollectionManifest;
const scan = () => scanAssets({assetsDir, manifestsDir});

before(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'remotion-lab-assets-'));
  assetsDir = path.join(root, 'public/assets');
  manifestsDir = path.join(root, 'collections');
  await buildFixtureCollection(assetsDir);
  const {reports} = await scan();
  assert.deepEqual(reports.map((report) => [report.collection, report.status, report.clips, report.fonts, report.skipped, report.failed]),
    [['fixture', 'created', 7, 2, ['notes.txt'], []]]);
  manifest = await read();
}, {timeout: 120_000});
after(async () => { if (root) await rm(root, {recursive: true, force: true}); });

test('the scan measures clips exactly', () => {
  assert.deepEqual(collectionSchema.parse(manifest), manifest);
  const facts = Object.fromEntries(Object.entries(manifest.clips).map(([name, clip]) => [name,
    [clip.format, clip.codec, clip.width, clip.height, clip.frameCount, clip.fpsRational, clip.durationSeconds, clip.timing, clip.hasAlpha, clip.hasAudio]]));
  assert.deepEqual(facts, {
    'clips/count.mp4': ['mp4', 'h264', 64, 64, 12, [12, 1], 1, 'constant', false, false],
    // WebM stores millisecond timestamps (0, 33, 67…), which still describe an even 30 fps.
    'clips/cutout.webm': ['webm', 'vp9', 64, 64, 7, [30, 1], 0.233333, 'constant', true, false],
    'clips/ntsc.mp4': ['mp4', 'h264', 64, 64, 5, [30000, 1001], 0.166833, 'constant', false, false],
    'held.gif': ['gif', 'gif', 16, 16, 12, [25, 1], 0.48, 'constant', false, false],
    'pulse.gif': ['gif', 'gif', 16, 16, 6, [25, 2], 0.48, 'constant', false, false],
    'steps.gif': ['gif', 'gif', 16, 16, 8, [10, 1], 0.8, 'constant', false, false],
    'uneven.gif': ['gif', 'gif', 16, 16, 4, null, 0.75, 'variable', true, false],
  });
  for (const [name, levels] of Object.entries(fixtureLevels)) assert.equal(manifest.clips[name].frameCount, levels.length);
  assert.deepEqual(manifest.clips['uneven.gif'].frameStarts, [0, 0.05, 0.15, 0.35]);
  assert.equal(manifest.clips['uneven.gif'].fps, 5.333333);
  assert.equal(manifest.clips['steps.gif'].frameStarts, undefined);
});

test('the scan tells clips that loop on their own from clips that snap back', () => {
  // pulse.gif returns to its first frame in an ordinary step; steps.gif jumps from its brightest frame to its darkest.
  const pulse = manifest.clips['pulse.gif'].loop;
  assert.equal(pulse.seamless, true);
  assert.equal(pulse.seamDifference, pulse.neighborDifference);
  const steps = manifest.clips['steps.gif'].loop;
  assert.equal(steps.seamless, false);
  assert(steps.seamDifference > 5 * steps.neighborDifference);
  assert.equal(manifest.clips['clips/count.mp4'].loop.seamless, false);
});

test('held frames beside the loop point do not hide a clip that loops', () => {
  // held.gif is pulse.gif drawn on twos. Its first two and last two frames are identical, so
  // measuring motion only beside the seam finds none and calls an ordinary step a cut.
  const held = manifest.clips['held.gif'].loop;
  assert.equal(held.seamless, true);
  assert.equal(held.seamDifference, manifest.clips['pulse.gif'].loop.seamDifference);
  assert.equal(held.neighborDifference, held.seamDifference);
  // An ordinary step is the upper quartile of every consecutive change in the clip.
  assert.deepEqual(loopVerdict(0.2, [0, 0.2, 0, 0.2, 0]), {seamless: true, seamDifference: 0.2, neighborDifference: 0.2});
  assert.deepEqual(loopVerdict(0.5, [0, 0.2, 0, 0.2, 0]), {seamless: false, seamDifference: 0.5, neighborDifference: 0.2});
  // A mostly still clip with one cut inside it gives no excuse for a cut at the seam.
  assert.equal(loopVerdict(0.3, [0, 0, 0, 0, 0, 0, 0, 0.4]).seamless, false);
  // A single frame, or a still clip, loops trivially.
  assert.deepEqual(loopVerdict(0, []), {seamless: true, seamDifference: 0, neighborDifference: 0});
  assert.equal(loopVerdict(0.004, [0, 0]).seamless, true);
});

test('every clip gets a filmstrip of evenly spaced, labelled frames', async () => {
  assert.deepEqual(filmstripFrames(1), [0]);
  assert.deepEqual(filmstripFrames(4), [0, 1, 2, 3]);
  assert.deepEqual(filmstripFrames(89), [0, 18, 35, 53, 70, 88]);
  for (const [name, clip] of Object.entries(manifest.clips)) {
    assert.equal(clip.filmstrip.file, `filmstrips/${name}.jpg`);
    assert.deepEqual(clip.filmstrip.frames, filmstripFrames(clip.frameCount));
    const image = await readFile(path.join(manifestsDir, 'fixture', clip.filmstrip.file));
    assert.deepEqual([...image.subarray(0, 3)], [0xff, 0xd8, 0xff], `${name}: filmstrip is not a JPEG`);
    assert(image.length < 60_000, `${name}: filmstrip should stay small`);
  }
});

test('the scan groups font files into families with weights, styles and variable axes', () => {
  assert.deepEqual(Object.keys(manifest.fonts), ['Lab Block', 'Lab Static']);
  const [variable] = manifest.fonts['Lab Block'].faces;
  assert.deepEqual([variable.file, variable.format, variable.weight, variable.style], ['type/LabBlock-VF.ttf', 'ttf', 400, 'normal']);
  assert.deepEqual(variable.axes, {wght: {name: 'Weight', min: 100, default: 400, max: 900}});
  assert.deepEqual(variable.instances, {Thin: {wght: 100}, Regular: {wght: 400}, Black: {wght: 900}});
  assert.deepEqual(manifest.fonts['Lab Static'].faces.map((face) => [face.file, face.subfamily, face.weight, face.style, face.axes]), [
    ['type/LabStatic-Regular.ttf', 'Regular', 400, 'normal', {}],
    ['type/LabStatic-BoldItalic.ttf', 'Bold Italic', 700, 'italic', {}],
  ]);
  // The fixture fonts draw only "A", and the manifest says so.
  assert.equal(variable.glyphCount, 3);
  assert(!variable.missingAscii.includes('A') && variable.missingAscii.includes('a') && variable.missingAscii.includes('7'));
});

test('frame timing is exact for even spacing and keeps every start time otherwise', () => {
  assert.deepEqual(analyseTiming([0, 1001, 2002, 3003], 1001, [1, 30000], [30000, 1001]),
    {fps: 29.97003, fpsRational: [30000, 1001], durationSeconds: 0.133467, timing: 'constant'});
  // Millisecond timestamps cannot hold 1/30 s, but stay within a tick of it.
  assert.deepEqual(analyseTiming([0, 33, 67, 100, 133, 167], 33, [1, 1000], [30, 1]).fpsRational, [30, 1]);
  // A frame arriving two ticks late is no longer an even 30 fps.
  const late = analyseTiming([0, 33, 69, 100], 33, [1, 1000], [30, 1]);
  assert.deepEqual([late.timing, late.fpsRational, late.frameStarts], ['variable', null, [0, 0.033, 0.069, 0.1]]);
  assert.deepEqual(analyseTiming([0, 4, 8], 4, [1, 100], null).fpsRational, [25, 1]);
  // Equal gaps but a longer final frame: the clip's length differs from frameCount / fps.
  const held = analyseTiming([0, 10, 20], 50, [1, 100], [10, 1]);
  assert.deepEqual([held.timing, held.durationSeconds, held.frameStarts], ['variable', 0.7, [0, 0.1, 0.2]]);
  assert.deepEqual(analyseTiming([7], 20, [1, 100], null), {fps: 5, fpsRational: [5, 1], durationSeconds: 0.2, timing: 'constant'});
  assert.throws(() => analyseTiming([0, 10, 10], 10, [1, 100], null), /do not increase/);
});

test('re-scanning keeps hand-written descriptions and tags and reports what changed', async () => {
  const edited = await read();
  edited.description = 'Test collection';
  edited.tags = ['fixture'];
  edited.clips['pulse.gif'].description = 'Gray card that brightens and dims';
  edited.clips['pulse.gif'].tags = ['loop', 'flat'];
  edited.clips['steps.gif'].description = 'Will be deleted';
  edited.fonts['Lab Block'].description = 'Solid block, variable weight';
  edited.fonts['Lab Block'].tags = ['display'];
  await writeFile(manifestPath(), JSON.stringify(edited));

  // Reformatting alone counts as a change; a second scan has nothing to do.
  assert.equal((await scan()).reports[0].status, 'updated');
  assert.equal((await scan()).reports[0].status, 'unchanged');
  const kept = await read();
  assert.deepEqual([kept.description, kept.tags], ['Test collection', ['fixture']]);
  assert.deepEqual([kept.clips['pulse.gif'].description, kept.clips['pulse.gif'].tags], ['Gray card that brightens and dims', ['loop', 'flat']]);
  assert.deepEqual([kept.fonts['Lab Block'].description, kept.fonts['Lab Block'].tags], ['Solid block, variable weight', ['display']]);
  assert.deepEqual({...kept.clips['pulse.gif'], description: '', tags: []}, manifest.clips['pulse.gif']);

  await rm(path.join(assetsDir, 'fixture/steps.gif'));
  await rm(path.join(assetsDir, 'fixture/type/LabStatic-Regular.ttf'));
  await rm(path.join(assetsDir, 'fixture/type/LabStatic-BoldItalic.ttf'));
  const [report] = (await scan()).reports;
  assert.deepEqual([report.status, report.removed], ['updated', ['clip steps.gif', 'font Lab Static']]);
  const after = await read();
  assert.equal(after.clips['steps.gif'], undefined);
  assert.equal(after.clips['pulse.gif'].description, 'Gray card that brightens and dims');
  assert(!existsSync(path.join(manifestsDir, 'fixture/filmstrips/steps.gif.jpg')), 'stale filmstrip should be removed');
  assert(existsSync(path.join(manifestsDir, 'fixture/filmstrips/pulse.gif.jpg')));
});

test('a manifest whose media is not on this machine is left alone and stays importable', async () => {
  const elsewhere = path.join(manifestsDir, 'elsewhere/manifest.json');
  await mkdir(path.dirname(elsewhere), {recursive: true});
  const content = JSON.stringify({version: 1, collection: 'elsewhere', description: 'On another machine', tags: [], clips: {}, fonts: {}});
  await writeFile(elsewhere, content);
  await mkdir(path.join(assetsDir, 'Bad Name'), {recursive: true});
  const result = await scan();
  assert.deepEqual([result.indexed, result.absent, result.invalid], [['elsewhere', 'fixture'], ['elsewhere'], ['Bad Name']]);
  assert.equal(await readFile(elsewhere, 'utf8'), content);
  const index = await readFile(path.join(manifestsDir, 'index.ts'), 'utf8');
  assert.match(index, /import c0 from '\.\/elsewhere\/manifest\.json';\nimport c1 from '\.\/fixture\/manifest\.json';/);
  assert.match(index, /'elsewhere': c0,\n {2}'fixture': c1,/);
  await assert.rejects(scanAssets({assetsDir, manifestsDir, only: ['nowhere']}), /No such collection folder/);

  await writeFile(manifestPath(), '{not json');
  await assert.rejects(scan(), /not valid JSON, so its descriptions and tags cannot be carried over/);
});

test('clip() and font() resolve manifest entries and explain what is available otherwise', () => {
  const {clip, font, clipNames, fontFamilies} = createAssets({fixture: manifest});
  const pulse = clip('fixture', 'pulse.gif');
  assert.deepEqual([pulse.kind, pulse.collection, pulse.name, pulse.publicPath, pulse.frameCount, pulse.fpsRational],
    ['clip', 'fixture', 'pulse.gif', 'assets/fixture/pulse.gif', 6, [25, 2]]);
  const block = font('fixture', 'Lab Block');
  assert.deepEqual([block.kind, block.family, block.faces[0].axes.wght.max], ['font', 'Lab Block', 900]);
  assert.deepEqual(clipNames('fixture'), Object.keys(manifest.clips));
  assert.deepEqual(fontFamilies('fixture'), ['Lab Block', 'Lab Static']);
  assert.deepEqual([assetKey(pulse), assetKey(block)], ['clip:fixture/pulse.gif', 'font:fixture/Lab Block']);

  assert.throws(() => clip('retro' as never, 'pulse.gif'),
    /Unknown asset collection "retro"\. Collections with a manifest: "fixture"\. Add media to public\/assets\/retro\/ and run npm run assets:scan/);
  assert.throws(() => clip('fixture', 'pulse'), /No clip "pulse" in collection "fixture"\. Its manifest lists: "clips\/count\.mp4".*npm run assets:scan -- fixture/);
  assert.throws(() => font('fixture', 'toString'), /No font family "toString" in collection "fixture"\. Its manifest lists: "Lab Block", "Lab Static"/);
  assert.throws(() => createAssets({}).clip('fixture' as never, 'x' as never), /Collections with a manifest: none/);
});

test('missing files are reported per file, against whatever lookup the caller has', () => {
  const {clip, font} = createAssets({fixture: manifest});
  const refs = [clip('fixture', 'pulse.gif'), font('fixture', 'Lab Static')];
  assert.deepEqual(refs.flatMap(assetFiles),
    ['assets/fixture/pulse.gif', 'assets/fixture/type/LabStatic-Regular.ttf', 'assets/fixture/type/LabStatic-BoldItalic.ttf']);
  assert.deepEqual(missingAssets(refs, () => true), []);
  assert.deepEqual(missingAssets(refs, (file) => file.endsWith('Regular.ttf')), [
    'public/assets/fixture/pulse.gif is missing (clip "pulse.gif" in collection "fixture")',
    'public/assets/fixture/type/LabStatic-BoldItalic.ttf is missing (font "Lab Static" in collection "fixture")',
  ]);
});

test('each source frame maps to a time inside the clip that selects it', () => {
  const {clip} = createAssets({fixture: manifest});
  // GIFs are addressed by frame start, videos by frame middle; see clipFrameTime.
  assert.deepEqual([0, 1, 5].map((frame) => clipFrameTime(clip('fixture', 'pulse.gif'), frame)), [0, 0.08, 0.4]);
  assert.deepEqual([0, 1, 2, 3].map((frame) => clipFrameTime(clip('fixture', 'uneven.gif'), frame)), [0, 0.05, 0.15, 0.35]);
  const close = (actual: number, expected: number) => assert(Math.abs(actual - expected) < 1e-12, `${actual} is not ${expected}`);
  close(clipFrameTime(clip('fixture', 'clips/count.mp4'), 0), 0.5 / 12);
  close(clipFrameTime(clip('fixture', 'clips/count.mp4'), 11), 11.5 / 12);
  close(clipFrameTime(clip('fixture', 'clips/ntsc.mp4'), 4), (4.5 * 1001) / 30000);
  assert.throws(() => clipFrameTime(clip('fixture', 'pulse.gif'), 6), /has frames 0\.\.5; got 6/);
  assert.throws(() => clipFrameTime(clip('fixture', 'pulse.gif'), 1.5), /got 1\.5/);
});

test('beat positions a rounding error short of a whole frame select that frame', () => {
  assert.deepEqual([0, 0.5, 5.999999999999979, 6, 6.999, 14.999999999, 15, -1, -0.5, 31].map((frame) => sourceFrameIndex(frame, 15)),
    [0, 0, 6, 6, 6, 0, 0, 14, 14, 1]);
  assert.throws(() => sourceFrameIndex(Number.NaN, 15), /finite/);
  // A 15-frame clip restarted on every beat of a 120 BPM, 30 fps loop has one source frame per rendered
  // frame. Both documented recipes must show each of them once, in order, on every beat.
  const timing = {bpm: 120, bars: 4, beatsPerBar: 4, fps: 30};
  const frames = Array.from({length: getLoopDurationInFrames(timing)}, (_, frame) => getBeatState(frame, timing));
  const expected = frames.map((_, frame) => frame % 15);
  const restarted = frames.map(({beat, totalBeats}) => step(beat, 1, totalBeats).phase * 15);
  assert(restarted.some((frame, i) => Math.floor(frame) !== expected[i]), 'the fixture no longer reproduces the rounding error');
  assert.deepEqual(restarted.map((frame) => sourceFrameIndex(frame, 15)), expected);
  assert.deepEqual(frames.map(({beat}) => sourceFrameIndex((beat % 1) * 15, 15)), expected);
  // Other tempos, rates and meters whose cycles are whole rendered frames.
  for (const [config, cycleBeats, count] of [
    [{bpm: 100, bars: 4, beatsPerBar: 4, fps: 30}, 1, 18], [{bpm: 120, bars: 4, beatsPerBar: 4, fps: 60}, 1, 30],
    [{bpm: 90, bars: 8, beatsPerBar: 4, fps: 30}, 1, 20], [{bpm: 120, bars: 4, beatsPerBar: 3, fps: 30}, 3, 45],
  ] as const) {
    const total = getLoopDurationInFrames(config);
    for (let frame = 0; frame < total; frame++) {
      const {beat, totalBeats} = getBeatState(frame, config);
      assert.equal(sourceFrameIndex(step(beat, cycleBeats, totalBeats).phase * count, count), frame % count,
        `${config.bpm} BPM at ${config.fps} fps, frame ${frame}`);
      assert.equal(sourceFrameIndex(((beat / cycleBeats) % 1) * count, count), frame % count);
    }
  }
});

test('font faces load under a collection-scoped family with ranges for variable axes', () => {
  const {font} = createAssets({fixture: manifest});
  assert.equal(cssFontFamily(font('fixture', 'Lab Block')), '"fixture/Lab Block"');
  assert.deepEqual(faceDescriptors(font('fixture', 'Lab Block').faces[0]), {weight: '100 900', style: 'normal'});
  assert.deepEqual(font('fixture', 'Lab Static').faces.map(faceDescriptors),
    [{weight: '400', style: 'normal'}, {weight: '700', style: 'italic'}]);
  const face = font('fixture', 'Lab Static').faces[0];
  const wide = {...face, axes: {wdth: {name: 'Width', min: 75, default: 100, max: 125}}};
  assert.deepEqual(faceDescriptors(wide), {weight: '400', style: 'normal', stretch: '75% 125%'});
  // The same face shipped twice loads once, in the smaller format.
  assert.deepEqual(facesToLoad({faces: [face, {...face, file: 'a.woff2', format: 'woff2'}, wide]}).map((item) => item.file),
    ['a.woff2', face.file]);
});

test('sketches declare assets, validate them with their props, and expose them to scripts', () => {
  const {clip, font} = createAssets({fixture: manifest});
  const sketch = defineSketch({
    id: 'probe', title: 'Probe', description: 'Test sketch',
    schema: z.object({source: z.string()}),
    defaults: {source: 'pulse.gif'},
    Component: () => null,
    assets: (props) => [clip('fixture', props.source), font('fixture', 'Lab Block')],
  });
  assert.deepEqual(sketch.assets(sketch.defaultProps).map(assetKey), ['clip:fixture/pulse.gif', 'font:fixture/Lab Block']);
  assert.throws(() => sketch.resolve({...sketch.defaultProps, source: 'gone.gif'}),
    /Invalid sketch "probe": assets: No clip "gone\.gif" in collection "fixture"/);
  // Outside a browser the public folder is checked by the caller, so metadata alone still resolves.
  assert.equal(sketch.metadata(sketch.defaultProps).durationInFrames, 240);
  const publicDir = path.dirname(assetsDir);
  assert.deepEqual(missingSketchAssets(sketch, {}, publicDir), []);
  assert.deepEqual(missingSketchAssets(sketch, {}, path.join(root, 'nowhere')), [
    'public/assets/fixture/pulse.gif is missing (clip "pulse.gif" in collection "fixture")',
    'public/assets/fixture/type/LabBlock-VF.ttf is missing (font "Lab Block" in collection "fixture")',
  ]);
  const fixed = defineSketch({id: 'fixed', title: 'Fixed', description: 'Test sketch', schema: z.object({}), defaults: {},
    Component: () => null, assets: [clip('fixture', 'pulse.gif')]});
  assert.deepEqual(fixed.assets(fixed.defaultProps).map(assetKey), ['clip:fixture/pulse.gif']);
  assert.deepEqual(defineSketch({id: 'plain', title: 'Plain', description: 'Test sketch', schema: z.object({}), defaults: {},
    Component: () => null}).assets({}), []);
});

test('committed manifests are valid, indexed, and have their filmstrips', () => {
  const dir = path.resolve('collections');
  const folders = readdirSync(dir, {withFileTypes: true}).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  assert.deepEqual(Object.keys(manifests).sort(), folders.sort(), 'collections/index.ts is stale; run npm run assets:scan');
  for (const [name, value] of Object.entries(manifests as Record<string, unknown>)) {
    const result = collectionSchema.safeParse(value);
    assert(result.success, `collections/${name}/manifest.json: ${result.success ? '' : result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`);
    assert.equal(result.data.collection, name);
    for (const [clipName, entry] of Object.entries(result.data.clips)) {
      assert(existsSync(path.join(dir, name, entry.filmstrip.file)), `collections/${name}: missing filmstrip for ${clipName}`);
      assert.equal(entry.frameStarts?.length ?? entry.frameCount, entry.frameCount, `${clipName}: one start time per frame`);
    }
  }
});
