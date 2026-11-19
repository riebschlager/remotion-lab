import React, {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {AbsoluteFill, useDelayRender} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {useThree} from '@react-three/fiber';
import {Color, Group, LoadingManager, Quaternion, Vector3} from 'three';
import {RectAreaLightUniformsLib} from 'three/addons/lights/RectAreaLightUniformsLib.js';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
import {zColor} from '@remotion/zod-types';
import {z} from 'zod';
import {collectionFile} from '../../assets';
import {useBeat} from '../../beat/BeatContext';
import {divisionBeats, step, stepRandom} from '../../beat/envelopes';
import {divisionSchema} from '../../beat/divisions';
import {useCanvas} from '../canvas';
import {defineSketch, divisionIssues, useAsset, useSketch, type SketchBaseProps} from '../define';
import {chunkBounce, chunkEaseOptions, chunkMotionPhase} from './model';
import {chunkModel, sideCuts, tierCount} from './chunkGeometry';
import {createPoseSampler, DEFAULT_POSE_TIMES, SOURCE_DURATION, type PoseSampler} from './poses';
import {StudioFloor} from './StudioFloor';
import {Portal, portalSchema, leakSchema, portalDefaults, leakDefaults} from './Portal';
import {cascadeDefaults, cascadeGaps, cascadeMotion, cascadeSchema, cascadeTiming} from './cascade';
import {cameraDefaults, cameraSchema, cameraShot, shotPosition, type Shot} from './camera';

const poseTimeSchema = z.number().min(0).max(SOURCE_DURATION).step(0.05);
const schema = z.object({
  division: divisionSchema,
  poseTimes: z.tuple([poseTimeSchema, poseTimeSchema, poseTimeSchema, poseTimeSchema])
    .describe('Four source animation times in seconds, one pose reached on each beat'),
  scatter: z.number().min(0).max(1.25).step(0.05).describe('Lateral distance between chunks at peak'),
  spread: z.number().min(0).max(2.5).step(0.05).describe('Vertical separation at peak'),
  motion: z.enum(['cascade', 'accordion']).default('accordion')
    .describe('cascade: bottom-up ballistic launch that restacks with bounce and wobble; accordion: all chunks ease together'),
  cascade: cascadeSchema.default(cascadeDefaults).describe('Physics for cascade motion'),
  holdOpen: z.number().min(0).max(0.8).step(0.01).default(0).describe('Fraction of each division spent fully apart (cascade freezes at the top chunk apex)'),
  openEase: z.enum(chunkEaseOptions).default('smooth').describe('Accordion easing as the chunks break apart'),
  closeEase: z.enum(chunkEaseOptions).default('smooth').describe('Accordion easing as the chunks reassemble'),
  kick: z.number().min(0).max(0.5).step(0.01).describe('Alternating sideways bounce'),
  twist: z.number().min(0).max(30).step(1).describe('Chunk twist in degrees'),
  viewAngle: z.number().min(-60).max(60).step(1).describe('Character viewing angle'),
  backdrop: zColor(),
  cutColor: zColor().describe('Primary neon portal rim'),
  portal: portalSchema,
  lightLeak: leakSchema,
  floorColor: zColor(),
  ambientIntensity: z.number().min(0).max(2).step(0.01).describe('Ambient studio fill'),
  keyIntensity: z.number().min(0).max(15).step(0.1).describe('Large warm softbox'),
  fillIntensity: z.number().min(0).max(10).step(0.1).describe('Gentle front fill'),
  rimIntensity: z.number().min(0).max(15).step(0.1).describe('Cool rear strip'),
  roughness: z.number().min(0.15).max(0.9).step(0.01).describe('Vinyl satin finish'),
  // Saved looks without a camera keep the original locked-off shot.
  camera: cameraSchema.default({...cameraDefaults, mode: 'static'}).describe('Beat-locked camera moves'),
});
type Props = z.output<typeof schema>;
const modelFile = collectionFile('milhouse-01', 'milhouse-1.fbx');

// Keep model parsing and texture readiness together: a frame never captures an
// untextured intermediate load. Missing FBX/embedded textures fail explicitly.
let modelPromise: Promise<Group> | undefined;
const loadModel = (src: string) => modelPromise ??= new Promise<Group>((resolve, reject) => {
  const manager = new LoadingManager();
  let model: Group | undefined;
  manager.onLoad = () => { if (model) resolve(model); };
  manager.onError = (url) => reject(new Error(`Milhouse model/texture is missing: ${url}`));
  new FBXLoader(manager).load(src,
    root => { model = root; },
    undefined,
    () => reject(new Error(`public/${modelFile.publicPath} is missing or invalid. Restore the supplied FBX runtime copy.`)),
  );
}).catch(error => { modelPromise = undefined; throw error; });

function useMilhouse(times: readonly number[]) {
  const {src} = useAsset(modelFile);
  const {delayRender, continueRender, cancelRender} = useDelayRender();
  const [hold] = useState(() => delayRender('Loading Milhouse FBX and embedded texture'));
  const [model, setModel] = useState<Group | null>(null);
  const released = useRef(false);
  useEffect(() => {
    let current = true;
    loadModel(src).then(result => { if (current) setModel(result); }, error => { if (current) cancelRender(error); });
    return () => { current = false; if (!released.current) { continueRender(hold); released.current = true; } };
  }, [src, hold, continueRender, cancelRender]);
  useLayoutEffect(() => {
    if (model && !released.current) { continueRender(hold); released.current = true; }
  }, [model, hold, continueRender]);
  const poses = useMemo(() => model ? createPoseSampler(model, times) : null, [model, times]);
  useEffect(() => () => { poses?.material.dispose(); }, [poses]);
  return poses;
}

const Chunks: React.FC<{sampler: PoseSampler; props: Props; energy: number; phase: number; yaw: number}> = ({sampler, props, energy, phase, yaw}) => {
  const {beat, totalBeats} = useBeat();
  const {seed} = useSketch();
  const chunks = useMemo(() => chunkModel(sampler.sample(beat, totalBeats)), [sampler, beat, totalBeats]);
  const headings = sideCuts.map(cut => Math.atan2(cut.normal.z, cut.normal.x));
  const motions = props.motion === 'cascade'
    ? cascadeMotion(phase, tierCount, props.spread, props.cascade, headings)
    : headings.map((heading, tier) => ({
      heading, lift: energy * (0.15 + tier / (tierCount - 1) * props.spread),
      air: energy, tilt: 0, squash: 0,
    }));
  const gaps = cascadeGaps(motions);
  const openingFor = (cut: number) => cut < tierCount - 1
    ? Math.min(1, gaps[cut] * (tierCount - 1) * 9)
    : Math.min(1, motions[cut - tierCount + 1].air * props.scatter * 8);
  const opening = Math.max(...gaps.map((_, cut) => openingFor(cut)),
    ...motions.map((_, tier) => openingFor(tier + tierCount - 1)));
  const spill = useMemo(() => ({
    strength: {value: 0}, primary: {value: new Color()}, secondary: {value: new Color()},
  }), []);
  spill.strength.value = opening * props.lightLeak.surfaceSpill * props.portal.glow;
  spill.primary.value.set(props.cutColor);
  spill.secondary.value.set(props.portal.secondaryColor);
  const material = useMemo(() => {
    const satin = sampler.material.clone();
    satin.roughness = props.roughness;
    satin.onBeforeCompile = shader => {
      shader.uniforms.portalSpill = spill.strength;
      shader.uniforms.portalPrimary = spill.primary;
      shader.uniforms.portalSecondary = spill.secondary;
      shader.vertexShader = 'attribute float cutDistance; varying vec3 portalLocal; varying float vCutDistance;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\nportalLocal = position; vCutDistance = cutDistance;');
      shader.fragmentShader = 'uniform float portalSpill; uniform vec3 portalPrimary, portalSecondary; varying vec3 portalLocal; varying float vCutDistance;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float hue = smoothstep(0.3, 0.7, 0.5 + 0.5 * sin(portalLocal.x * 4.5 + portalLocal.z * 5.0));
        totalEmissiveRadiance += mix(portalPrimary, portalSecondary, hue)
          * exp(-vCutDistance * 26.0) * min(portalSpill, 1.2) * 0.45;`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        float hairFinish = smoothstep(0.02, 0.18, diffuseColor.b - diffuseColor.r);
        roughnessFactor *= mix(1.0, 0.65, hairFinish);`);
    };
    return satin;
  }, [sampler, props.roughness, spill]);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => () => {
    for (const chunk of chunks) {
      chunk.surface.dispose();
      for (const face of chunk.faces) face.caps.dispose();
    }
  }, [chunks]);
  return (
    <group rotation={[0, (props.viewAngle - yaw) * Math.PI / 180, 0]} position={[0, -2.95, 0]}>
      {chunks.map(({tier, side, center, surface, faces}) => {
        const id = tier * 2 + (side > 0 ? 1 : 0);
        const motion = motions[tier];
        const direction = sideCuts[tier].normal;
        const scatter = side * 0.5 * props.scatter * motion.air;
        const kick = motion.air * props.kick * (0.85 + 0.3 * stepRandom(seed('chunk-kick'), id));
        const position = center.clone().addScaledVector(direction, scatter);
        position.x += (tier % 2 ? 1 : -1) * kick;
        position.y += motion.lift;
        const axis = new Vector3(-Math.sin(motion.heading), 0, Math.cos(motion.heading));
        // Local bounce effects need real clearance, or the settled seams peel open.
        const clearance = Math.min(1, (motion.air * props.scatter
          + Math.max(gaps[tier - 1] ?? 0, gaps[tier] ?? 0)) / 0.12);
        const squash = motion.squash * clearance;
        const turn = side * motion.air * props.twist * Math.PI / 180;
        const quaternion = new Quaternion().setFromAxisAngle(axis, side * motion.tilt * clearance)
          .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), turn));
        return (
          <group key={id} position={position} quaternion={quaternion}
            scale={[1 + squash / 2, 1 - squash, 1 + squash / 2]}>
            <mesh geometry={surface} material={material} castShadow receiveShadow />
            {faces.map(face => {
              const exposure = openingFor(face.cut);
              return exposure > 0.00001 ? (
                <group key={face.cut} position={face.offset} quaternion={face.rotation}>
                  <Portal caps={face.caps} color={props.cutColor} settings={props.portal} leaks={props.lightLeak}
                    energy={motion.air} opening={exposure} clock={beat * props.portal.echoTravel}
                    drift={beat / totalBeats * Math.PI * 2}
                    variation={stepRandom(seed('portal-phase'), id) * props.portal.chunkVariation} />
                </group>
              ) : null;
            })}
          </group>
        );
      })}
    </group>
  );
};

