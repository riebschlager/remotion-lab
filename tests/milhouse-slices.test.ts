import assert from 'node:assert/strict';
import {test} from 'node:test';
import {BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3} from 'three';
import {bakeModel, sliceBounce, sliceModel} from '../src/sketches/milhouse-slices/sliceGeometry';
import sketch from '../src/sketches/milhouse-slices/sketch';

const boxModel = () => {
  const root = new Group();
  const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial());
  mesh.position.y = 0.5;
  root.add(mesh);
  return bakeModel(root);
};

const area = (geometry: ReturnType<typeof sliceModel>[number]['surface']) => {
  const p = geometry.getAttribute('position');
  let sum = 0;
  for (let i = 0; i < p.count; i += 3) {
    const ax = p.getX(i + 1) - p.getX(i), ay = p.getY(i + 1) - p.getY(i), az = p.getZ(i + 1) - p.getZ(i);
    const bx = p.getX(i + 2) - p.getX(i), by = p.getY(i + 2) - p.getY(i), bz = p.getZ(i + 2) - p.getZ(i);
    sum += Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx) / 2;
  }
  return sum;
};

test('horizontal cuts preserve the surface, interpolate UVs and cap both cut faces', () => {
  const model = boxModel();
  const sections = sliceModel(model, 5);
  assert.ok(Math.abs(sections.reduce((sum, s) => sum + area(s.surface), 0) - 150) < 1e-5);
  for (const [i, section] of sections.entries()) {
    const positions = section.surface.getAttribute('position');
    const uv = section.surface.getAttribute('uv');
    for (let j = 0; j < positions.count; j++) {
      const worldY = positions.getY(j) + section.center;
      assert.ok(worldY >= i - 1e-6 && worldY <= i + 1 + 1e-6);
      assert.ok(uv.getX(j) >= 0 && uv.getX(j) <= 1);
      assert.ok(uv.getY(j) >= 0 && uv.getY(j) <= 1);
    }
    assert.ok(Math.abs(area(section.caps) - (i === 0 || i === 4 ? 25 : 50)) < 1e-5);
    // A mismatch lights a visible cut face as an interior-facing surface.
    const cap = section.caps.getAttribute('position');
    const normals = section.caps.getAttribute('normal');
    for (let j = 0; j < cap.count; j += 3) {
      const a = new Vector3().fromBufferAttribute(cap, j);
      const b = new Vector3().fromBufferAttribute(cap, j + 1).sub(a);
      const c = new Vector3().fromBufferAttribute(cap, j + 2).sub(a);
      const normal = new Vector3().fromBufferAttribute(normals, j);
      assert.ok(b.cross(c).dot(normal) >= -1e-10, 'Cut-face winding must agree with its outward normal');
    }
  }
  const replay = sliceModel(model, 5);
  assert.deepEqual(replay.map(s => [...s.surface.getAttribute('position').array]),
    sections.map(s => [...s.surface.getAttribute('position').array]));
});

test('slice bounce launches, rebounds, settles and closes continuously', () => {
  assert.equal(sliceBounce(0), 0);
  assert.equal(sliceBounce(0.32), 1);
  assert.ok(Math.abs(sliceBounce(0.76) - 0.13) < 1e-10);
  assert.equal(sliceBounce(0.9), 0);
  assert.equal(sliceBounce(1), 0);
  for (const join of [0, 0.64, 0.88, 1]) {
    const before = sliceBounce((join - 1e-6 + 1) % 1);
    const after = sliceBounce((join + 1e-6) % 1);
    assert.ok(Math.abs(before - after) < 1e-8);
  }
});

test('both sketch metadata paths reject incompatible musical divisions', () => {
  const props = {...sketch.defaultProps, bars: 1, beatsPerBar: 3, division: '1/2'};
  assert.throws(() => sketch.metadata(props), /division/);
  assert.throws(() => sketch.seamMetadata(props), /division/);
});
