import React, {useMemo} from 'react';
import {AbsoluteFill} from 'remotion';
import {z} from 'zod';
import {clip, clipNames, sourceFrameIndex, type ClipRef} from '../../assets';
import {useBeat} from '../../beat/BeatContext';
import {divisionBeats, lfo, mod, stepRandom} from '../../beat/envelopes';
import {divisionSchema} from '../../beat/divisions';
import {patternEvents, patternIssues, patternPulse} from '../../beat/patterns';
import {useCanvas} from '../canvas';
import {defineSketch, divisionIssues, useAsset, useSketch} from '../define';
import {FaceCanvas, lensReach, rgb, type Face, type Fog, type Rgb} from './FaceCanvas';
import {useFaceTextures} from './textures';

// ---------------------------------------------------------------------------
// Material: every clip of `gif-dancimal`, Neil Sanders' dancing stickers, all
// seamless transparent loops shown in their own colours. Tone says which
// grounds they stand out on (see the palette below).
// ---------------------------------------------------------------------------
type Tone = 'warm' | 'cool' | 'light';
const coolClips = new Set([
  'Happy Dance Party Sticker by Neil Sanders.gif',     // blue bird, yellow legs
  'Happy Dance Sticker by Neil Sanders copy.gif',      // small blue dancer
  'Happy Side To Side Sticker by Neil Sanders.gif',    // teal
]);
const lightClips = new Set([
  'Happy Fun Sticker by Neil Sanders copy.gif',        // white cat
  'Jump Bouncing Sticker by Neil Sanders.gif',         // pale blue frog
]);
const clips = clipNames('gif-dancimal').map((name) => ({
  ref: clip('gif-dancimal', name),
  tone: (lightClips.has(name) ? 'light' : coolClips.has(name) ? 'cool' : 'warm') as Tone,
}));

// ---------------------------------------------------------------------------
// Palette: the stickers are mostly orange, yellow, lime and red, so the world
// is their complement: indigo, violet, cobalt and lilac. The lane dashes are
// the one warm note in the street.
// ---------------------------------------------------------------------------
const NIGHT = '#0d0a2e';
const INK = '#0e0a2c';           // edges and shade
const HAZE = '#a48cf6';
const DASH = '#ffd23f';
const sky = {
  stops: ['#0d0a2e', '#2a1f86', '#6a4cf0', '#d2b8ff'].map(rgb),
  below: rgb(HAZE),
};
// Stars are mostly cool white, a few sticker-warm. The distant skyline sits just darker than the
// horizon glow (far row) and a step darker again (near row), with faint lilac windows.
const STAR_COLORS: [Rgb, Rgb] = [rgb('#f3eeff'), rgb('#ffe39a')];
const SKYLINE_COLORS: [Rgb, Rgb] = [rgb('#9c86f2'), rgb('#7559de')];
const SKYLINE_LIGHTS = rgb('#efe6ff');
const SKYLINE_MIST = rgb('#d2b8ff');
/** Tallest skyline block at `skyline: 1`, in radians of elevation (about 9 vmin). */
const SKYLINE_RISE = 0.09;
const grounds: Record<Tone, Rgb[]> = {
  warm: ['#3b2ab0', '#2343c9', '#6b4fe6', '#1d1766'].map(rgb),
  cool: ['#4a1466', '#7a2585', '#e8dcff'].map(rgb),
  light: ['#1d1766', '#3b2ab0', '#4a1466'].map(rgb),
};
const CAP = rgb('#251b70');     // top and underside of a cube
const ROAD = rgb('#2a1f6b');
const STREET_TOP = rgb('#17123f');
const CURB = rgb('#7fe3ff');
const DASH_RGB = rgb(DASH);
const SLABS = ['#231a63', '#33237a'].map(rgb);
const INK_RGB = rgb(INK);
const HAZE_RGB = rgb(HAZE);

// Haze ramps, in cube sizes ahead of the eye.
const cubeFog: Fog = {floor: 0, start: 4.5, end: 10.5, max: 0.82};
const slabFog: Fog = {...cubeFog, floor: 0.12};
const roadFog: Fog = {floor: 0, start: 3.2, end: 10.6, max: 1};

// CSS-convention rotations (y points down), in degrees, for placing cube faces.
type Vec = [number, number, number];
const turn = (deg: number) => [Math.cos(deg * Math.PI / 180), Math.sin(deg * Math.PI / 180)];
const rotX = ([x, y, z]: Vec, deg: number): Vec => { const [c, s] = turn(deg); return [x, y * c - z * s, y * s + z * c]; };
const rotY = ([x, y, z]: Vec, deg: number): Vec => { const [c, s] = turn(deg); return [x * c + z * s, y, -x * s + z * c]; };
const rotZ = ([x, y, z]: Vec, deg: number): Vec => { const [c, s] = turn(deg); return [x * c - y * s, x * s + y * c, z]; };

