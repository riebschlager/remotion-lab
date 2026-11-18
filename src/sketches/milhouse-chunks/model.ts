import {
  Box3, DoubleSide, Group, Matrix3,
  Mesh, MeshPhysicalMaterial, MeshStandardMaterial, SkinnedMesh, Vector2, Vector3,
} from 'three';

export type Vertex = {p: Vector3; n: Vector3; uv: Vector2};
export type Triangle = [Vertex, Vertex, Vertex];
export type Model = {triangles: Triangle[]; material: MeshStandardMaterial};
/** Bake the current FBX pose; chunks retain the supplied texture coordinates. */
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

const peakPhase = 0.32;
const smooth = (t: number) => Math.sin(Math.PI * t / 2) ** 2;
const sliceEasing = {
  smooth,
  'ease-in': (t: number) => smooth(t * t),
  'ease-out': (t: number) => 1 - smooth((1 - t) ** 2),
  linear: (t: number) => t,
};
export const chunkEaseOptions = ['smooth', 'ease-in', 'ease-out', 'linear'] as const;

/** Insert a plateau at the launch peak and fit the other stages around it. */
export function chunkMotionPhase(phase: number, holdOpen: number, peak = peakPhase): number {
  if (holdOpen === 0) return phase;
  const movingTime = 1 - holdOpen;
  const holdStart = peak * movingTime;
  if (phase < holdStart) return phase / movingTime;
  if (phase <= holdStart + holdOpen) return peak;
  return (phase - holdOpen) / movingTime;
}

/** Opening, closing, and a smaller rebound after reassembly. */
export function chunkBounce(
  phase: number,
  openEase: keyof typeof sliceEasing = 'smooth',
  closeEase: keyof typeof sliceEasing = 'smooth',
): number {
  if (phase < peakPhase) return sliceEasing[openEase](phase / peakPhase);
  if (phase < 0.64) return 1 - sliceEasing[closeEase]((phase - peakPhase) / peakPhase);
  if (phase < 0.88) return 0.13 * Math.sin(Math.PI * (phase - 0.64) / 0.24) ** 2;
  return 0;
}
