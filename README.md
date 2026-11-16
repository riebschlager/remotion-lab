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
| `prism-stack` | Three pink, cyan and gold ring instances with independent timing and blending | 120 BPM, 4 bars |
| `swing-session` | Shuffled cyan hits, accented amber backbeats, rests and trailing rings | 120 BPM, 4 bars |
| `modulation-orbit` | Beat-driven scale, LFO rotation, mixed colors and looping noise displacement | 120 BPM, 4 bars |

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
Individual fields within a layer merge; arrays such as `layers` and `layerOrder` replace
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
the original back-to-front order unless `layerOrder` overrides it. This legacy
form renders one instance of every registered type:

```json
{"layerOrder": ["rings", "background"]}
```

For this legacy form, every registered name must appear exactly once, including
disabled layers. To stack multiple instances of any registered type, supply
`layers` instead. Its array order is back-to-front; it replaces the entire
legacy stack and takes precedence over `layerOrder`.

```json
{
  "preset": "neon-orbit",
  "overrides": {
    "layers": [
      {"id": "backdrop", "type": "background"},
      {"id": "slow-pink", "type": "rings", "props": {
        "color": "#ff6699", "division": "1/2", "offsetBeats": 0.5,
        "opacity": 0.7, "blendMode": "screen"
      }},
      {"id": "fast-cyan", "type": "rings", "props": {
        "color": "#55ddff", "division": "1/8", "offsetBeats": 0.25,
        "opacity": 0.4, "blendMode": "plus-lighter"
      }}
    ]
  }
}
```

Save this JSON and use `--props=./my-stack.json`, or choose `prism-stack` in
Studio to try a complete example. `layers` also works directly on `BeatLoop`
and `SeamCheck`. Each entry has a unique `id`, a registered `type`, and optional
partial `props` validated against that type's schema. IDs start with a letter
and contain letters, numbers, hyphens or underscores (up to 64 characters).
All IDs must be unique, including disabled instances.

Effective instance settings are **registry defaults → top-level type settings
from the preset and caller → instance props**. For example, `overrides.rings`
supplies shared ring settings, while `layers[i].props` wins for that instance.
Instances are never implicitly added: include a background if you want one.
An empty `layers: []` intentionally renders only the black canvas. Array
overrides replace the whole stack rather than merging entries by ID.

Stable IDs also namespace seeded drift and ring variation. Reordering an
instance keeps its motion; renaming it deliberately changes its random
variation. The default IDs `background` and `rings` preserve the old look.
Layer components can access `{id, type, seed}` through `useLayerInstance()`;
use `seed('channel')` with `loopNoise` or `stepRandom`, never an array index.

Stacks and generated geometry remain procedural: edit instance props or the
JSON array rather than duplicating independent Studio timeline clips. Timing and
preset defaults on the root registrations remain source-editable in Studio;
shared layer defaults live beside each layer's implementation.

## Beat patterns, accents and swing

Every layer accepts an optional `pattern`. Its `steps` array repeats over the
layer's `division`: `0` is a rest, `1` is a full accent, and values between
them are softer hits. This example uses eight eighth-note slots over one
4/4 bar, with swing on the alternate slots:

```json
{
  "preset": "neon-orbit",
  "overrides": {
    "rings": {
      "division": "1/8",
      "pattern": {"steps": [1, 0, 0.45, 0.25, 0.75, 0, 1, 0.35], "swing": 0.25}
    }
  }
}
```

Choose `swing-session` in Studio for a complete multi-instance example, or run:

```bash
npm run render:preset -- --props='{"preset":"swing-session"}'
npm run seamcheck:preset -- --props='{"preset":"swing-session","overrides":{"debug":{"enabled":true}}}'
```

Swing delays slots 1, 3, 5, … by `swing × divisionBeats` while leaving the
pair's total duration unchanged. `0` is straight; `1/3` produces a 2:1
long-short feel. The allowed range is `0 ≤ swing < 1`. Swung patterns need
an even number of slots so each repeat contains complete pairs; straight
patterns may have odd lengths, including patterns for odd meters.

The full pattern (`steps.length × divisionBeats`) must fit a whole number of
times inside the loop. Enabled instances validate this independently, with
errors identifying the instance. Empty arrays, nonfinite strengths, values
outside 0–1, and invalid swing values are rejected. An all-zero array is a
valid silent rhythm.

Rests skip new pulses and ring births; existing tails keep moving. Strength
scales background pulse intensity, ring opacity and the core pulse. In
pattern mode, full-strength rings use `accentColor`; softer rings use `color`.
`accentEvery` continues to control colors only in fixed-division mode. Ring
`lifeSteps` counts base divisions rather than active hits, so rests and swing
do not stretch a ring's lifetime. Overlapping tails, including tails longer
than the loop, are rebuilt from wrapped hit ages on every frame.

