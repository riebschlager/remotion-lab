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

## Original brief

Preserve the request, exact copy and must-haves here. Separate supplied facts
from assumptions made while designing.

## Idea and hierarchy

What should this feel like? What does the viewer notice first and remember?
What supports it, and what stays quiet?

## Rhythm

Tempo, bars and meter. Give each element a musical role: its division or
pattern, rests, accents, offset and motion between hits. Explain why they
belong together and where they deliberately differ.

## Look and copy

Palette, shapes, texture, type treatment. Exact words and explicit line breaks;
how long important copy stays readable. What must not appear?

## Assets and treatment

"None", or the collection this sketch draws on. Read its manifest and open
each candidate clip's filmstrip before choosing. Record the evidence:

- clip \`<collection>/<path>\`: frame count, native fps, shape, alpha,
  loop flag and internal cuts. Chosen Clip mode, phrase length, and cut handling.
- font \`<collection>/<Family>\`: actual face/axes and supported copy.
  Type split and all/sequence/stagger treatment, with fitting margins.

## Canvas and success criteria

Primary canvas and a second shape. What must remain legible, prominent or
uncropped on both? Describe observable signs the rhythm and mood are working.

## Review notes

After previewing, record what the contact sheets showed, what changed and why,
and any intended seam hit or remaining compromise. Link preserved sheets for
both canvases; the preview command overwrites the same output directory.

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
