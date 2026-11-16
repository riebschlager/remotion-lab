import {z} from 'zod';
import {divisionFitsLoop, pulse} from './envelopes';
import {mod} from './timing';

export const beatPatternSchema = z.object({
  /** One strength per division: 0 = rest, 1 = full accent. */
  steps: z.array(z.number().min(0).max(1)).min(1),
  /** Delay odd slots by this fraction of one division; 1/3 gives 2:1 swing. */
  swing: z.number().min(0).lt(1).optional(),
}).strict();
export type BeatPattern = z.infer<typeof beatPatternSchema>;

/** Reusable examples; the layer's division determines the length of a slot. */
export const beatPatterns = {
  syncopated: {steps: [1, 0, 0.45, 0, 0.75, 0.35, 0, 0.55], swing: 0.25},
  backbeat: {steps: [0, 1, 0, 0.65], swing: 0},
  shuffle: {steps: [1, 0.35, 0.75, 0], swing: 1 / 3},
} satisfies Record<string, BeatPattern>;

/** Field-prefixed musical constraints, shared by helpers and layer validation. */
export const patternIssues = (pattern: BeatPattern, stepBeats: number, totalBeats: number): string[] => {
  const issues: string[] = [];
  if (!pattern.steps.length || pattern.steps.some((strength) => !Number.isFinite(strength) || strength < 0 || strength > 1)) {
    issues.push('pattern.steps: provide at least one finite strength between 0 and 1');
  }
  const swing = pattern.swing ?? 0;
  if (!Number.isFinite(swing) || swing < 0 || swing >= 1) issues.push('pattern.swing: must be at least 0 and less than 1');
  if (swing > 0 && pattern.steps.length % 2 !== 0) issues.push('pattern.swing: swung patterns need an even number of slots to preserve pairs');
  if (!divisionFitsLoop(stepBeats * pattern.steps.length, totalBeats)) {
    issues.push(`pattern.steps: ${pattern.steps.length} slots of ${stepBeats} beats must repeat a whole number of times in ${totalBeats} beats`);
  }
  return issues;
};

export type PatternHit = {
  /** Stable slot identity within the complete loop, including rest positions. */
  index: number;
  patternIndex: number;
  beat: number;
  strength: number;
};

/** Compile a loop's active hits, preserving slot identity across rests/swing. */
export const patternHits = (pattern: BeatPattern, stepBeats: number, totalBeats: number, offsetBeats = 0): PatternHit[] => {
  const issues = patternIssues(pattern, stepBeats, totalBeats);
  if (issues.length) throw new Error(issues.join('; '));
  if (!Number.isFinite(offsetBeats)) throw new Error('Pattern offset must be finite');
  const hits: PatternHit[] = [];
  for (let index = 0; index < Math.round(totalBeats / stepBeats); index++) {
    const patternIndex = index % pattern.steps.length;
    const strength = pattern.steps[patternIndex];
    if (strength === 0) continue;
    const delay = patternIndex % 2 === 1 ? (pattern.swing ?? 0) * stepBeats : 0;
    hits.push({index, patternIndex, strength, beat: mod(index * stepBeats + delay + offsetBeats, totalBeats)});
  }
  return hits;
};

export type PatternEvent = PatternHit & {age: number; generation: number};

/** Living events, youngest first. Include prior loop generations for tails
 * longer than the loop; never infer history from a previous rendered frame.
 */
export const patternEvents = (
  beat: number, stepBeats: number, totalBeats: number, pattern: BeatPattern,
  offsetBeats = 0, lifeBeats = stepBeats,
): PatternEvent[] => {
  if (!Number.isFinite(beat) || !Number.isFinite(lifeBeats) || lifeBeats < 0) {
    throw new Error('Pattern beat and lifetime must be finite; lifetime must be nonnegative');
  }
  const events: PatternEvent[] = [];
  for (const hit of patternHits(pattern, stepBeats, totalBeats, offsetBeats)) {
    const wrappedAge = mod(beat - hit.beat, totalBeats);
    // Triplet onsets can differ from frame-derived beats by a few ulps.
    // Snap that numerical residue, rather than delaying the hit a full frame.
    const age = totalBeats - wrappedAge < 1e-9 ? 0 : wrappedAge;
    for (let generation = 0; age + generation * totalBeats < lifeBeats; generation++) {
      events.push({...hit, age: age + generation * totalBeats, generation});
    }
  }
  return events.sort((a, b) => a.age - b.age);
};

/** Strength-weighted hit envelope. Max-combine overlapping tails so a softer
 * new hit cannot abruptly cut off a previous accent. Rests never retrigger.
 */
export const patternPulse = (
  beat: number, stepBeats: number, totalBeats: number, pattern: BeatPattern,
  offsetBeats = 0, options: NonNullable<Parameters<typeof pulse>[1]> = {},
) => {
  const life = ((options.attack ?? 0) + Math.max(options.decay ?? 0.6, 1e-6)) * stepBeats;
  return patternEvents(beat, stepBeats, totalBeats, pattern, offsetBeats, life)
    .reduce((value, event) => Math.max(value, event.strength * pulse(event.age / stepBeats, options)), 0);
};