`offsetBeats` shifts the complete rhythm. Each instance can author its own
pattern in `layers[i].props`, inherit its type's pattern, or set `pattern: null`
to clear that inheritance and return to the fixed division. Pattern objects
replace as a whole when overridden; their `steps` arrays do not merge. Omit
the field (or use `null`) to retain the original fixed-grid rendering.

Reusable `syncopated`, `backbeat` and `shuffle` examples are exported as
`beatPatterns` from `src/beat/patterns.ts`. The optional debug overlay displays
each enabled instance's strengths, rests and swing amount. Generated pattern
controls remain part of composition props, including the JSON editor.

## Shared modulation

Every registered instance can optionally map beat envelopes, LFOs and looping
noise to scale, rotation, color and displacement. Choose `modulation-orbit` in
Studio for a complete example. A compact custom configuration looks like:

```json
{
  "preset": "neon-orbit",
  "overrides": {
    "rings": {
      "offsetBeats": 0.5,
      "modulation": {
        "scale": {"signal": {"type": "beat"}, "range": [1, 1.15]},
        "rotation": {"signal": {"type": "lfo", "cycles": 2}, "range": [-15, 15]},
        "color": {
          "signal": [{"type": "beat", "weight": 0.3}, {"type": "noise", "channel": "tint", "weight": 0.7}],
          "range": ["#61d8ff", "#ff80c8"]
        },
        "displacement": {
          "x": {"signal": {"type": "noise", "channel": "x"}, "range": [-60, 60]},
          "y": {"signal": {"type": "lfo", "cycles": 1}, "range": [-40, 40]}
        }
      }
    }
  }
}
```

| Source | Behavior and optional controls |
| --- | --- |
| `beat` | Inherits the layer's division, offset and pattern. Optional `division`, `offsetBeats`, `pattern`, `attack`, `decay`, `curve` override them. `pattern: null` selects the fixed grid. Envelope defaults: attack 0, decay 0.6, curve 2. |
| `lfo` | Whole `cycles` per complete loop (default 1), `shape` (sine, triangle, saw, square), and `phaseOffset` in cycles. Zero cycles holds a constant. Saw/square waves intentionally jump. |
| `noise` | Circular looping noise with optional `channel` (default `noise`), `radius` (default 1), and `z` (default 0). Channels are namespaced by stable instance ID. Use different channel names for independent axes. |

All signals are normalized to 0–1. LFO/noise values map from their native
−1…1 range and clamp at the endpoints; noise naturally need not reach both
extremes. A `signal` can be one source or a nonempty array of sources. Arrays
use a weighted mean, with each `weight` defaulting to 1. Weights must be
finite and nonnegative. Weight zero removes a source from the mix; all-zero
weights produce zero, which maps to the first output endpoint.

| Target | Output units and effect |
| --- | --- |
| `scale` | Nonnegative multiplier range; scales the entire layer about its center |
| `rotation` | Degree range; rotates the entire layer about its center |
| `color` | Two CSS colors; replaces the background's center glow or the rings' current strokes and core fill |
| `displacement.x`, `displacement.y` | Pixel ranges; shifts the entire layer along each axis |

Numeric ranges can run in either direction. Geometry applies as centered
scale/rotation followed by displacement in composition pixels, inside the
layer's existing opacity/blend wrapper. Color changes apply to all living
rings at the current frame; rhythmic strengths still affect their opacity.
An explicit mapped color takes precedence over the layer's normal pulse or
accent palette. Include a beat source in the mix if that color should pulse.

Omitted mappings are neutral: scale 1, rotation 0, no color override, and zero
displacement. `modulation: null` clears inherited modulation; `{}` is also a
neutral mapping. A supplied modulation object replaces its inherited object
as a whole, rather than merging individual targets. Source patterns and
divisions must fit the loop just like layer rhythms; errors identify the
instance, target and source. Zero-weight sources skip musical checks, while
structural schema constraints always apply. Disabled instances skip musical
checks entirely.

