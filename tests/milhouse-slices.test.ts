import assert from 'node:assert/strict';
import {test} from 'node:test';
import {BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3} from 'three';
import {bakeModel, sliceBounce, sliceModel, sliceMotionPhase} from '../src/sketches/milhouse-slices/sliceGeometry';
import sketch from '../src/sketches/milhouse-slices/sketch';
import {portalDefaults} from '../src/sketches/milhouse-slices/Portal';

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

test('a split hold keeps the slices at peak and fits the rebound and rest before the next hit', () => {
  const hold = 0.4;
  const start = 0.32 * (1 - hold);
  const end = start + hold;
  const sample = (phase: number) => sliceBounce(sliceMotionPhase(phase, hold), 'ease-out', 'ease-in');
  for (const phase of [start, (start + end) / 2, end]) {
    assert.equal(sliceMotionPhase(phase, hold), 0.32);
    assert.equal(sample(phase), 1);
  }
  assert.ok(sample(start / 2) > 0.5, 'Ease out accelerates the opening early');
  assert.ok(sample(end + start / 2) > 0.5, 'Ease in delays reassembly');
  assert.ok(Math.abs(sample(hold + 0.76 * (1 - hold)) - 0.13) < 1e-10);
  assert.equal(sample(0.99), 0);
  assert.equal(sample(0), 0);
  for (const metadata of [sketch.metadata, sketch.seamMetadata]) {
    const legacy = metadata({...sketch.defaultProps, holdOpen: undefined, openEase: undefined, closeEase: undefined}).props;
    assert.deepEqual([legacy.holdOpen, legacy.openEase, legacy.closeEase], [0, 'smooth', 'smooth']);
    assert.doesNotThrow(() => metadata({...sketch.defaultProps, holdOpen: 0.8}));
    assert.throws(() => metadata({...sketch.defaultProps, holdOpen: 1}), /holdOpen/);
  }
});

test('both sketch metadata paths reject incompatible musical divisions', () => {
  const props = {...sketch.defaultProps, bars: 1, beatsPerBar: 3, division: '1/2'};
  assert.throws(() => sketch.metadata(props), /division/);
  assert.throws(() => sketch.seamMetadata(props), /division/);
});

test('four pose targets advance on quarter notes and wrap independently of render order', async () => {
  const {poseIndex} = await import('../src/sketches/milhouse-slices/poses');
  assert.deepEqual([0, 0.99, 1, 1.99, 2, 3, 4, 15.99, 16, -0.01].map(b => poseIndex(b, 16)),
    [0, 0, 1, 1, 2, 3, 0, 3, 0, 3]);
  for (const metadata of [sketch.metadata, sketch.seamMetadata]) {
    assert.throws(() => metadata({...sketch.defaultProps, bars: 1, beatsPerBar: 3, division: '1/4'}), /four-beat/);
    assert.throws(() => metadata({...sketch.defaultProps, poseTimes: [1, 2, 13, 99]}), /poseTimes/);
    assert.doesNotThrow(() => metadata({...sketch.defaultProps, division: '1/8'}));
  }
});

