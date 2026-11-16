import assert from 'node:assert/strict';
import {readFile, realpath, access} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (file) => readFile(path.join(root, file), 'utf8');
const lock = JSON.parse(await read('skills-lock.json'));
const {dependencies} = JSON.parse(await read('package.json'));
const expected = ['best-practices', 'captions', 'create', 'docs', 'interactivity',
  'license', 'maps', 'markup', 'multimedia', 'render', 'saas', 'studio', 'upgrade'];

try {
  for (const suffix of expected) {
    const name = `remotion-${suffix}`;
    assert.equal(lock.skills[name]?.source, 'remotion-dev/skills', `${name}: missing official source in skills-lock.json`);
    const entry = `.agents/skills/${name}/SKILL.md`;
    const content = await read(entry);
    assert(content.includes(`name: ${name}\n`), `${entry}: unexpected skill name`);
    assert(content.includes(`version: ${dependencies.remotion}\n`), `${entry}: skill version differs from Remotion; review npm run skills:update`);
    assert.equal(await realpath(path.join(root, '.claude/skills', name)),
      await realpath(path.join(root, '.agents/skills', name)), `${name}: Claude link does not target the shared skill`);
  }
  // The router ships a nested reference tree. A copied SKILL.md alone is insufficient.
  const router = '.agents/skills/remotion-best-practices';
  const content = await read(`${router}/SKILL.md`);
  for (const [, target] of content.matchAll(/\]\((\.\/[^)]+)\)/g)) {
    await access(path.resolve(root, router, target));
  }
  await access(path.join(root, 'AGENTS.md'));
  for (const name of ['beat-loop', 'brief-to-sketch']) {
    const entry = `.agents/skills/${name}/SKILL.md`;
    const content = await read(entry);
    assert(content.includes(`name: ${name}\n`), `${entry}: unexpected skill name`);
    assert.equal(await realpath(path.join(root, '.claude/skills', name)),
      await realpath(path.join(root, '.agents/skills', name)), `${name}: missing shared Claude link`);
    for (const [, target] of content.matchAll(/\]\((\.\.?\/[^)]+)\)/g)) {
      await access(path.resolve(root, `.agents/skills/${name}`, target));
    }
  }
  console.log(`Agent setup OK: ${expected.length} official skills, router references, local beat-loop/brief-to-sketch skills and Claude links.`);
} catch (error) {
  console.error(`Agent setup check failed: ${error.message}\nRestore checked-in skills or run npm run skills:add, then review changes.`);
  process.exitCode = 1;
}
