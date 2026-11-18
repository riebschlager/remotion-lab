import {Box3, BufferGeometry, Float32BufferAttribute, Plane, Quaternion, ShapeUtils, Vector2, Vector3} from 'three';
import type {Model, Triangle, Vertex} from './model';

const UP = new Vector3(0, 1, 0);
const EPS = 1e-6;
const tierNormal = new Vector3(-0.19, 1, 0.12).normalize();
const makeCut = (normal: Vector3, point: Vector3) => new Plane().setFromNormalAndCoplanarPoint(normal.normalize(), point);
const tierCuts = [1.05, 2.28, 3.55].map(y => makeCut(tierNormal.clone(), new Vector3(0, y, 0)));
// Offsets and alternating inclinations keep the fractures from forming a grid.
export const sideCuts = [
  makeCut(new Vector3(1, 0.3, 0.5), new Vector3(-0.08, 0.52, 0)),
  makeCut(new Vector3(1, -0.32, -0.63), new Vector3(0.17, 1.65, 0)),
  makeCut(new Vector3(1, 0.42, 0.75), new Vector3(-0.18, 2.91, 0)),
  makeCut(new Vector3(1, -0.42, -0.52), new Vector3(0.1, 4.21, 0)),
];
export const tierCount = sideCuts.length;
const cuts = [...tierCuts, ...sideCuts];

type Facet = {vertices: Triangle; cut: number | null};
type CutFace = {cut: number; caps: BufferGeometry; offset: Vector3; rotation: Quaternion};
export type Chunk = {tier: number; side: -1 | 1; center: Vector3; surface: BufferGeometry; faces: CutFace[]};

function triangulate(vertices: Vertex[], cut: number | null): Facet[] {
  const result: Facet[] = [];
  for (let i = 1; i < vertices.length - 1; i++) {
    result.push({vertices: [vertices[0], vertices[i], vertices[i + 1]], cut});
  }
  return result;
}

/** Both halves use the same intersection vertices, including on earlier caps. */
function split(facets: Facet[], cut: number): [Facet[], Facet[]] {
  const plane = cuts[cut];
  const halves: [Facet[], Facet[]] = [[], []];
  const segments: [Vector3, Vector3][] = [];
  for (const {vertices, cut: source} of facets) {
    const polygons: [Vertex[], Vertex[]] = [[], []];
    const intersections: Vector3[] = [];
    for (let i = 0; i < 3; i++) {
      const a = vertices[i], b = vertices[(i + 1) % 3];
      const da = plane.distanceToPoint(a.p), db = plane.distanceToPoint(b.p);
      polygons[da < 0 ? 0 : 1].push(a);
      if ((da < 0) === (db < 0)) continue;
      const t = da / (da - db);
      const v = {
        p: a.p.clone().lerp(b.p, t),
        n: a.n.clone().lerp(b.n, t).normalize(),
        uv: a.uv.clone().lerp(b.uv, t),
      };
      polygons[0].push(v);
      polygons[1].push(v);
      intersections.push(v.p);
    }
    halves[0].push(...triangulate(polygons[0], source));
    halves[1].push(...triangulate(polygons[1], source));
    if (intersections.length === 2 && intersections[0].distanceToSquared(intersections[1]) >= EPS ** 2) {
      segments.push([intersections[0], intersections[1]]);
    }
  }
  for (const vertices of capTriangles(segments, plane.normal)) {
    halves[0].push({vertices, cut});
    const opposite = (v: Vertex) => ({...v, n: v.n.clone().negate()});
    halves[1].push({vertices: [opposite(vertices[0]), opposite(vertices[2]), opposite(vertices[1])], cut});
  }
  return halves;
}

