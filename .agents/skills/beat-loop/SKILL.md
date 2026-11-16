---
name: beat-loop
description: Implement and validate beat-locked timing, envelopes, layers, Clip and Type behavior in remotion-lab. Engine reference for sketch work; use brief-to-sketch for creative interpretation and visual review.
---

# Beat-locked loops

Read README.md and AGENTS.md at the repository root. Use the official
`remotion-best-practices` skill alongside this project-specific guidance.

For creative briefs, use [brief-to-sketch](../brief-to-sketch/SKILL.md) for
interpretation and visual review; this skill owns engine rules and API recipes.

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

## Rhythms

`pattern: {steps: number[], swing?: number}` repeats strengths over the
layer's `division`. Zero is a rest, one is a full accent, and intermediate
values are softer hits. `pattern: null` clears an inherited pattern; omission
preserves the original fixed division. Each instance can supply its own
pattern. Pattern objects and arrays replace as a whole when overridden.

Use `patternPulse(beat, stepBeats, totalBeats, pattern, offsetBeats, options)`
for intensity and `patternEvents(beat, stepBeats, totalBeats, pattern,
offsetBeats, lifeBeats)` for living objects. Both derive history solely from
beat position. Rests skip births without truncating previous tails; event
lifetimes are measured in beats, not the number of active hits. Long tails
include prior loop generations. Seed randomness from `event.index`, which
retains the full-loop slot index across rests, and namespace by instance ID.

Swing delays odd slots by a fraction of a division and preserves pair length.
Zero is straight; 1/3 yields a 2:1 feel. Values must be finite and in [0, 1).
Nonzero swing requires even slot counts. Straight odd-length patterns work
when their total duration fits evenly inside the loop. The registry validates
complete pattern duration and pairing for every enabled instance; structural
constraints apply even when disabled. All-rest patterns are valid.

Background weights its pulse by strength. Rings weight opacity and core pulse,
use accentColor for strength 1, and retain accentEvery only for fixed-grid mode.
Ring lifeSteps remains a count of base divisions. New layers must explicitly
consume the rhythm helpers; adding the shared schema field alone is insufficient.
Preserve legacy output when pattern is absent or null.

`beatPatterns` in `src/beat/patterns.ts` exports reusable examples. The
`swing-session` preset demonstrates independent shuffle and backbeat layers;
BeatDebug lists strengths and swing amounts. Test zero-strength silence,
weighted accents, exact onsets for fractional swing, negative offsets, stable
identity, odd meters, loop compatibility, and tails through rests and seams.

## Shared modulation

`modulation` optionally maps a normalized `signal` to a target `range`.
Signals are beat envelopes, integer-cycle LFOs or circular looping noise;
arrays combine them by weighted mean. Weights default to one, must be finite
and nonnegative, and zero removes a source. An all-zero mix yields zero,
which maps to the first output endpoint, not necessarily a neutral transform.
LFO/noise values normalize from -1..1 to 0..1. Saw/square jumps are intentional.

Targets are scale (nonnegative multipliers), rotation (degrees), color (two
CSS colors), and displacement.x/y (pixels). Numeric endpoints may reverse.
Omitted targets are neutral; omitted/null modulation preserves old rendering.
A supplied modulation object replaces the inherited object as a whole.

Use `sampleSignal`, `mapRange`, `mapColor`, `modulateNumber`, `modulateColor`,
`modulateDisplacement` and `resolveModulation` from `src/beat/modulation.ts`.
The context contains existing `useBeat()` state as `time`, the instance's
`seed`, and its division/offset/pattern. No additional clock or frame state.
`beatSignal` also centralizes the normal background/core beat envelopes.

Beat sources inherit the resolved layer rhythm unless division, offset or
pattern is explicitly overridden; null pattern selects the fixed grid.
Attack/decay use division units; curve must be positive. LFO cycles are whole
and nonnegative, phaseOffset is in cycles. Noise channels use stable instance
IDs; different channel strings make axes independent. Source compatibility
is checked per target and instance. Zero-weight sources skip musical checks;
all structural constraints remain active. Disabled instances skip musical
checks. Keep new sources wired into both sampling and validation.

