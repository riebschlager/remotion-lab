import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {test} from 'node:test';
import {difference, missingSketchAssets, openSession} from '../../scripts/lib/render';
import {leakDefaults, portalDefaults} from '../../src/sketches/milhouse-slices/Portal';
import milhouseSlices from '../../src/sketches/milhouse-slices/sketch';

const missing = missingSketchAssets(milhouseSlices);
const skip = missing.length ? missing.join('; ') : false;
test('active Milhouse portals repeat exactly and respond visibly to portal and leak controls', {skip, timeout: 180_000}, async () => {
  const session = await openSession();
  const dir = path.resolve('out/loop-tests/milhouse-portal');
  await mkdir(dir, {recursive: true});
  try {
    const composition = await session.select('milhouse-slices');
    const peak = await session.still(composition, 5, path.join(dir, 'peak.png'), 0.3);
    await session.still(composition, 50, path.join(dir, 'later.png'), 0.3);
    const repeat = await session.still(composition, 5, path.join(dir, 'repeat.png'), 0.3);
    assert.equal(difference(peak, repeat), 0, 'Active portal frame depends on rendering history');
    const quiet = await session.select('milhouse-slices', {
      portal: {...portalDefaults, glow: 0, aurora: 0},
      lightLeak: {...leakDefaults, strength: 0, surfaceSpill: 0},
    });
    assert.ok(difference(peak, await session.still(quiet, 5, path.join(dir, 'quiet.png'), 0.3)) > 0.001);
    const noLeaks = await session.select('milhouse-slices', {lightLeak: {...leakDefaults, strength: 0, surfaceSpill: 0}});
    assert.ok(difference(peak, await session.still(noLeaks, 5, path.join(dir, 'no-leaks.png'), 0.3)) > 0.0001);
    const transparent = await session.select('milhouse-slices', {transparent: true});
    const alpha = await session.still(transparent, 5, path.join(dir, 'transparent.png'), 0.3);
    assert.equal(alpha.data[3], 0, 'Transparent portal rendering must leave the canvas corners clear');
  } finally {await session.close();}
});
