/**
 * Pure timing math. No React, no Remotion hooks — everything here is a
 * function of numbers so it can be reasoned about (and tested) in isolation.
 *
 * Core rule: time is expressed as LOOP PHASE (0 → 1), and beats are derived
 * from phase. The frame after the last frame samples frame 0. Layer functions
 * must still make that transition continuous, except for intentional attacks.
 */

export type TimingConfig = {
  bpm: number;
  bars: number;
  beatsPerBar: number;
  fps: number;
};

export type BeatState = {
  /** Frame inside the loop, 0 … loopDurationInFrames - 1 */
  frame: number;
  loopDurationInFrames: number;
  fps: number;
  /** 0 → 1 across the whole loop (never reaches 1) */
  loopPhase: number;
  totalBeats: number;
  beatsPerBar: number;
  /** Continuous beat position, 0 → totalBeats */
  beat: number;
  /** Integer beat number, 0 → totalBeats - 1 */
  beatIndex: number;
  /** 0 → 1 inside the current beat */
  beatPhase: number;
  /** Continuous bar position, 0 → bars */
  bar: number;
  barIndex: number;
  /** 0 → 1 inside the current bar */
  barPhase: number;
  /** Requested tempo */
  bpm: number;
  /** Tempo actually rendered after rounding the loop to whole frames */
  effectiveBpm: number;
};

export const getTotalBeats = ({bars, beatsPerBar}: Pick<TimingConfig, 'bars' | 'beatsPerBar'>) =>
  bars * beatsPerBar;

/**
 * Loop length in frames. Rounded to a whole frame, which may stretch the tempo
 * by a hair — see `effectiveBpm`. For silent loops that's the right trade.
 * If you sync to real audio, pick bpm/fps/bars combos that land on whole
 * frames (e.g. 128 BPM @ 30fps → 16 bars = exactly 900 frames).
 */
export const getLoopDurationInFrames = (cfg: TimingConfig) => {
  const seconds = getTotalBeats(cfg) * (60 / cfg.bpm);
  return Math.max(1, Math.round(seconds * cfg.fps));
};

/** True when the loop length lands exactly on a whole frame (no tempo stretch). */
export const isFrameExact = (cfg: TimingConfig) => {
  const exact = getTotalBeats(cfg) * (60 / cfg.bpm) * cfg.fps;
  return Math.abs(exact - Math.round(exact)) < 1e-6;
};

/** Positive modulo: mod(-1, 4) === 3 */
export const mod = (a: number, n: number) => ((a % n) + n) % n;

export const getBeatState = (
  rawFrame: number,
  cfg: TimingConfig,
): BeatState => {
  const loopDurationInFrames = getLoopDurationInFrames(cfg);
  const totalBeats = getTotalBeats(cfg);
  const frame = mod(Math.floor(rawFrame), loopDurationInFrames);

  const loopPhase = frame / loopDurationInFrames;
  const beat = loopPhase * totalBeats;
  const beatIndex = Math.floor(beat);
  const bar = beat / cfg.beatsPerBar;
  const barIndex = Math.floor(bar);

  return {
    frame,
    loopDurationInFrames,
    fps: cfg.fps,
    loopPhase,
    totalBeats,
    beatsPerBar: cfg.beatsPerBar,
    beat,
    beatIndex,
    beatPhase: beat - beatIndex,
    bar,
    barIndex,
    barPhase: bar - barIndex,
    bpm: cfg.bpm,
    effectiveBpm: (totalBeats / (loopDurationInFrames / cfg.fps)) * 60,
  };
};