`LayerModulation` applies centered scale/rotation and composition-pixel
translation inside the existing layer blend wrapper. Do not apply those
transforms again in the layer. Read `useLayerModulation().color` for paint:
Background replaces its center glow, Rings replace current strokes/core.
Color mappings override the normal pulse/accent palette; strengths continue
to control intensity/opacity. New layers must explicitly consume mapped color.

`modulation-orbit` demonstrates all sources and targets. Test normalized
ranges, weighted mixing, source rhythm inheritance, per-instance isolation,
reorder-stable seeds, neutral output, actual rendered target effects, and
seam continuity. Preserve deliberate source-editable preset defaults instead
of assuming every composition starts with the same selection.

## Sketches

A sketch is the unit for a new idea: `src/sketches/<id>/` with `brief.md` and
`sketch.tsx`. Start with `npm run sketch:new -- <id> ["Title"]`, which also
registers it in `src/sketches/index.ts`. Use `src/sketches/pulse-grid` as the
structural reference. Do not add a registry layer, preset or Root entry for a
sketch.

1. If the idea uses GIFs, video or fonts, read the collection first; see
   "Asset collections" below. Design from what the manifest and filmstrips
   show, not from file names.
2. Write the brief: idea, rhythm, look, assets, notes. Under Assets, name each
   clip and font with the facts that shaped the design (frame count, alpha,
   whether it loops). Keep the brief current when the design changes, so the
   sketch can be rebuilt or forked from it.
3. Declare only the sketch's own params in `schema`, with complete `defaults`.
   Timing, `canvas`, `customSize`, `transparent`, `variant` and `debug` are
   supplied and reserved. Override starting tempo or canvas with `timing` and
   `canvas` on the definition.
4. Build the component from `useBeat()` and the helpers in `src/beat`. Read
   sizes from `useCanvas()` and express them in `vmin` or canvas fractions.
   Seed with `useSketch().seed('channel')`; choose per-item identity from a
   wrapped step or event index plus a stable item number, never render order.
   A delay is an `offsetBeats` on a wrapped grid, never a subtraction that can
   go negative or a clamp that drops events near the seam.
5. Return field-prefixed messages from `validate(props, timing)` for every
   division, pattern or cycle count the sketch exposes. `divisionIssues` covers
   divisions; `patternIssues` covers patterns.
6. Reuse registered layers with `<UseLayer id type props />`. Rings measures
   in literal pixels, so prefer it only on the portrait canvas.
7. Run `npm run preview -- <id>` and read `out/preview/<id>/sheet.png`. The
   top row is on the beat, the middle row half a beat later, the bottom row
   crosses the loop point at the red line. Labels are frame (`F`) and beat
   (`B`). Judge it against the brief: composition, legibility at phone size,
   whether hits read as hits, and whether the seam row looks like any other
   three consecutive frames. Iterate before reporting.
8. Preview one more canvas (`--props='{"canvas":"landscape"}'`), then run
   `npm run check`. `npm run test:visual` applies determinism and seam checks
   to every registered sketch automatically; add sketch-specific tests only
   for behavior those do not cover.

The seam check is a heuristic. A hit that lands exactly on beat 0 is an
intended jump and is compared with interior hits; anything larger is a
warning. Determinism failures are always defects.

## Asset collections

Media lives in `public/assets/<collection>/` and is gitignored. Its committed
description is `collections/<collection>/manifest.json` with one filmstrip
per clip in `filmstrips/`. `npm run assets:scan [-- <collection>]` writes
both and regenerates `collections/index.ts`. README.md documents every field.

Before designing with a collection:

1. Read the manifest. Collection, clip and font entries carry a hand-written
   `description` and `tags`; start there, then the measurements.
