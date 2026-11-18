import {BufferGeometry, DataTexture, Float32BufferAttribute, LinearFilter, RGBAFormat, Vector3} from 'three';

// Fixed texture sampling budget, independent of output resolution. R is inward
// distance normalized per connected island; G is distance in model units.
export const FIELD_SIZE = 128;
export function portalGeometry(caps: BufferGeometry) {
  const p = caps.getAttribute('position');
  const n = caps.getAttribute('normal');
  const faces: number[][] = [[], []];
  for (let i = 0; i < p.count; i += 3) faces[n.getY(i) > 0 ? 1 : 0].push(i);
  caps.computeBoundingBox();
  const bounds = caps.boundingBox!;
  const minX = Number.isFinite(bounds.min.x) ? bounds.min.x - 0.025 : 0;
  const minZ = Number.isFinite(bounds.min.z) ? bounds.min.z - 0.025 : 0;
  const span = Math.max(0.05, bounds.max.x - minX + 0.025, bounds.max.z - minZ + 0.025);
  const size = FIELD_SIZE, cell = span / size;
  const pixels = new Uint8Array(size * size * 2 * 4);
  const uvs = new Float32Array(p.count * 2);
  const rayPositions: number[] = [], rayDirections: number[] = [], rayUV: number[] = [];
  const key = (v: Vector3) => v.toArray().map(x => Math.round(x * 1e5)).join(',');

  faces.forEach((triangles, face) => {
    const mask = new Uint8Array(size * size);
    const edges = new Map<string, {a: Vector3; b: Vector3; count: number}>();
    for (const i of triangles) {
      const vertices = [0, 1, 2].map(j => new Vector3().fromBufferAttribute(p, i + j));
      for (let j = 0; j < 3; j++) {
        const a = vertices[j], b = vertices[(j + 1) % 3];
        const id = [key(a), key(b)].sort().join('/');
        const edge = edges.get(id);
        if (edge) edge.count++; else edges.set(id, {a, b, count: 1});
        uvs[(i + j) * 2] = (a.x - minX) / span;
        uvs[(i + j) * 2 + 1] = ((a.z - minZ) / span + face) / 2;
      }
      const v = vertices.map(a => [(a.x - minX) / cell, (a.z - minZ) / cell]);
      const low = Math.max(0, Math.floor(Math.min(...v.map(a => a[1]))));
      const high = Math.min(size - 1, Math.ceil(Math.max(...v.map(a => a[1]))));
      for (let y = low; y <= high; y++) {
        const intersections: number[] = [];
        for (let j = 0; j < 3; j++) {
          const a = v[j], b = v[(j + 1) % 3], scan = y + 0.5;
          if ((a[1] <= scan && b[1] > scan) || (b[1] <= scan && a[1] > scan)) {
            intersections.push(a[0] + (scan - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
          }
        }
        if (intersections.length === 2) {
          const left = Math.max(0, Math.ceil(Math.min(...intersections) - 0.5));
          const right = Math.min(size - 1, Math.floor(Math.max(...intersections) - 0.5));
          for (let x = left; x <= right; x++) mask[y * size + x] = 1;
        }
      }
    }
    const distance = new Float32Array(size * size);
    for (let i = 0; i < distance.length; i++) distance[i] = mask[i] ? size : 0;
    // Two chamfer sweeps approximate Euclidean distance to the actual silhouette.
    for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) {
      const i = y * size + x;
      distance[i] = Math.min(distance[i], distance[i - 1] + 1, distance[i - size] + 1,
        distance[i - size - 1] + Math.SQRT2, distance[i - size + 1] + Math.SQRT2);
    }
    for (let y = size - 2; y > 0; y--) for (let x = size - 2; x > 0; x--) {
      const i = y * size + x;
      distance[i] = Math.min(distance[i], distance[i + 1] + 1, distance[i + size] + 1,
        distance[i + size - 1] + Math.SQRT2, distance[i + size + 1] + Math.SQRT2);
    }
    const visited = new Uint8Array(size * size);
    for (let start = 0; start < mask.length; start++) {
      if (!mask[start] || visited[start]) continue;
      const island = [start]; visited[start] = 1;
      let max = 1;
      for (let q = 0; q < island.length; q++) {
        const i = island[q]; max = Math.max(max, distance[i]);
        for (const next of [i - 1, i + 1, i - size, i + size]) {
          if (next < 0 || next >= mask.length || !mask[next] || visited[next]) continue;
          visited[next] = 1; island.push(next);
        }
      }
      for (const i of island) {
        const offset = (face * size * size + i) * 4;
        pixels[offset] = Math.round(255 * distance[i] / max);
        pixels[offset + 1] = Math.min(255, Math.round(255 * distance[i] * cell));
        pixels[offset + 2] = 255; pixels[offset + 3] = 255;
      }
    }
    // Boundary ribbons extend along averaged outward normals, not a shared
    // center, so detached hands/arms keep their own light source.
    const boundary = [...edges.values()].filter(e => e.count === 1);
    const normals = new Map<string, Vector3>();
    for (const {a, b} of boundary) {
      const outward = new Vector3().subVectors(b, a).cross(new Vector3(0, face ? 1 : -1, 0)).normalize();
      for (const vertex of [a, b]) {
        const id = key(vertex);
        if (!normals.has(id)) normals.set(id, new Vector3());
        normals.get(id)!.add(outward);
      }
    }
    for (const {a, b} of boundary) {
      for (const [vertex, extension] of [[a, 0], [b, 0], [b, 1], [a, 0], [b, 1], [a, 1]] as const) {
        rayPositions.push(vertex.x, vertex.y + (face ? 0.001 : -0.001), vertex.z);
        rayDirections.push(...normals.get(key(vertex))!.clone().normalize().multiplyScalar(extension).toArray());
        rayUV.push(extension, 0);
      }
    }
  });
  const geometry = caps.clone();
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  const rays = new BufferGeometry();
  rays.setAttribute('position', new Float32BufferAttribute(rayPositions, 3));
  rays.setAttribute('outward', new Float32BufferAttribute(rayDirections, 3));
  rays.setAttribute('uv', new Float32BufferAttribute(rayUV, 2));
  const texture = new DataTexture(pixels, size, size * 2, RGBAFormat);
  texture.minFilter = texture.magFilter = LinearFilter;
  texture.generateMipmaps = false; texture.needsUpdate = true;
  return {geometry, rays, texture};
}
