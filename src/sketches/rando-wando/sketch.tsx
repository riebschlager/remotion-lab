import React, {useMemo} from 'react';
import {AbsoluteFill} from 'remotion';
import {z} from 'zod';
import {clip, sourceFrameIndex, type ClipRef} from '../../assets';
import {useBeat} from '../../beat/BeatContext';
import {divisionBeats, lfo, mod, stepRandom} from '../../beat/envelopes';
import {divisionSchema} from '../../beat/divisions';
import {beatPatternSchema, patternEvents, patternIssues, patternPulse} from '../../beat/patterns';
import {useCanvas} from '../canvas';
import {defineSketch, divisionIssues, useAsset, useSketch} from '../define';
import {FaceCanvas, rgb, type Face} from './FaceCanvas';
import {useFaceTextures} from './textures';

// ---------------------------------------------------------------------------
// Material: every clip of the `test` collection, used only as face texture.
// `beats` is the musical length of one pass; it is rounded to a whole number
// of passes per loop when the sketch runs, so any tempo or bar count closes.
// ---------------------------------------------------------------------------
const bust = clip('test', 'Art Animation GIF by Mr Tronch.gif');
const glitch = clip('test', 'Cartoon Glitch GIF by Santi_OFF.gif');
const smiley = clip('test', 'Fun Love Sticker by Tarver.gif');
const computer = clip('test', 'Animation Cartoon Sticker by FUN WITH FRIDAY.gif');
const tunnel = clip('test', 'slapchop-video-20260824-205001-10s.mp4');
const dancers = clip('test', 'movie-2026-10-19-19-57.0.mp4');

type Source = {ref: ClipRef; beats: number; weight: number; excerpt: boolean};
const gifSources: Source[] = [
  {ref: bust, beats: 4, weight: 3, excerpt: false},
  {ref: glitch, beats: 8, weight: 3, excerpt: false},
  {ref: smiley, beats: 2, weight: 3, excerpt: false},
  {ref: computer, beats: 1, weight: 2, excerpt: false},
];
// Videos are long: each face shows one of a few seeded excerpts at native speed.
// Every excerpt is decoded up front and shared, so their number and length are bounded.
const EXCERPTS = 3;
const EXCERPT_FRAMES = 72;
const videoSources: Source[] = [
  {ref: tunnel, beats: 4, weight: 2, excerpt: true},
  {ref: dancers, beats: 4, weight: 1, excerpt: true},
];

// ---------------------------------------------------------------------------
// Palette: amber, pink and blue. Each map sends source luminance (dark to
// light) through four stops, so any footage lands inside the palette.
// ---------------------------------------------------------------------------
const NAVY = '#0c0f3f';
const BLUE = '#2b5cff';
const PINK = '#ff5ea8';
const AMBER = '#ffb52e';
const CREAM = '#fff0c4';
const HAZE = '#ff86a6';
const maps = [
  [NAVY, BLUE, PINK, AMBER],
  ['#2a0f4a', PINK, AMBER, CREAM],
  ['#10206b', '#3f7dff', '#ff8fc0', CREAM],
  ['#3a1036', '#ff7a2e', AMBER, '#bcd2ff'],
];
const faceColors = [AMBER, PINK, BLUE, CREAM, '#ff8a3c', '#6f8dff'];
const mapStops = maps.map((stops) => stops.map(rgb));
const faceGrounds = faceColors.map(rgb);
const CAP = rgb('#1a1a66');   // top and underside of a cube
const NAVY_RGB = rgb(NAVY);
const HAZE_RGB = rgb(HAZE);

// CSS-convention rotations (y points down), in degrees, for placing cube faces.
type Vec = [number, number, number];
const turn = (deg: number) => [Math.cos(deg * Math.PI / 180), Math.sin(deg * Math.PI / 180)];
const rotX = ([x, y, z]: Vec, deg: number): Vec => { const [c, s] = turn(deg); return [x, y * c - z * s, y * s + z * c]; };
const rotY = ([x, y, z]: Vec, deg: number): Vec => { const [c, s] = turn(deg); return [x * c + z * s, y, -x * s + z * c]; };
const rotZ = ([x, y, z]: Vec, deg: number): Vec => { const [c, s] = turn(deg); return [x * c - y * s, x * s + y * c, z]; };

