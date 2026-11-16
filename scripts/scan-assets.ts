/**
 * Describe the asset collections in public/assets/ for agents.
 *
 *   npm run assets:scan             every collection folder that is present
 *   npm run assets:scan -- retro    only public/assets/retro/
 *
 * Writes collections/<collection>/manifest.json and filmstrips/, and
 * regenerates collections/index.ts. Descriptions and tags already written
 * into a manifest are kept.
 */
import path from 'node:path';
import {scanAssets} from './lib/scan';

const only = process.argv.slice(2);
const relative = (file: string) => path.relative(process.cwd(), file);

try {
  const {reports, invalid, absent} = await scanAssets({only, log: (message) => console.log(message)});
  if (!reports.length && !invalid.length) {
    console.log('No collections found. Put a folder of GIFs, videos or fonts in public/assets/<collection>/ and run this again.');
  }
  for (const report of reports) {
    console.log(`\n${report.collection}: ${report.clips} clips, ${report.fonts} font families — ${relative(report.manifest)} ${report.status}`);
    for (const name of report.removed) console.log(`  removed (file is gone; its description and tags went with it): ${name}`);
    for (const name of report.skipped) console.log(`  skipped (not a supported clip or font): ${name}`);
    for (const message of report.warnings) console.log(`  warning: ${message}`);
    for (const message of report.failed) console.error(`  FAILED ${message}`);
  }
  for (const name of invalid) {
    console.error(`\nSkipped public/assets/${name}: rename the folder to lowercase letters, digits and hyphens.`);
  }
  if (absent.length) console.log(`\nLeft untouched (media not on this machine): ${absent.join(', ')}`);
  if (invalid.length || reports.some((report) => report.failed.length)) process.exitCode = 1;
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
}