2. Open the filmstrip (`filmstrip.file`, relative to the manifest) of every
   clip you might use. Cells are labelled with their source frame;
   `filmstrip.frames` lists the same numbers. A checkerboard is transparency.
3. Decide from the facts. `hasAlpha` clips can overlay other layers; opaque
   ones are backdrops or need a blend mode. `loop.seamless` clips can cycle;
   others should be retriggered on a hit or played once per loop, with the
   cut placed on a beat. The flag compares the seam with an ordinary step
   across the whole clip; it says nothing about hard cuts inside the clip,
   so look at the filmstrip and description too. `frameCount` against the number of rendered frames
   per cycle tells you whether a clip will look smooth or stepped. `width`
   and `height` tell you which canvases it fills without heavy cropping.
4. For fonts, check `faces` for the weights and styles that exist, `axes` for
   variable ranges, and `missingAscii` before choosing the words.

After a scan adds entries, write their `description` and `tags` from the
filmstrips. Edit nothing else in a manifest; re-scanning keeps those two
fields and rewrites the rest.

In a sketch:

- `clip('collection', 'path/in/collection.gif')` and `font('collection',
  'Family Name')` from `src/assets` return the manifest entry. Create them at
  module level and list them in `defineSketch({assets: [...]})`, or use
  `assets: (props) => [...]` when a param selects one.
- `useAsset(ref)` in the component adds `src` to a clip and `fontFamily` to a
  font. It throws for an asset that was not declared.
- Prefer `<Clip>` from `src/assets/Clip.tsx` for named playback. From a brief:
  “one wobble per bar” → `fit`, `duration: {bars: 1}` (or `{beats: n}`);
  “restart on selected hits” → `retrigger`, division/pattern and durationBeats;
  “stop-motion” → `step`, integer jump; “rock/wander through footage” →
  `scrub`, a normalized signal from the existing modulation helpers.
- Expose `clipPlaybackSchema` in the sketch schema. Declare every binding in
  `defineSketch({clips: p => [{clip: ref, playback: p.playback, field: 'playback'}]})`.
  This runs `clipPlaybackIssues` in both metadata paths before rendering, including
  when timing or pattern controls change. Keep the asset in `assets` as well.
  Custom frame logic can call `clipPlaybackIssues` from validate; a hook cannot
  provide pre-render metadata validation by itself.
- Fit requires a whole number of plays per loop; bars use the current meter.
  Retrigger and step require complete rhythm/pattern cycles, including swing
  pairs. Retrigger reads the youngest active pattern event, not the current
  slot: rests never restart, the last hit carries across the seam, playback
  runs once in durationBeats then holds. All-rest hit modes are invisible.
- Step counts active hits, not rest slots. Hit ordinal zero shows startFrame
  (default zero); each subsequent hit adds jump (default one, negatives allowed).
  Active hits × jump must be a multiple of the source cycle length. Choose
  `seam: 'wrap'` only for a deliberate reset at the first active slot of the shifted rhythm each loop.
  Ping-pong uses 2×(frameCount−1) steps, or one for a still, so closure can
  be more restrictive than forward playback.
- Read `loop.seamless`. Non-looping forward fit/step require `cut: 'allow'`;
  `direction: 'ping-pong'` avoids their endpoint cut. Fit also supports
  `cut: 'fade'`, a sine-squared opacity envelope at cycle joins. Retrigger
  requires fade or allow even for seamless media because a new hit can
  interrupt anywhere. Its fade reaches zero at the previous/next active hit,
  including across rests, swing and the seam. Ping-pong retrigger returns to
  zero then holds but does not hide early interruption. No option repairs
  cuts inside the source footage; inspect filmstrips and document intentional cuts.
- Scrub samples existing weighted modulation signals and maps 0..1 to
  0..last source frame. One selects the last frame, never wraps to zero.
  Sine/triangle/looping noise avoid endpoint cuts; beat envelopes and saw/square
  jumps require `cut: 'allow'`. Shared source validation rejects partial LFO
  cycles and incompatible beat patterns. Distinct stable channel props seed
  independent noise; no random values, effects or callbacks that update state.