const schema = z.object({
  /** Buildings passed per bar. 3 against a 4-beat bar keeps the drive from strobing with the hops. */
  blocksPerBar: z.number().int().min(1).max(8),
  /** Grid of the seismic hits. */
  hopDivision: divisionSchema,
  /** Strength of each hit on that grid; 0 rests. Swing loosens the offbeats. */
  hopPattern: beatPatternSchema,
  /** Hop height of one cube at full strength, in cube sizes. Upper cubes ride on the ones below. */
  hopHeight: z.number().min(0).max(1.5),
  /** Length of one hop-and-settle, in beats. */
  hopBeats: z.number().min(0.1).max(4),
  /** Beats the wave needs to travel one cube size down the street. */
  waveBeats: z.number().min(0).max(1),
  /** Beats between a cube and the one stacked on it. */
  stackBeats: z.number().min(0).max(0.5),
  /** The right side of the street answers the left this many beats later. */
  answerBeats: z.number().min(0).max(4),
  /** Tallest building, in cubes. */
  maxFloors: z.number().int().min(2).max(9),
  /** Put the two long videos on some faces too (slower to render). */
  useVideos: z.boolean(),
  /** Abstract car bonnet along the bottom edge. */
  hood: z.boolean(),
});
type Props = z.output<typeof schema>;

/** Hop, a smaller bounce, then a tiny settle: 0 at both ends, peak 1. */
const hopCurve = (u: number) => (u <= 0 || u >= 1 ? 0
  : Math.abs(Math.sin(3 * Math.PI * u)) * Math.pow(1 - u, 2.2) / 0.69);
const smooth = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

// Street geometry, in cube sizes.
const PITCH = 1.3;     // one building plus its alley
const FAR = 11;        // fully dissolved in haze
const NEAR = 0.62;     // closer cube centres are already off-screen
const EYE = 0.85;      // camera height

