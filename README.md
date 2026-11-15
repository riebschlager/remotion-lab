# remotion-lab

Beat-locked, seamless-loop vertical videos (1080×1920) built with [Remotion](https://www.remotion.dev).

## Quick start

```bash
npm install
npm run dev          # opens Remotion Studio — edit props live in the right panel
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Studio with live parameter panel |
| `npm run render` | Renders `BeatLoop` → `out/loop.mp4` |
| `npm run render:60` | Same at 60fps |
| `npm run seamcheck` | Renders 1s before → 1s after the loop point. If you see a jump, something isn't periodic. |
| `npm run still` | Frame 0 as a PNG |
| `npm run typecheck` | TypeScript check |

Override any prop from the CLI (props merge with defaults; nested layer objects are replaced whole):

```bash
npx remotion render BeatLoop out/128.mp4 --props='{"bpm":128,"bars":16}'
```

## How time works

```
frame ──► loopPhase (0→1) ──► beat (0→totalBeats) ──► step / envelope / lfo ──► pixels
```

- **Loop length is derived, never typed.** `bpm × bars × beatsPerBar × fps` → `durationInFrames` via `calculateMetadata` in `Root.tsx`.
- Loop length is rounded to whole frames, which can stretch the tempo slightly. The debug overlay shows the effective BPM when that happens. For silent loops that's fine. For audio sync, choose combos that land exactly (128 BPM @ 30fps → 16 bars = 900 frames).
- **`useBeat()` is the only clock.** It returns `beat`, `beatIndex`, `beatPhase`, `bar`, `barPhase`, `loopPhase`, `totalBeats`, etc.

## The rules (break one and the loop seams)

1. **Layers never call `useCurrentFrame()`.** Use `useBeat()`.
2. **No state between frames.** Remotion renders frames in parallel and out of order, so there's no feedback and no accumulators. Every frame is a pure function of beat position.
3. **No `Math.random()`.** Use `stepRandom(seed, step.index)`. It's deterministic and repeats every loop.
4. **LFOs use whole cycles per loop.** `lfo(loopPhase, cycles)` rounds for you.
5. **Noise must loop.** Use `loopNoise(seed, loopPhase, radius)`, which samples 3D noise around a circle.
6. **Divisions must fit the loop.** "4 bars" in a 2-bar loop pops at the seam. The debug overlay warns you.
7. **Long tails wrap.** Use `step()` ages or `decaySince()`. Both are modulo the loop, so a ring born on the last beat keeps expanding into frame 0.

## Toolkit (`src/beat/envelopes.ts`)

| Function | Use |
| --- | --- |
| `step(beat, stepBeats, totalBeats, offsetBeats)` | Grid clock → `{phase, index, age, stepsPerLoop}` |
| `divisionBeats(division, beatsPerBar)` | `'1/8'` → `0.5` beats, etc. |
| `pulse(phase, {attack, decay, curve})` | Hit envelope. `attack: 0` = peak on the beat frame |
| `decaySince(beat, hitBeat, lengthBeats, totalBeats)` | Multi-beat tail, wrapped across the seam |
| `bump(phase)` | Smooth 0→1→0 |
| `lfo(loopPhase, cycles, shape, phaseOffset)` | sine / triangle / saw / square, −1→1 |
| `loopNoise(seed, loopPhase, radius, z)` | Seamless noise, ~−1→1 |
| `stepRandom(seed, index, channel)` | Seeded 0→1 per step |

## Adding a layer

1. **Schema** – in `src/schema.ts`, `baseLayerSchema.extend({...})` with your params, add it to `loopSchema`, and add defaults to `defaultLoopProps`.
2. **Component** – in `src/layers/MyLayer.tsx`, read `useBeat()` and build from `step()` + envelopes. Use `Background.tsx` as the minimal template.
3. **Stack** – in `src/LoopComposition.tsx`, wrap it in `<Layer enabled opacity blendMode>` at the z-position you want, and add its `division` to the `BeatDebug` list.

Every layer gets `enabled`, `opacity`, `blendMode`, `division`, and `offsetBeats` for free. Per-layer offsets are what make a stack feel composed instead of everything hitting at once.

## Layout

```
src/
  index.ts              registerRoot
  Root.tsx              BeatLoop + SeamCheck compositions, calculateMetadata
  schema.ts             zod schema → Studio parameter panel
  LoopComposition.tsx   the layer stack
  beat/
    timing.ts           pure frame → beat math
    BeatContext.tsx     <BeatProvider> + useBeat()
    envelopes.ts        step, pulse, lfo, loopNoise, stepRandom…
  layers/
    Layer.tsx           enabled / opacity / blend wrapper
    Background.tsx      example: pulsing, rotating gradient
    Rings.tsx           example: rings born each step, live across the seam
    BeatDebug.tsx       grid overlay + loop warnings (turn off for finals)
```
