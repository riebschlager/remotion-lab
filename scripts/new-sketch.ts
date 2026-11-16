/**
 * Scaffold a sketch folder and register it.
 *
 *   npm run sketch:new -- neon-rain "Neon Rain"
 */
import {existsSync} from 'node:fs';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';

const [id, givenTitle] = process.argv.slice(2);
if (!id || !/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(id)) {
  console.error('Usage: npm run sketch:new -- <kebab-case-id> ["Title"]');
  process.exit(2);
}
const dir = path.resolve('src/sketches', id);
if (existsSync(dir)) {
  console.error(`src/sketches/${id} already exists`);
  process.exit(1);
}

const words = id.split('-');
const title = givenTitle ?? words.map((word) => word[0].toUpperCase() + word.slice(1)).join(' ');
const pascal = words.map((word) => word[0].toUpperCase() + word.slice(1)).join('');
const camel = pascal[0].toLowerCase() + pascal.slice(1);

const sketch = `import React from 'react';
import {AbsoluteFill} from 'remotion';
import {zColor} from '@remotion/zod-types';
import {z} from 'zod';
import {useBeat} from '../../beat/BeatContext';
import {divisionBeats, pulse, step} from '../../beat/envelopes';
import {divisionSchema} from '../../beat/divisions';
import {useCanvas} from '../canvas';
import {defineSketch, divisionIssues} from '../define';

const schema = z.object({
  division: divisionSchema,
  color: zColor(),
});

const ${pascal}: React.FC<z.output<typeof schema>> = ({division, color}) => {
  const {beat, totalBeats, beatsPerBar} = useBeat();
  const {vmin} = useCanvas();
  const hit = step(beat, divisionBeats(division, beatsPerBar), totalBeats);
  const energy = pulse(hit.phase, {decay: 0.7});
  const size = (20 + 30 * energy) * vmin;
  return (
    <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
      <div style={{width: size, height: size, borderRadius: '50%', backgroundColor: color}} />
    </AbsoluteFill>
  );
};

export default defineSketch({
  id: '${id}',
  title: ${JSON.stringify(title)},
  description: 'TODO: one sentence on what this looks like.',
  schema,
  defaults: {division: '1/4', color: '#7fe7ff'},
  Component: ${pascal},
  validate: (props, timing) => divisionIssues('division', props.division, timing),
  debugDivisions: (props) => [props.division],
});
`;

const brief = `# ${title}

## Idea

What should this feel like? What is the one thing a viewer remembers?

## Rhythm

Tempo, bars and meter. What hits on which division; anything that rests or swings.

## Look

Palette, shapes, type, texture, references.

## Assets

"None", or the collection this sketch draws on. Read
collections/<collection>/manifest.json and the clips' filmstrips before
choosing, then list each asset with the facts that shaped the design:

- clip \`<collection>/<path>\`: frames, native fps, size, alpha, loops on its own?
  How it is driven (once every N beats, restarted per hit, one frame per hit).
- font \`<collection>/<Family>\`: weights or variable axes used.

## Notes

Constraints, target canvases, things to avoid.
`;

await mkdir(dir, {recursive: true});
await writeFile(path.join(dir, 'sketch.tsx'), sketch);
await writeFile(path.join(dir, 'brief.md'), brief);

const indexPath = path.resolve('src/sketches/index.ts');
const index = await readFile(indexPath, 'utf8');
const registered = index
  .replace(/((?:^import .*\n)+)/m, `$1import ${camel} from './${id}/sketch';\n`)
  .replace(/(export const sketches: Sketch\[\] = \[\n(?:.*\n)*?)(\];)/, `$1  ${camel},\n$2`);
if (registered === index || !registered.includes(`  ${camel},\n`)) {
  throw new Error('Could not register the sketch; add it to src/sketches/index.ts by hand');
}
await writeFile(indexPath, registered);

console.log(`Created src/sketches/${id}/ (sketch.tsx, brief.md) and registered it.
Next: write the brief, build the sketch, then run
  npm run preview -- ${id}`);