// Studio gives a number field with a whole-number minimum and no step a step of 1, so every
// fractional field states its step with `multipleOf`, which Studio reads as the input step.
// The hop pattern has the shape of the shared `beatPatternSchema`, with steps added: that schema
// cannot take one, because its built-in shuffle swing is 1/3.
const hopPatternSchema = z.object({
  /** One strength per division: 0 = rest, 1 = full accent. */
  steps: z.array(z.number().min(0).max(1).multipleOf(0.05)).min(1),
  /** Delay odd slots by this fraction of one division. */
  swing: z.number().min(0).max(0.95).multipleOf(0.01).optional(),
}).strict();

const schema = z.object({
  /** Buildings passed per bar. 3 against a 4-beat bar keeps the drive from strobing with the hops. */
  blocksPerBar: z.number().int().min(1).max(8),
  /** Grid of the seismic hits. */
  hopDivision: divisionSchema,
  /** Strength of each hit on that grid; 0 rests. Swing loosens the offbeats. */
  hopPattern: hopPatternSchema,
  /** Hop height of one cube at full strength, in cube sizes. Upper cubes ride on the ones below. */
  hopHeight: z.number().min(0).max(1.5).multipleOf(0.01),
  /** Length of one hop-and-settle, in beats. */
  hopBeats: z.number().min(0.1).max(4).multipleOf(0.05),
  /** Beats the wave needs to travel one cube size down the street. */
  waveBeats: z.number().min(0).max(1).multipleOf(0.01),
  /** Beats between a cube and the one stacked on it. */
  stackBeats: z.number().min(0).max(0.5).multipleOf(0.01),
  /** The right side of the street answers the left this many beats later. */
  answerBeats: z.number().min(0).max(4).multipleOf(0.05),
  /** Tallest building, in cubes. */
  maxFloors: z.number().int().min(2).max(9),
  /** Fisheye lens strength: 0 is a flat view; higher bows the street and widens the edges. */
  fisheye: z.number().min(0).max(1).multipleOf(0.01),
  /** Look left and right (rotation about the camera's y axis): sine amplitude in degrees. */
  lookYaw: z.number().min(0).max(45).multipleOf(0.5),
  /** Left-right look cycles per loop. */
  lookYawCycles: z.number().int().min(1).max(8),
  /** Look up and down (rotation about the camera's x axis): sine amplitude in degrees. */
  lookPitch: z.number().min(0).max(30).multipleOf(0.5),
  /** Up-down look cycles per loop. */
  lookPitchCycles: z.number().int().min(1).max(8),
  /** Share of the sky's star cells that hold a star; 0 for none. Each twinkles every 2, 4 or 8 beats. */
  stars: z.number().min(0).max(1).multipleOf(0.01),
  /** Height of the distant skyline on the horizon; 0 leaves it out. */
  skyline: z.number().min(0).max(2).multipleOf(0.05),
});
type Props = z.output<typeof schema>;

/** Hop, a smaller bounce, then a tiny settle: 0 at both ends, peak 1. */
const hopCurve = (u: number) => (u <= 0 || u >= 1 ? 0
  : Math.abs(Math.sin(3 * Math.PI * u)) * Math.pow(1 - u, 2.2) / 0.69);
const smooth = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/** The source frame showing at `phase` (0..1) of one pass, honouring variable GIF timing. */
const frameAt = (media: ClipRef, phase: number) => {
  const starts = media.timing === 'variable' ? media.frameStarts : undefined;
  if (!starts) return sourceFrameIndex(phase * media.frameCount, media.frameCount);
  const time = phase * media.durationSeconds + 1e-6;
  let lo = 0;
  let hi = media.frameCount - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= time) lo = mid; else hi = mid - 1;
  }
  return lo;
};

// Street geometry, in cube sizes.
const PITCH = 1.3;     // one building plus its alley
const FAR = 11;        // fully dissolved in haze
const NEAR = -1.3;     // cube centres beside or just behind the eye still show when it looks around
const EYE = 0.85;      // camera height
const ROLL = 1.1;      // camera roll amplitude, degrees