test('FBX pose baking preserves source rig and produces repeatable distinct meshes', async t => {
  const {existsSync, readFileSync} = await import('node:fs');
  const path = 'public/assets/milhouse-01/milhouse-2.fbx';
  if (!existsSync(path)) return t.skip('Supplied FBX runtime media is not on this machine');
  const {TextureLoader, Texture, Bone} = await import('three');
  const {FBXLoader} = await import('three/addons/loaders/FBXLoader.js');
  const {bakePoses, createPoseSampler, poseBlend, DEFAULT_POSE_TIMES} = await import('../src/sketches/milhouse-slices/poses');
  const originalLoad = TextureLoader.prototype.load;
  TextureLoader.prototype.load = function () { return new Texture(); };
  try {
    const bytes = readFileSync(path);
    const root = new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    const snapshot = () => {
      const values: number[][] = [];
      root.traverse(o => {if (o instanceof Bone) values.push([...o.position.toArray(), ...o.quaternion.toArray()]);});
      return values;
    };
    const before = snapshot();
    const models = bakePoses(root, DEFAULT_POSE_TIMES);
    assert.deepEqual(snapshot(), before);
    const points = (model: typeof models[number]) => model.triangles.flatMap(tri => tri.flatMap(v => v.p.toArray()));
    const reverse = bakePoses(root, [...DEFAULT_POSE_TIMES].reverse()).reverse();
    models.forEach((model, index) => {
      assert.deepEqual(points(model), points(reverse[index]));
      assert.ok(model.triangles.every(tri => tri.every(v => Math.abs(v.n.length() - 1) < 1e-8)));
      if (index) assert.notDeepEqual(points(model), points(models[0]));
      const sections = sliceModel(model, 8);
      const sourceArea = model.triangles.reduce((sum, [a, b, c]) =>
        sum + b.p.clone().sub(a.p).cross(c.p.clone().sub(a.p)).length() / 2, 0);
      assert.ok(Math.abs(sections.reduce((sum, section) => sum + area(section.surface), 0) - sourceArea) < 1e-4,
        'Shared pose bounds must retain the full animated surface in the horizontal slices');
      sections.forEach(section => {section.surface.dispose(); section.caps.dispose();});
    });
    const sampler = createPoseSampler(root, DEFAULT_POSE_TIMES);
    const midpoint = points(sampler.sample(0.5, 16));
    assert.notDeepEqual(midpoint, points(models[0]));
    assert.notDeepEqual(midpoint, points(models[1]));
    sampler.sample(3.75, 16);
    assert.deepEqual(points(sampler.sample(0.5, 16)), midpoint);
    assert.deepEqual(points(sampler.sample(16.5, 16)), midpoint);
    for (let i = 0; i < 4; i++) {
      assert.deepEqual(points(sampler.sample(i, 16)), points(models[i]));
      const before = points(sampler.sample(i - 1e-4, 16));
      const after = points(sampler.sample(i + 1e-4, 16));
      assert.ok(Math.max(...before.map((value, j) => Math.abs(value - after[j]))) < 1e-8,
        'Bone blending must meet continuously at every target and the loop seam');
      const blended = sampler.sample(i + 0.5, 16);
      const sections = sliceModel(blended, 8);
      const sourceArea = blended.triangles.reduce((sum, [a, b, c]) =>
        sum + b.p.clone().sub(a.p).cross(c.p.clone().sub(a.p)).length() / 2, 0);
      assert.ok(Math.abs(sections.reduce((sum, section) => sum + area(section.surface), 0) - sourceArea) < 1e-4,
        'Moving extremities must not be truncated at the endpoint bounds');
      sections.forEach(section => {section.surface.dispose(); section.caps.dispose();});
    }
    assert.deepEqual(poseBlend(3.5, 16), {from: 3, to: 0, mix: 0.5});
    assert.deepEqual(snapshot(), before);
    sampler.material.dispose();
    assert.throws(() => bakePoses(root, [99]), /poseTimes/);
    models[0].material.dispose(); reverse[0].material.dispose();
  } finally {TextureLoader.prototype.load = originalLoad;}
});

