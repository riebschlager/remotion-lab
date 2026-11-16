/** Shared still-rendering, loop checks and contact sheets for previews and visual tests. */
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {openBrowser, renderStill, selectComposition} from '@remotion/renderer';
import {PNG} from 'pngjs';

export type Session = Awaited<ReturnType<typeof openSession>>;
type Composition = Awaited<ReturnType<typeof selectComposition>>;

export const openSession = async () => {
  const bundleDir = await mkdtemp(path.join(tmpdir(), 'remotion-lab-'));
  const serveUrl = await bundle({entryPoint: path.resolve('src/index.ts'), outDir: bundleDir});
  const browser = await openBrowser('chrome');
  return {
    select: (id: string, inputProps: Record<string, unknown> = {}) =>
      selectComposition({serveUrl, id, inputProps, puppeteerInstance: browser}),
    still: async (composition: Composition, frame: number, output: string, scale: number) => {
      await renderStill({serveUrl, composition, inputProps: composition.props, frame, output,
        imageFormat: 'png', scale, puppeteerInstance: browser, isProduction: false});
      return PNG.sync.read(await readFile(output));
    },
    close: async () => {
      try { await browser.close({silent: true}); }
      finally { await rm(bundleDir, {recursive: true, force: true}); }
    },
  };
};

/** Mean absolute RGB difference of decoded pixels, normalized to 0..1. */
export const difference = (a: PNG, b: PNG) => {
  if (a.width !== b.width || a.height !== b.height) throw new Error('Cannot compare frames of different sizes');
  let sum = 0;
  for (let i = 0; i < a.data.length; i++) if (i % 4 !== 3) sum += Math.abs(a.data[i] - b.data[i]);
  return sum / (a.width * a.height * 3 * 255);
};

export type LoopReport = {
  id: string;
  width: number; height: number; fps: number; durationInFrames: number; totalBeats: number;
  /** Frame 0 rendered again after every other frame. Must be identical. */
  deterministic: boolean;
  /** Change from the last frame to frame 0. */
  seamJump: number;
  /** Average change between the frames just before and just after the seam. */
  neighborMotion: number;
  /** Largest change onto a sampled interior beat: what an intended hit looks like. */
  beatAttack: number;
  seamOk: boolean;
  rows: Array<{name: string; cells: Array<{frame: number; beat: number}>}>;
  sheet: string;
};

/**
 * Render a spread of frames from one loop, check it and lay out a contact sheet.
 *
 * The seam heuristic allows a jump at the loop point as large as ordinary
 * motion beside it or an intended hit elsewhere in the loop. It is a
 * regression aid, not a proof: look at the sheet's seam row as well.
 */
