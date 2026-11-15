# remotion-lab

Beat-locked, seamless-loop vertical videos (1080×1920) built with [Remotion](https://www.remotion.dev).

## Quick start

Requires Node.js 22 or newer.

```bash
npm ci
npm run check        # agent setup, types, and pure loop tests
npm run dev          # opens Remotion Studio — edit props live in the right panel
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Studio with live parameter panel |
| `npm run render` | Renders clean `BeatLoop` → `out/loop.mp4` |
| `npm run render:60` | Same at 60fps |
| `npm run seamcheck` | Manual preview around the seam; up to 1s on either side |
| `npm run still` | Frame 0 as a PNG |
| `npm run presets` | List named looks, musical settings and durations |
| `npm run render:preset` | Render `PresetLoop` → `out/preset.mp4` |
| `npm run seamcheck:preset` | Render `PresetSeamCheck` → `out/preset-seamcheck.mp4` |
| `npm run typecheck` | TypeScript check |
| `npm test` | Timing, envelope, event identity, and configuration regression tests |
| `npm run test:visual` | Rendered seam, determinism, clean defaults, and composition integration tests |
| `npm run skills:check` | Check official skill versions, router references, and compatibility links |
| `npm run check` | Skill setup + type check + unit tests |

Override any prop from the CLI (props merge with defaults; nested layer objects are replaced whole):

```bash
npx remotion render BeatLoop out/128.mp4 --props='{"bpm":128,"bars":16}'
```

All compositions default to `debug.enabled: false`, including final exports.
Enable the overlay in Studio or explicitly request it for a diagnostic render:

```bash
npm run seamcheck -- --props='{"debug":{"enabled":true}}'
```

## Named presets

Open **Presets → PresetLoop** in Studio and choose a `preset`. Use
**PresetSeamCheck** to inspect its boundary. The built-in looks are:

| Preset | Look | Timing |
| --- | --- | --- |
| `neon-orbit` | Original cyan rings, pink accents, violet pulse | 120 BPM, 4 bars |
| `amber-echo` | Gold and coral rings on the offbeat, with longer echoes | 100 BPM, 4 bars |
| `midnight-drift` | Quiet rotating blue gradient, rings disabled | 90 BPM, 8 bars |

Presets are defined once in `src/presets.ts`. Each stores a title, description
and overrides of the registry defaults. Adding a preset there automatically
adds it to the selector and `npm run presets`; no new root registration is needed.

```bash
npm run render:preset -- --props='{"preset":"amber-echo"}'
npm run seamcheck:preset -- --props='{"preset":"amber-echo"}'
npx remotion render PresetLoop out/custom-amber.mp4 --props='{"preset":"amber-echo","overrides":{"bpm":128,"bars":16,"rings":{"thickness":20}}}'
```

For reusable variations, save that JSON to a file and pass `--props=./my-look.json`.
Resolution order is **registry defaults → saved preset → your overrides**.
Individual fields within a layer merge; arrays such as `layerOrder` replace
the whole array. Unknown preset names, misspelled override fields and invalid
musical settings fail before rendering. Enable optional override fields in
Studio by clearing their `<undefined>` checkbox, or use its JSON editor.

`BeatLoop` and `SeamCheck` retain their original top-level props. Their CLI
overrides still merge shallowly: an explicitly provided `rings` object must
be complete. An omitted layer now receives its registry defaults. Use the
preset compositions when you want convenient partial layer overrides.

## Layer registry

`src/layers/registry.ts` is the single registration point. Each layer module
exports a `defineLayer({schema, defaults, Component, validate?})` definition.
The registry generates typed schema fields, fallback defaults, partial preset
controls, rendering, musical validation and enabled debug divisions. It keeps
the original back-to-front order unless `layerOrder` overrides it.

```json
{"layerOrder": ["rings", "background"]}
```

Every registered name must appear exactly once, including disabled layers.
Layer definitions currently have one instance each. Their stack and generated
geometry are procedural: edit parameters through composition props rather
than duplicating or dragging them as independent Studio clips. Timing and
preset defaults on the root registrations remain source-editable in Studio;
shared layer defaults live beside each layer's implementation.

## How time works

```
frame ──► loopPhase (0→1) ──► beat (0→totalBeats) ──► step / envelope / lfo ──► pixels
```

- **Loop length is derived, never typed.** `round(bars × beatsPerBar × 60 / bpm × fps)` → `durationInFrames` via `calculateMetadata` in `Root.tsx`.
- `timingMode: "visual"` (default) rounds to whole frames, which can stretch the tempo slightly. The debug overlay shows effective BPM. `timingMode: "exact"` rejects settings that require rounding. For example, 128 BPM @ 30fps over 16 bars is exactly 900 frames. An exact loop duration does not imply that every beat falls on an integer frame, and audio is not yet part of this project.
- **`useBeat()` is the only clock.** It returns `beat`, `beatIndex`, `beatPhase`, `bar`, `barPhase`, `loopPhase`, `totalBeats`, etc.

All four compositions validate resolved props in `src/metadata.ts`
before deriving duration. Invalid fields, incomplete nested CLI overrides,
incompatible divisions on enabled layers, and inexact timing in exact mode
fail with field-specific errors. Disabled layers may retain incompatible
divisions; their other fields must still satisfy the schema.

## The rules (break one and the loop seams)

1. **Layers never call `useCurrentFrame()`.** Use `useBeat()`.
2. **No state between frames.** Remotion renders frames in parallel and out of order, so there's no feedback and no accumulators. Every frame is a pure function of beat position.
3. **No `Math.random()`.** Use `stepRandom(seed, step.index)`. It's deterministic and repeats every loop.
4. **LFOs use whole cycles per loop.** `lfo(loopPhase, cycles)` rejects fractional or negative cycles. Zero holds a constant. Saw/square waves have intentional discontinuities.
5. **Noise must loop.** Use `loopNoise(seed, loopPhase, radius)`, which samples 3D noise around a circle.
6. **Divisions must fit the loop.** "4 bars" in a 2-bar loop is rejected for an enabled layer. The `step()` helper also rejects incompatible divisions.
7. **Long tails wrap.** Use `step()` ages or `decaySince()`. A single `decaySince()` tail must be positive and no longer than the loop. For longer lifetimes, render overlapping generations as Rings does, preserving wrapped birth identity.

## Toolkit (`src/beat/envelopes.ts`)

| Function | Use |
| --- | --- |
| `step(beat, stepBeats, totalBeats, offsetBeats)` | Grid clock → `{phase, index, age, stepsPerLoop}` |
| `divisionBeats(division, beatsPerBar)` | `'1/8'` → `0.5` beats, etc. |
| `pulse(phase, {attack, decay, curve})` | Hit envelope. `attack: 0` = peak on the beat frame |
| `decaySince(beat, hitBeat, lengthBeats, totalBeats)` | Wrapped single-hit tail, length ≤ loop |
| `bump(phase)` | Smooth 0→1→0 |
| `lfo(loopPhase, cycles, shape, phaseOffset)` | sine / triangle / saw / square, −1→1 |
| `loopNoise(seed, loopPhase, radius, z)` | Seamless noise, ~−1→1 |
| `stepRandom(seed, index, channel)` | Seeded 0→1 per step |

## Adding a layer

1. **Define** – in `src/layers/MyLayer.tsx`, extend `baseLayerSchema` from `layers/base.ts`, build a component using `useBeat()`, and export a `defineLayer` definition with its schema, defaults and component. Use `Background.tsx` as the template. Keep defaults in the definition, rather than attaching defaults to individual schema fields, so partial preset overrides stay sparse.
2. **Register** – import the definition in `src/layers/registry.ts` and add one entry to `layerRegistry`. Place it at its default z-position. Use `enabled: false` for opt-in effects to preserve existing presets. No edits to Root, LoopComposition, global validation or debug division lists are needed.
3. **Constrain and test** – standard division validation is automatic. For additional musical constraints, add `validate(props, timing)` to the definition, returning messages such as `['radius: exceeds the supported range']`. Disabled layers skip these extra checks; schema constraints always apply. Add fixtures and run `npm run check` and `npm run test:visual`.

Every layer gets `enabled`, `opacity`, `blendMode`, `division`, and `offsetBeats` for free. Per-layer offsets are what make a stack feel composed instead of everything hitting at once.

## Loop verification

`npm run check` runs fast checks without a browser. `npm run test:visual`
bundles the real project, launches Remotion's bundled browser (downloaded on
first use if needed), and renders PNGs at 20% scale. Artifacts remain in
`out/loop-tests/` for inspection; temporary bundles are removed after testing.

Rendered fixtures cover offset hits, tails longer than the loop, odd meter,
rounded tempo, 60fps, clean exports, malformed CLI props, and SeamCheck's
mapping to the actual boundary frames. They also exercise each named preset,
partial overrides, invalid selections and actual layer stacking order.
Frames are rendered out of order and
repeated to check determinism. A boundary between hits is compared to motion
on either side; an intentional beat attack is compared to an interior attack.

The last frame and first frame are consecutive samples and need not match.
Frame N matching frame 0 only establishes repetition because the clock wraps;
it does not establish continuity. Pixel thresholds are regression heuristics
for these fixtures, not a guarantee for every future layer. Inspect new visual
styles in Studio and use `npm run seamcheck` for manual review. CI runs both
the fast checks and rendered suite.

## Agent setup

[AGENTS.md](AGENTS.md) is the shared project contract; `CLAUDE.md` points to it.
The official [Remotion skills](https://www.remotion.dev/docs/ai/skills) are
checked into `.agents/skills/` with `skills-lock.json` recording their source.
Claude uses per-skill links in `.claude/skills/`. The local `beat-loop` skill
adds this project's timing, layer authoring and verification workflow without
modifying the upstream skills.

```bash
npm run skills:check   # verify discovery files, versions, references and links
npm run skills:add     # restore/install official skills when needed
npm run skills:update  # deliberately refresh upstream skills; review the diff
```

Keep all `remotion` and `@remotion/*` dependencies at the same exact version.
When upgrading, update skills together with the framework, then run both test
suites. The setup check reports a skill/framework version mismatch for review.
After adding local skills, start a new agent session if discovery is stale.

## Layout

```
src/
  index.ts              registerRoot
  Root.tsx              direct + preset composition registrations
  schema.ts             registry-derived schema → Studio parameter panel
  presets.ts            named looks, partial overrides, validated resolution
  PresetComposition.tsx preset loop and seam views
  validation.ts         schema + enabled division + exact timing validation
  metadata.ts           shared validation before duration calculation
  LoopComposition.tsx   the layer stack
  beat/
    timing.ts           pure frame → beat math
    BeatContext.tsx     <BeatProvider> + useBeat()
    envelopes.ts        step, pulse, lfo, loopNoise, stepRandom…
  layers/
    base.ts             shared layer controls
    definition.ts       defineLayer: defaults, renderer, validation contract
    registry.ts         register once; derive schema, order and configured layers
    Layer.tsx           enabled / opacity / blend wrapper
    Background.tsx      gradient component + schema + defaults
    Rings.tsx           wrapped rings + schema + defaults
    BeatDebug.tsx       optional grid overlay + timing diagnostics
```
