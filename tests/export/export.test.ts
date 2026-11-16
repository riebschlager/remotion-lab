/**
 * Real exports, checked from the files themselves. Slower than the default
 * suites and not part of them: run with `npm run test:export`.
 */
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {readFile, rm, stat} from 'node:fs/promises';
import path from 'node:path';
import {after, before, test} from 'node:test';
import {promisify} from 'node:util';
import {jobProps} from '../../scripts/lib/export';
import {runExport, type WrittenSidecar} from '../../scripts/lib/export-render';
import {openSession, type Session} from '../../scripts/lib/render';
import {decodeFrames, ff} from '../../scripts/lib/scan';

const run = promisify(execFile);
const outDir = path.resolve('out/export-tests');

// One bar at 130 BPM is 55.38 frames, so these exports also cover a rounded tempo.
const LOOP = 55;
const REPEAT = 3;
const timing = {bpm: 130, bars: 1};
const canvases = [{name: '270x480', width: 270, height: 480}, {name: '480x270', width: 480, height: 270}];
const formats = [
  {profile: 'social', extension: 'mp4', codec: 'h264', alpha: false},
  {profile: 'prores', extension: 'mov', codec: 'prores', alpha: true},
  {profile: 'webm', extension: 'webm', codec: 'vp9', alpha: true},
] as const;
const fileFor = (canvas: string, extension: string) =>
  path.join(outDir, 'export-probe', `export-probe_${canvas}_130bpm_x${REPEAT}.${extension}`);

let session: Session;
let notes: string[] = [];
before(async () => {
  await rm(outDir, {recursive: true, force: true});
  // The fixture sketch draws no backdrop of its own, so `transparent` leaves real holes.
  session = await openSession({entryPoint: path.resolve('tests/export/entry.tsx')});
  const jobs = canvases.flatMap((canvas) => formats.map(({profile}) => ({profile, props: jobProps({id: 'export-probe',
    isSketch: true, inputProps: timing, profile, canvas: {canvas: 'custom' as const, customSize: {width: canvas.width, height: canvas.height}}})})));
  await runExport(session, {id: 'export-probe', jobs, repeat: REPEAT, outDir, production: false, log: (line) => notes.push(line)});
}, {timeout: 300_000});
after(async () => { await session?.close(); });

type Probe = {streams: Array<{codec_type: string; codec_name: string; profile?: string; pix_fmt: string; width: number; height: number;
  r_frame_rate: string; nb_read_frames: string; color_space?: string; tags?: Record<string, string>}>; format: {duration: string}};
const probe = async (file: string) => {
  const {stdout} = await ff('ffprobe', ['-v', 'error', '-count_frames', '-show_entries',
    'stream=codec_type,codec_name,profile,pix_fmt,width,height,r_frame_rate,nb_read_frames,color_space:stream_tags=alpha_mode:format=duration',
    '-of', 'json', file]);
  const times = await ff('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'frame=best_effort_timestamp_time',
    '-of', 'csv=p=0', file]);
  return {...(JSON.parse(stdout) as Probe),
    times: times.stdout.split('\n').map((line) => line.trim().replace(/,$/, '')).filter(Boolean).map(Number)};
};

/** Every frame of a file as decoded RGBA: a hash each, plus the alpha range of the whole file. */
const decode = async (file: string, width: number, height: number, decoder: string | null) => {
  const hashes: string[] = [];
  let minAlpha = 255;
  let maxAlpha = 0;
  let coloredOpaque = 0;
  await decodeFrames(file, width, height, decoder, (index, rgba) => {
    hashes[index] = createHash('sha1').update(rgba).digest('hex');
    for (let i = 0; i < rgba.length; i += 4) {
      const alpha = rgba[i + 3];
      if (alpha < minAlpha) minAlpha = alpha;
      if (alpha > maxAlpha) maxAlpha = alpha;
      if (alpha > 200 && rgba[i] + rgba[i + 1] + rgba[i + 2] > 60) coloredOpaque++;
    }
  });
  return {hashes, minAlpha, maxAlpha, coloredOpaque};
};