- Clip's x/y/width/height are canvas fractions (defaults 0/0/1/1). Derive
  square boxes from useCanvas().vmin and divide by width/height; fitting is
  contain, cover or fill. All source frames receive equal musical time even
  for variable-delay GIFs; ClipFrame handles exact media addressing.
- `useClipPlayback(ref, playback, channel)` returns frame, age, opacity and the
  latest hit strength. Clip's style function receives the same sample for
  accent-driven paint/transforms. Clip multiplies style opacity by its fade.
  Keep Clip at sketch level until a second sketch needs a registered layer.
  `clip-duet` is the real-media fit/retrigger reference; fixture rendered tests
  verify all modes without public media. For custom selection use ClipFrame,
  sourceFrameIndex and explicit sketch validation; do not duplicate flooring.
- Never render `<AnimatedImage>`, `<Video>` or `<Gif>` directly in a sketch.
  They read Remotion's frame clock, which breaks the loop rules. `ClipFrame`
  freezes that clock at the frame you ask for. It also hides a difference
  between the two players: a GIF is addressed by a frame's start time and a
  video by its middle (`clipFrameTime` in `src/assets`).
- Use `type.fontFamily` from `useAsset`, not the bare family name: fonts are
  registered under a collection-scoped name so a missing font can never be
  silently replaced by one installed on the machine. Faces load before the
  component mounts. Animate variable axes with `fontVariationSettings`.

Declared assets are checked before rendering. "public/assets/… is missing"
means the collection is not on this machine; say so, and do not substitute
other media. `npm run test:visual` skips the loop checks of such a sketch.
`tests/visual/assets-entry.tsx` is a complete small example, and
`src/sketches/sticker-slap` is a sketch built on a real collection.

## Kinetic Type

Use `Type` from `src/type/Type.tsx` inside a sketch; keep it outside the registry
until a second sketch needs a layer. Read the chosen font's manifest first.
Declare it in assets and bind settings with `defineSketch({types: p =>
[{font: ref, settings: p.title, field: 'title'}]})`. Expose `typeSettingsSchema`
in the sketch schema. Both metadata paths validate before rendering; a hook
cannot provide that guarantee alone. `typeIssues` is available for custom checks.

Choose from the brief:

- “Hit the whole title”: split line, mode all.
- “One word/letter per hit”: split word/letter, mode sequence.
- “Traveling ripple”: mode stagger, staggerBeats in beats (default .25).
- “Breathe the weight/width”: axes mappings keyed by manifest tags, each with
  a normalized modulation signal and a range inside the selected face.

Settings require text/split/mode/division. Optional pattern, offsetBeats and
attack/decay/curve use the existing helpers; attack/decay are division units.
Whitespace preserves space but consumes no hit or stagger position. Repeated
text has source-position IDs. Sequence counts active hits, including accents
but excluding rests, and requires a whole number of visible-unit rounds in
one loop. Stagger offsets wrap, including negatives; never clamp delayed units
away near the seam. Long tails retain their unit identity across rests/joins.
All-rest patterns produce zero energy. Unit styles receive energy, strength,
age, axes and unit identity for scale/opacity/position/color/blur.

Axis signals use the shared weighted mix, LFO and circular noise rules.
Inherited beat sources follow sequence assignment or stagger offsets. Explicit
source rhythms retain shared override semantics. Sequence inheritance expands
to a full-loop pattern, so a different source division may need an explicit
compatible pattern. Bindings check these constraints too. Use distinct stable
channel names for separate Type blocks. Ranges may reverse but cannot exceed
the selected face. Missing axes or weight/style faces fail; do not synthesize.

