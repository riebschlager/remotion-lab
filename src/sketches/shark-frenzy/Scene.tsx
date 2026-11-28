import {useMemo} from 'react';
import {ThreeCanvas} from '@remotion/three';
import {Color, MeshBasicMaterial, MeshStandardMaterial, NearestFilter, PerspectiveCamera, Vector3, type Material, type Texture} from 'three';
import {collectionFile} from '../../assets';
import {useAsset} from '../define';
import {
  drifters, riderMixAt, riderPlaceAt, riderTakes, mixAt, PHRASE, type Pose, type RiderTake,
} from './choreography';
import {makeRig, poseRig, useGltf, type Rig} from './Rig';
import {mod} from '../../beat/envelopes';

export const sharkModel = collectionFile('shark-01', 'shark.glb');
export const riderModel = collectionFile('shark-01', 'guy.glb');

type SharkTake = 'swim' | 'idle' | 'bite';
const sharkTakes: Record<SharkTake, string> = {swim: 'Swim_Vertical', idle: 'Idle', bite: 'Bite'};

/** Body centre in bind space, so turns pivot around the middle of the shark. */
const bodyOffset = new Vector3(0, -.28, .98);
/** Nose distance ahead of the body centre. */
export const NOSE = 2.75;
/** The rider's hips, used as his somersault pivot (bind-space height of a 1.82-unit figure). */
const HIPS = .92;

const crispPalette = (source: Material) => {
  const material = (source as MeshStandardMaterial).clone();
  const map = material.map as Texture | null;
  if (map) {
    // Palette atlas: sample swatches crisply instead of bleeding neighbours.
    map.magFilter = NearestFilter;
    map.minFilter = NearestFilter;
    map.generateMipmaps = false;
    map.needsUpdate = true;
  }
  material.flatShading = true;
  material.needsUpdate = true;
  return material;
};

export function useCast() {
  const shark = useGltf(useAsset(sharkModel).src, 'shark.glb');
  const rider = useGltf(useAsset(riderModel).src, 'guy.glb');
  return useMemo(() => {
    if (!shark || !rider) return null;
    const sharkRig = makeRig(shark, sharkTakes, 'shark.glb', crispPalette);
    // The giants are shadows in the water, never lit figures competing with the shark.
    const silhouette = new MeshBasicMaterial({transparent: true, opacity: .5, depthWrite: false});
    sharkRig.rig.position.copy(bodyOffset);
    const bone = (name: string) => {
      const found = sharkRig.rig.getObjectByName(name);
      if (!found) throw new Error(`shark.glb has no "${name}" bone to carry the rider.`);
      return found;
    };
    return {
      shark: sharkRig,
      back: bone('pelvis'),
      jaw: bone('mouth_tip'),
      rider: makeRig(rider, riderTakes, 'guy.glb'),
      silhouette,
      drifters: drifters.map(() => makeRig(rider, riderTakes, 'guy.glb', () => silhouette)),
    };
  }, [shark, rider]);
}

export type Cast = NonNullable<ReturnType<typeof useCast>>;

export type View = {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
};

export const makeCamera = (width: number, height: number, view: View) => {
  const camera = new PerspectiveCamera(view.fov, width / height, .05, 120);
  camera.position.set(...view.position);
  camera.lookAt(new Vector3(...view.target));
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  return camera;
};

/** Canvas-pixel position of a world point. */
export const project = (camera: PerspectiveCamera, point: [number, number, number], width: number, height: number) => {
  const v = new Vector3(...point).project(camera);
  return {x: (v.x * .5 + .5) * width, y: (.5 - v.y * .5) * height, behind: v.z > 1};
};

/** A bone's position in the shark group's frame (the frame `pose` places). */
const inSharkFrame = (cast: Cast, bone: Cast['back']) => {
  const point = bone.getWorldPosition(new Vector3());
  return cast.shark.rig.worldToLocal(point).add(bodyOffset);
};

const soloMix = (rig: Rig<RiderTake>, take: RiderTake, time: number) => {
  const mix = {} as Record<RiderTake, [number, number]>;
  for (const name of Object.keys(rig.actions) as RiderTake[]) mix[name] = [name === take ? time : 0, name === take ? 1 : 0];
  return mix;
};

type Props = {
  cast: Cast | null;
  P: number;
  loopPhase: number;
  width: number;
  height: number;
  camera: PerspectiveCamera;
  pose: Pose;
  fog: string;
  fogNear: number;
  fogFar: number;
  riderScale: number;
  drift: boolean;
};

export function Scene({cast, P, loopPhase, width, height, camera, pose, fog, fogNear, fogFar, riderScale, drift}: Props) {
  if (!cast) return null;
  poseRig(cast.shark, mixAt(P, cast.shark.durations));
  poseRig(cast.rider, riderMixAt(P, cast.rider.durations));
  cast.shark.rig.updateMatrixWorld(true);

  // Rider: from the shark's back to its tongue and back, somersaulting each way.
  const place = riderPlaceAt(P);
  const back = inSharkFrame(cast, cast.back).add(new Vector3(0, .5, 0));
  const tongue = inSharkFrame(cast, cast.jaw).add(new Vector3(0, .02, -.15));
  const scale = riderScale * (1 - .25 * place);
  const hop = 4 * place * (1 - place) * 1.7;
  const at = back.lerp(tongue, place).add(new Vector3(0, hop + HIPS * scale, 0));
  const riderYaw = -Math.PI / 2 * (1 - place);
  const flip = Math.PI * 2 * place;

  cast.silhouette.color.copy(new Color(fog).multiplyScalar(.45));
  for (const [index, drifter] of drifters.entries()) {
    const rig = cast.drifters[index];
    poseRig(rig, soloMix(rig, drifter.take, mod(P / drifter.beatsPerCycle, 1) * rig.durations[drifter.take]));
  }

  return (
    <ThreeCanvas width={width} height={height} camera={camera}
      gl={{alpha: true, antialias: true, preserveDrawingBuffer: true}}
      onCreated={({gl}) => gl.setClearColor(0, 0)}>
      <fog attach="fog" args={[fog, fogNear, fogFar]} />
      <hemisphereLight args={['#9ae6ff', '#03111f', 1.9]} />
      <directionalLight position={[1.5, 8, 4]} intensity={3.1} color="#eafcff" />
      <directionalLight position={[-4, 1, -6]} intensity={2.2} color="#4cc9ff" />
      <group position={[pose.x, pose.y, pose.z]} rotation={[pose.pitch, pose.yaw, pose.roll, 'YXZ']}>
        <primitive object={cast.shark.rig} />
        <group position={at.toArray()} rotation={[flip, riderYaw, 0, 'YXZ']} scale={scale}>
          <primitive object={cast.rider.rig} position={[0, -HIPS, 0]} />
        </group>
      </group>
      {drift && drifters.map((drifter, index) => {
        const phase = loopPhase + drifter.offset;
        const angle = Math.PI * 2 * phase;
        return (
          <group key={index}
            position={[drifter.x + 1.6 * Math.sin(angle), drifter.y + 1.1 * Math.cos(angle * 2), drifter.z]}
            rotation={[Math.PI * 2 * drifter.tumble * loopPhase, Math.PI * 2 * drifter.spin * loopPhase + drifter.offset * 6, .4 * Math.sin(angle)]}
            scale={drifter.scale}>
            <primitive object={cast.drifters[index].rig} position={[0, -HIPS, 0]} />
          </group>
        );
      })}
    </ThreeCanvas>
  );
}

export {PHRASE};
