import React, {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {AbsoluteFill, staticFile, useDelayRender} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {DoubleSide, LoadingManager} from 'three';
import {RectAreaLightUniformsLib} from 'three/addons/lights/RectAreaLightUniformsLib.js';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
import {zColor} from '@remotion/zod-types';
import {z} from 'zod';
import {useBeat} from '../../beat/BeatContext';
import {divisionBeats, step, stepRandom} from '../../beat/envelopes';
import {divisionSchema} from '../../beat/divisions';
import {useCanvas} from '../canvas';
import {defineSketch, divisionIssues, useSketch, type SketchBaseProps} from '../define';
import {bakeModel, sliceBounce, sliceModel, type Model} from './sliceGeometry';
import {StudioFloor} from './StudioFloor';

const schema = z.object({
  division: divisionSchema,
  slices: z.number().int().min(2).max(20).describe('Horizontal mesh sections'),
  spread: z.number().min(0).max(2.5).step(0.05).describe('Vertical separation at peak'),
  kick: z.number().min(0).max(0.5).step(0.01).describe('Alternating sideways bounce'),
  twist: z.number().min(0).max(30).step(1).describe('Slice twist in degrees'),
  viewAngle: z.number().min(-60).max(60).step(1).describe('Character viewing angle'),
  backdrop: zColor(),
  cutColor: zColor(),
  floorColor: zColor(),
  ambientIntensity: z.number().min(0).max(2).step(0.01).describe('Ambient studio fill'),
  keyIntensity: z.number().min(0).max(15).step(0.1).describe('Large warm softbox'),
  fillIntensity: z.number().min(0).max(10).step(0.1).describe('Gentle front fill'),
  rimIntensity: z.number().min(0).max(15).step(0.1).describe('Cool rear strip'),
  roughness: z.number().min(0.15).max(0.9).step(0.01).describe('Vinyl satin finish'),
});
type Props = z.output<typeof schema>;

// Keep model parsing and texture readiness together: a frame never captures an
// untextured intermediate load. Missing FBX/embedded textures fail explicitly.
let modelPromise: Promise<Model> | undefined;
const loadModel = () => modelPromise ??= new Promise<Model>((resolve, reject) => {
  const manager = new LoadingManager();
  let model: Model | undefined;
  manager.onLoad = () => { if (model) resolve(model); };
  manager.onError = (url) => reject(new Error(`Milhouse model/texture is missing: ${url}`));
  new FBXLoader(manager).load(staticFile('assets/milhouse-01/milhouse-2.fbx'),
    root => { try { model = bakeModel(root); } catch (error) { reject(error); } },
    undefined,
    () => reject(new Error('public/assets/milhouse-01/milhouse-2.fbx is missing or invalid. Restore the supplied FBX runtime copy.')),
  );
}).catch(error => { modelPromise = undefined; throw error; });

function useMilhouse() {
  const {delayRender, continueRender, cancelRender} = useDelayRender();
  const [hold] = useState(() => delayRender('Loading Milhouse FBX and embedded texture'));
  const [model, setModel] = useState<Model | null>(null);
  const released = useRef(false);
  useEffect(() => {
    let current = true;
    loadModel().then(result => { if (current) setModel(result); }, error => { if (current) cancelRender(error); });
    return () => { current = false; if (!released.current) { continueRender(hold); released.current = true; } };
  }, [hold, continueRender, cancelRender]);
  useLayoutEffect(() => {
    if (model && !released.current) { continueRender(hold); released.current = true; }
  }, [model, hold, continueRender]);
  return model;
}

const Sections: React.FC<{model: Model; props: Props; energy: number; phase: number}> = ({model, props, energy, phase}) => {
  const {seed} = useSketch();
  const sections = useMemo(() => sliceModel(model, props.slices), [model, props.slices]);
  const material = useMemo(() => {
    const satin = model.material.clone();
    satin.roughness = props.roughness;
    // The embedded palette distinguishes blue hair from the satin yellow body.
    satin.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        float hairFinish = smoothstep(0.02, 0.18, diffuseColor.b - diffuseColor.r);
        roughnessFactor *= mix(1.0, 0.65, hairFinish);`);
    };
    return satin;
  }, [model, props.roughness]);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => () => { for (const section of sections) { section.surface.dispose(); section.caps.dispose(); } }, [sections]);
  return (
    <group rotation={[0, props.viewAngle * Math.PI / 180, 0]} position={[0, -2.95, 0]}>
      {sections.map((section, index) => {
        const fraction = index / (props.slices - 1);
        const direction = index % 2 ? 1 : -1;
        const individuality = 0.85 + 0.3 * stepRandom(seed('slice-kick'), index);
        const lift = energy * (0.15 + fraction * props.spread);
        const x = direction * energy * props.kick * individuality;
        const yaw = direction * energy * props.twist * Math.PI / 180;
        return (
          <group key={index} position={[x, section.center + lift, 0]}
            rotation={[0, yaw, direction * Math.sin(phase * Math.PI * 2) * energy * 0.035]}>
            <mesh geometry={section.surface} material={material} castShadow receiveShadow />
            {/* Hide caps at rest so coincident internal surfaces cannot z-fight. */}
            <mesh geometry={section.caps} visible={energy > 0.00001} castShadow receiveShadow>
              <meshStandardMaterial color={props.cutColor} side={DoubleSide} roughness={0.88} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
};

const MilhouseSlices: React.FC<Props> = (props) => {
  const {beat, totalBeats, beatsPerBar} = useBeat();
  const {width, height, aspect} = useCanvas();
  const model = useMilhouse();
  const {transparent, variant} = props as Props & SketchBaseProps;
  const {phase} = step(beat, divisionBeats(props.division, beatsPerBar), totalBeats);
  const energy = sliceBounce(phase);
  // A canvas-fraction camera: keep the whole silhouette and its bounce visible
  // even on very wide or narrow custom canvases. World model height is five.
  const frustumHeight = Math.max(7.1 + props.spread, 4.5 / aspect);
  const zoom = height / frustumHeight;
  return (
    <AbsoluteFill style={transparent ? undefined : {backgroundColor: props.backdrop}}>
      {model ? <ThreeCanvas width={width} height={height} orthographic
        shadows="percentage"
        camera={{position: [0, 4, 20], zoom, near: 0.1, far: 100}}
        gl={{alpha: true, antialias: true, preserveDrawingBuffer: true}}
        onCreated={({camera}) => {
          RectAreaLightUniformsLib.init();
          camera.lookAt(0, 0, 0); camera.updateProjectionMatrix();
        }}>
        {!transparent ? <fog attach="fog" args={[props.backdrop, 22, 60]} /> : null}
        <ambientLight intensity={props.ambientIntensity} color="#e7deed" />
        <rectAreaLight position={[-4.5, 5, 6]} width={4.5} height={6}
          intensity={props.keyIntensity} color="#fff0dc" onUpdate={light => light.lookAt(0, 0, 0)} />
        <rectAreaLight position={[4.5, 1.5, 5]} width={3.5} height={5}
          intensity={props.fillIntensity} color="#eef0ff" onUpdate={light => light.lookAt(0, -0.2, 0)} />
        <rectAreaLight position={[3.5, 3.5, -4]} width={2} height={5}
          intensity={props.rimIntensity} color="#c9d4ff" onUpdate={light => light.lookAt(0, 0.4, 0)} />
        {/* A weak shadow-casting source under the key adds occlusion between slices. */}
        <directionalLight position={[-4.5, 7, 6]} intensity={0.65} color="#fff0dc" castShadow
          shadow-mapSize={[1024, 1024]} shadow-camera-left={-5} shadow-camera-right={5}
          shadow-camera-top={6} shadow-camera-bottom={-5} shadow-camera-near={0.5}
          shadow-camera-far={25} shadow-bias={-0.0002} shadow-normalBias={0.015} shadow-radius={3} />
        <Sections model={model} props={props} energy={energy} phase={phase} />
        {!transparent ? <StudioFloor color={props.floorColor}
          revision={`${props.slices}/${props.spread}/${props.kick}/${props.twist}/${props.viewAngle}/${variant}`} /> : null}
      </ThreeCanvas> : null}
    </AbsoluteFill>
  );
};

export default defineSketch({
  id: 'milhouse-slices',
  title: 'Milhouse Slices',
  description: 'Milhouse springs into horizontal mesh sections and reassembles on every beat.',
  schema,
  defaults: {division: '1/4', slices: 8, spread: 1.5, kick: 0.15, twist: 10,
    viewAngle: -15, backdrop: '#302139', cutColor: '#ffca9e', floorColor: '#403246',
    ambientIntensity: 0.28, keyIntensity: 7.5, fillIntensity: 3.3, rimIntensity: 9, roughness: 0.46},
  timing: {bpm: 120, bars: 4, beatsPerBar: 4},
  Component: MilhouseSlices,
  validate: (props, timing) => divisionIssues('division', props.division, timing),
  debugDivisions: (props) => [props.division],
});