export const inspectLoop = async (session: Session, id: string, inputProps: Record<string, unknown>,
  {dir, scale = 0.2}: {dir: string; scale?: number}): Promise<LoopReport> => {
  const composition = await session.select(id, inputProps);
  const {durationInFrames: n, fps, width, height} = composition;
  const props = composition.props as {bars?: number; beatsPerBar?: number};
  const totalBeats = (props.bars ?? 4) * (props.beatsPerBar ?? 4);
  await rm(dir, {recursive: true, force: true});
  await mkdir(path.join(dir, 'frames'), {recursive: true});

  const wrap = (frame: number) => ((frame % n) + n) % n;
  const cache = new Map<number, PNG>();
  const frame = async (index: number) => {
    const f = wrap(index);
    if (!cache.has(f)) {
      cache.set(f, await session.still(composition, f, path.join(dir, 'frames', `${String(f).padStart(5, '0')}.png`), scale));
    }
    return cache.get(f)!;
  };

  const count = Math.max(1, Math.min(8, totalBeats, Math.floor(n / 2)));
  const beats = Array.from({length: count}, (_, i) => Math.floor((i * totalBeats) / count));
  // The first frame at or after each onset, which is where a zero-attack hit peaks.
  const onBeat = beats.map((beat) => wrap(Math.ceil((beat * n) / totalBeats - 1e-9)));
  const offBeat = beats.map((beat) => wrap(Math.round(((beat + 0.5) * n) / totalBeats)));
  const seam = [...new Set([-3, -2, -1, 0, 1, 2].map(wrap))];

  // Seam first, then the rest: frames must not depend on render order.
  for (const f of [...seam, ...offBeat, ...onBeat]) await frame(f);
  const attacks = [];
  for (const f of onBeat.slice(1)) attacks.push(difference(await frame(f - 1), await frame(f)));
  const repeat = await session.still(composition, 0, path.join(dir, 'frames', 'repeat-00000.png'), scale);

  const first = await frame(0);
  const seamJump = difference(await frame(n - 1), first);
  const neighborMotion = (difference(await frame(n - 2), await frame(n - 1)) + difference(first, await frame(1))) / 2;
  const beatAttack = Math.max(0, ...attacks);

  const beatOf = (f: number) => (f * totalBeats) / n;
  const rows = [
    {name: 'on the beat', cells: onBeat},
    {name: 'half a beat later', cells: offBeat},
    {name: 'across the seam', cells: seam},
  ].map((row) => ({name: row.name, cells: row.cells.map((f) => ({frame: f, beat: beatOf(f)}))}));

  const sheet = path.join(dir, 'sheet.png');
  await writeFile(sheet, PNG.sync.write(contactSheet(rows.map((row, r) => row.cells.map((cell, c) => ({
    image: cache.get(cell.frame)!, label: `F${cell.frame} B${cell.beat.toFixed(2)}`,
    // Mark the loop point between the last frame and frame 0.
    divider: r === 2 && cell.frame === 0 && c > 0,
  }))))));

  const report: LoopReport = {
    id, width, height, fps, durationInFrames: n, totalBeats,
    deterministic: difference(first, repeat) === 0,
    seamJump, neighborMotion, beatAttack,
    seamOk: seamJump <= Math.max(2 * neighborMotion, 1.25 * beatAttack) + 0.001,
    rows, sheet,
  };
  await writeFile(path.join(dir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  return report;
};

// A 3×5 pixel font: enough to stamp frame and beat numbers onto the sheet.
const glyphs: Record<string, string> = {
  0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111',
  4: '101101111001001', 5: '111100111001111', 6: '111100111101111', 7: '111001001001001',
  8: '111101111101111', 9: '111101111001111', '.': '000000000000010', F: '111100110100100',
  B: '110101110101110',
};

const fill = (png: PNG, x0: number, y0: number, w: number, h: number, [r, g, b]: number[]) => {
  for (let y = Math.max(0, y0); y < Math.min(png.height, y0 + h); y++) {
    for (let x = Math.max(0, x0); x < Math.min(png.width, x0 + w); x++) {
      const i = (y * png.width + x) * 4;
      png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = b; png.data[i + 3] = 255;
    }
  }
};

const stamp = (png: PNG, text: string, x: number, y: number, size: number) => {
  [...text].forEach((character, index) => {
    const glyph = glyphs[character];
    if (!glyph) return;
    [...glyph].forEach((bit, i) => {
      if (bit === '1') fill(png, x + index * size * 4 + (i % 3) * size, y + Math.floor(i / 3) * size, size, size, [235, 235, 235]);
    });
  });
};

type Cell = {image: PNG; label: string; divider?: boolean};

/** Rows of labelled frames on a dark gray ground, so black frames stay visible. */
export const contactSheet = (rows: Cell[][]) => {
  const {width: w, height: h} = rows[0][0].image;
  const size = Math.max(2, Math.round(w / 110));
  const gap = size * 4;
  const strip = size * 9;
  const columns = Math.max(...rows.map((row) => row.length));
  const sheet = new PNG({width: gap + columns * (w + gap), height: gap + rows.length * (h + strip + gap)});
  fill(sheet, 0, 0, sheet.width, sheet.height, [38, 38, 44]);
  rows.forEach((row, r) => row.forEach((cell, c) => {
    const x = gap + c * (w + gap);
    const y = gap + r * (h + strip + gap);
    stamp(sheet, cell.label, x, y + size * 2, size);
    // Composite over black: transparent sketches would otherwise read as gray.
    fill(sheet, x, y + strip, w, h, [0, 0, 0]);
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const from = (py * w + px) * 4;
        const to = ((y + strip + py) * sheet.width + x + px) * 4;
        const alpha = cell.image.data[from + 3] / 255;
        for (let k = 0; k < 3; k++) sheet.data[to + k] = Math.round(cell.image.data[from + k] * alpha);
      }
    }
    if (cell.divider) fill(sheet, Math.round(x - gap / 2 - size / 2), y, size, h + strip, [255, 80, 80]);
  }));
  return sheet;
};
