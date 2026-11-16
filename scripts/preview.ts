/**
 * Render a contact sheet for one composition and check that it loops.
 *
 *   npm run preview -- pulse-grid
 *   npm run preview -- pulse-grid --props='{"canvas":"square","bpm":128}'
 *   npm run preview -- PresetLoop --props=./my-look.json --scale=0.3
 */
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {findSketch} from '../src/sketches';
import {missingAssetsHint} from '../src/assets';
import {inspectLoop, missingSketchAssets, openSession} from './lib/render';

const {values, positionals} = parseArgs({allowPositionals: true, options: {
  props: {type: 'string'}, scale: {type: 'string'}, strict: {type: 'boolean'},
}});
const [id] = positionals;
if (!id) {
  console.error('Usage: npm run preview -- <composition-id> [--props=<json|file>] [--scale=0.2] [--strict]');
  process.exit(2);
}

const scale = Number(values.scale ?? 0.2);
if (!(scale > 0 && scale <= 1)) throw new Error('--scale must be above 0 and at most 1');
const raw = values.props?.trim();
const inputProps = raw ? JSON.parse(raw.startsWith('{') ? raw : await readFile(raw, 'utf8')) : {};

// A sketch whose collection is not on this machine cannot render: say so before bundling.
const sketch = findSketch(id.replace(/-seam$/, ''));
if (sketch) {
  let missing: string[] = [];
  try { missing = missingSketchAssets(sketch, inputProps); } catch { /* Invalid props are reported by the render below. */ }
  if (missing.length) {
    console.error(`Cannot preview "${id}":\n${missing.map((line) => `  ${line}`).join('\n')}\n${missingAssetsHint}`);
    process.exit(1);
  }
}

const session = await openSession();
try {
  const report = await inspectLoop(session, id, inputProps, {dir: path.resolve('out/preview', id), scale});
  const fixed = (value: number) => value.toFixed(5);
  console.log(`\n${id}: ${report.width}×${report.height}, ${report.durationInFrames} frames at ${report.fps} fps, ${report.totalBeats} beats`);
  for (const row of report.rows) {
    console.log(`  row "${row.name}": frames ${row.cells.map((cell) => cell.frame).join(', ')}`);
  }
  console.log(`  determinism: ${report.deterministic ? 'PASS' : 'FAIL — frame 0 changed when rendered again; look for state, clocks or unseeded randomness'}`);
  console.log(`  seam:        ${report.seamOk ? 'PASS' : 'WARN — the loop point jumps more than any sampled motion; inspect the seam row'}`
    + ` (jump ${fixed(report.seamJump)}, beside it ${fixed(report.neighborMotion)}, interior hit ${fixed(report.beatAttack)})`);
  console.log(`  sheet:       ${report.sheet}`);
  if (!report.deterministic || (values.strict && !report.seamOk)) process.exitCode = 1;
} finally {
  await session.close();
}