const RandoWando: React.FC<Props> = (props) => {
  const {blocksPerBar, hopDivision, hopPattern, hopHeight, hopBeats, waveBeats, stackBeats, answerBeats,
    maxFloors, useVideos, hood} = props;
  const transparent = Boolean((props as {transparent?: boolean}).transparent);
  const {beat, totalBeats, beatsPerBar, loopPhase, effectiveBpm} = useBeat();
  const {width, height, vmin, cx, aspect} = useCanvas();
  const {seed} = useSketch();

  const assets = {
    bust: useAsset(bust), glitch: useAsset(glitch), smiley: useAsset(smiley), computer: useAsset(computer),
    tunnel: useAsset(useVideos ? tunnel : bust), dancers: useAsset(useVideos ? dancers : bust),
  };
  const loaded = new Map<ClipRef, ClipRef & {src: string}>([[bust, assets.bust], [glitch, assets.glitch],
    [smiley, assets.smiley], [computer, assets.computer], [tunnel, assets.tunnel], [dancers, assets.dancers]]);
  const sources = useVideos ? [...gifSources, ...videoSources] : gifSources;
  const totalWeight = sources.reduce((sum, source) => sum + source.weight, 0);

  const S = 30 * vmin;            // cube size in pixels (projection is independent of it)
  const textureSize = Math.max(64, Math.min(512, Math.round(S)));

  // What each clip plays, and the source frames that takes. Each clip is decoded once into
  // shared bitmaps (see textures.tsx); faces only choose which bitmap to copy.
  const plans = useMemo(() => sources.map((source, index) => {
    const media = loaded.get(source.ref)!;
    const passes = Math.max(1, Math.round(totalBeats / source.beats));
    const passBeats = totalBeats / passes;
    if (!source.excerpt) {
      return {source, media, passBeats, span: 0, step: 1, count: 0, starts: [] as number[],
        frames: Array.from({length: media.frameCount}, (_, frame) => frame)};
    }
    // Source frames one pass covers at native speed, sampled so an excerpt keeps a bounded
    // number of frames (a 60 fps source is read every other frame at this tempo).
    const span = Math.min(media.frameCount - 1, passBeats * (60 / effectiveBpm) * media.fps);
    const step = Math.max(1, Math.ceil(span / EXCERPT_FRAMES));
    const count = Math.floor(span / step) + 1;
    const starts = Array.from({length: EXCERPTS}, (_, excerpt) =>
      Math.floor(stepRandom(seed('excerpt-start'), index, excerpt) * (media.frameCount - span)));
    const frames = [...new Set(starts.flatMap((start) => Array.from({length: count}, (_, k) => start + k * step)))]
      .sort((a, b) => a - b);
    return {source, media, passBeats, span, step, count, starts, frames};
  }), [useVideos, totalBeats, effectiveBpm, seed]);
  const textures = useFaceTextures(plans.map((plan) => ({clip: plan.media, frames: plan.frames})), textureSize);
  const P = 100 * vmin;           // eye to picture plane
  const hy = height * 0.6;        // horizon
  // Centre line to the nearest facade, in cube sizes: wider canvases get a wider street,
  // so the road and sky keep their share of the frame.
  const STREET = 1.15 * Math.max(1, Math.min(2, 0.95 * aspect));
  const stepBeats = divisionBeats(hopDivision, beatsPerBar);

  // The street is a ring of `ring` buildings per side and the camera drives
  // exactly once around it per loop, so the last frame hands over to the first.
  const ring = Math.round(totalBeats / beatsPerBar) * blocksPerBar;
  const camZ = loopPhase * ring * PITCH;
  const camX = 0.14 * lfo(loopPhase, 1);
  const roll = 1.1 * lfo(loopPhase, 2, 'sine', 0.2);
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

  /** Which clip, tint and phase a face wears: fixed per building, floor and face. */
  const texture = (key: number) => {
    let pick = stepRandom(seed('clip'), key) * totalWeight;
    const plan = plans.find((candidate) => (pick -= candidate.source.weight) < 0) ?? plans[0];
    const {media, passBeats} = plan;
    // Whole-beat phase offsets: neighbours are out of step, and source cuts land on a beat.
    const offset = Math.floor(stepRandom(seed('phase'), key) * Math.max(1, Math.round(passBeats)));
    const phase = mod(beat - offset, passBeats) / passBeats;
    let frame = sourceFrameIndex(phase * media.frameCount, media.frameCount);
    if (plan.source.excerpt) {
      const start = plan.starts[Math.floor(stepRandom(seed('excerpt'), key) * EXCERPTS)];
      frame = start + Math.min(plan.count - 1, Math.floor(phase * plan.span / plan.step + 1e-6)) * plan.step;
    }
    return {pixels: textures?.get(media.src)?.get(frame),
      stops: mapStops[Math.floor(stepRandom(seed('map'), key) * maps.length)],
      ground: faceGrounds[Math.floor(stepRandom(seed('ground'), key) * faceColors.length)]};
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

  // The cubes are drawn into one canvas (see FaceCanvas.tsx), a little larger than the frame
  // so the camera roll never shows its edge. This projection is the CSS one the road and
  // slabs use: eye P in front of the picture plane, vanishing point at (cx, hy).
  const marginX = Math.ceil(0.04 * width);
  const marginY = Math.ceil(0.04 * height);
  const canvasWidth = width + 2 * marginX;
  const canvasHeight = height + 2 * marginY;
  const nearW = 0.004;
  const farW = 2 * FAR * S / P;
  const depthB = 2 / (1 / farW - 1 / nearW);
  const depthA = -1 - depthB / nearW;
  /** A point in street pixels (relative to the eye's ground point, z toward the viewer) to clip space. */
  const project = ([x, y, z]: Vec) => {
    const w = (P - z) / P;
    return [
      ((cx + marginX) / canvasWidth * 2 - 1) * w + 2 * (x - camX * S) / canvasWidth,
      (1 - (hy + marginY) / canvasHeight * 2) * w - 2 * (y + eye * S) / canvasHeight,
      depthA * w + depthB,
      w,
    ];
  };
  const faceCorners = [[-1, -1], [1, -1], [-1, 1], [1, 1]];

  const faces: Face[] = [];
  // Slabs never stand in front of a cube, so they are drawn with the road in a layer of their
  // own behind the stacks instead of being depth-sorted against them.
  const slabs: React.ReactNode[] = [];
  const firstSlot = Math.floor(camZ / PITCH);
  for (let n = Math.ceil(FAR / PITCH) + 1; n >= 0; n--) {
    const slot = firstSlot + n;
    const d = slot * PITCH - camZ;             // cube centre, distance ahead of the eye
    if (d < NEAR || d > FAR) continue;
    const id = mod(slot, ring);
    const fog = 0.82 * smooth(4.5, FAR - 0.5, d);
    const fade = 1 - smooth(FAR - 2.2, FAR - 0.2, d);
    for (const side of [-1, 1]) {
      const b = building(side, id);
      const front = building(side, mod(id - 1, ring));
      const x = side * (STREET + b.setback + 0.5);
      const waveOffset = d * waveBeats + (side > 0 ? answerBeats : 0);

      // Quiet city behind the facade: one flat slab, no texture, no hop.
      const slabWide = 7;
      slabs.push(
        <div key={`slab${side}_${slot}`} style={{position: 'absolute', left: -slabWide * S / 2, top: -b.back * S,
          width: slabWide * S, height: b.back * S, opacity: fade,
          backgroundColor: stepRandom(seed('slab'), side * 1000 + id) < 0.5 ? '#231a63' : '#3a1c6e',
          transform: `translate3d(${side * (STREET + 1.95 + slabWide / 2) * S}px, 0px, ${P - (d + 0.1) * S}px)`}}>
          <div style={{position: 'absolute', inset: 0, backgroundColor: HAZE, opacity: 0.3 + 0.7 * fog}} />
        </div>,
      );

      let lift = 0;
      for (let floor = 0; floor < b.floors; floor++) {
        const hop = hopAt(waveOffset + floor * stackBeats);
        lift += hopHeight * hop.value;
        const bottom = floor + lift;
        // Skip cubes that are entirely above the frame.
        if (bottom > eye && hy - (bottom - eye) * P / (d + 0.5) < -8 * vmin) break;
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
          return {corners, ground: tex.ground, shade, fog, opacity: fade,
            ...(textured ? {pixels: tex.pixels, stops: tex.stops} : {})};
        };
        faces.push(
          paint(place((corner) => rotY(corner, -side * 90)), 0, 0, true),            // facing the street
          paint(place((corner) => corner), 1, 0.28, showFront),                      // facing the camera
          {corners: place((corner) => rotX(corner, bottom + 0.5 > eye ? -90 : 90)),  // top, or underside above the eye
            ground: CAP, shade: 0, fog: 0, opacity: fade},
        );
      }
    }
  }

  // Road: fixed to the camera; only its markings slide, by the fractional travel.
  const roadNear = 0.25;
  const roadLength = (FAR - roadNear) * S;
  const roadWidth = 16 * S;
  const dash = PITCH * S;
  const slide = mod(camZ + roadNear, PITCH) * S;
  const strip = (x: number, wide: number, style: React.CSSProperties) => (
    <div style={{position: 'absolute', top: 0, height: roadLength, left: roadWidth / 2 + (x - wide / 2) * S, width: wide * S, ...style}} />
  );
  const sun = 15 * vmin * (1 + 0.07 * thump);

  return (
    <AbsoluteFill style={{overflow: 'hidden'}}>
      {transparent ? null : (
        <AbsoluteFill style={{background: `linear-gradient(to bottom, ${NAVY} 0px, #2a2f9a ${0.45 * hy}px, ${PINK} ${0.86 * hy}px, ${AMBER} ${hy}px, ${HAZE} ${hy}px)`}} />
      )}
      <div style={{position: 'absolute', left: cx - sun / 2, top: hy - sun * 0.62, width: sun, height: sun, borderRadius: '50%',
        background: `radial-gradient(circle, ${CREAM} 0%, ${CREAM} 45%, ${AMBER} 70%)`,
        boxShadow: `0 0 ${6 * vmin}px ${2 * vmin}px ${AMBER}`}} />

      <AbsoluteFill style={{transform: `rotate(${roll}deg) scale(1.04)`, transformOrigin: `${cx}px ${hy}px`}}>
        <AbsoluteFill style={{perspective: P, perspectiveOrigin: `${cx}px ${hy}px`}}>
          <div style={{position: 'absolute', left: cx - camX * S, top: hy + eye * S, transformStyle: 'preserve-3d'}}>
            <div style={{position: 'absolute', left: -roadWidth / 2, top: 0, width: roadWidth, height: roadLength,
              transformOrigin: '50% 0', transform: `translateZ(${P - roadNear * S}px) rotateX(-90deg)`,
              backgroundColor: '#3b2a86', overflow: 'hidden'}}>
              {strip(0, 2 * STREET, {backgroundColor: '#161653'})}
              {strip(-STREET, 0.07, {backgroundColor: PINK})}
              {strip(STREET, 0.07, {backgroundColor: PINK})}
              {strip(0, 0.1, {backgroundImage: `linear-gradient(to bottom, ${AMBER} 0, ${AMBER} 45%, transparent 45%)`,
                backgroundSize: `100% ${dash}px`, backgroundPositionY: slide})}
              <div style={{position: 'absolute', inset: 0,
                background: `linear-gradient(to bottom, transparent ${(3 / FAR) * 100}%, ${HAZE} 96%)`}} />
            </div>
            {slabs}
          </div>
        </AbsoluteFill>
        <FaceCanvas width={canvasWidth} height={canvasHeight} faces={faces} textureSize={textureSize}
          shadeColor={NAVY_RGB} fogColor={HAZE_RGB} borderColor={NAVY_RGB} border={edge / S}
          style={{position: 'absolute', left: -marginX, top: -marginY, width: canvasWidth, height: canvasHeight}} />
      </AbsoluteFill>

      {hood ? (
        <div style={{position: 'absolute', left: cx - 0.62 * width, width: 1.24 * width, height: 30 * vmin,
          top: height - (9 - 0.9 * thump) * vmin, borderRadius: '50%',
          background: `linear-gradient(to bottom, ${BLUE} 0, #1a2a9a ${2.2 * vmin}px, ${NAVY} ${7 * vmin}px)`,
          borderTop: `${0.5 * vmin}px solid ${PINK}`}} />
      ) : null}
    </AbsoluteFill>
  );
};

export default defineSketch({
  id: 'rando-wando',
  title: 'Rando Wando',
  description: 'Driving down a street of cube-stack buildings whose faces play palette-mapped clips and hop as each beat ripples past.',
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
    useVideos: true,
    hood: true,
  },
  timing: {bpm: 100, bars: 4},
  Component: RandoWando,
  assets: (props) => [bust, glitch, smiley, computer, ...(props.useVideos ? [tunnel, dancers] : [])],
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
