import React from 'react';
import {AbsoluteFill} from 'remotion';
import {zColor} from '@remotion/zod-types';
import {z} from 'zod';
import {useBeat} from '../../beat/BeatContext';
import {getTotalBeats} from '../../beat/timing';
import {lfo, loopNoise, mod, stepRandom} from '../../beat/envelopes';
import {useCanvas} from '../canvas';
import {defineSketch, useSketch, type SketchBaseProps} from '../define';
import {basePoseAt, CHOMPS, chompHitAt, PHRASE, poseAt, zoomAt, type Pose} from './choreography';
import {makeCamera, NOSE, project, riderModel, Scene, sharkModel, useCast, type View} from './Scene';

const schema = z.object({
  waterTop: zColor().describe('Water colour near the surface'),
  waterMid: zColor().describe('Mid-water colour; also the fog the shark fades into'),
  waterDeep: zColor().describe('Colour of the depths'),
  rays: z.number().min(0).max(1).step(.05).describe('Light shaft strength'),
  snow: z.number().min(0).max(1).step(.05).describe('Marine snow density'),
  shake: z.number().min(0).max(1).step(.05).describe('Camera kick on each bite'),
  bubbles: z.number().int().min(0).max(40).describe('Bubbles released per bite'),
  riderScale: z.number().min(.1).max(2).step(.05).describe('Size of the man riding the shark'),
  drifters: z.boolean().describe('Giant men tumbling in the fog'),
});
type Props = z.output<typeof schema> & Partial<Pick<SketchBaseProps, 'transparent'>>;

const FOV = 38;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ahead = (pose: Pose, distance: number): [number, number, number] =>
  [pose.x + Math.sin(pose.yaw) * Math.cos(pose.pitch) * distance, pose.y - Math.sin(pose.pitch) * distance,
    pose.z + Math.cos(pose.yaw) * Math.cos(pose.pitch) * distance];

/** Distance at which a wantW × wantH window fills the frame. */
const frameDistance = (aspect: number, wantW: number, wantH: number) => {
  const t = Math.tan((FOV * Math.PI) / 360);
  return Math.max(wantW / (2 * t * aspect), wantH / (2 * t));
};

const useView = (P: number, aspect: number, shake: number, seed: string): View => {
  const base = basePoseAt(P);
  const zoom = zoomAt(P);
  // The swim camera trails the shark around the ellipse instead of watching its centre.
  const swimTarget: [number, number, number] = [base.x * .65, .1 + base.y * .6, -1 + base.z * .65];
  const jaws = ahead(base, NOSE * .45);
  const target = swimTarget.map((v, i) => lerp(v, jaws[i], zoom)) as [number, number, number];
  const wide = frameDistance(aspect, 8.6, 6.4);
  const tight = frameDistance(aspect, 3.9, 3.4);
  const distance = Math.exp(lerp(Math.log(wide), Math.log(tight), zoom));
  const phase = P / PHRASE;
  const sway = .35 * (1 - zoom * .6);
  const hit = chompHitAt(P) * shake;
  const kick = Math.max(...CHOMPS.map((c, i) => (mod(P - c, PHRASE) < .5 ? i + 1 : 0)));
  const jitter = (channel: number) => hit * .22 * (stepRandom(seed, kick, channel) * 2 - 1);
  const elevation = .2 + .08 * loopNoise(seed, phase, .8, 3);
  return {
    fov: FOV + hit * 2.5,
    target: [target[0] + jitter(0), target[1] + jitter(1), target[2]],
    position: [
      target[0] + sway * loopNoise(seed, phase, 1, 0) + jitter(2),
      target[1] + distance * elevation + sway * loopNoise(seed, phase, 1, 1) + jitter(3),
      target[2] + distance - hit * .35,
    ],
  };
};

function Rays({strength, flash, phase, seed}: {strength: number; flash: number; phase: number; seed: string}) {
  if (strength === 0) return null;
  return (
    <AbsoluteFill style={{mixBlendMode: 'screen', overflow: 'hidden'}}>
      {Array.from({length: 6}, (_, i) => {
        const x = 8 + 84 * stepRandom(seed, i, 0);
        const width = 7 + 16 * stepRandom(seed, i, 1);
        const lean = -14 + 28 * stepRandom(seed, i, 2) + 4 * lfo(phase, 1, 'sine', stepRandom(seed, i, 3));
        const glow = (.35 + .3 * (.5 + .5 * lfo(phase, 2, 'sine', stepRandom(seed, i, 4)))) * strength * (1 + flash * .6);
        return (
          <div key={i} style={{
            position: 'absolute', top: '-12%', left: `${x}%`, width: `${width}%`, height: '95%',
            transformOrigin: '50% 0', rotate: `${lean}deg`, translate: '-50% 0', opacity: glow,
            background: 'linear-gradient(180deg, #d8fbffcc, #8de6ff55 35%, transparent 92%)',
            filter: 'blur(1.6vmin)',
          }} />
        );
      })}
    </AbsoluteFill>
  );
}

