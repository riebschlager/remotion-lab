import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {promisify} from 'node:util';
import {buildSidecar, exportPaths, exportProfiles, exportStem, jobProps, loopTiming, parseCanvases,
  parseExportArgs, parseProfiles} from '../scripts/lib/export';
import {findSketch} from '../src/sketches';

const pulseGrid = findSketch('pulse-grid')!;
const selected = (input: Record<string, unknown> = {}) => {
  const metadata = pulseGrid.metadata({...pulseGrid.defaultProps, ...input});
  return {...metadata, props: metadata.props as Record<string, unknown>};
};

test('output names contain the id, canvas and requested tempo', () => {
  assert.equal(exportStem({id: 'pulse-grid', canvasName: 'portrait', bpm: 120, repeat: 1}), 'pulse-grid_portrait_120bpm');
  assert.equal(exportStem({id: 'pulse-grid', canvasName: 'square', bpm: 127.5, repeat: 4}), 'pulse-grid_square_127.5bpm_x4');
  assert.equal(exportStem({id: 'PresetLoop', canvasName: '1080x1920', bpm: 100, repeat: 2, tag: 'amber'}),
    'PresetLoop_1080x1920_100bpm_x2_amber');
  assert.deepEqual(exportPaths('out/export', 'pulse-grid', 'pulse-grid_portrait_120bpm', 'prores'), {
    video: path.join('out/export/pulse-grid/pulse-grid_portrait_120bpm.mov'),
    sidecar: path.join('out/export/pulse-grid/pulse-grid_portrait_120bpm.mov.json'),
  });
  assert.deepEqual(Object.values(exportProfiles).map((profile) => profile.extension), ['mp4', 'mov', 'webm']);
});

test('a sidecar states the tempo, length, canvas and codec of a repeated sketch export', () => {
  const inputProps = {bpm: 130, bars: 1, canvas: 'landscape'};
  const {paths, sidecar} = buildSidecar({id: 'pulse-grid', profile: 'social', inputProps,
    composition: selected(inputProps), repeat: 3});
  // 4 beats at 130 BPM are 55.38 frames at 30 fps: the loop rounds to 55 and plays slightly fast.
  assert.equal(paths.video, path.join('out/export/pulse-grid/pulse-grid_landscape_130bpm_x3.mp4'));
  assert.equal(paths.sidecar, `${paths.video}.json`);
  assert.deepEqual({...sidecar, props: null}, {
    sidecarVersion: 1, file: 'pulse-grid_landscape_130bpm_x3.mp4', compositionId: 'pulse-grid', profile: 'social',
    inputProps, props: null,
    requestedBpm: 130, effectiveBpm: 130.909091, bars: 1, beatsPerBar: 4, totalBeats: 4, fps: 30,
    repeat: 3, loopFrameCount: 55, loopDurationSeconds: 1.833333, frameCount: 165, durationSeconds: 5.5,
    canvas: {name: 'landscape', width: 1920, height: 1080},
    codec: 'h264', container: 'mp4', pixelFormat: 'yuv420p', ffprobePixelFormat: 'yuv420p',
    proResProfile: null, crf: 18, colorSpace: 'bt709', frameImageFormat: 'jpeg', jpegQuality: 95,
    alpha: false, transparent: false,
  });
  // Resolved props include the sketch's own params and every shared control.
  assert.equal(sidecar.props.bpm, 130);
  assert.equal(sidecar.props.variant, 0);
  assert('density' in sidecar.props);
});

test('alpha sidecars record the codec settings and whether anything is transparent', () => {
  const custom = {canvas: 'custom', customSize: {width: 640, height: 360}};
  const transparent = jobProps({id: 'pulse-grid', isSketch: true, inputProps: custom, profile: 'prores', canvas: null});
  assert.equal(transparent.transparent, true);
  const prores = buildSidecar({id: 'pulse-grid', profile: 'prores', inputProps: transparent, composition: selected(transparent), repeat: 1});
  assert.equal(prores.paths.video, path.join('out/export/pulse-grid/pulse-grid_640x360_120bpm.mov'));
  assert.deepEqual([prores.sidecar.codec, prores.sidecar.proResProfile, prores.sidecar.pixelFormat, prores.sidecar.ffprobePixelFormat,
    prores.sidecar.alpha, prores.sidecar.transparent], ['prores', '4444', 'yuva444p10le', 'yuva444p12le', true, true]);
  assert.deepEqual(prores.sidecar.canvas, {name: '640x360', width: 640, height: 360});

  // An explicit transparent: false is respected and reported.
  const opaque = jobProps({id: 'pulse-grid', isSketch: true, inputProps: {transparent: false}, profile: 'webm', canvas: null});
  const webm = buildSidecar({id: 'pulse-grid', profile: 'webm', inputProps: opaque, composition: selected(opaque), repeat: 1});
  assert.deepEqual([webm.sidecar.codec, webm.sidecar.pixelFormat, webm.sidecar.crf, webm.sidecar.alpha, webm.sidecar.transparent],
    ['vp9', 'yuva420p', 28, true, false]);
});

test('preset compositions report their resolved tempo, and non-loops are refused', () => {
  const props = {preset: 'amber-echo', overrides: {bars: 2}};
  assert.deepEqual(loopTiming('PresetLoop', props), {bpm: 100, bars: 2, beatsPerBar: 4, fps: 30});
  const composition = {props, fps: 30, durationInFrames: 144, width: 1080, height: 1920};
  const {paths, sidecar} = buildSidecar({id: 'PresetLoop', profile: 'social', inputProps: props, composition, repeat: 1});
  assert.equal(paths.video, path.join('out/export/PresetLoop/PresetLoop_1080x1920_100bpm.mp4'));
  assert.deepEqual([sidecar.requestedBpm, sidecar.effectiveBpm, sidecar.bars, sidecar.frameCount, sidecar.durationSeconds],
    [100, 100, 2, 144, 4.8]);

  assert.throws(() => buildSidecar({id: 'PresetLoop', profile: 'social', inputProps: props,
    composition: {...composition, durationInFrames: 60}, repeat: 1}), /Only whole loops can be exported/);
  assert.throws(() => loopTiming('Unknown', {title: 'no timing'}), /no usable bpm/);
});

