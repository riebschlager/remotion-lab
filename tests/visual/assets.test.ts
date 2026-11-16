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