Box x/y/width/height are canvas fractions; maximum fontSize is vmin. Explicit
newlines define lines. Remotion measureText plus SVG ink bounds account for
advances, overhangs and tall glyphs only after the collection font is loaded.
Pure fitType shrinks to both width and height. Default-axis measurements fix
line breaks and unit slots for the loop. Current glyphs are contained with
SVG aspect fitting, shrinking inside their slots if wider/taller; neighbors
never move. This can reduce apparent size on a wide axis. There is no reflow
mode. Keep effects within generous box margins; the outer box clips effects.

Coverage is deliberately printable ASCII plus newlines: missingAscii is the
only coverage evidence in today's manifests. Name unsupported characters in
validation rather than using fallback. No rich text, automatic line wrapping,
joined scripts, custom tracking/leading, kerning, ligatures or optical sizing
in this version. Keep generated units procedural and edit props in Studio.
Use type-beat as the real-font example; Lab Block fixtures verify variable
weight while the real collection only contains static BBH Bogle. Check both
canvas contact sheets for phone-size legibility and inspect seam neighbors.

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

## Layer instances

A supplied `layers: [{id, type, props?}]` array replaces the legacy stack.
Array order is z-order; `[]` intentionally leaves a black canvas. Each entry
uses a registry-generated discriminated schema, so props are partial but
specific to that type. IDs must be globally unique, including disabled
instances, and stable across frames and reorderings. Allowed IDs begin with
a letter and contain letters, digits, hyphens or underscores (max 64 chars).

Effective settings are registry defaults, then the resolved top-level type
settings, then the instance's own props. Type-level preset overrides can
supply shared defaults; explicitly authored instance fields win. Preset array
overrides replace the whole array, without merging by ID. Include a background
entry when needed; instances are not implicitly added.

When `layers` is omitted, the original singleton stack and `layerOrder` still
work. Explicit instances ignore `layerOrder`; their array supplies the order.
Root selector/timing defaults stay inline. Layer defaults live in definitions.
Stacks remain procedural and are edited through props rather than independent
Studio timeline clips.

Use `{id, type, seed}` from `useLayerInstance()` for instance-aware layers.
Pass `seed('channel')` to random/noise helpers; never seed from array position.
Legacy instances use their type as their ID and retain old seed strings;
new IDs get independent channels. Renaming an ID deliberately changes its
random variation. The Rings implementation is the working example.

Test repeated layers for independently resolved fields, duplicate-ID errors,
per-instance musical validation, default isolation, reorder-stable motion,
rendered color/timing/blend differences, and continuity through the seam.
The `prism-stack` preset demonstrates three independent ring instances.

## Named presets

Add a title, description and partial overrides to `loopPresets` in
`src/presets.ts`. The selector and `npm run presets` derive from its keys;
there is no per-preset root registration. All presets resolve through the
same validation used by the direct loop compositions.

`PresetLoop` and `PresetSeamCheck` accept `{preset, overrides}`. Resolution is
registry defaults, then saved preset, then caller overrides. Layer fields
merge individually; arrays (including `layers`) replace wholesale. Unknown override fields fail.
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

## Export

`npm run export -- <id> [--props] [--profile=social|prores|webm|downstream|all]
[--canvas=a,b] [--repeat=n] [--tag=x]` writes `out/export/<id>/<id>_<canvas>_<bpm>bpm[_xN][_tag].<ext>`
and `<file>.json`. The sidecar's `effectiveBpm`, `loopFrameCount` and
`loopDurationSeconds` are what downstream tools sync to. README "Exporting"
documents fields and the transparent-format caveats.

One loop is encoded once and repeats are stream copies, so joins are the loop
point itself. Never extend a composition's duration to repeat it. Only whole
loops export: seam views and compositions whose length differs from their
tempo's loop are refused. Missing collection media fails before bundling.

Alpha profiles switch on `transparent`, which removes only the shell's black
fill. A sketch that paints its own backdrop exports opaque; the exporter says
so and records `alphaSample`. For a compositing sketch, branch on
`props.transparent` and skip the backdrop. WebM alpha needs `-c:v libvpx-vp9`
to decode with ffmpeg. After changing export code run `npm run test:export`.
