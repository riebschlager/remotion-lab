/**
 * Export finished loops for social posts and downstream projects.
 *
 *   npm run export -- pulse-grid
 *   npm run export -- pulse-grid --repeat=4 --canvas=portrait,square
 *   npm run export -- pulse-grid --profile=downstream --props='{"bpm":128}'
 *   npm run export -- PresetLoop --props='{"preset":"amber-echo"}' --repeat=2
 *
 * Each output gets a sidecar `<file>.json` stating its tempo. See README.md.
 */
import {readFile} from 'node:fs/promises';
import {missingAssetsHint} from '../src/assets';
import {findSketch} from '../src/sketches';
import {exportUsage, jobProps, parseExportArgs, type ExportOptions} from './lib/export';
import {runExport, type ExportJob} from './lib/export-render';
import {missingSketchAssets, openSession} from './lib/render';

let options: ExportOptions;
let inputProps: Record<string, unknown>;
let jobs: ExportJob[];
try {
  options = parseExportArgs(process.argv.slice(2));
  const raw = options.props;
  inputProps = raw ? JSON.parse(raw.startsWith('{') ? raw : await readFile(raw, 'utf8')) : {};
  const isSketch = Boolean(findSketch(options.id));
  jobs = (options.canvases ?? [null]).flatMap((canvas) => options.profiles.map((profile) =>
    ({profile, props: jobProps({id: options.id, isSketch, inputProps, profile, canvas})})));
} catch (error) {
  console.error(`${(error as Error).message}\n\n${exportUsage}`);
  process.exit(2);
}
const {id, repeat, tag, outDir} = options;

// A sketch whose props are invalid or whose collection is not on this machine
// cannot render: say so for every canvas before bundling anything.
const sketch = findSketch(id);
if (sketch) {
  let missing: string[];
  try {
    missing = [...new Set(jobs.flatMap((job) => missingSketchAssets(sketch, job.props)))];
  } catch (error) {
    console.error(`Cannot export "${id}": ${(error as Error).message}`);
    process.exit(1);
  }
  if (missing.length) {
    console.error(`Cannot export "${id}":\n${missing.map((line) => `  ${line}`).join('\n')}\n${missingAssetsHint}`);
    process.exit(1);
  }
}

const session = await openSession();
try {
  await runExport(session, {id, jobs, repeat, tag, outDir, production: options.production, log: (message) => console.log(message)});
} finally {
  await session.close();
}
