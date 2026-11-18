import {AnimationMixer, Group} from 'three';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {applyNormalization, bakeModel, normalizeModels} from './sliceGeometry';

export const SOURCE_DURATION = 17.233333587646484;

export function createPerformance(source: Group, start: number, end: number) {
  const rig = clone(source) as Group;
  const clip = source.animations[0];
  const hips = rig.getObjectByName('mixamorigHips');
  if (!clip || !hips) throw new Error('Milhouse FBX is missing its source animation or animated hips.');
  if (start < 0 || end > clip.duration || end <= start) {
    throw new Error(`Source excerpt must be ordered and fit within the ${clip.duration}-second FBX animation.`);
  }

  const mixer = new AnimationMixer(rig);
  mixer.clipAction(clip).play();
  const material = bakeModel(rig, false).material;
  const capture = (time: number) => {
    // setTime seeks the original keys regardless of the previously rendered beat.
    mixer.setTime(Math.min(time, clip.duration - 1e-6));
    hips.position.x = 0;
    hips.position.z = 0;
    return bakeModel(rig, false, material);
  };

  const first = capture(start);
  const last = capture(end);
  // Keep one scale and floor reference across the whole gesture.
  const middle = capture((start + end) / 2);
  const normalization = normalizeModels([first, middle, last]);
  return {
    material,
    first,
    sample(progress: number) {
      return applyNormalization(capture(start + (end - start) * progress), normalization);
    },
  };
}
