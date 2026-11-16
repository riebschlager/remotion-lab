import {z} from 'zod';

export const DIVISIONS = {
  '1/16': 0.25,
  '1/8': 0.5,
  '1/4': 1,
  '1/2': 2,
  '1 bar': 4,
  '2 bars': 8,
  '4 bars': 16,
} as const;

export type Division = keyof typeof DIVISIONS;

/**
 * Length of a division in beats. Bar-based divisions scale with beatsPerBar
 * (so "1 bar" in 3/4 is 3 beats).
 */
export const divisionBeats = (division: Division, beatsPerBar = 4) => {
  const base = DIVISIONS[division];
  return base >= 4 ? (base / 4) * beatsPerBar : base;
};

/**
 * A division only loops cleanly if it fits a whole number of times in the
 * loop. "4 bars" inside a 2-bar loop will pop at the seam.
 */
export const divisionFitsLoop = (stepBeats: number, totalBeats: number) => {
  if (!Number.isFinite(stepBeats) || !Number.isFinite(totalBeats) || stepBeats <= 0 || totalBeats <= 0) return false;
  const n = totalBeats / stepBeats;
  return Math.abs(n - Math.round(n)) < 1e-6;
};

export const divisionSchema = z.enum(Object.keys(DIVISIONS) as [Division, ...Division[]]);