test('portal distance fields follow disconnected cap silhouettes without mutating source UVs', async () => {
  const {portalGeometry, FIELD_SIZE} = await import('../src/sketches/milhouse-slices/portalGeometry');
  const root = new Group();
  for (const x of [-0.75, 0.75]) {
    const mesh = new Mesh(new BoxGeometry(0.5, 1, 0.5), new MeshStandardMaterial());
    mesh.position.set(x, 0.5, 0); root.add(mesh);
  }
  const sections = sliceModel(bakeModel(root), 2);
  for (const section of sections) {
    const source = [...section.caps.getAttribute('uv').array];
    const a = portalGeometry(section.caps), b = portalGeometry(section.caps);
    assert.ok(a.texture.image.data && b.texture.image.data);
    assert.deepEqual([...a.texture.image.data], [...b.texture.image.data]);
    assert.deepEqual([...section.caps.getAttribute('uv').array], source);
    const data = a.texture.image.data;
    assert.ok(data);
    // Scan rows through the islands: normalized depth reaches 1 in each,
    // while the space between the two independent windows stays empty.
    let occupiedRows = 0;
    for (let y = 0; y < FIELD_SIZE * 2; y++) {
      const left: number[] = [], right: number[] = [];
      for (let x = 0; x < FIELD_SIZE; x++) {
        const i = (y * FIELD_SIZE + x) * 4;
        if (data[i + 2]) (x < FIELD_SIZE / 2 ? left : right).push(data[i]);
      }
      if (left.length && right.length) {
        occupiedRows++;
        assert.equal(data[(y * FIELD_SIZE + FIELD_SIZE / 2) * 4 + 2], 0);
      }
    }
    assert.ok(occupiedRows > 5);
    assert.ok([...data].includes(255));
    assert.ok(a.rays.getAttribute('position').count > 0);
    for (const field of [a, b]) {field.geometry.dispose(); field.rays.dispose(); field.texture.dispose();}
    section.surface.dispose(); section.caps.dispose();
  }
});

test('portal travel closes musically in both metadata paths and controls allow quiet/off treatments', () => {
  for (const metadata of [sketch.metadata, sketch.seamMetadata]) {
    assert.throws(() => metadata({...sketch.defaultProps, portal: {...portalDefaults, echoTravel: 0.2}}), /portal.echoTravel/);
    assert.doesNotThrow(() => metadata({...sketch.defaultProps, portal: {...portalDefaults, echoTravel: 0.25}}));
    assert.doesNotThrow(() => metadata({...sketch.defaultProps,
      portal: {...portalDefaults, glow: 0, aurora: 0, echoTravel: 0},
      lightLeak: {strength: 0, reach: 0, definition: 0, surfaceSpill: 0}}));
  }
});

test('cascade launches bottom-up, never interpenetrates, lands in order and rests at the seam', async () => {
  const {cascadeMotion, cascadeTiming, cascadeGaps, cascadeDefaults} = await import('../src/sketches/milhouse-slices/cascade');
  const n = 8, spread = 1.5, headings = Array.from({length: n}, (_, i) => i);
  const {slices, apex} = cascadeTiming(n, spread, cascadeDefaults);
  assert.ok(Math.abs(slices[n - 1].land - cascadeDefaults.landAt) < 1e-12, 'Gravity is solved so the top slice lands on time');
  for (let i = 1; i < n; i++) {
    assert.ok(slices[i].launch > slices[i - 1].launch && slices[i].land > slices[i - 1].land);
  }
  assert.ok(apex > 0 && apex < cascadeDefaults.landAt);
  for (let p = 0; p < 1; p += 0.01) {
    const motion = cascadeMotion(p, n, spread, cascadeDefaults, headings);
    assert.ok(cascadeGaps(motion).every(gap => gap >= 0));
    assert.deepEqual(cascadeMotion(p, n, spread, cascadeDefaults, headings), motion);
  }
  for (const p of [0, 1 - 1e-9]) {
    for (const m of cascadeMotion(p, n, spread, cascadeDefaults, headings)) {
      assert.ok(m.lift < 1e-6 && Math.abs(m.tilt) < 1e-4 && Math.abs(m.squash) < 1e-6, 'Rest at both sides of the seam');
    }
  }
  for (const metadata of [sketch.metadata, sketch.seamMetadata]) {
    const legacy = metadata({...sketch.defaultProps, motion: undefined, cascade: undefined}).props;
    assert.equal(legacy.motion, 'accordion', 'Saved looks without motion keep the original accordion');
    assert.deepEqual(legacy.cascade, cascadeDefaults);
    assert.throws(() => metadata({...sketch.defaultProps, cascade: {...cascadeDefaults, stagger: 0.4, landAt: 0.5}}), /cascade.landAt/);
    assert.throws(() => metadata({...sketch.defaultProps, cascade: {...cascadeDefaults, landAt: 0.9, bounce: 0.5}}), /cascade.bounce/);
  }
});
