import {z} from 'zod';
import {sourceFrameIndex, type ClipRef} from './index';
import {divisionBeats, divisionFitsLoop, divisionSchema} from '../beat/divisions';
import {step} from '../beat/envelopes';
import {beatPatternSchema, patternEvents, patternHits, patternIssues} from '../beat/patterns';
import {modulationIssues, modulationSignalSchema, sampleSignal, type ModulationContext} from '../beat/modulation';
import {getTotalBeats, mod, type TimingConfig} from '../beat/timing';

const rhythm = {
  division: divisionSchema,
  offsetBeats: z.number().optional(),
  pattern: beatPatternSchema.nullable().optional(),
};
const travel = {
  direction: z.enum(['forward', 'ping-pong']).optional(),
};
export const clipPlaybackSchema = z.discriminatedUnion('mode', [
  z.object({mode: z.literal('fit'),
    duration: z.union([z.object({beats: z.number().positive()}).strict(), z.object({bars: z.number().positive()}).strict()]),
    offsetBeats: z.number().optional(), ...travel, cut: z.enum(['allow', 'fade']).optional(),
  }).strict(),
  z.object({mode: z.literal('retrigger'), ...rhythm, ...travel,
    durationBeats: z.number().positive(), cut: z.enum(['allow', 'fade']),
  }).strict(),
  z.object({mode: z.literal('step'), ...rhythm, ...travel,
    jump: z.number().int().optional(), startFrame: z.number().int().optional(),
    seam: z.enum(['closed', 'wrap']).optional(), cut: z.literal('allow').optional(),
  }).strict(),
  z.object({mode: z.literal('scrub'), ...rhythm, signal: modulationSignalSchema,
    cut: z.literal('allow').optional(),
  }).strict(),
]);
export type ClipPlayback = z.infer<typeof clipPlaybackSchema>;
export type ClipBinding = {clip: ClipRef; playback: ClipPlayback; field?: string};
const period = (clip: ClipRef, p: {mode: string; direction?: string}) =>
  p.direction === 'ping-pong' ? Math.max(1, 2 * (clip.frameCount - 1)) : clip.frameCount;
const duration = (p: Extract<ClipPlayback, {mode: 'fit'}>, meter: number) =>
  'beats' in p.duration ? p.duration.beats : p.duration.bars * meter;
const patternOf = (p: {pattern?: {steps: number[]; swing?: number} | null}) => p.pattern ?? {steps: [1]};

/** Call through defineSketch({clips}) to validate both metadata paths before decoding media. */
export const clipPlaybackIssues = (clip: ClipRef, input: ClipPlayback, timing: TimingConfig, field = 'playback'): string[] => {
  const parsed = clipPlaybackSchema.safeParse(input);
  if (!parsed.success) {
    const expand = (issues: readonly z.core.$ZodIssue[]): z.core.$ZodIssue[] => issues.flatMap((i) => {
      if (i.code !== 'invalid_union') return [i];
      const nested = expand(i.errors.flat()).map((n) => ({...n, path: [...i.path, ...n.path]}));
      const detailed = nested.filter((n) => n.path.length > i.path.length);
      return detailed.length ? detailed : [i];
    });
    return expand(parsed.error.issues).map((i) => `${field}.${i.path.join('.')}: ${i.message}`);
  }
  const p = parsed.data;
  const errors: string[] = [];
  const total = getTotalBeats(timing);
  if (p.mode === 'fit') {
    if (!divisionFitsLoop(duration(p, timing.beatsPerBar), total)) errors.push('duration: must fit a whole number of plays in the loop');
    if (!clip.loop.seamless && p.direction !== 'ping-pong' && !p.cut) errors.push('cut: clip does not loop on its own; choose direction "ping-pong", cut "fade", or deliberately cut with "allow"');
  } else {
    const length = divisionBeats(p.division, timing.beatsPerBar);
    if (p.mode !== 'scrub') {
      if (!divisionFitsLoop(length, total)) errors.push('division: must fit a whole number of times in the loop');
      if (p.pattern) errors.push(...patternIssues(p.pattern, length, total));
    }
    if (p.mode === 'step') {
      if (!errors.length) {
        const count = patternHits(patternOf(p), length, total).length;
        if (p.seam !== 'wrap' && mod(count * (p.jump ?? 1), period(clip, p)) !== 0) {
          errors.push('jump: active hits × jump must advance a whole number of source cycles; use seam "wrap" for an intentional reset');
        }
      }
      if (!clip.loop.seamless && p.direction !== 'ping-pong' && p.cut !== 'allow') errors.push('cut: clip does not loop on its own; choose ping-pong or explicitly allow the cut');
    }
    if (p.mode === 'scrub') {
      errors.push(...modulationIssues({scale: {signal: p.signal, range: [0, 1]}},
        {division: p.division, offsetBeats: p.offsetBeats ?? 0, pattern: p.pattern}, timing)
        .map((s) => s.replace('modulation.scale.', '')));
      const sources = Array.isArray(p.signal) ? p.signal : [p.signal];
      if (p.cut !== 'allow' && sources.some((s) => s.weight !== 0 &&
        (s.type === 'beat' || (s.type === 'lfo' && (s.cycles ?? 1) > 0 && ['saw', 'square'].includes(s.shape ?? 'sine'))))) {
        errors.push('cut: beat/saw/square signals can jump the playhead; explicitly allow the cut or use sine, triangle, or noise');
      }
    }
  }
  return errors.map((s) => `${field}.${s}`);
};

