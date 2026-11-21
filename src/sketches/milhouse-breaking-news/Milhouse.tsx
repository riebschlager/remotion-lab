import {useEffect, useMemo, useState} from 'react';
import {ThreeCanvas} from '@remotion/three';
import {useDelayRender} from 'remotion';
import {AnimationMixer, LoadingManager, LoopOnce, OrthographicCamera, PerspectiveCamera, type Group} from 'three';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {collectionFile} from '../../assets';
import {useAsset} from '../define';

export const falling = collectionFile('milhouse-02', 'Falling.fbx');

let pendingModel: Promise<Group> | undefined;

function loadModel(src: string) {
  return pendingModel ??= new Promise<Group>((resolve, reject) => {
    const manager = new LoadingManager();
    let rig: Group | undefined;
    manager.onLoad = () => {if (rig) resolve(rig);};
    manager.onError = url => reject(new Error(`Could not load the Falling.fbx model or its palette: ${url}`));
    new FBXLoader(manager).load(src, model => {rig = model;}, undefined, reject);
  }).catch(error => {
    pendingModel = undefined;
    throw error;
  });
}

export function useFallingModel() {
  const {src} = useAsset(falling);
  const {delayRender, continueRender, cancelRender} = useDelayRender();
  const [handle] = useState(() => delayRender('Loading Falling.fbx and its palette'));
  const [model, setModel] = useState<Group | null>(null);

  useEffect(() => {
    let active = true;
    loadModel(src).then(
      loaded => {if (active) setModel(loaded);},
      error => {if (active) cancelRender(error);},
    );
    return () => {
      active = false;
      continueRender(handle);
    };
  }, [src, handle, continueRender, cancelRender]);

  useEffect(() => {
    if (model) continueRender(handle);
  }, [model, handle, continueRender]);

  return useMemo(() => {
    if (!model) return null;
    const clip = model.animations[0];
    if (!clip || clip.duration <= 0) throw new Error('Falling.fbx requires a falling animation.');
    const rig = clone(model);
    const mixer = new AnimationMixer(rig);
    const action = mixer.clipAction(clip);
    action.setLoop(LoopOnce, 1);
    return {rig, mixer, action, duration: clip.duration};
  }, [model]);
}

type Props = {
  model: ReturnType<typeof useFallingModel>;
  width: number;
  height: number;
  progress: number;
  zoom: number;
  x: number;
  y: number;
  pitch: number;
  yaw: number;
  roll: number;
  light: string;
  rim: string;
  visible: boolean;
  street?: boolean;
};

const streetFov = 34;
const streetDistance = 3.6;

export function FallingFigure({model, width, height, progress, zoom, x, y, pitch, yaw, roll, light, rim, street = false, visible}: Props) {
  const shortSide = Math.min(width, height);
  const camera = useMemo(() => {
    // Keep the renderer and the skinned mesh mounted across camera cuts.
    if (street) {
      const perspective = new PerspectiveCamera(streetFov, width / height, 0.1, 30);
      perspective.position.z = streetDistance;
      return perspective;
    }
    const orbit = new OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, 0.1, 30);
    orbit.position.z = 6;
    orbit.zoom = shortSide;
    orbit.updateProjectionMatrix();
    return orbit;
  }, [street, width, height, shortSide]);
  if (!model) return null;

  // Evaluate the original skeletal keys at an absolute time on every render.
  // Stay just inside the last key so LoopOnce never disables the action.
  model.action.play();
  model.mixer.setTime(Math.min(progress * model.duration, model.duration - 1e-6));
  // Match the 2D framing controls at the plane through the subject.
  const cameraZoom = street ? height / (2 * streetDistance * Math.tan(streetFov * Math.PI / 360)) : shortSide;

  return (
    <ThreeCanvas width={width} height={height} camera={camera}
      gl={{alpha: true, antialias: true, preserveDrawingBuffer: true}}
      onCreated={({gl}) => gl.setClearColor(0, 0)}>
      <ambientLight intensity={1.45} color="#d6e3ff" />
      <directionalLight position={[-3, 5, 6]} intensity={2.25} color={light} />
      <directionalLight position={[2, -1, -3]} intensity={2} color={rim} />
      <group position={[(x - 0.5) * width / cameraZoom, (0.5 - y) * height / cameraZoom, 0]}
        rotation={[pitch, yaw, roll]} scale={zoom * shortSide / cameraZoom} visible={visible}>
        <primitive object={model.rig} position={street ? [0, -0.42, -0.55] : [0, -0.39, -0.25]} />
      </group>
    </ThreeCanvas>
  );
}
