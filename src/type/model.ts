import {z} from 'zod';
import type {FontRef} from '../assets';
import type {FontFace} from '../assets/manifest';
import {divisionBeats, divisionFitsLoop, divisionSchema} from '../beat/divisions';
import {pulse} from '../beat/envelopes';
import {beatPatternSchema, patternEvents, patternHits, patternIssues} from '../beat/patterns';
import {modulateNumber, modulationIssues, numberModulationSchema, type ModulationContext} from '../beat/modulation';
import {getTotalBeats, type TimingConfig} from '../beat/timing';

export const typeSettingsSchema = z.object({
  text: z.string().min(1).max(2000),
  split: z.enum(['line', 'word', 'letter']),
  mode: z.enum(['all', 'sequence', 'stagger']),
  division: divisionSchema,
  pattern: beatPatternSchema.nullable().optional(),
  offsetBeats: z.number().optional(), staggerBeats: z.number().optional(),
  attack: z.number().min(0).optional(), decay: z.number().positive().optional(), curve: z.number().positive().optional(),
  weight: z.number().min(1).max(1000).optional(), italic: z.boolean().optional(),
  axes: z.record(z.string(), numberModulationSchema).optional(),
}).strict();
export type TypeSettings = z.infer<typeof typeSettingsSchema>;
export type TypeBinding = {font: FontRef; settings: TypeSettings; field?: string};
export type TypeUnit = {id: string; text: string; line: number; index: number};

/** Explicit line breaks; whitespace is preserved. IDs describe source positions, never render order. */
export const splitType = (text: string, split: TypeSettings['split']): TypeUnit[] => {
  let offset = 0;
  const units: TypeUnit[] = [];
  text.split('\n').forEach((line, row) => {
    const parts = split === 'line' ? [line] : split === 'word' ? line.match(/\S+|\s+/g) ?? [''] : [...line];
    parts.forEach((part) => {
      units.push({id: `${split}:${offset}`, text: part, line: row, index: units.length});
      offset += part.length;
    });
    offset++;
  });
  return units;
};
export const activeUnits = (units: TypeUnit[]) => units.filter((u) => u.text.trim().length > 0);

/** Pick one exact face; no synthetic weight/style or mixing axis ranges from different faces. */
export const typeFace = (font: FontRef, p: TypeSettings): FontFace | undefined => font.faces.find((face) => {
  const weight = p.weight ?? 400;
  return face.style === (p.italic ? 'italic' : 'normal') &&
    (face.axes.wght ? weight >= face.axes.wght.min && weight <= face.axes.wght.max : face.weight === weight) &&
    Object.keys(p.axes ?? {}).every((tag) => face.axes[tag]);
});

/** A full-loop pattern keeps sequence assignment in the inherited axis beat signal too. */
const unitPattern = (p: TypeSettings, index: number, count: number, total: number, meter: number) => {
  if (p.mode !== 'sequence') return p.pattern;
  const pattern = p.pattern ?? {steps: [1]};
  let hit = 0;
  return {steps: Array.from({length: Math.round(total / divisionBeats(p.division, meter))}, (_, slot) => {
    const strength = pattern.steps[slot % pattern.steps.length];
    if (!strength) return 0;
    return hit++ % count === index ? strength : 0;
  }), swing: pattern.swing};
};

export const typeIssues = (font: FontRef, input: TypeSettings, timing: TimingConfig, field = 'type'): string[] => {
  const parsed = typeSettingsSchema.safeParse(input);
  if (!parsed.success) return parsed.error.issues.map((i) => `${field}.${i.path.join('.')}: ${i.message}`);
  const p = parsed.data;
  const errors: string[] = [];
  const face = typeFace(font, p) ?? typeFace(font, {...p, axes: undefined});
  if (!face) errors.push('font: no face supports the requested weight, style and axis tags');
  if (face) {
    const missing = [...new Set(p.text)].filter((c) => c !== '\n' &&
      (c < ' ' || c > '~' || face.missingAscii.includes(c)));
    if (missing.length) errors.push(`text: ${font.family} cannot verify/draw ${missing.map((c) => JSON.stringify(c)).join(', ')}; supported coverage is printable ASCII plus newlines`);
    for (const [tag, mapping] of Object.entries(p.axes ?? {})) {
      const axis = face.axes[tag];
      if (!axis) { errors.push(`axes.${tag}: not supported by the selected face`); continue; }
      if (mapping.range.some((value) => value < axis.min || value > axis.max)) {
        errors.push(`axes.${tag}.range: must stay within ${axis.min}..${axis.max}`);
      }
    }
  }
  const total = getTotalBeats(timing);
  const length = divisionBeats(p.division, timing.beatsPerBar);
  if (!divisionFitsLoop(length, total)) errors.push('division: must fit a whole number of times in the loop');
  if (p.pattern) errors.push(...patternIssues(p.pattern, length, total));
  const count = activeUnits(splitType(p.text, p.split)).length;
  if (!count) errors.push('text: include at least one visible character');
  if (!errors.length && p.mode === 'sequence') {
    const hits = patternHits(p.pattern ?? {steps: [1]}, length, total).length;
    if (hits % count !== 0) errors.push('mode: sequence needs a whole number of unit rounds per loop (active hits must be divisible by visible units)');
  }
  for (const [tag, mapping] of Object.entries(p.axes ?? {})) {
    const pattern = !errors.length ? unitPattern(p, 0, count, total, timing.beatsPerBar) : p.pattern;
    errors.push(...modulationIssues({scale: mapping}, {division: p.division, offsetBeats: p.offsetBeats ?? 0, pattern}, timing)
      .map((s) => s.replace('modulation.scale', `axes.${tag}`)));
  }
  return errors.map((s) => `${field}.${s}`);
};

export type TypeSample = {energy: number; strength: number; age: number | null; axes: Record<string, number>};
/** Assign full-loop hits to units, retaining long tails and identities through rests and the seam. */
export const sampleTypeUnit = (p: TypeSettings, index: number, count: number, context: ModulationContext): TypeSample => {
  const length = divisionBeats(p.division, context.time.beatsPerBar);
  const offset = (p.offsetBeats ?? 0) + (p.mode === 'stagger' ? index * (p.staggerBeats ?? 0.25) : 0);
  const pattern = p.pattern ?? {steps: [1]};
  const hits = patternHits(pattern, length, context.time.totalBeats, offset);
  const life = ((p.attack ?? 0) + (p.decay ?? 0.6)) * length;
  const events = patternEvents(context.time.beat, length, context.time.totalBeats, pattern, offset, Math.max(life, context.time.totalBeats))
    .filter((e) => p.mode !== 'sequence' || hits.findIndex((h) => h.index === e.index) % count === index);
  const energy = events.reduce((max, e) => Math.max(max, e.strength * pulse(e.age / length, p)), 0);
  const rhythm = {division: p.division, offsetBeats: offset, pattern: unitPattern(p, index, count, context.time.totalBeats, context.time.beatsPerBar)};
  return {energy, strength: events[0]?.strength ?? 0, age: events[0]?.age ?? null,
    axes: Object.fromEntries(Object.entries(p.axes ?? {}).map(([tag, mapping]) => [tag,
      modulateNumber(mapping, {...context, ...rhythm, seed: (s) => context.seed(`unit:${index}:${s}`)})]))};
};
