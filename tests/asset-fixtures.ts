/**
 * A small asset collection built from scratch, so asset tests need no media
 * in git. GIFs are encoded here; videos go through Remotion's bundled ffmpeg;
 * fonts are the committed files in tests/fixtures/fonts.
 *
 * Every frame is a flat gray whose level identifies it, so a test can tell
 * which source frame a render shows by reading one pixel.
 */
import {copyFile, mkdir, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {PNG} from 'pngjs';
import {ff} from '../scripts/lib/scan';

type GifFrame = {
  /** Gray level 0..254 (even values are exact). */
  level: number;
  /** Display time in hundredths of a second. */
  delay: number;
  /** Leave the right half of the frame transparent. */
  cutout?: boolean;
};

/** A minimal GIF89a writer: 128 grays, uncompressed LZW codes, optional transparency. */
export const encodeGif = (width: number, height: number, frames: GifFrame[]) => {
  const bytes: number[] = [];
  const word = (value: number) => bytes.push(value & 0xff, value >> 8);
  bytes.push(...Buffer.from('GIF89a'));
  word(width); word(height);
  bytes.push(0xf6, 0, 0); // 128-entry global palette
  for (let i = 0; i < 128; i++) bytes.push(i * 2, i * 2, i * 2);
  bytes.push(0x21, 0xff, 0x0b, ...Buffer.from('NETSCAPE2.0'), 3, 1, 0, 0, 0); // loop forever
  const transparent = 127;
  for (const frame of frames) {
    bytes.push(0x21, 0xf9, 4, 0x08 | (frame.cutout ? 1 : 0)); // dispose to background
    word(frame.delay);
    bytes.push(transparent, 0, 0x2c);
    word(0); word(0); word(width); word(height);
    bytes.push(0, 7); // no local palette; 7-bit symbols, so every code below is one byte
    const codes: number[] = [];
    for (let i = 0; i < width * height; i++) {
      // A clear code every 100 pixels keeps the code width at 8 bits.
      if (i % 100 === 0) codes.push(128);
      codes.push(frame.cutout && i % width >= width / 2 ? transparent : frame.level >> 1);
    }
    codes.push(129);
    for (let i = 0; i < codes.length; i += 255) {
      const block = codes.slice(i, i + 255);
      bytes.push(block.length, ...block);
    }
    bytes.push(0);
  }
  bytes.push(0x3b);
  return Buffer.from(bytes);
};

const flatPng = (size: number, level: number, cutout: boolean) => {
  const png = new PNG({width: size, height: size});
  for (let i = 0; i < size * size; i++) {
    const clear = cutout && i % size >= size / 2;
    png.data.set(clear ? [0, 0, 0, 0] : [level, level, level, 255], i * 4);
  }
  return PNG.sync.write(png);
};

const encodeVideo = (output: string, levels: number[], rate: string, codec: string[], cutout = false) =>
  ff('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', rate, '-c:v', 'png', '-i', '-', ...codec, output],
    {input: Buffer.concat(levels.map((level) => flatPng(64, level, cutout)))});

/** Gray level of each frame, by clip. */
export const fixtureLevels = {
  'steps.gif': [20, 50, 80, 110, 140, 170, 200, 230],
  'pulse.gif': [40, 100, 160, 220, 160, 100],
  'uneven.gif': [60, 120, 180, 240],
  // Drawn on twos: every frame is shown twice, so the frames beside the loop point do not move.
  'held.gif': [40, 40, 100, 100, 160, 160, 220, 220, 160, 160, 100, 100],
  'clips/count.mp4': [20, 40, 60, 80, 100, 120, 140, 160, 180, 200, 220, 240],
  'clips/ntsc.mp4': [30, 80, 130, 180, 230],
  'clips/cutout.webm': [40, 70, 100, 130, 160, 190, 220],
} as const;

export const unevenDelays = [5, 10, 20, 40];

/** Write the collection to `<assetsDir>/<collection>/`, replacing anything there. */
export const buildFixtureCollection = async (assetsDir: string, collection = 'fixture') => {
  const dir = path.join(assetsDir, collection);
  await rm(dir, {recursive: true, force: true});
  await mkdir(path.join(dir, 'clips'), {recursive: true});
  await mkdir(path.join(dir, 'type'), {recursive: true});
  const gif = (name: keyof typeof fixtureLevels, delays: number[], cutout = false) => writeFile(path.join(dir, name),
    encodeGif(16, 16, fixtureLevels[name].map((level, i) => ({level, delay: delays[i % delays.length], cutout}))));
  // A ramp that snaps back at the end, a ramp that returns smoothly, uneven timing with transparency,
  // and a smooth return whose frames are each held twice.
  await gif('steps.gif', [10]);
  await gif('pulse.gif', [8]);
  await gif('uneven.gif', unevenDelays, true);
  await gif('held.gif', [4]);
  const h264 = ['-c:v', 'libx264', '-pix_fmt', 'yuv420p'];
  await encodeVideo(path.join(dir, 'clips/count.mp4'), [...fixtureLevels['clips/count.mp4']], '12', h264);
  await encodeVideo(path.join(dir, 'clips/ntsc.mp4'), [...fixtureLevels['clips/ntsc.mp4']], '30000/1001', h264);
  // WebM stores milliseconds, so 30 fps cannot be written exactly, and VP9 keeps alpha on the side.
  await encodeVideo(path.join(dir, 'clips/cutout.webm'), [...fixtureLevels['clips/cutout.webm']], '30',
    ['-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-auto-alt-ref', '0'], true);
  for (const file of ['LabBlock-VF.ttf', 'LabStatic-Regular.ttf', 'LabStatic-BoldItalic.ttf']) {
    await copyFile(path.resolve('tests/fixtures/fonts', file), path.join(dir, 'type', file));
  }
  await writeFile(path.join(dir, 'notes.txt'), 'Not an asset.\n');
  return dir;
};