for (const canvas of canvases) {
  for (const format of formats) {
    const file = fileFor(canvas.name, format.extension);
    test(`${format.profile} ${canvas.name}: the file is what its sidecar says`, async () => {
      assert(existsSync(file), `${file} was not written`);
      const sidecar = JSON.parse(await readFile(`${file}.json`, 'utf8')) as WrittenSidecar;
      assert.deepEqual([sidecar.compositionId, sidecar.profile, sidecar.file, sidecar.repeat, sidecar.loopFrameCount,
        sidecar.frameCount, sidecar.fps, sidecar.requestedBpm, sidecar.effectiveBpm, sidecar.durationSeconds],
      ['export-probe', format.profile, path.basename(file), REPEAT, LOOP, LOOP * REPEAT, 30, 130, 130.909091, 5.5]);
      assert.deepEqual(sidecar.canvas, canvas);
      assert.equal(sidecar.fileSizeBytes, (await stat(file)).size);

      const {streams, format: container, times} = await probe(file);
      assert.equal(streams.length, 1, 'exports carry one video stream and no audio');
      const [video] = streams;
      assert.equal(video.codec_name, sidecar.codec);
      assert.equal(video.codec_name, format.codec);
      assert.equal(video.pix_fmt, sidecar.ffprobePixelFormat);
      assert.deepEqual([video.width, video.height], [sidecar.canvas.width, sidecar.canvas.height]);
      assert.equal(Number(video.nb_read_frames), sidecar.frameCount);
      assert.equal(video.r_frame_rate, `${sidecar.fps}/1`);
      assert.equal(video.color_space, sidecar.colorSpace);
      // WebM stores whole milliseconds.
      assert(Math.abs(Number(container.duration) - sidecar.durationSeconds) < 0.002, `duration ${container.duration}`);
      assert.equal(times.length, sidecar.frameCount);
      times.forEach((time, index) => assert(Math.abs(time - times[0] - index / sidecar.fps) < 0.002,
        `frame ${index} is at ${time}s; joins must keep frames evenly spaced`));
      // ffprobe names the profile "4444" or, in older builds, by its number.
      if (format.profile === 'prores') assert(['4444', '4'].includes(String(video.profile)), `ProRes profile ${video.profile}`);
      assert.deepEqual([sidecar.alpha, sidecar.transparent], [format.alpha, format.alpha]);
      if (format.alpha) {
        assert.equal(sidecar.alphaSample?.minAlpha, 0);
        assert(sidecar.alphaSample!.transparentFraction > 0.2);
      } else {
        assert.equal(sidecar.alphaSample, null);
      }
      if (format.profile === 'webm') {
        assert.equal(Object.entries(video.tags ?? {}).find(([key]) => key.toLowerCase() === 'alpha_mode')?.[1], '1');
      }
    });

    test(`${format.profile} ${canvas.name}: repeats decode to identical frames and alpha is ${format.alpha ? 'real' : 'absent'}`, async () => {
      const decoded = await decode(file, canvas.width, canvas.height, format.profile === 'webm' ? 'libvpx-vp9' : null);
      assert.equal(decoded.hashes.length, LOOP * REPEAT);
      for (let frame = LOOP; frame < LOOP * REPEAT; frame++) {
        assert.equal(decoded.hashes[frame], decoded.hashes[frame - LOOP], `frame ${frame} differs from frame ${frame - LOOP}`);
      }
      // Guard against a vacuous pass on a still picture.
      assert(new Set(decoded.hashes.slice(0, LOOP)).size > LOOP / 2, 'the loop should animate');
      if (format.alpha) {
        assert.equal(decoded.minAlpha, 0, 'the omitted backdrop should decode as fully transparent');
        assert(decoded.maxAlpha >= 250, `the drawing should be opaque somewhere (max alpha ${decoded.maxAlpha})`);
        assert(decoded.coloredOpaque > 100, 'opaque pixels should carry the drawing');
      } else {
        assert.equal(decoded.minAlpha, 255);
      }
    });
  }
}

test('an alpha export of a composition that fills its frame says nothing is transparent', {timeout: 300_000}, async () => {
  notes = [];
  const props = jobProps({id: 'export-probe', isSketch: true, inputProps: {...timing, filled: true, canvas: 'custom',
    customSize: {width: 270, height: 480}}, profile: 'webm', canvas: null});
  const [result] = await runExport(session, {id: 'export-probe', jobs: [{profile: 'webm', props}], tag: 'filled', outDir,
    production: false, log: (line) => notes.push(line)});
  assert.equal(path.basename(result.video), 'export-probe_270x480_130bpm_filled.webm');
  assert.deepEqual([result.sidecar.transparent, result.sidecar.alphaSample?.minAlpha, result.sidecar.alphaSample?.transparentFraction],
    [true, 255, 0]);
  assert(notes.some((line) => /nothing is transparent .+ although transparent is on/.test(line)), notes.join('\n'));
  assert.equal((await decode(result.video, 270, 480, 'libvpx-vp9')).minAlpha, 255);
});

test('the command exports a preset as one whole loop with its resolved tempo', {timeout: 300_000}, async () => {
  await run(process.execPath, ['--import', 'tsx', 'scripts/export.ts', 'PresetLoop',
    '--props={"preset":"amber-echo","overrides":{"bars":1}}', '--tag=check', `--out=${outDir}`, '--test-render']);
  const file = path.join(outDir, 'PresetLoop', 'PresetLoop_1080x1920_100bpm_check.mp4');
  const sidecar = JSON.parse(await readFile(`${file}.json`, 'utf8')) as WrittenSidecar;
  assert.deepEqual([sidecar.requestedBpm, sidecar.effectiveBpm, sidecar.bars, sidecar.repeat, sidecar.frameCount, sidecar.durationSeconds],
    [100, 100, 1, 1, 72, 2.4]);
  const {streams, format: container} = await probe(file);
  assert.deepEqual([streams[0].codec_name, streams[0].pix_fmt, streams[0].width, streams[0].height, Number(streams[0].nb_read_frames)],
    ['h264', 'yuv420p', 1080, 1920, 72]);
  assert(Math.abs(Number(container.duration) - 2.4) < 0.002);
});
