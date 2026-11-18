import React, {useEffect, useMemo, useRef, useState} from 'react';
import {useDelayRender} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {useFrame} from '@react-three/fiber';
import {
  Color, Group, HalfFloatType, LoadingManager, NoBlending, NoToneMapping, PerspectiveCamera,
  Mesh, Vector2, Vector3, WebGLRenderTarget,
} from 'three';
import {RectAreaLightUniformsLib} from 'three/addons/lights/RectAreaLightUniformsLib.js';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
import {zColor} from '@remotion/zod-types';
import {z} from 'zod';
import {collectionFile} from '../../assets';
import {useBeat} from '../../beat/BeatContext';
import {step} from '../../beat/envelopes';
import {useCanvas} from '../canvas';
import {defineSketch, useAsset, type SketchBaseProps} from '../define';
import {sliceModel, type Model} from './sliceGeometry';
import {createPerformance, SOURCE_DURATION} from './animation';
import {portalGeometry} from './portalGeometry';

const modelFile = collectionFile('milhouse-01', 'milhouse-2.fbx');
const SOURCE_IN = 11.8;
const SOURCE_OUT = 14.35;
const schema = z.object({
  lift: z.number().min(0.8).max(3).step(0.1).describe('How high the upper half rises'),
  slide: z.number().min(0.3).max(3).step(0.1).describe('How far the upper half moves sideways'),
  diveStart: z.number().min(0.45).max(0.68).step(0.01).describe('Fraction of the bar before the camera plunges'),
  sourceIn: z.number().min(0).max(SOURCE_DURATION).describe('FBX animation in point in seconds').default(SOURCE_IN),
  sourceOut: z.number().min(0).max(SOURCE_DURATION).describe('FBX animation out point in seconds').default(SOURCE_OUT),
  backdrop: zColor(),
  floorColor: zColor(),
  rimColor: zColor(),
  echoColor: zColor(),
});
type Props = z.output<typeof schema> & Partial<Pick<SketchBaseProps, 'transparent'>>;

let modelPromise: Promise<Group> | undefined;
function loadModel(src: string) {
  return modelPromise ??= new Promise<Group>((resolve, reject) => {
    const manager = new LoadingManager();
    let root: Group | undefined;
    manager.onLoad = () => {if (root) resolve(root);};
    manager.onError = (url) => reject(new Error(`Milhouse model/texture is missing: ${url}`));
    new FBXLoader(manager).load(src, model => {root = model;}, undefined, reject);
  }).catch(error => {modelPromise = undefined; throw error;});
}

function useModel() {
  const {src} = useAsset(modelFile);
  const {delayRender, continueRender, cancelRender} = useDelayRender();
  const [hold] = useState(() => delayRender('Loading Milhouse model and embedded palette'));
  const [root, setRoot] = useState<Group | null>(null);
  useEffect(() => {
    let active = true;
    loadModel(src).then(model => {if (active) setRoot(model);}, error => {if (active) cancelRender(error);});
    return () => {active = false; continueRender(hold);};
  }, [src, hold, continueRender, cancelRender]);
  useEffect(() => {if (root) continueRender(hold);}, [root, hold, continueRender]);
  return root;
}

const ease = (value: number) => {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
};
const between = (value: number, from: number, to: number) => ease((value - from) / (to - from));

const portalVertex = `
  varying vec2 fieldUv;
  varying vec4 screen;
  void main() {
    fieldUv = uv;
    screen = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = screen;
  }
`;
const portalFragment = `
  uniform sampler2D field, destination;
  uniform vec3 rimColor, echoColor;
  uniform vec2 center;
  uniform float windowScale, clock, handoff;
  uniform bool entrance;
  varying vec2 fieldUv;
  varying vec4 screen;
  void main() {
    vec2 distanceField = texture2D(field, fieldUv).rg;
    vec2 screenUv = screen.xy / screen.w * 0.5 + 0.5;
    vec2 projected = (screenUv - center) / windowScale + 0.5;
    vec2 imageUv = mix(projected, screenUv, handoff);
    vec4 room = texture2D(destination, imageUv);
    float bounds = min(min(imageUv.x, 1.0 - imageUv.x), min(imageUv.y, 1.0 - imageUv.y));
    float window = float(entrance) * smoothstep(0.0, 0.08, bounds);
    float rim = 1.0 - smoothstep(0.012, 0.06, distanceField.g);
    float band = pow(0.5 + 0.5 * cos(6.28318 * (distanceField.r * 3.0 - clock)), 10.0);
    vec3 led = mix(rimColor, echoColor, smoothstep(0.22, 0.78, 0.5 + 0.5 * sin(fieldUv.x * 19.0)));
    vec3 paint = mix(vec3(0.018, 0.003, 0.043), room.rgb, window * room.a);
    paint = mix(paint, led, max(rim, band * (1.0 - distanceField.r) * 0.37));
    gl_FragColor = mix(vec4(paint, 1.0), room, handoff);
    #include <colorspace_fragment>
  }
`;

