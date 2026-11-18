import {z} from 'zod';
import {easeInOutSine, mod, pulse} from '../../beat/envelopes';

/**
 * Beat-locked camera paths. Everything is a pure function of the beat clock so
 * frames render in any order, and every path returns to its start at the seam.
 *
 * The camera is orthographic, so distance never changes framing: a shot is an
 * azimuth around Milhouse, an elevation above the floor plane and a zoom
 * multiplier on the aspect-derived base zoom.
 */
const markSchema = z.object({
  azimuth: z.number().min(-180).max(180).step(1).describe('Degrees around Milhouse; 0 is the front'),
  elevation: z.number().min(-5).max(75).step(1).describe('Degrees above the horizon'),
  zoom: z.number().min(0.6).max(2).step(0.01).describe('Multiplier on the base framing'),
});
export type CameraMark = z.output<typeof markSchema>;

export const cameraModes = ['static', 'turntable', 'ratchet', 'marks'] as const;
export const cameraSchema = z.object({
  mode: z.enum(cameraModes).describe(
    'static: fixed hero (ignores punch, push and finale); turntable: continuous orbit; ratchet: swings only while slices are airborne; marks: eases between four marks, one per pose beat'),
  turns: z.number().int().min(0).max(4).describe('Whole orbits per loop for turntable/ratchet; 0 sways back and forth across arc'),
  arc: z.number().min(0).max(180).step(1).describe('Sway width in degrees when turns is 0'),
  elevation: z.number().min(-5).max(75).step(0.01).describe('Camera elevation in degrees for static/turntable/ratchet'),
  travel: z.number().min(0.1).max(1).step(0.01).describe('marks: fraction of each beat spent travelling to the next mark'),
  marks: z.tuple([markSchema, markSchema, markSchema, markSchema]).describe('marks: shot reached on each beat of the four-beat pose phrase'),
  punch: z.number().min(0).max(0.3).step(0.01).describe('Zoom-in hit on each slice launch'),
  push: z.number().min(0).max(0.3).step(0.01).describe('Slow push-in across each bar, easing back out on its last beat'),
  finale: z.number().min(0).max(1).step(0.01).describe('Blend toward an overhead shot during the last bar (0 off)'),
  finaleElevation: z.number().min(20).max(80).step(1).describe('Elevation reached at the top of the finale'),
  finaleZoom: z.number().min(0.6).max(2.5).step(0.01).describe('Zoom multiplier at the top of the finale'),
  lightsFollow: z.boolean().describe('Keep the studio lights fixed relative to the camera instead of the world'),
});
export type CameraSettings = z.output<typeof cameraSchema>;

/** The original fixed camera sat at (0, 4, 20) looking at the origin. */
export const CAMERA_DISTANCE = Math.hypot(4, 20);
const HERO_ELEVATION = Math.atan2(4, 20) * 180 / Math.PI;

export const cameraDefaults: CameraSettings = {
  mode: 'ratchet', turns: 1, arc: 70, elevation: Number(HERO_ELEVATION.toFixed(2)),
  travel: 0.5,
  marks: [
    {azimuth: 0, elevation: 11, zoom: 1},
    {azimuth: -35, elevation: -3, zoom: 1.12},
    {azimuth: 70, elevation: 8, zoom: 1.05},
    {azimuth: 25, elevation: 38, zoom: 1.1},
  ],
  punch: 0.06, push: 0.04, finale: 0, finaleElevation: 60, finaleZoom: 1.35, lightsFollow: false,
};

export type Shot = {azimuth: number; elevation: number; zoom: number};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export type ShotClock = {
  beat: number; totalBeats: number; beatsPerBar: number;
  /** Raw (un-held) phase and index of the slice division step. */
  stepPhase: number; stepIndex: number; stepsPerLoop: number;
  /** Raw step phase at which the stack has fully landed; ratchet travel ends here. */
  landPhase: number;
};

/** Camera shot for the current beat. Angles in degrees. */
export function cameraShot(settings: CameraSettings, clock: ShotClock): Shot {
  const {beat, totalBeats, beatsPerBar, stepPhase, stepIndex, stepsPerLoop, landPhase} = clock;
  const loopPhase = mod(beat, totalBeats) / totalBeats;
  let shot: Shot = {azimuth: 0, elevation: settings.elevation, zoom: 1};
  // Static is the original locked-off hero shot: no orbit, punch, push or finale.
  if (settings.mode === 'static') return shot;

  if (settings.mode === 'turntable') {
    shot.azimuth = settings.turns > 0
      ? 360 * settings.turns * loopPhase
      : settings.arc / 2 * Math.sin(loopPhase * Math.PI * 2);
  } else if (settings.mode === 'ratchet') {
    // Move only while the slices are apart: the swing reads as caused by the cut.
    const travel = easeInOutSine(stepPhase / Math.max(landPhase, 1e-3));
    if (settings.turns > 0) {
      shot.azimuth = (stepIndex + travel) * 360 * settings.turns / stepsPerLoop;
    } else {
      const side = (index: number) => (index % 2 ? 1 : -1) * settings.arc / 2;
      shot.azimuth = lerp(side(stepIndex), side(stepIndex + 1), travel);
    }
  } else if (settings.mode === 'marks') {
    // One mark per beat of the pose phrase; travel on the back of the beat so
    // each mark lands on the downbeat with its pose.
    const local = mod(beat, 4);
    const index = Math.floor(local) % 4;
    const from = settings.marks[index], to = settings.marks[(index + 1) % 4];
    const t = easeInOutSine((local - index - (1 - settings.travel)) / settings.travel);
    shot = {
      azimuth: lerp(from.azimuth, to.azimuth, t),
      elevation: lerp(from.elevation, to.elevation, t),
      zoom: lerp(from.zoom, to.zoom, t),
    };
  }

  // Launch punch, attack slightly after the hit so the seam stays continuous.
  shot.zoom *= 1 + settings.punch * pulse(stepPhase, {attack: 0.03, decay: 0.45, curve: 2});
  // Bar-long push: in over three quarters of the bar, back out on the final stretch.
  const barPhase = mod(beat, beatsPerBar) / beatsPerBar;
  const push = barPhase < 0.75 ? easeInOutSine(barPhase / 0.75) : 1 - easeInOutSine((barPhase - 0.75) / 0.25);
  shot.zoom *= 1 + settings.push * push;

  if (settings.finale > 0) {
    const lastBar = totalBeats - beatsPerBar;
    const local = mod(beat, totalBeats) - lastBar;
    const rise = local > 0 ? Math.sin(Math.PI * local / beatsPerBar) ** 2 * settings.finale : 0;
    shot.elevation = lerp(shot.elevation, settings.finaleElevation, rise);
    shot.zoom *= lerp(1, settings.finaleZoom, rise);
  }
  return shot;
}

/** World-space camera position for a shot orbiting a point on the vertical axis. */
export function shotPosition(shot: Shot, azimuthOffset = 0, targetY = 0): [number, number, number] {
  const az = (shot.azimuth + azimuthOffset) * Math.PI / 180;
  const el = shot.elevation * Math.PI / 180;
  return [
    CAMERA_DISTANCE * Math.cos(el) * Math.sin(az),
    targetY + CAMERA_DISTANCE * Math.sin(el),
    CAMERA_DISTANCE * Math.cos(el) * Math.cos(az),
  ];
}
