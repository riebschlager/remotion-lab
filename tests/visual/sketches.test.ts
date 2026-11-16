import assert from 'node:assert/strict';
import path from 'node:path';
import {after, before, test} from 'node:test';
import {difference, inspectLoop, openSession, type Session} from '../../scripts/lib/render';
import {sketches} from '../../src/sketches';
import {seamLead} from '../../src/sketches/define';

let session: Session;
const artifacts = path.resolve('out/loop-tests/sketches');

before(async () => { session = await openSession(); }, {timeout: 120_000});
after(async () => { await session?.close(); });

// Every registered sketch gets these checks automatically, on a tall and a wide canvas.
for (const sketch of sketches) {
  for (const canvas of ['portrait', 'landscape'] as const) {
    test(`${sketch.id} (${canvas}) renders deterministically and loops`, async (t) => {
      const report = await inspectLoop(session, sketch.id, {canvas},
        {dir: path.join(artifacts, `${sketch.id}-${canvas}`)});
      t.diagnostic(`seam=${report.seamJump.toFixed(6)}, beside=${report.neighborMotion.toFixed(6)}, hit=${report.beatAttack.toFixed(6)}`);
      assert.equal(report.width > report.height, canvas === 'landscape');
      assert(report.deterministic, 'Frame 0 changed after out-of-order rendering');
      assert(report.seamOk, 'The loop point jumps more than any sampled motion');
    });
  }

  test(`${sketch.id} seam view shows the loop's own boundary frames`, async () => {
    const loop = await session.select(sketch.id);
    const seam = await session.select(`${sketch.id}-seam`);
    const lead = seamLead(loop.durationInFrames, loop.fps);
    assert.equal(seam.durationInFrames, lead * 2);
    const file = (name: string) => path.join(artifacts, `${sketch.id}-${name}.png`);
    assert.equal(difference(await session.still(loop, loop.durationInFrames - 1, file('loop-last'), 0.2),
      await session.still(seam, lead - 1, file('seam-before'), 0.2)), 0);
    assert.equal(difference(await session.still(loop, 0, file('loop-first'), 0.2),
      await session.still(seam, lead, file('seam-after'), 0.2)), 0);
  });

  test(`${sketch.id} rejects invalid props through Remotion`, async () => {
    await assert.rejects(session.select(sketch.id, {bpm: 0}), /bpm/);
    await assert.rejects(session.select(sketch.id, {canvas: 'custom'}), /customSize/);
  });
}