function Snow({density, phase, seed, vmin}: {density: number; phase: number; seed: string; vmin: number}) {
  const count = Math.round(90 * density);
  return (
    <AbsoluteFill style={{overflow: 'hidden'}}>
      {Array.from({length: count}, (_, i) => {
        const depth = stepRandom(seed, i, 0);
        // Near flakes fall twice as far per loop; both are whole cycles.
        const cycles = depth > .7 ? 2 : 1;
        const y = mod(stepRandom(seed, i, 1) + phase * cycles, 1) * 112 - 6;
        const x = stepRandom(seed, i, 2) * 100 + 1.2 * lfo(phase, cycles + 1, 'sine', stepRandom(seed, i, 3));
        const size = vmin * (.18 + depth * depth * .75);
        return (
          <div key={i} style={{
            position: 'absolute', left: `${x}%`, top: `${y}%`, width: size, height: size, borderRadius: '50%',
            background: '#e6fbff', opacity: .18 + .45 * depth, filter: depth > .85 ? `blur(${size * .35}px)` : undefined,
          }} />
        );
      })}
    </AbsoluteFill>
  );
}

const SharkFrenzy: React.FC<Props> = ({waterTop, waterMid, waterDeep, rays, snow, shake, bubbles, riderScale, drifters, transparent}) => {
  const {beat, loopPhase} = useBeat();
  const {width, height, vmin, aspect} = useCanvas();
  const {seed} = useSketch();
  const cast = useCast();
  const P = mod(beat, PHRASE);
  const pose = poseAt(P);
  const view = useView(P, aspect, shake, seed('camera'));
  const camera = makeCamera(width, height, view);
  const hit = chompHitAt(P);
  const t = Math.tan((view.fov * Math.PI) / 360);
  // Fog scales with the shot, so the near side of the swim stays crisp on every canvas.
  const reach = Math.hypot(...view.position.map((v, i) => v - view.target[i]) as [number, number, number]);

  // Bubbles: each chomp releases a cloud from where the jaws were when they closed.
  const bubbleSeed = seed('bubbles');
  const cloud = CHOMPS.flatMap((chomp, c) => {
    const since = mod(P - chomp, PHRASE);
    const life = 3.2;
    if (since >= life || bubbles === 0) return [];
    const mouth = ahead(poseAt(chomp), NOSE * .92);
    return Array.from({length: bubbles}, (_, i) => {
      const r = (k: number) => stepRandom(bubbleSeed, c * 100 + i, k);
      const burst = 1 - Math.exp(-since * 2.2);
      const world: [number, number, number] = [
        mouth[0] + (r(0) - .5) * 2.2 * burst,
        mouth[1] + (r(1) - .3) * .9 * burst + since * (.35 + r(2) * .55) + .04 * since * since,
        mouth[2] + (r(3) - .2) * 1.6 * burst,
      ];
      const screen = project(camera, world, width, height);
      const depth = Math.hypot(world[0] - view.position[0], world[1] - view.position[1], world[2] - view.position[2]);
      const radius = (.035 + r(4) * .09) * height / (2 * t * depth);
      const fade = Math.min(1, since / .08) * Math.pow(1 - since / life, 1.4);
      return {key: `${c}-${i}`, ...screen, radius, fade};
    });
  });

  return (
    <AbsoluteFill style={{overflow: 'hidden'}}>
      {!transparent && <AbsoluteFill style={{
        background: `linear-gradient(180deg, ${waterTop} 0%, ${waterMid} 42%, ${waterDeep} 100%)`,
      }} />}
      <AbsoluteFill style={{
        background: `radial-gradient(ellipse 80% 45% at 50% -5%, #e9ffff${Math.round(40 + 60 * hit).toString(16)}, transparent 70%)`,
      }} />
      <Rays strength={rays} flash={hit} phase={loopPhase} seed={seed('rays')} />
      <Snow density={snow * .55} phase={loopPhase} seed={seed('snow-far')} vmin={vmin * .7} />
      <Scene cast={cast} P={P} loopPhase={loopPhase} width={width} height={height} camera={camera} pose={pose}
        fog={waterMid} fogNear={reach * .85} fogFar={reach * 3.2} riderScale={riderScale} drift={drifters} />
      {cloud.map((b) => b.behind ? null : (
        <div key={b.key} style={{
          position: 'absolute', left: b.x - b.radius, top: b.y - b.radius, width: b.radius * 2, height: b.radius * 2,
          borderRadius: '50%', opacity: b.fade,
          background: 'radial-gradient(circle at 35% 30%, #ffffffee 0 14%, #dffaff22 34%, #bff3ff33 70%, #f2feffcc 86%, transparent 92%)',
        }} />
      ))}
      <Snow density={snow * .45} phase={loopPhase} seed={seed('snow-near')} vmin={vmin * 1.5} />
      <AbsoluteFill style={{background: 'radial-gradient(ellipse at 50% 45%, transparent 55%, #010814b3 100%)'}} />
    </AbsoluteFill>
  );
};

export default defineSketch({
  id: 'shark-frenzy',
  title: 'Shark Frenzy',
  description: 'A low-poly shark circles in deep water with a cheering man on its back, then snaps its jaws around him on three beats.',
  schema,
  defaults: {
    waterTop: '#3fb8c8',
    waterMid: '#0d4a6b',
    waterDeep: '#020a18',
    rays: .7,
    snow: .6,
    shake: .6,
    bubbles: 16,
    riderScale: .6,
    drifters: true,
  },
  Component: SharkFrenzy,
  assets: [sharkModel, riderModel],
  timing: {bpm: 100, bars: 4, beatsPerBar: 4},
  validate: (_props, timing) => getTotalBeats(timing) % PHRASE === 0 ? []
    : [`bars: the swim–idle–bite phrase is ${PHRASE} beats; use a loop length that is a multiple of ${PHRASE} beats.`],
});