/** Stitch closed contours in the cut plane, then fill them with outward-facing triangles. */
function capTriangles(segments: [Vector3, Vector3][], normal: Vector3): Triangle[] {
  const key = (p: Vector3) => p.toArray().map(v => Math.round(v / EPS)).join(',');
  type ContourNode = {point: Vector3; neighbors: Set<string>};
  const nodes = new Map<string, ContourNode>();
  for (const [a, b] of segments) {
    const aKey = key(a), bKey = key(b);
    if (aKey === bKey) continue;
    for (const [id, other, point] of [[aKey, bKey, a], [bKey, aKey, b]] as const) {
      if (!nodes.has(id)) nodes.set(id, {point, neighbors: new Set()});
      nodes.get(id)!.neighbors.add(other);
    }
  }
  const toPlane = new Quaternion().setFromUnitVectors(normal, UP);
  const visited = new Set<string>();
  const triangles: Triangle[] = [];
  for (const start of nodes.keys()) {
    if (visited.has(start)) continue;
    let current: string | undefined = start, previous: string | undefined;
    const contour: Vector3[] = [];
    while (current !== undefined && !visited.has(current)) {
      visited.add(current);
      const node: ContourNode = nodes.get(current)!;
      contour.push(node.point);
      const next: string | undefined = [...node.neighbors].find(id => id !== previous);
      previous = current;
      current = next;
    }
    if (current !== start || contour.length < 3) continue;
    const shape = contour.map(p => {
      const local = p.clone().applyQuaternion(toPlane);
      return new Vector2(local.x, local.z);
    });
    for (const indices of ShapeUtils.triangulateShape(shape, [])) {
      const triangle = indices.map(i => ({p: contour[i], n: normal, uv: new Vector2()})) as Triangle;
      const cross = triangle[1].p.clone().sub(triangle[0].p).cross(triangle[2].p.clone().sub(triangle[0].p));
      if (cross.dot(normal) < 0) [triangle[1], triangle[2]] = [triangle[2], triangle[1]];
      triangles.push(triangle);
    }
  }
  return triangles;
}

function geometryFrom(triangles: Triangle[], origin: Vector3, rotation: Quaternion) {
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [];
  for (const triangle of triangles) for (const vertex of triangle) {
    positions.push(...vertex.p.clone().sub(origin).applyQuaternion(rotation).toArray());
    normals.push(...vertex.n.clone().applyQuaternion(rotation).toArray());
    uvs.push(...vertex.uv.toArray());
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  return geometry;
}

function makeChunk(facets: Facet[], tier: number, side: Chunk['side']): Chunk | null {
  const skin = facets.filter(f => f.cut === null).map(f => f.vertices);
  if (!skin.length) return null;
  const center = new Box3().setFromPoints(skin.flatMap(triangle => triangle.map(v => v.p))).getCenter(new Vector3());
  const surface = geometryFrom(skin, center, new Quaternion());
  const faces = cuts.flatMap((plane, cut) => {
    const triangles = facets.filter(f => f.cut === cut).map(f => f.vertices);
    if (!triangles.length) return [];
    // Feed the existing portal shader a planar surface in its native XZ coordinates.
    const origin = plane.projectPoint(center, new Vector3());
    const rotation = new Quaternion().setFromUnitVectors(UP, triangles[0][0].n);
    const caps = geometryFrom(triangles, origin, rotation.clone().invert());
    return [{cut, caps, offset: origin.sub(center), rotation}];
  });
  const distances = skin.flatMap(triangle => triangle.map(v =>
    faces.reduce((distance, face) => Math.min(distance, Math.abs(cuts[face.cut].distanceToPoint(v.p))), 5)));
  surface.setAttribute('cutDistance', new Float32BufferAttribute(distances, 1));
  return {tier, side, center, surface, faces};
}

export function chunkModel(model: Model): Chunk[] {
  let remaining: Facet[] = model.triangles.map(vertices => ({vertices, cut: null}));
  const tiers = tierCuts.map((_, index) => {
    const [lower, upper] = split(remaining, index);
    remaining = upper;
    return lower;
  });
  tiers.push(remaining);
  return tiers.flatMap((facets, tier) => {
    const [negative, positive] = split(facets, tierCuts.length + tier);
    return [makeChunk(negative, tier, -1), makeChunk(positive, tier, 1)].filter(chunk => chunk !== null);
  });
}
