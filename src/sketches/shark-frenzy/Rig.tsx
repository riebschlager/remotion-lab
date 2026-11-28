import {useEffect, useState} from 'react';
import {useDelayRender} from 'remotion';
import {AnimationMixer, LoopRepeat, MathUtils, Mesh, type AnimationAction, type Group, type Material} from 'three';
import {GLTFLoader, type GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';

const pending = new Map<string, Promise<GLTF>>();
const load = (src: string, label: string) => {
  let promise = pending.get(src);
  if (!promise) {
    promise = new GLTFLoader().loadAsync(src).catch((error: Error) => {
      pending.delete(src);
      throw new Error(`Could not load ${label}: ${error.message}`);
    });
    pending.set(src, promise);
  }
  return promise;
};

/** Loads a GLB once per source and holds the render until it is ready. */
export function useGltf(src: string, label: string) {
  const {delayRender, continueRender, cancelRender} = useDelayRender();
  const [handle] = useState(() => delayRender(`Loading ${label}`));
  const [gltf, setGltf] = useState<GLTF | null>(null);

  useEffect(() => {
    let active = true;
    load(src, label).then((loaded) => {if (active) setGltf(loaded);}, (error) => {if (active) cancelRender(error);});
    return () => {
      active = false;
      continueRender(handle);
    };
  }, [src, label, handle, continueRender, cancelRender]);

  useEffect(() => {
    if (gltf) continueRender(handle);
  }, [gltf, handle, continueRender]);

  return gltf;
}

export type Rig<T extends string> = {
  rig: Group;
  mixer: AnimationMixer;
  actions: Record<T, AnimationAction>;
  durations: Record<T, number>;
};

/** An independent skinned copy with one looping action per named take. */
export function makeRig<T extends string>(gltf: GLTF, takes: Record<T, string>, label: string,
  material?: (source: Material) => Material): Rig<T> {
  const rig = clone(gltf.scene) as Group;
  rig.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    // Skinned bounds lag the pose; never let a figure get culled.
    node.frustumCulled = false;
    if (material) node.material = material(node.material as Material);
  });
  const mixer = new AnimationMixer(rig);
  const actions = {} as Record<T, AnimationAction>;
  const durations = {} as Record<T, number>;
  for (const take of Object.keys(takes) as T[]) {
    const clip = gltf.animations.find((candidate) => candidate.name === takes[take]);
    if (!clip || clip.duration <= 0) {
      throw new Error(`${label} needs a "${takes[take]}" animation; it has ${gltf.animations.map((a) => a.name).join(', ')}.`);
    }
    const action = mixer.clipAction(clip);
    action.setLoop(LoopRepeat, Infinity);
    action.play();
    actions[take] = action;
    durations[take] = clip.duration;
  }
  return {rig, mixer, actions, durations};
}

export type Mix<T extends string> = Record<T, [time: number, weight: number]>;

/** Absolute evaluation: every take gets its time and weight, then a zero-delta update. */
export function poseRig<T extends string>({mixer, actions, durations}: Rig<T>, mix: Mix<T>) {
  for (const take of Object.keys(actions) as T[]) {
    const [time, weight] = mix[take];
    actions[take].enabled = true;
    actions[take].setEffectiveWeight(weight);
    actions[take].time = MathUtils.clamp(time, 0, durations[take] - 1e-4);
  }
  mixer.update(0);
}
