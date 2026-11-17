import {AnimationMixer, Bone, Group} from 'three';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {step} from '../../beat/envelopes';
import {applyNormalization, bakeModel, normalizeModels} from './sliceGeometry';

export const SOURCE_DURATION = 17.233333587646484;
export const DEFAULT_POSE_TIMES = [1, 2, 13, 15] as const;

export const poseIndex = (beat: number, totalBeats: number) => step(beat, 1, totalBeats).index % 4;

/** Zero velocity/acceleration at each authored pose, including the four-to-one join. */
export function poseBlend(beat: number, totalBeats: number) {
  const {index, phase: t} = step(beat, 1, totalBeats);
  return {from: index % 4, to: (index + 1) % 4, mix: t * t * t * (t * (t * 6 - 15) + 10)};
}

/** Capture local bone transforms once; every subsequent sample writes the complete rig. */
export function createPoseSampler(source: Group, times: readonly number[]) {
  const root = clone(source) as Group;
  const clip = source.animations[0];
  if (!clip) throw new Error('Milhouse FBX contains no source animation.');
  if (times.length !== 4 || times.some(t => !Number.isFinite(t) || t < 0 || t > clip.duration)) {
    throw new Error(`poseTimes: supply four source times between 0 and ${clip.duration} seconds.`);
  }
  const hips = root.getObjectByName('mixamorigHips');
  if (!hips) throw new Error('Milhouse FBX is missing its animated hips.');
  const bones: Bone[] = [];
  root.traverse(object => {if (object instanceof Bone) bones.push(object);});
  const mixer = new AnimationMixer(root);
  mixer.clipAction(clip).play();
  const endpoints = times.map(time => {
    mixer.setTime(time);
    hips.position.x = 0;
    hips.position.z = 0;
    return bones.map(bone => ({
      position: bone.position.clone(), quaternion: bone.quaternion.clone(), scale: bone.scale.clone(),
    }));
  });
  mixer.stopAllAction();
  mixer.uncacheRoot(root);
  const setPose = (from: number, to: number, mix: number) => {
    bones.forEach((bone, index) => {
      const a = endpoints[from][index], b = endpoints[to][index];
      bone.position.copy(a.position).lerp(b.position, mix);
      bone.quaternion.copy(a.quaternion).slerp(b.quaternion, mix);
      bone.scale.copy(a.scale).lerp(b.scale, mix);
    });
    root.updateMatrixWorld(true);
  };
  // One fixed normalization from the same four source poses as the held prototype.
  const poses = endpoints.map((_, index) => {
    setPose(index, index, 0);
    return bakeModel(root, false);
  });
  const normalization = normalizeModels(poses);
  const material = poses[0].material;
  for (const pose of poses.slice(1)) {pose.material.dispose(); pose.material = material;}
  return {
    poses, material,
    sample(beat: number, totalBeats: number) {
      const {from, to, mix} = poseBlend(beat, totalBeats);
      if (mix === 0) return poses[from];
      setPose(from, to, mix);
      return applyNormalization(bakeModel(root, false, material), normalization);
    },
  };
}

export type PoseSampler = ReturnType<typeof createPoseSampler>;
export const bakePoses = (source: Group, times: readonly number[]) => createPoseSampler(source, times).poses;