test('options are validated before anything renders', () => {
  assert.deepEqual(parseExportArgs(['pulse-grid']), {id: 'pulse-grid', props: undefined, profiles: ['social'],
    canvases: null, repeat: 1, tag: undefined, outDir: 'out/export', production: true});
  const parsed = parseExportArgs(['pulse-grid', '--profile=social,downstream,webm', '--canvas=portrait,1280x720,portrait',
    '--repeat=4', '--tag=v2', '--props={"bpm":128}', '--out=elsewhere', '--test-render']);
  assert.deepEqual(parsed, {id: 'pulse-grid', props: '{"bpm":128}', profiles: ['social', 'prores', 'webm'],
    canvases: [{canvas: 'portrait'}, {canvas: 'custom', customSize: {width: 1280, height: 720}}],
    repeat: 4, tag: 'v2', outDir: 'elsewhere', production: false});
  assert.deepEqual(parseProfiles('all'), ['social', 'prores', 'webm']);
  assert.deepEqual(parseCanvases('all').map((spec) => spec.canvas), ['portrait', 'portrait-4x5', 'square', 'landscape']);

  assert.throws(() => parseExportArgs([]), /exactly one composition id/);
  assert.throws(() => parseExportArgs(['a', 'b']), /exactly one composition id/);
  for (const repeat of ['0', '-1', '1.5', 'two', '1001']) {
    assert.throws(() => parseExportArgs(['pulse-grid', `--repeat=${repeat}`]), /--repeat: use a whole number of loops/);
  }
  assert.throws(() => parseExportArgs(['pulse-grid', '--profile=gif']), /unknown profile "gif"/);
  assert.throws(() => parseExportArgs(['pulse-grid', '--canvas=widescreen']), /unknown canvas "widescreen"/);
  assert.throws(() => parseExportArgs(['pulse-grid', '--canvas=1281x720']), /"1281x720": width: Use an even number/);
  assert.throws(() => parseExportArgs(['pulse-grid', '--tag=a/b']), /--tag/);
  assert.throws(() => parseExportArgs(['pulse-grid', '--scale=2']), /Unknown option/);
  assert.throws(() => parseExportArgs(['pulse-grid-seam']), /seam view, not a loop. Export "pulse-grid"/);
  assert.throws(() => parseExportArgs(['PresetSeamCheck']), /Export "PresetLoop"/);
  assert.throws(() => parseExportArgs(['SeamCheck']), /Export "BeatLoop"/);
});

test('canvas and transparency are applied per output', () => {
  const base = {id: 'pulse-grid', isSketch: true, inputProps: {bpm: 128, canvas: 'square'}};
  assert.deepEqual(jobProps({...base, profile: 'social', canvas: null}), {bpm: 128, canvas: 'square'});
  assert.deepEqual(jobProps({...base, profile: 'social', canvas: {canvas: 'landscape'}}), {bpm: 128, canvas: 'landscape'});
  assert.deepEqual(jobProps({...base, profile: 'webm', canvas: {canvas: 'custom', customSize: {width: 640, height: 360}}}),
    {bpm: 128, canvas: 'custom', customSize: {width: 640, height: 360}, transparent: true});
  assert.throws(() => jobProps({...base, inputProps: {transparent: true}, profile: 'social', canvas: null}),
    /"social" has no alpha channel/);

  const preset = {id: 'PresetLoop', isSketch: false, inputProps: {preset: 'amber-echo'}};
  assert.deepEqual(jobProps({...preset, profile: 'prores', canvas: null}), {preset: 'amber-echo'});
  assert.throws(() => jobProps({...preset, profile: 'social', canvas: {canvas: 'square'}}), /only sketches have a canvas/);
});

test('the command stops before bundling when options are wrong or collection media is absent', async () => {
  const run = promisify(execFile);
  const script = path.resolve('scripts/export.ts');
  const tsx = path.resolve('node_modules/tsx/dist/loader.mjs');
  // A folder with no public/ stands in for a machine without the collection.
  const elsewhere = await mkdtemp(path.join(tmpdir(), 'remotion-lab-export-'));
  try {
    const command = (...args: string[]) => run(process.execPath, ['--import', `file://${tsx}`, script, ...args], {cwd: elsewhere})
      .then(() => assert.fail('expected the export to fail'), (error: {code: number; stderr: string}) => error);
    const missing = await command('sticker-slap', '--canvas=portrait,square');
    assert.equal(missing.code, 1);
    assert.match(missing.stderr, /Cannot export "sticker-slap":\n {2}public\/assets\/test\/.+ is missing/);
    assert.match(missing.stderr, /Collection media is not in git/);

    const invalid = await command('pulse-grid', '--props={"density":"lots"}');
    assert.equal(invalid.code, 1);
    assert.match(invalid.stderr, /Cannot export "pulse-grid": Invalid sketch "pulse-grid": density/);

    const usage = await command('pulse-grid', '--repeat=0');
    assert.equal(usage.code, 2);
    assert.match(usage.stderr, /--repeat: use a whole number of loops[\s\S]+Usage: npm run export/);
  } finally {
    await rm(elsewhere, {recursive: true, force: true});
  }
});