function splitPose(model: Model) {
  const [lower, upper] = sliceModel(model, 2);
  return {
    lower,
    upper,
    dispose() {
      lower.surface.dispose();
      lower.caps.dispose();
      upper.surface.dispose();
      upper.caps.dispose();
    },
  };
}

function portalFaces(pose: ReturnType<typeof splitPose>) {
  const entry = portalGeometry(pose.lower.caps);
  const echo = portalGeometry(pose.upper.caps);
  return {
    entry,
    echo,
    dispose() {
      for (const face of [entry, echo]) {
        face.geometry.dispose();
        face.texture.dispose();
      }
    },
  };
}

const Studio: React.FC<{root: Group; props: Props}> = ({root, props}) => {
  const {beat, totalBeats, beatsPerBar} = useBeat();
  const {width, height, aspect} = useCanvas();
  const {phase} = step(beat, beatsPerBar, totalBeats);
  const open = between(phase, 0.10, 0.32);
  const approach = between(phase, 0.20, props.diveStart);
  const plunge = between(phase, props.diveStart, 0.99);
  const handoff = between(plunge, 0.69, 0.96);
  const upper = useRef<Group>(null);
  const lowerSurface = useRef<Mesh>(null);
  const upperSurface = useRef<Mesh>(null);
  const gates = useRef<Group>(null);
  const upperCap = useRef<Mesh>(null);

  const performance = useMemo(
    () => createPerformance(root, props.sourceIn, props.sourceOut),
    [root, props.sourceIn, props.sourceOut],
  );
  useEffect(() => () => performance.material.dispose(), [performance]);
  const opening = useMemo(() => splitPose(performance.first), [performance]);
  useEffect(() => () => opening.dispose(), [opening]);

  // Drive the original keys across the whole bar, independently of camera timing.
  const pose = useMemo(
    () => phase === 0 ? opening : splitPose(performance.sample(phase)),
    [performance, opening, phase],
  );
  useEffect(() => () => {if (pose !== opening) pose.dispose();}, [pose, opening]);
  const showGates = open > 0;
  const faces = useMemo(() => showGates ? portalFaces(pose) : null, [pose, showGates]);
  useEffect(() => () => faces?.dispose(), [faces]);

  // Use the same output aspect and cap the offscreen pass at one megapixel.
  const scale = Math.min(1, Math.sqrt(1_048_576 / (width * height)));
  const target = useMemo(() => new WebGLRenderTarget(
    Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)),
    {type: HalfFloatType},
  ), [width, height, scale]);
  useEffect(() => () => target.dispose(), [target]);

  const fov = 37;
  const distance = Math.max(11.8, 7.5 / aspect);
  const hero = useMemo(() => {
    const camera = new PerspectiveCamera(fov, aspect, 0.01, Math.max(150, distance + 80));
    camera.position.set(0, 0.9 + distance * 0.13, distance);
    camera.lookAt(0, 0.35, 0);
    camera.updateMatrixWorld();
    return camera;
  }, [aspect, distance]);
  const cap = faces?.entry;
  const entry = cap ? cap.entry.clone().add(new Vector3(0, pose.lower.center - 2.5, 0)) : new Vector3();
  const revealPosition = new Vector3(0, 6.0, Math.max(9.6, 6.4 / aspect));
  // Fit the entire camera frustum within the largest continuous area of the cap.
  const finalDistance = Math.min(0.14, (cap?.clearance ?? 0) * 0.7 /
    (Math.hypot(1, aspect) * Math.tan(fov * Math.PI / 360)));
  const crossing = entry.clone().add(new Vector3(0, finalDistance, finalDistance * 0.06));
  const aim = new Vector3(0, 0.35, 0).lerp(new Vector3(0.2, 0.95, 0), approach);
  // Follow some of the upper half's lateral travel while the split is on screen.
  aim.x += open * props.slide * 0.33;
  aim.lerp(entry, between(plunge, 0, 0.57));
  const cameraPosition = hero.position.clone().lerp(revealPosition, approach).lerp(crossing, plunge);
  const cameraView = hero.clone();
  cameraView.position.copy(cameraPosition);
  cameraView.lookAt(aim);
  cameraView.updateMatrixWorld();
  const projectedEntry = entry.clone().project(cameraView);

  // The destination uses the next room's opening source pose. The meshes keep
  // their matching section centers, so only their geometry needs swapping.
  // Rendering the next world never depends on the previous frame.
  useFrame(({gl, scene, camera}) => {
    camera.position.copy(cameraView.position);
    camera.quaternion.copy(cameraView.quaternion);
    camera.updateMatrixWorld();
    if (!showGates || !upper.current || !lowerSurface.current || !upperSurface.current ||
      !gates.current || !upperCap.current) return;
    const previousTarget = gl.getRenderTarget();
    const lift = upper.current.position.clone();
    const roll = upper.current.rotation.z;
    try {
      lowerSurface.current.geometry = opening.lower.surface;
      upperSurface.current.geometry = opening.upper.surface;
      upper.current.position.set(0, 0, 0);
      upper.current.rotation.z = 0;
      gates.current.visible = upperCap.current.visible = false;
      gl.setRenderTarget(target);
      gl.render(scene, hero);
    } finally {
      gl.setRenderTarget(previousTarget);
      lowerSurface.current.geometry = pose.lower.surface;
      upperSurface.current.geometry = pose.upper.surface;
      upper.current.position.copy(lift);
      upper.current.rotation.z = roll;
      gates.current.visible = upperCap.current.visible = true;
    }
  }, -1);

  const gateMaterial = (face: ReturnType<typeof portalGeometry>, entrance: boolean) => ({
    vertexShader: portalVertex,
    fragmentShader: portalFragment,
    blending: NoBlending,
    uniforms: {
      field: {value: face.texture}, destination: {value: target.texture},
      rimColor: {value: new Color(props.rimColor)}, echoColor: {value: new Color(props.echoColor)},
      center: {value: new Vector2(projectedEntry.x * 0.5 + 0.5, projectedEntry.y * 0.5 + 0.5)},
      windowScale: {value: 0.10 + 0.68 * plunge ** 1.6}, clock: {value: phase * 3},
      handoff: {value: entrance ? handoff : 0}, entrance: {value: entrance},
    },
  });

  return <>
    {!props.transparent && <color attach="background" args={[props.backdrop]} />}
    <ambientLight intensity={0.28} color="#e7deed" />
    <rectAreaLight position={[-4.5, 5, 6]} width={4.5} height={6}
      intensity={7.5} color="#fff0dc" onUpdate={light => light.lookAt(0, 0, 0)} />
    <rectAreaLight position={[4.5, 1.5, 5]} width={3.5} height={5}
      intensity={3.3} color="#eef0ff" onUpdate={light => light.lookAt(0, -0.2, 0)} />
    <rectAreaLight position={[3.5, 3.5, -4]} width={2} height={5}
      intensity={9} color="#c9d4ff" onUpdate={light => light.lookAt(0, 0.4, 0)} />
    {!props.transparent && <mesh position={[0, -2.51, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[200, 200]} />
      <shaderMaterial uniforms={{floor: {value: new Color(props.floorColor)}, backdrop: {value: new Color(props.backdrop)}}}
        vertexShader={`varying vec2 ground;
          void main() {ground = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);}`}
        fragmentShader={`uniform vec3 floor, backdrop; varying vec2 ground;
          void main() {
            float shadow = exp(-dot(ground * vec2(0.7, 1.15), ground * vec2(0.7, 1.15)));
            vec3 color = mix(backdrop, floor, exp(-length(ground) * 0.10));
            gl_FragColor = vec4(color * (1.0 - shadow * 0.63), 1.0);
            #include <colorspace_fragment>
          }`} />
    </mesh>}
    <mesh ref={lowerSurface} geometry={pose.lower.surface} material={performance.material} position-y={pose.lower.center - 2.5} />
    <group ref={upper} position={[open * props.slide, open * props.lift, 0]} rotation-z={-0.18 * open}>
      <mesh ref={upperSurface} geometry={pose.upper.surface} material={performance.material} position-y={pose.upper.center - 2.5} />
      {faces && <mesh ref={upperCap} geometry={faces.echo.geometry} position-y={pose.upper.center - 2.5}>
        <shaderMaterial {...gateMaterial(faces.echo, false)} />
      </mesh>}
    </group>
    {faces && <group ref={gates}>
      <mesh geometry={faces.entry.geometry} position-y={pose.lower.center - 2.5}>
        <shaderMaterial {...gateMaterial(faces.entry, true)} />
      </mesh>
    </group>}
  </>;
};

