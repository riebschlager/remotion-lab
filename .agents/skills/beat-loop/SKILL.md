---
name: beat-loop
description: Add or change beat-locked layers, timing, envelopes, configuration validation and loop checks in remotion-lab.
---

# Beat-locked loops

Read README.md and AGENTS.md at the repository root. Use the official
`remotion-best-practices` skill alongside this project-specific guidance.

## Clock and continuity

`src/beat/timing.ts` converts frames to a wrapped loop phase. Layers consume
`useBeat()` from `src/beat/BeatContext.tsx`, including when using Remotion
interpolation helpers. Do not introduce another frame clock in layers.

Build hits from `step(beat, divisionBeats(division, beatsPerBar), totalBeats,
offsetBeats)`. Divisions must fit the loop; offsets may wrap either way. Use
the wrapped step index with `stepRandom` so identity survives the seam. Use
`loopNoise` for continuous drift and whole cycles for LFOs. Zero LFO cycles
hold a constant; saw/square wave jumps and beat attacks are intentional.

A wrapped clock guarantees repetition, not smoothness. Check values and motion
immediately before and after resets. `decaySince` supports a single hit with a
positive tail no longer than the loop. For longer lifetimes, render overlapping
event generations with wrapped birth identities, following `src/layers/Rings.tsx`;
do not clamp away older living events.

Visual timing rounds duration to whole frames and reports effective BPM in
debug mode. Exact timing rejects rounding. Even an exact loop can have beats
between frames; do not promise sample-accurate audio or frame-exact onsets.

## Adding a layer

1. In `src/layers/MyLayer.tsx`, extend `baseLayerSchema` from `layers/base.ts`,
   build the component, and export `defineLayer({schema, defaults, Component,
   validate?})`. Keep defaults in the definition, not individual schema fields,
   so partial override schemas stay sparse. Use disabled defaults for opt-in
   effects to preserve existing presets.
2. Add the exported definition to `layerRegistry` in `src/layers/registry.ts`
   at its default z-position. Schema fields, default filling, rendering,
   enabled debug divisions and division validation derive from the registry;
   do not add separate lists in Root, LoopComposition or global validation.
3. For extra musical constraints, return field-prefixed messages from the
   definition's `validate(props, timing)`, e.g. `radius: exceeds the supported
   range`. Disabled layers skip musical checks; schema constraints always run.
4. Add loop fixtures and run `npm run check` and `npm run test:visual`.

The stack has one instance per registered type. `layerOrder` must include
all registered names once, including disabled layers. The stack and generated
geometry are procedural; edit through composition props rather than adding
independently editable timeline clips. Root selector/timing defaults stay
inline for Studio source editing. Layer defaults live in their definitions.

## Named presets

Add a title, description and partial overrides to `loopPresets` in
`src/presets.ts`. The selector and `npm run presets` derive from its keys;
there is no per-preset root registration. All presets resolve through the
same validation used by the direct loop compositions.

`PresetLoop` and `PresetSeamCheck` accept `{preset, overrides}`. Resolution is
registry defaults, then saved preset, then caller overrides. Layer fields
merge individually; arrays replace wholesale. Unknown override fields fail.
`BeatLoop` and `SeamCheck` retain shallow CLI merging; explicitly supplied
layer objects must be complete, while omitted layers get registry defaults.

Test named presets for valid metadata, isolation from mutations, partial
merging, clean defaults, and rendered seam motion. In Studio, optional override
fields are enabled by clearing their `<undefined>` checkbox; JSON props are
also supported. Keep user preview changes out of source unless requested.

## Verification

Unit tests cover known timing results, invalid combinations, negative frames,
wrapped event ages and continuous envelope limits. Visual tests render the
actual compositions with Remotion's bundled browser at reduced scale, compare
seam motion to neighboring motion, check intended attacks, and render frames
out of order to detect stateful behavior. Keep diagnostics off for continuity
checks. Never require last-frame/first-frame equality or treat frame N/frame 0
equality alone as evidence of smoothness.

Use Studio for aesthetic review. Render/export only within the user's requested
scope; small test renders are part of verifying requested code changes. The
visual suite is a regression check for its fixtures, not proof for all artwork.
