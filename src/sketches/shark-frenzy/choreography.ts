/**
 * The 16-beat phrase as pure functions of the phrase position P (0 ≤ P < 16).
 * Every channel is periodic in P, so the loop closes wherever the phrase repeats.
 */
import {mod} from '../../beat/envelopes';

export const PHRASE = 16;
/** Beats on which the jaws slam shut. */
export const CHOMPS = [12, 13, 14] as const;

const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------------------
// Animation mix
// ---------------------------------------------------------------------------

export type TakeDurations = {swim: number; idle: number; bite: number};
export type Mix = {swim: [number, number]; idle: [number, number]; bite: [number, number]};

/** Bite take: phrase beat → clip seconds. Closures (0.62 / 1.17 / 1.71 s) land on CHOMPS. */
const biteAnchors = (end: number): [number, number][] => [[11, 0], [12, .62], [13, 1.17], [14, 1.71], [16, end]];

const piecewise = (x: number, anchors: [number, number][]) => {
  if (x <= anchors[0][0]) return anchors[0][1];
  for (let i = 1; i < anchors.length; i++) {
    const [x1, y1] = anchors[i];
    if (x <= x1) {
      const [x0, y0] = anchors[i - 1];
      return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
    }
  }
  return anchors[anchors.length - 1][1];
};

/** [clip time, weight] for each take; weights always sum to 1. */
export const mixAt = (P: number, d: TakeDurations): Mix => {
  // Shift so the bite→swim cross-fade around the seam starts at u = 0.
  const u = mod(P + .75, PHRASE);
  let swim = 0, idle = 0, bite = 0;
  if (u < 1) {swim = smooth(u); bite = 1 - swim;}
  else if (u < 8.25) swim = 1;
  else if (u < 9.25) {idle = smooth(u - 8.25); swim = 1 - idle;}
  else if (u < 11.25) idle = 1;
  else if (u < 12) {bite = smooth((u - 11.25) / .75); idle = 1 - bite;}
  else bite = 1;
  // Unwrapped bite beat: the tail after the seam continues past 16.
  const biteBeat = u < 4 ? u - .75 + PHRASE : u - .75;
  const eps = 1e-4;
  return {
    swim: [mod(P / 4, 1) * (d.swim - eps), swim],
    idle: [mod((P - 8) / 4, 1) * (d.idle - eps), idle],
    bite: [Math.min(piecewise(biteBeat, biteAnchors(d.bite)), d.bite - eps), bite],
  };
};

// ---------------------------------------------------------------------------
// Periodic Hermite keyframes
// ---------------------------------------------------------------------------

type Key = [beat: number, value: number];

/** C1 periodic interpolation; `delta` is added per phrase (for unwrapped angles). */
const periodic = (keys: Key[], P: number, delta = 0) => {
  const n = keys.length;
  const at = (k: number): Key => {
    const wraps = Math.floor(k / n);
    const [t, v] = keys[mod(k, n)];
    return [t + wraps * PHRASE, v + wraps * delta];
  };
  const x = mod(P - keys[0][0], PHRASE) + keys[0][0];
  let i = 0;
  while (i < n - 1 && x >= keys[i + 1][0]) i++;
  const [t0, v0] = at(i), [t1, v1] = at(i + 1);
  const [tp, vp] = at(i - 1), [tn, vn] = at(i + 2);
  const m0 = (v1 - vp) / (t1 - tp), m1 = (vn - v0) / (tn - t0);
  const h = t1 - t0, s = (x - t0) / h;
  const s2 = s * s, s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * v0 + (s3 - 2 * s2 + s) * h * m0 + (-2 * s3 + 3 * s2) * v1 + (s3 - s2) * h * m1;
};

// ---------------------------------------------------------------------------
// Shark path
// ---------------------------------------------------------------------------

/** Swim ellipse (world units; the shark is ~5.6 long). */
export const ORBIT = {rx: 3.2, rz: 2.6, cz: -2.6, y: .15};

const wrapPi = (a: number) => mod(a + Math.PI, Math.PI * 2) - Math.PI;

type PoseKey = {P: number; x: number; y: number; z: number; yaw: number; pitch: number; roll: number};

const swimKeys: PoseKey[] = Array.from({length: 8}, (_, i) => {
  const th = (i / 8) * Math.PI * 2;
  return {
    P: i,
    x: ORBIT.rx * Math.sin(th),
    y: ORBIT.y + .35 * Math.sin(th * 2),
    z: ORBIT.cz + ORBIT.rz * Math.cos(th),
    // Heading along the ellipse tangent, unwrapped: π/2 → 5π/2 over the swim.
    yaw: Math.PI / 2 + th + wrapPi(Math.atan2(ORBIT.rx * Math.cos(th), -ORBIT.rz * Math.sin(th)) - Math.PI / 2 - th),
    pitch: 0,
    roll: -.32,
  };
});

const TAU = Math.PI * 2;
const face = TAU; // facing the camera after one full turn
const poseKeys: PoseKey[] = [
  ...swimKeys,
  {P: 8, x: 0, y: ORBIT.y, z: 0, yaw: Math.PI / 2 + TAU, pitch: 0, roll: -.28},
  {P: 9.5, x: .55, y: .05, z: .35, yaw: face + .55, pitch: -.04, roll: -.12},
  {P: 11, x: 0, y: 0, z: .55, yaw: face, pitch: -.08, roll: 0},
  {P: 12.5, x: 0, y: -.02, z: .85, yaw: face, pitch: -.04, roll: 0},
  {P: 14, x: 0, y: 0, z: .95, yaw: face, pitch: -.02, roll: 0},
  {P: 15, x: -.5, y: .05, z: .55, yaw: face + .55, pitch: 0, roll: -.15},
];

