import {Vector3, type BufferGeometry, type PerspectiveCamera} from 'three';

/** The DOM bloom and the WebGL rim share the very same triangulated cut.
 * A single nonzero path also handles disconnected pieces of the posed mesh. */
export function projectCut(geometry: BufferGeometry, offsetY: number, camera: PerspectiveCamera,
  width: number, height: number, centerX: number, centerY: number) {
  const positions = geometry.getAttribute('position');
  const point = new Vector3();
  const path: string[] = [];
  let extent = 0;
  for (let i = 0; i < positions.count; i++) {
    point.fromBufferAttribute(positions, i);
    point.y += offsetY;
    point.project(camera);
    const x = (1 + point.x) / 2;
    const y = (1 - point.y) / 2;
    path.push(`${i % 3 === 0 ? 'M' : 'L'}${(x * width).toFixed(2)} ${(y * height).toFixed(2)}${i % 3 === 2 ? 'Z' : ''}`);
    const visibleX = Math.max(0, Math.min(1, x));
    const visibleY = Math.max(0, Math.min(1, y));
    extent = Math.max(extent, Math.abs(visibleX - centerX), Math.abs(visibleY - centerY));
  }
  return {clipPath: `path("${path.join(' ')}")`, coverScale: 2 * extent};
}
