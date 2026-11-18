import {z} from 'zod';

/**
 * Closed-form "cascade" physics for the chunk tiers. Everything is a pure
 * function of the division phase so frames render in any order.
 *
 * - Bottom-up launch: tier i leaves the stack at `stagger * i / (n - 1)`.
 * - Ballistic arcs under one shared gravity, solved so the top tier lands at
 *   `landAt`; lower tiers fly shorter arcs and land first, so the stack
 *   rebuilds from the feet up.
 * - Contact: a tier can never sink below the one beneath it (cumulative max),
 *   so early tiers carry the stack and late tiers settle onto it.
 * - Restitution hop, impact squash and a coin-style settling wobble whose
 *   precession speeds up as its amplitude dies, reaching rest at phase 1.
 */
export const cascadeSchema = z.object({
  stagger: z.number().min(0).max(0.4).step(0.01).describe('Delay from the bottom tier launch to the top tier launch (fraction of a division)'),
  landAt: z.number().min(0.3).max(0.9).step(0.01).describe('When the top tier lands (fraction of a division); gravity is solved from it'),
  bounce: z.number().min(0).max(0.5).step(0.01).describe('Restitution: size of the hop after each landing'),
  tumble: z.number().min(0).max(25).step(0.5).describe('Airborne tilt in degrees, toward each tier\'s off-center mass'),
  wobble: z.number().min(0).max(15).step(0.5).describe('Settling coin wobble in degrees after landing'),
  squash: z.number().min(0).max(0.3).step(0.01).describe('Impact squash on landing'),
});
export type CascadeSettings = z.output<typeof cascadeSchema>;
export const cascadeDefaults: CascadeSettings = {
  stagger: 0.16, landAt: 0.62, bounce: 0.22, tumble: 8, wobble: 5, squash: 0.08,
};

/** Rest positions keep the legacy lift profile: 0.15 plus a share of spread. */
export const tierHeight = (index: number, count: number, spread: number) =>
  0.15 + (count > 1 ? index / (count - 1) : 0) * spread;

export type TierMotion = {
  /** Vertical offset above the rest position. */
  lift: number;
  /** Airborne amount, 0 at rest and 1 at the tier's own apex. */
  air: number;
  /** Tilt angle (radians) and the heading (radians, in XZ) of its tilt axis. */
  tilt: number; heading: number;
  /** Positive values flatten the tier: y scales by 1 - squash. */
  squash: number;
};

const arc = (tau: number, duration: number) => tau > 0 && tau < duration
  ? 4 * (tau / duration) * (1 - tau / duration) : 0;
const swing = (tau: number, duration: number) => tau > 0 && tau < duration
  ? Math.sin(Math.PI * tau / duration) : 0;
const impact =(u: number, attack: number) => u > 0 ? (u / attack) * Math.exp(1 - u / attack) : 0;

/** Timing landmarks, also used to place the hold plateau at the top tier's apex. */
export function cascadeTiming(count: number, spread: number, settings: CascadeSettings) {
  const top = tierHeight(count - 1, count, spread);
  const flight = settings.landAt - settings.stagger;
  const gravity = 8 * top / (flight * flight);
  const tiers = Array.from({length: count}, (_, index) => {
    const launch = count > 1 ? settings.stagger * index / (count - 1) : 0;
    const height = tierHeight(index, count, spread);
    const duration = Math.sqrt(8 * height / gravity);
    const hop = settings.bounce * duration;
    return {launch, height, duration, land: launch + duration, hop, rest: launch + duration + hop};
  });
  return {gravity, tiers, apex: settings.stagger + flight / 2};
}

/**
 * `headings` are the XZ directions of each tier's off-center mass; tilting
 * toward them reads as torque from an uneven cut.
 */
export function cascadeMotion(
  phase: number, count: number, spread: number, settings: CascadeSettings, headings: readonly number[],
): TierMotion[] {
  const {tiers} = cascadeTiming(count, spread, settings);
  const top = tiers[count - 1].height;
  const tumble = settings.tumble * Math.PI / 180, wobble = settings.wobble * Math.PI / 180;
  // Impact effects fade out completely before the seam.
  const seamFade = Math.min(1, (1 - phase) / 0.06);
  let floor = 0;
  return tiers.map(({launch, height, duration, land, hop, rest}, index) => {
    const tau = phase - launch;
    // A hop of `bounce * duration` under the same gravity rises bounce² as high.
    const free = height * (arc(tau, duration) + settings.bounce ** 2 * arc(tau - duration, hop));
    // Contact: rest on (or be carried by) everything below.
    const below = floor;
    const lift = floor = Math.max(free, floor);
    // A tier only tumbles once it has clearance; while carried it stays seated.
    const clearance = Math.min(1, (lift - below) / 0.08);
    const weight = Math.sqrt(height / top);
    const squash = settings.squash * weight * seamFade
      * (impact(phase - land, 0.025) + settings.bounce * impact(phase - land - hop, 0.02));
    const heading = headings[index] ?? 0;
    const air = Math.min(1, lift / height);
    if (phase <= rest) {
      // Airborne: lean toward the heavy side, returning flat for each landing.
      const tilt = clearance * tumble * (swing(tau, duration) + settings.bounce * swing(tau - duration, hop));
      return {lift, air, tilt, heading, squash};
    }
    // Coin settle: amplitude decays to zero at the seam while precession accelerates.
    const s = Math.min(0.9999, (phase - rest) / (1 - rest));
    const tilt = wobble * weight * (1 - s) ** 2 * (1 - Math.exp(-s / 0.04));
    return {lift, air, tilt, heading: heading - 2 * Math.PI * 1.4 * Math.log(1 - s), squash};
  });
}

/** Contact-gap per cut: zero when the two faces touch. */
export const cascadeGaps = (motions: readonly TierMotion[]) =>
  motions.slice(1).map((motion, index) => Math.max(0, motion.lift - motions[index].lift));