/** Drives the orthographic camera from the beat clock before the frame is advanced. */
const CameraRig: React.FC<{shot: Shot; azimuthOffset: number; baseZoom: number}> = ({shot, azimuthOffset, baseZoom}) => {
  const camera = useThree(state => state.camera);
  useLayoutEffect(() => {
    camera.position.set(...shotPosition(shot, azimuthOffset));
    camera.up.set(0, 1, 0);
    camera.zoom = baseZoom * shot.zoom;
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [camera, shot.azimuth, shot.elevation, shot.zoom, azimuthOffset, baseZoom]);
  return null;
};

const MilhouseChunks: React.FC<Props> = (props) => {
  const {beat, totalBeats, beatsPerBar} = useBeat();
  const {width, height, aspect} = useCanvas();
  const sampler = useMilhouse(props.poseTimes);
  const {transparent, variant} = props as Props & SketchBaseProps;
  const {phase: stepPhase, index: stepIndex, stepsPerLoop} = step(beat, divisionBeats(props.division, beatsPerBar), totalBeats);
  const cascade = props.motion === 'cascade';
  const phase = chunkMotionPhase(stepPhase, props.holdOpen,
    cascade ? cascadeTiming(tierCount, props.spread, props.cascade).apex : undefined);
  // Raw division phase when the figure is back together; the hold sits before it.
  const landPhase = (cascade ? props.cascade.landAt : 0.64) * (1 - props.holdOpen) + props.holdOpen;
  const shot = cameraShot(props.camera, {beat, totalBeats, beatsPerBar, stepPhase, stepIndex, stepsPerLoop, landPhase});
  // Lights following the camera is the same as turning Milhouse the other way.
  const follow = props.camera.lightsFollow;
  const energy = cascade ? 0 : chunkBounce(phase, props.openEase, props.closeEase);
  // A canvas-fraction camera: keep the whole silhouette and its bounce visible
  // even on very wide or narrow custom canvases. World model height is five.
  const frustumHeight = Math.max(7.1 + props.spread, 4.5 / aspect);
  const zoom = height / frustumHeight;
  return (
    <AbsoluteFill style={transparent ? undefined : {backgroundColor: props.backdrop}}>
      {sampler ? <ThreeCanvas width={width} height={height} orthographic
        shadows="percentage"
        camera={{position: shotPosition(shot, follow ? 0 : shot.azimuth), zoom: zoom * shot.zoom, near: 0.1, far: 100}}
        gl={{alpha: true, antialias: true, preserveDrawingBuffer: true}}
        onCreated={({camera}) => {
          RectAreaLightUniformsLib.init();
          camera.lookAt(0, 0, 0); camera.updateProjectionMatrix();
        }}>
        <CameraRig shot={shot} azimuthOffset={follow ? -shot.azimuth : 0} baseZoom={zoom} />
        {!transparent ? <fog attach="fog" args={[props.backdrop, 22, 60]} /> : null}
        <ambientLight intensity={props.ambientIntensity} color="#e7deed" />
        <rectAreaLight position={[-4.5, 5, 6]} width={4.5} height={6}
          intensity={props.keyIntensity} color="#fff0dc" onUpdate={light => light.lookAt(0, 0, 0)} />
        <rectAreaLight position={[4.5, 1.5, 5]} width={3.5} height={5}
          intensity={props.fillIntensity} color="#eef0ff" onUpdate={light => light.lookAt(0, -0.2, 0)} />
        <rectAreaLight position={[3.5, 3.5, -4]} width={2} height={5}
          intensity={props.rimIntensity} color="#c9d4ff" onUpdate={light => light.lookAt(0, 0.4, 0)} />
        {/* A weak shadow-casting source under the key adds occlusion between chunks. */}
        <directionalLight position={[-4.5, 7, 6]} intensity={0.65} color="#fff0dc" castShadow
          shadow-mapSize={[1024, 1024]} shadow-camera-left={-5} shadow-camera-right={5}
          shadow-camera-top={6} shadow-camera-bottom={-5} shadow-camera-near={0.5}
          shadow-camera-far={25} shadow-bias={-0.0002} shadow-normalBias={0.015} shadow-radius={3} />
        <Chunks sampler={sampler} props={props} energy={energy} phase={phase} yaw={follow ? shot.azimuth : 0} />
        {!transparent ? <StudioFloor color={props.floorColor}
          revision={`${props.motion}/${JSON.stringify(props.cascade)}/${props.scatter}/${props.spread}/${props.kick}/${props.twist}/${props.viewAngle}/${follow ? shot.azimuth : 0}/${variant}/${props.poseTimes.join(",")}/${props.cutColor}/${JSON.stringify(props.portal)}/${JSON.stringify(props.lightLeak)}/${phase}/${energy}`} /> : null}
      </ThreeCanvas> : null}
    </AbsoluteFill>
  );
};

export default defineSketch({
  id: 'milhouse-chunks',
  title: 'Milhouse Chunks',
  description: 'Satin Milhouse breaks into irregular chunks with neon echo portals on the inner faces.',
  schema,
  defaults: {division: '1/4', poseTimes: [...DEFAULT_POSE_TIMES], scatter: 0.85, spread: 1.5,
    motion: 'cascade', cascade: {...cascadeDefaults},
    holdOpen: 0, openEase: 'smooth', closeEase: 'smooth', kick: 0.15, twist: 10,
    portal: portalDefaults, lightLeak: leakDefaults,
    viewAngle: -15, backdrop: '#302139', cutColor: '#00efef', floorColor: '#403246',
    ambientIntensity: 0.28, keyIntensity: 7.5, fillIntensity: 3.3, rimIntensity: 9, roughness: 0.46,
    camera: {...cameraDefaults, marks: [...cameraDefaults.marks]}},
  timing: {bpm: 120, bars: 4, beatsPerBar: 4},
  Component: MilhouseChunks,
  assets: [modelFile],
  validate: (props, timing) => [
    ...divisionIssues('division', props.division, timing),
    ...(Math.abs(timing.bars * timing.beatsPerBar * props.portal.echoTravel - Math.round(timing.bars * timing.beatsPerBar * props.portal.echoTravel)) < 1e-8
      ? [] : ['portal.echoTravel: inward waves must complete whole cycles over the loop.']),
    ...(props.motion === 'cascade' && props.cascade.landAt - props.cascade.stagger < 0.2
      ? ['cascade.landAt: leave at least 0.2 of the division after the top tier launches (landAt - stagger).'] : []),
    ...(props.motion === 'cascade' && props.cascade.landAt + props.cascade.bounce * (props.cascade.landAt - props.cascade.stagger) > 0.95
      ? ['cascade.bounce: the top tier must finish its hop before 95% of the division so the figure can settle.'] : []),
    ...(props.camera.mode === 'ratchet' && props.camera.turns === 0
      && Math.round(timing.bars * timing.beatsPerBar / divisionBeats(props.division, timing.beatsPerBar)) % 2 !== 0
      ? ['camera.turns: a back-and-forth ratchet needs an even number of divisions in the loop.'] : []),
    ...((timing.bars * timing.beatsPerBar) % 4 === 0 ? [] : ['poseTimes: loop must contain complete four-beat pose phrases.']),
  ],
  debugDivisions: (props) => [props.division],
});