For custom layer properties, `src/beat/modulation.ts` exports `beatSignal`,
`sampleSignal`, `mapRange`, `mapColor`, `modulateNumber`, `modulateColor`,
`modulateDisplacement` and `resolveModulation`. Pass a context containing the
`time` returned by `useBeat()`, the instance's `seed` function, and the layer's
division, offset and pattern. Helpers are pure and do not introduce a clock.
The shared `LayerModulation` wrapper already applies geometry; layers use
`useLayerModulation().color` to paint the mapped color. Do not apply the same
transform a second time inside the component. Background and Rings are the
working examples.

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
3. **No `Math.random()`.** Use `stepRandom(seed, step.index)` or a pattern event's full-loop `index`. Preserve slot identities across rests; never renumber only the active hits.
4. **LFOs use whole cycles per loop.** `lfo(loopPhase, cycles)` rejects fractional or negative cycles. Zero holds a constant. Saw/square waves have intentional discontinuities.
5. **Noise must loop.** Use `loopNoise(seed, loopPhase, radius)`, which samples 3D noise around a circle.
6. **Divisions and patterns must fit the loop.** "4 bars" in a 2-bar loop is rejected for an enabled layer. A pattern's complete cycle must also repeat evenly. The pure helpers reject incompatible settings too.
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

Pattern helpers in `src/beat/patterns.ts`:

| Function | Use |
| --- | --- |
| `patternHits(pattern, stepBeats, totalBeats, offsetBeats)` | Active hits with stable slot indices, strengths and swung beat positions |
| `patternEvents(beat, stepBeats, totalBeats, pattern, offsetBeats, lifeBeats)` | Living events and wrapped ages, including prior loop generations |
| `patternPulse(beat, stepBeats, totalBeats, pattern, offsetBeats, options)` | Strength-weighted pulse; overlapping envelopes combine by maximum |
| `patternIssues(pattern, stepBeats, totalBeats)` | Field-specific pattern compatibility checks |

## Adding a layer

1. **Define** – in `src/layers/MyLayer.tsx`, extend `baseLayerSchema` from `layers/base.ts`, build a component using `useBeat()`, and export a `defineLayer` definition with its schema, defaults and component. Use `Background.tsx` as the template. Keep defaults in the definition, rather than attaching defaults to individual schema fields, so partial preset overrides stay sparse.
2. **Register** – import the definition in `src/layers/registry.ts` and add one entry to `layerRegistry`. Place it at its default z-position. Use `enabled: false` for opt-in effects to preserve existing presets. No edits to Root, LoopComposition, global validation or debug division lists are needed.
3. **Constrain and test** – standard division validation is automatic and runs independently for every instance. For additional musical constraints, add `validate(props, timing)` to the definition, returning messages such as `['radius: exceeds the supported range']`. Disabled instances skip these extra checks; schema constraints always apply. Use `useLayerInstance().seed` to namespace random channels, then add fixtures and run `npm run check` and `npm run test:visual`.

Every layer gets `enabled`, `opacity`, `blendMode`, `division`, and `offsetBeats` for free. Per-layer offsets are what make a stack feel composed instead of everything hitting at once.
The shared schema also exposes `pattern`, but a new layer must explicitly
consume `patternPulse` or `patternEvents` to respond to it. Background and
Rings demonstrate both approaches; the registry supplies validation.
Shared modulation geometry is automatic for registered layers. Consume
`useLayerModulation().color` if the new layer supports the shared color target.

## Loop verification

`npm run check` runs fast checks without a browser. `npm run test:visual`
bundles the real project, launches Remotion's bundled browser (downloaded on
first use if needed), and renders PNGs at 20% scale. Artifacts remain in
`out/loop-tests/` for inspection; temporary bundles are removed after testing.

Rendered fixtures cover offset hits, tails longer than the loop, odd meter,
rounded tempo, 60fps, clean exports, malformed CLI props, and SeamCheck's
mapping to the actual boundary frames. They also exercise each named preset,
partial overrides, invalid selections and actual layer stacking order.
Multi-instance checks verify independent colors, timing and blend modes,
stable motion after reordering, duplicate-ID rejection, and legacy pixel
equivalence when expressed as explicit instances.
Rhythm fixtures check rests, visible accent strength, the exact frame of a
triplet swing onset, silent rings, and swung tails spanning multiple loops.
Modulation checks cover normalized sources, weighted mixes, output ranges,
real rendered transforms/colors, source validation, identity after reorder,
neutral overrides, and seam continuity of the combined preset.
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
    patterns.ts         rhythm schema, reusable patterns, hit schedules and envelopes
    divisions.ts        shared beat divisions and their schema (re-exported by envelopes)
    modulation.ts       normalized sources, weighted mixes, target mappings and validation
  layers/
    base.ts             shared layer controls
    definition.ts       defineLayer: defaults, renderer, validation contract
    registry.ts         register once; derive schema, order and configured layers
    InstanceContext.tsx stable IDs and per-instance random seed channels
    LayerModulation.tsx shared transforms and evaluated color context
    Layer.tsx           enabled / opacity / blend wrapper
    Background.tsx      gradient component + schema + defaults
    Rings.tsx           wrapped rings + schema + defaults
    BeatDebug.tsx       optional grid overlay + timing diagnostics
```