const RandoWando: React.FC<Props> = (props) => {
  const {blocksPerBar, hopDivision, hopPattern, hopHeight, hopBeats, waveBeats, stackBeats, answerBeats,
    maxFloors, fisheye, lookYaw, lookYawCycles, lookPitch, lookPitchCycles, stars, skyline} = props;
  const transparent = Boolean((props as {transparent?: boolean}).transparent);
  const {beat, totalBeats, beatsPerBar, loopPhase, effectiveBpm} = useBeat();
  const {width, height, vmin, cx, aspect} = useCanvas();
  const {seed} = useSketch();

  const media = clips.map(({ref}) => useAsset(ref));
  const S = 30 * vmin;            // cube size in pixels (projection is independent of it)
  const textureSize = Math.max(64, Math.min(256, Math.round(S)));

  // Each sticker plays forward at close to its native speed: one pass is the power-of-two
  // number of beats nearest its own length, then rounded to whole passes per loop.
  const plans = useMemo(() => clips.map(({tone}, index) => {
    const ref = media[index];
    const nativeBeats = ref.durationSeconds * effectiveBpm / 60;
    const beats = 2 ** Math.min(3, Math.max(0, Math.round(Math.log2(nativeBeats))));
    const passes = Math.max(1, Math.round(totalBeats / beats));
    return {media: ref, tone, passBeats: totalBeats / passes,
      frames: Array.from({length: ref.frameCount}, (_, frame) => frame)};
  }), [totalBeats, effectiveBpm]);
  const textures = useFaceTextures(plans.map((plan) => ({clip: plan.media, frames: plan.frames})), textureSize);

  const P = 100 * vmin;           // eye to picture plane
  const hy = height * 0.56;       // horizon
  // Centre line to the nearest facade, in cube sizes: wider canvases get a wider street,
  // so the road and sky keep their share of the frame.
  const STREET = 1.15 * Math.max(1, Math.min(2, 0.95 * aspect));
  const stepBeats = divisionBeats(hopDivision, beatsPerBar);

  // The street is a ring of `ring` buildings per side and the camera drives
  // exactly once around it per loop, so the last frame hands over to the first.
  const ring = Math.round(totalBeats / beatsPerBar) * blocksPerBar;
  const camZ = loopPhase * ring * PITCH;
  const camX = 0.14 * lfo(loopPhase, 1);
  const roll = ROLL * lfo(loopPhase, 2, 'sine', 0.2);
  // Looking around: whole sine cycles per loop. Pitch starts a quarter cycle later, so the
  // two together trace a loop rather than a diagonal line.
  const yaw = lookYaw * lfo(loopPhase, lookYawCycles);
  const pitch = lookPitch * lfo(loopPhase, lookPitchCycles, 'sine', 0.25);
  const thump = patternPulse(beat, stepBeats, totalBeats, hopPattern, 0, {decay: 0.8, curve: 2});
  const eye = EYE + 0.025 * thump;

  const hopAt = (offsetBeats: number) => {
    let value = 0;
    let index = 0;
    for (const event of patternEvents(beat, stepBeats, totalBeats, hopPattern, offsetBeats, hopBeats)) {
      const v = event.strength * hopCurve(event.age / hopBeats);
      if (v > value) { value = v; index = event.index; }
    }
    return {value, index};
  };

  /** Which sticker, ground and phase a face wears: fixed per building, floor and face. */
  const texture = (key: number) => {
    const plan = plans[Math.floor(stepRandom(seed('clip'), key) * plans.length)];
    const {passBeats} = plan;
    // Whole-beat phase offsets: neighbours dance out of step, and every pass starts on a beat.
    const offset = Math.floor(stepRandom(seed('phase'), key) * Math.max(1, Math.round(passBeats)));
    const phase = mod(beat - offset, passBeats) / passBeats;
    const choices = grounds[plan.tone];
    return {pixels: textures?.get(plan.media.src)?.get(frameAt(plan.media, phase)),
      ground: choices[Math.floor(stepRandom(seed('ground'), key) * choices.length)]};
  };

  const building = (side: number, id: number) => {
    const key = side * 1000 + id;
    return {
      floors: 3 + Math.floor(stepRandom(seed('floors'), key) * (maxFloors - 2)),
      setback: 0.45 * Math.floor(stepRandom(seed('setback'), key) * 3),
      back: 2 + Math.floor(stepRandom(seed('back'), key) * (maxFloors + 2)),
    };
  };

  const edge = Math.max(2, 0.012 * S);

  // The flat camera's projection; the lens is applied to it on the GPU (see FaceCanvas.tsx).
  // The lens gathers a wider field than the flat frame, out to `reach` half-diagonals at the
  // corners, so culling uses that wider view.
  const pivot: [number, number] = [cx, hy];
  const reach = lensReach(fisheye) * Math.hypot(width / 2, height / 2) * 1.05;
  const nearW = 0.004;
  const farW = 2 * FAR * S / P;
  const depthB = 2 / (1 / farW - 1 / nearW);
  const depthA = -1 - depthB / nearW;
  const [cosYaw, sinYaw] = turn(yaw);
  const [cosPitch, sinPitch] = turn(pitch);
  /**
   * A point in street pixels (relative to the eye's ground point, z toward the viewer) to clip
   * space. The camera turns right by `yaw`, then up by `pitch`, about the eye.
   */
  const project = ([x, y, z]: Vec) => {
    const vx = x - camX * S;
    const vy = y + eye * S;
    const vz = z - P;
    const x1 = vx * cosYaw + vz * sinYaw;
    const z1 = -vx * sinYaw + vz * cosYaw;
    const y2 = vy * cosPitch - z1 * sinPitch;
    const z2 = vy * sinPitch + z1 * cosPitch;
    const w = -z2 / P;
    return [
      (cx / width * 2 - 1) * w + 2 * x1 / width,
      (1 - hy / height * 2) * w - 2 * y2 / height,
      depthA * w + depthB,
      w,
    ];
  };
  /** A flat quad, corners in cube sizes: x across, y up from the ground, d ahead of the eye. */
  const quad = (corners: [number, number, number][]) =>
    corners.flatMap(([x, y, d]) => project([x * S, -y * S, P - d * S]));
  const faceCorners = [[-1, -1], [1, -1], [-1, 1], [1, 1]];

  // Road, markings and slabs never stand in front of a cube: drawn first, in painter's order.
  // The road starts behind the eye, so looking down never finds its edge.
  const ROAD_NEAR = -3;
  const ROAD_HALF = 20;
  const ground = (x0: number, x1: number, d0: number, d1: number, color: Rgb): Face => ({
    corners: quad([[x0, 0, d1], [x1, 0, d1], [x0, 0, d0], [x1, 0, d0]]),
    ground: color, shade: 0, fog: roadFog, opacity: 1, fine: true,
  });
  const backdrop: Face[] = [
    ground(-ROAD_HALF, ROAD_HALF, ROAD_NEAR, FAR, ROAD),
    ground(-STREET, STREET, ROAD_NEAR, FAR, STREET_TOP),
    ground(-STREET - 0.035, -STREET + 0.035, ROAD_NEAR, FAR, CURB),
    ground(STREET - 0.035, STREET + 0.035, ROAD_NEAR, FAR, CURB),
  ];
  // Centre dashes are fixed in the world, one per building pitch, so they come toward the viewer.
  const DASH_LENGTH = 0.45 * PITCH;
  for (let k = Math.floor((camZ + ROAD_NEAR) / PITCH) - 1; k * PITCH - camZ < FAR; k++) {
    const d0 = Math.max(ROAD_NEAR, k * PITCH - camZ);
    const d1 = Math.min(FAR, k * PITCH - camZ + DASH_LENGTH);
    if (d1 > d0) backdrop.push(ground(-0.05, 0.05, d0, d1, DASH_RGB));
  }

  const faces: Face[] = [];
  const slabs: Face[] = [];
  const firstSlot = Math.floor(camZ / PITCH);
  for (let n = Math.ceil(FAR / PITCH) + 1; n >= 0; n--) {
    const slot = firstSlot + n;
    const d = slot * PITCH - camZ;             // cube centre, distance ahead of the eye
    if (d < NEAR || d > FAR) continue;
    const id = mod(slot, ring);
    const fade = 1 - smooth(FAR - 2.2, FAR - 0.2, d);
    for (const side of [-1, 1]) {
      const b = building(side, id);
      const front = building(side, mod(id - 1, ring));
      const x = side * (STREET + b.setback + 0.5);
      const waveOffset = d * waveBeats + (side > 0 ? answerBeats : 0);

      // Quiet city behind the facade: one flat slab, no texture, no hop.
      const inner = side * (STREET + 1.95);
      const outer = side * (STREET + 1.95 + 7);
      const ds = d + 0.1;
      slabs.push({
        corners: quad([[inner, b.back, ds], [outer, b.back, ds], [inner, 0, ds], [outer, 0, ds]]),
        ground: SLABS[stepRandom(seed('slab'), side * 1000 + id) < 0.5 ? 0 : 1],
        shade: 0, fog: slabFog, opacity: fade,
      });

      let lift = 0;
      for (let floor = 0; floor < b.floors; floor++) {
        const hop = hopAt(waveOffset + floor * stackBeats);
        lift += hopHeight * hop.value;
        const bottom = floor + lift;
        // Skip cubes that are entirely above what the lens can show.
        // Projected from the cube's lowest point nearest the street, in front of the camera only.
        const [, clipY, , clipW] = project([(x - side * 0.5) * S, -bottom * S, P - (d - 0.5) * S]);
        if (clipW > 0.05 && (1 - clipY / clipW) / 2 * height < height / 2 - reach - 8 * vmin) break;
        const cube = (side > 0 ? 1 : 0) * 100000 + id * 100 + floor;
        const lean = (stepRandom(seed('lean'), hop.index, cube) * 2 - 1) * 9 * hop.value;
        const twist = (stepRandom(seed('twist'), hop.index, cube) * 2 - 1) * 7 * hop.value;
        const showFront = b.setback < front.setback - 0.01 || floor >= front.floors;
        // A face is a square of side S centred on the cube, turned to its side, then moved with the cube.
        const place = (orient: (corner: Vec) => Vec) => faceCorners.flatMap(([u, v]) => {
          const [px, py, pz] = rotZ(rotY(orient([u * S / 2, v * S / 2, S / 2]), twist), lean);
          return project([px + x * S, py - (bottom + 0.5) * S, pz + P - d * S]);
        });
        const paint = (corners: number[], face: number, shade: number, textured: boolean): Face => {
          const tex = texture(cube * 4 + face);
          return {corners, ground: tex.ground, shade, fog: cubeFog, opacity: fade, border: edge / S,
            ...(textured ? {pixels: tex.pixels} : {})};
        };
        faces.push(
          paint(place((corner) => rotY(corner, -side * 90)), 0, 0, true),            // facing the street
          paint(place((corner) => corner), 1, 0.28, showFront),                      // facing the camera
          {corners: place((corner) => rotX(corner, bottom + 0.5 > eye ? -90 : 90)),  // top, or underside above the eye
            ground: CAP, shade: 0, fog: cubeFog, opacity: fade, border: edge / S},
        );
      }
    }
  }

  return (
    <AbsoluteFill style={{overflow: 'hidden'}}>
      {transparent ? null : <AbsoluteFill style={{backgroundColor: NIGHT}} />}
      <FaceCanvas width={width} height={height}
        backdrop={[...backdrop, ...slabs]} faces={faces} textureSize={textureSize}
        look={{shadeColor: INK_RGB, fogColor: HAZE_RGB, borderColor: INK_RGB}} distScale={P / S}
        fisheye={fisheye} rollDeg={roll} yawDeg={yaw} pitchDeg={pitch} focal={P} pivot={pivot}
        sky={transparent ? null : {...sky, at: [0, 0.45 * hy, 0.86 * hy, hy],
          stars: {amount: stars, size: 0.16 * vmin, phase: loopPhase, beats: totalBeats,
            seed: Math.floor(stepRandom(seed('sky'), 0) * 1000), colors: STAR_COLORS},
          skyline: {height: skyline * SKYLINE_RISE, colors: SKYLINE_COLORS, lights: SKYLINE_LIGHTS, mist: SKYLINE_MIST}}}
        style={{position: 'absolute', left: 0, top: 0, width, height}} />
    </AbsoluteFill>
  );
};

