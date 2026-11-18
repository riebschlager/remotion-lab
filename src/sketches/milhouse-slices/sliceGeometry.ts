import {
  Box3, BufferGeometry, DoubleSide, Float32BufferAttribute, Group, Matrix3,
  Mesh, MeshPhysicalMaterial, MeshStandardMaterial, ShapeUtils, SkinnedMesh, Vector2, Vector3,
} from 'three';

type Vertex = {p: Vector3; n: Vector3; uv: Vector2};
type Triangle = [Vertex, Vertex, Vertex];
export type Model = {triangles: Triangle[]; material: MeshStandardMaterial};
export type Section = {surface: BufferGeometry; caps: BufferGeometry; center: number};
const EPS = 1e-6;
const mix = (a: Vertex, b: Vertex, t: number): Vertex => ({
  p: a.p.clone().lerp(b.p, t), n: a.n.clone().lerp(b.n, t).normalize(), uv: a.uv.clone().lerp(b.uv, t),
});

/** Bake the current FBX pose; slices retain the supplied texture coordinates. */
export function bakeModel(root: Group, normalize = true, material?: MeshStandardMaterial): Model {
  root.updateMatrixWorld(true);
  const triangles: Triangle[] = [];
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    if (object instanceof SkinnedMesh) object.skeleton.update();
    const source = Array.isArray(object.material) ? object.material[0] : object.material;
    if (!material) material = new MeshPhysicalMaterial({
      map: source.map, color: '#ffffff', roughness: 0.46, metalness: 0, side: DoubleSide,
      clearcoat: 0.18, clearcoatRoughness: 0.36, ior: 1.46,
    });
    const geometry = object.geometry;
    const normalMatrix = new Matrix3().getNormalMatrix(object.matrixWorld);
    const count = geometry.index?.count ?? geometry.attributes.position.count;
    for (let i = 0; i < count; i += 3) {
      const triangle: Vertex[] = [];
      for (let j = 0; j < 3; j++) {
        const index = geometry.index ? geometry.index.getX(i + j) : i + j;
        const normal = new Vector3().fromBufferAttribute(geometry.attributes.normal, index);
        if (object instanceof SkinnedMesh) {
          // Transform the normal by the same weighted bone transform, excluding translation.
          object.applyBoneTransform(index, normal);
          normal.sub(object.applyBoneTransform(index, new Vector3())).normalize();
        }
        triangle.push({
          p: object.getVertexPosition(index, new Vector3()).applyMatrix4(object.matrixWorld),
          n: normal.applyMatrix3(normalMatrix).normalize(),
          uv: new Vector2().fromBufferAttribute(geometry.attributes.uv, index),
        });
      }
      triangles.push(triangle as Triangle);
    }
  });
  if (!material || !triangles.length) throw new Error('Milhouse FBX contains no renderable mesh.');
  const model = {triangles, material};
  if (normalize) normalizeModels([model]);
  return model;
}

/** One shared frame of reference: pose changes cannot resize the character. */
export type ModelNormalization = {origin: Vector3; scale: number};

export function applyNormalization(model: Model, {origin, scale}: ModelNormalization): Model {
  for (const triangle of model.triangles) for (const vertex of triangle) {
    vertex.p.sub(origin).multiplyScalar(scale);
  }
  return model;
}

export function normalizeModels(models: Model[]): ModelNormalization {
  const triangles = models.flatMap(model => model.triangles);
  const bounds = new Box3().setFromPoints(triangles.flatMap(t => t.map(v => v.p)));
  const center = bounds.getCenter(new Vector3());
  const scale = 5 / (bounds.max.y - bounds.min.y);
  const normalization = {origin: new Vector3(center.x, bounds.min.y, center.z), scale};
  for (const model of models) applyNormalization(model, normalization);
  return normalization;
}

function clipPolygon(vertices: Vertex[], y: number, above: boolean): Vertex[] {
  const result: Vertex[] = [];
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i], b = vertices[(i + 1) % vertices.length];
    const insideA = above ? a.p.y >= y : a.p.y <= y;
    const insideB = above ? b.p.y >= y : b.p.y <= y;
    if (insideA) result.push(a);
    if (insideA !== insideB) result.push(mix(a, b, (y - a.p.y) / (b.p.y - a.p.y)));
  }
  return result;
}