const MilhousePortalDive: React.FC<Props> = props => {
  const root = useModel();
  const {width, height, aspect} = useCanvas();
  return root && <ThreeCanvas width={width} height={height}
    camera={{fov: 37, near: 0.01, far: Math.max(150, 7.5 / aspect + 80)}}
    gl={{alpha: true, antialias: true, preserveDrawingBuffer: true}}
    onCreated={({gl}) => {
      RectAreaLightUniformsLib.init();
      gl.toneMapping = NoToneMapping;
    }}>
    <Studio root={root} props={props} />
  </ThreeCanvas>;
};

export default defineSketch({
  id: 'milhouse-portal-dive',
  title: 'Milhouse Portal Dive',
  description: 'Milhouse splits in two, revealing the same studio through the cut. One continuous dive per bar.',
  schema,
  defaults: {
    lift: 1.4, slide: 1.0, diveStart: 0.55, sourceIn: SOURCE_IN, sourceOut: SOURCE_OUT,
    backdrop: '#302139', floorColor: '#403246', rimColor: '#00efef', echoColor: '#ff00ce',
  },
  timing: {bpm: 120, bars: 4, beatsPerBar: 4},
  validate: ({sourceIn, sourceOut}) => sourceIn < sourceOut
    ? [] : ['sourceOut: the FBX out point must be later than sourceIn.'],
  Component: MilhousePortalDive,
  assets: [modelFile],
});