export type ClipSample = {frame: number; strength: number; age: number; opacity: number};
/** No history: rests retain the youngest active hit, even if it was in the previous loop. */
export const sampleClip = (clip: ClipRef, p: ClipPlayback, context: ModulationContext): ClipSample => {
  const {time} = context;
  const issues = clipPlaybackIssues(clip, p, {bpm: time.bpm, bars: time.totalBeats / time.beatsPerBar, beatsPerBar: time.beatsPerBar, fps: time.fps});
  if (issues.length) throw new Error(issues.join('; '));
  const frameAt = (position: number) => {
    const n = period(clip, p);
    const index = sourceFrameIndex(position, n);
    return 'direction' in p && p.direction === 'ping-pong' ? Math.min(index, n - index) : index;
  };
  const fade = (phase: number) => Math.sin(Math.PI * phase) ** 2;
  if (p.mode === 'fit') {
    const clock = step(time.beat, duration(p, time.beatsPerBar), time.totalBeats, p.offsetBeats ?? 0);
    return {frame: frameAt(clock.phase * period(clip, p)), strength: 1, age: clock.age,
      opacity: p.cut === 'fade' ? fade(clock.phase) : 1};
  }
  if (p.mode === 'scrub') {
    const signal = sampleSignal(p.signal, {...context, division: p.division, offsetBeats: p.offsetBeats ?? 0, pattern: p.pattern});
    // 1 selects the last frame, never wraps to frame zero.
    return {frame: sourceFrameIndex(signal * (clip.frameCount - 1), clip.frameCount), strength: 1, age: 0, opacity: 1};
  }
  const length = divisionBeats(p.division, time.beatsPerBar);
  const pattern = patternOf(p);
  const hits = patternHits(pattern, length, time.totalBeats, p.offsetBeats ?? 0);
  const latest = patternEvents(time.beat, length, time.totalBeats, pattern, p.offsetBeats ?? 0, time.totalBeats)[0];
  if (!latest) return {frame: p.mode === 'step' ? frameAt(p.startFrame ?? 0) : 0, strength: 0, age: 0, opacity: 0};
  if (p.mode === 'step') {
    const rank = hits.findIndex((h) => h.index === latest.index);
    return {frame: frameAt((p.startFrame ?? 0) + rank * (p.jump ?? 1)), strength: latest.strength, age: latest.age, opacity: 1};
  }
  const interval = Math.min(...hits.map((h) => mod(h.beat - latest.beat, time.totalBeats) || time.totalBeats));
  // Retrigger plays once then holds the final frame; it never free-runs through a rest.
  const position = Math.min(latest.age / p.durationBeats * period(clip, p), period(clip, p) - (p.direction === 'ping-pong' ? 0 : 1));
  return {frame: frameAt(position), strength: latest.strength, age: latest.age,
    opacity: p.cut === 'fade' ? fade(latest.age / interval) : 1};
};