const channel = (name: keyof Omit<PoseKey, 'P'>): Key[] => poseKeys.map((k) => [k.P, k[name]]);
const channels = {
  x: channel('x'), y: channel('y'), z: channel('z'),
  yaw: channel('yaw'), pitch: channel('pitch'), roll: channel('roll'),
};

/** Wrapped distance in beats from P to the nearest chomp. */
const chompDistance = (P: number) => Math.min(...CHOMPS.map((c) => {
  const d = mod(P - c, PHRASE);
  return d > PHRASE / 2 ? d - PHRASE : d;
}));

/** Forward thrust peaking just before each closure. */
export const lungeAt = (P: number) => {
  const d = chompDistance(P) + .06;
  return Math.exp(-((d / .2) ** 2));
};

/** Sharp 0..1 kick from each closure, decaying over half a beat. */
export const chompHitAt = (P: number) => Math.max(...CHOMPS.map((c) => {
  const since = mod(P - c, PHRASE);
  return since < .5 ? (1 - since / .5) ** 2.4 : 0;
}));

export type Pose = {x: number; y: number; z: number; yaw: number; pitch: number; roll: number};

export const basePoseAt = (P: number): Pose => ({
  x: periodic(channels.x, P),
  y: periodic(channels.y, P),
  z: periodic(channels.z, P),
  yaw: periodic(channels.yaw, P, TAU),
  pitch: periodic(channels.pitch, P),
  roll: periodic(channels.roll, P),
});

/** Base path plus the chomp lunge along the heading. */
export const poseAt = (P: number): Pose => {
  const base = basePoseAt(P);
  const thrust = .7 * lungeAt(P);
  return {...base, x: base.x + thrust * Math.sin(base.yaw), z: base.z + thrust * Math.cos(base.yaw),
    pitch: base.pitch - .08 * lungeAt(P)};
};

/** 0 = wide on the swim ellipse, 1 = tight on the jaws. */
const zoomKeys: Key[] = [[0, .32], [2, 0], [7, 0], [10, .7], [11.5, 1], [14.5, 1]];
export const zoomAt = (P: number) => Math.min(1, Math.max(0, periodic(zoomKeys, P)));

// ---------------------------------------------------------------------------
// The rider: a man in jeans who has no business being down here
// ---------------------------------------------------------------------------

/** Trapezoid presence from `start` to `end` (wrapping), with `fade`-beat smoothstep edges centred on each. */
const presence = (P: number, start: number, end: number, fade: number) => {
  const length = mod(end - start, PHRASE) + fade;
  const x = mod(P - start + fade / 2, PHRASE);
  if (x >= length) return 0;
  return Math.min(smooth(x / fade), smooth((length - x) / fade));
};

export type RiderTake = 'cheer' | 'confused' | 'chest' | 'pound' | 'bow';
export const riderTakes: Record<RiderTake, string> = {
  cheer: 'Cheering_Two_Hands', confused: 'Confused', chest: 'Chest_Open', pound: 'Attack_Ground_Pound', bow: 'Bow',
};

/** Ground pound: the deepest crouch (0.72 s) lands on the second chomp. */
const POUND_IMPACT = .72;

export const riderMixAt = (P: number, d: Record<RiderTake, number>): Record<RiderTake, [number, number]> => {
  const fade = .5;
  const weights = {
    cheer: presence(P, .25, 8, fade),
    confused: presence(P, 8, 10.5, fade),
    chest: presence(P, 10.5, 11.8, fade),
    pound: presence(P, 11.8, 14.5, fade),
    bow: presence(P, 14.5, .25, fade),
  };
  const total = Object.values(weights).reduce((sum, w) => sum + w, 0) || 1;
  const unwrapped = P < 4 ? P + PHRASE : P;
  const clamp = (t: number, duration: number) => Math.min(Math.max(t, 0), duration);
  return {
    cheer: [mod(P / 2, 1) * d.cheer, weights.cheer / total],
    confused: [mod((P - 8) * .6, d.confused), weights.confused / total],
    chest: [clamp((P - 10.25) / 1.8, 1) * d.chest, weights.chest / total],
    pound: [clamp(POUND_IMPACT + (unwrapped - CHOMPS[1]) * .6, d.pound), weights.pound / total],
    bow: [clamp(mod(P - 14.25, PHRASE) / 3.5, 1) * d.bow, weights.bow / total],
  };
};

/** 0 = standing on the shark's back, 1 = standing on its tongue. */
export const riderPlaceAt = (P: number) => presence(P, 10.875, 15.875, .75);

// ---------------------------------------------------------------------------
// Giant drifting men in the fog
// ---------------------------------------------------------------------------

export type Drifter = {take: RiderTake; beatsPerCycle: number; x: number; y: number; z: number; scale: number;
  spin: number; tumble: number; offset: number};

/** Each take loops a whole number of times per phrase; each body turns whole revolutions. */
export const drifters: Drifter[] = [
  {take: 'confused', beatsPerCycle: 4, x: -7, y: 2.5, z: -16, scale: 3.2, spin: 1, tumble: 0, offset: 0},
  {take: 'bow', beatsPerCycle: 8, x: 8, y: -1.5, z: -19, scale: 4.2, spin: -1, tumble: 1, offset: .3},
  {take: 'chest', beatsPerCycle: 2, x: 2, y: 5, z: -22, scale: 3.6, spin: 0, tumble: -1, offset: .6},
  {take: 'cheer', beatsPerCycle: 2, x: -3, y: -4.5, z: -14, scale: 2.6, spin: 2, tumble: 1, offset: .8},
];