const geometryFrom = (triangles: Vertex[][], center: number) => {
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [];
  for (const triangle of triangles) for (const vertex of triangle) {
    positions.push(vertex.p.x, vertex.p.y - center, vertex.p.z);
    normals.push(...vertex.n.toArray()); uvs.push(...vertex.uv.toArray());
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  return geometry;
};

/** Stitch plane intersections into closed contours; triangulate only closed cuts. */
function capAt(triangles: Triangle[], y: number, normal: number): Vertex[][] {
  const key = (v: Vector3) => `${Math.round(v.x / EPS)},${Math.round(v.z / EPS)}`;
  const nodes = new Map<string, {p: Vector3; links: Set<string>}>();
  for (const triangle of triangles) {
    const points: Vector3[] = [];
    for (let i = 0; i < 3; i++) {
      const a = triangle[i].p, b = triangle[(i + 1) % 3].p;
      if ((a.y < y && b.y >= y) || (b.y < y && a.y >= y)) {
        const p = a.clone().lerp(b, (y - a.y) / (b.y - a.y));
        if (!points.some(q => q.distanceToSquared(p) < EPS * EPS)) points.push(p);
      }
    }
    if (points.length !== 2) continue;
    const [a, b] = points.map(key);
    if (a === b) continue;
    for (const [id, other, p] of [[a, b, points[0]], [b, a, points[1]]] as const) {
      if (!nodes.has(id)) nodes.set(id, {p, links: new Set()});
      nodes.get(id)!.links.add(other);
    }
  }
  const used = new Set<string>();
  const result: Vertex[][] = [];
  for (const start of nodes.keys()) {
    if (used.has(start)) continue;
    const contour: Vector3[] = [];
    let current = start, previous = '', closed = false;
    for (let guard = 0; guard <= nodes.size; guard++) {
      if (used.has(current)) { closed = current === start; break; }
      used.add(current);
      const node = nodes.get(current)!;
      contour.push(node.p);
      const next = [...node.links].find(id => id !== previous);
      if (!next) break;
      previous = current; current = next;
    }
    if (!closed || contour.length < 3) continue;
    const shape = contour.map(p => new Vector2(p.x, p.z));
    for (const face of ShapeUtils.triangulateShape(shape, [])) {
      const vertices = face.map(i => ({p: contour[i], n: new Vector3(0, normal, 0), uv: new Vector2()}));
      // XZ triangulation winds toward -Y. Match winding to the supplied normal
      // so DoubleSide shading does not flip a top face's light response inward.
      const cross = vertices[1].p.clone().sub(vertices[0].p)
        .cross(vertices[2].p.clone().sub(vertices[0].p));
      if (cross.y * normal < 0) [vertices[1], vertices[2]] = [vertices[2], vertices[1]];
      result.push(vertices);
    }
  }
  return result;
}

export function sliceModel(model: Model, count: number): Section[] {
  // Shared boundaries are computed identically on both sides: no rest-pose cracks.
  const caps = Array.from({length: count - 1}, (_, i) => capAt(model.triangles, 5 * (i + 1) / count, 1));
  return Array.from({length: count}, (_, index) => {
    const low = 5 * index / count, high = 5 * (index + 1) / count;
    const center = (low + high) / 2;
    const clipped: Vertex[][] = [];
    for (const triangle of model.triangles) {
      // The outer sections retain extremities that arc beyond endpoint pose bounds.
      let polygon: Vertex[] = triangle;
      if (index > 0) polygon = clipPolygon(polygon, low, true);
      if (index < count - 1) polygon = clipPolygon(polygon, high, false);
      for (let i = 1; i < polygon.length - 1; i++) clipped.push([polygon[0], polygon[i], polygon[i + 1]]);
    }
    const capTriangles = [
      ...(index > 0 ? caps[index - 1].map(t => [...t].reverse().map(v => ({...v, n: v.n.clone().negate()}))) : []),
      ...(index < count - 1 ? caps[index] : []),
    ];
    return {surface: geometryFrom(clipped, center), caps: geometryFrom(capTriangles, center), center};
  });
}

const peakPhase = 0.32;
const smooth = (t: number) => Math.sin(Math.PI * t / 2) ** 2;
const sliceEasing = {
  smooth,
  'ease-in': (t: number) => smooth(t * t),
  'ease-out': (t: number) => 1 - smooth((1 - t) ** 2),
  linear: (t: number) => t,
};
export const sliceEaseOptions = ['smooth', 'ease-in', 'ease-out', 'linear'] as const;

/** Insert a plateau at the launch peak and fit the other stages around it. */
export function sliceMotionPhase(phase: number, holdOpen: number, peak = peakPhase): number {
  if (holdOpen === 0) return phase;
  const movingTime = 1 - holdOpen;
  const holdStart = peak * movingTime;
  if (phase < holdStart) return phase / movingTime;
  if (phase <= holdStart + holdOpen) return peak;
  return (phase - holdOpen) / movingTime;
}

/** Opening, closing, and a smaller rebound after reassembly. */
export function sliceBounce(
  phase: number,
  openEase: keyof typeof sliceEasing = 'smooth',
  closeEase: keyof typeof sliceEasing = 'smooth',
): number {
  if (phase < peakPhase) return sliceEasing[openEase](phase / peakPhase);
  if (phase < 0.64) return 1 - sliceEasing[closeEase]((phase - peakPhase) / peakPhase);
  if (phase < 0.88) return 0.13 * Math.sin(Math.PI * (phase - 0.64) / 0.24) ** 2;
  return 0;
}