export default defineSketch({
  id: 'rando-wando',
  title: 'Rando Wando',
  description: 'Driving through a fisheye down a street of cube-stack buildings whose faces are dancing stickers, hopping as each beat ripples past.',
  schema,
  defaults: {
    blocksPerBar: 3,
    hopDivision: '1/8',
    hopPattern: {steps: [1, 0, 0.55, 0, 0.85, 0, 0.55, 0.4], swing: 0.3},
    hopHeight: 0.42,
    hopBeats: 0.9,
    waveBeats: 0.11,
    stackBeats: 0.06,
    answerBeats: 0.5,
    maxFloors: 7,
    fisheye: 0.7,
    lookYaw: 12,
    lookYawCycles: 1,
    lookPitch: 5,
    lookPitchCycles: 2,
    stars: 0.5,
    skyline: 1,
  },
  timing: {bpm: 100, bars: 4},
  Component: RandoWando,
  assets: () => clips.map(({ref}) => ref),
  validate: (props, timing) => {
    const totalBeats = timing.bars * timing.beatsPerBar;
    return [
      ...divisionIssues('hopDivision', props.hopDivision, timing),
      ...patternIssues(props.hopPattern, divisionBeats(props.hopDivision, timing.beatsPerBar), totalBeats)
        .map((issue) => issue.replace(/^pattern\./, 'hopPattern.')),
      ...(props.hopBeats > totalBeats ? [`hopBeats: one hop (${props.hopBeats} beats) cannot outlast the ${totalBeats}-beat loop`] : []),
    ];
  },
  debugDivisions: (props) => [props.hopDivision],
});
