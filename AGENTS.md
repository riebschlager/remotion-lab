# Working in remotion-lab

Start with README.md. This is a beat-locked, deterministic animation platform;
the musical clock and periodic behavior are its core contract.

- Read `.agents/skills/remotion-best-practices/SKILL.md` for Remotion work and
  `.agents/skills/beat-loop/SKILL.md` for timing, envelopes or layers. Load only
  relevant upstream references. The project's beat clock specializes Remotion's
  frame-driven animation guidance: layers use `useBeat()`; only `BeatProvider`
  calls `useCurrentFrame()`.
- Frames may render in any order. No wall clocks, accumulated state, unseeded
  randomness, CSS animations or transitions. Use the beat helpers.
- Validate resolved props through `validateLoopProps` in both metadata paths.
  Add cross-field checks for new timing-dependent parameters. Disabled layers
  do not participate in division compatibility checks.
- Keep final defaults free of diagnostics. Enable `debug` explicitly for
  inspection. Keep authored composition selector/timing defaults inline so
  Studio can save edits. Layer defaults belong in `defineLayer`; the direct
  compositions also need literal snapshots for Studio's nested controls. Keep
  those snapshots aligned with the registry via `tests/studio-defaults.test.ts`.
- Run `npm run check` after changes. For rendered motion or timing changes,
  also run `npm run test:visual`; inspect Studio for aesthetic changes.
  `npm run seamcheck` is a manual diagnostic, not an automated pass/fail test.
- Official skills and `skills-lock.json` are checked in. Use
  `npm run skills:update` deliberately, review the diff, then run
  `npm run skills:check`. Keep upstream skills intact; put local conventions
  in the beat-loop skill.

For a creative brief or creative revision, use the local
`.agents/skills/brief-to-sketch/SKILL.md` for interpretation, asset selection,
visual hierarchy and critical preview review. Keep engine/API rules in beat-loop.
Preserve supplied copy, tempo and required assets; infer ordinary design choices.
Record the original request and assumptions in brief.md before implementation.
Inspect both canvas sheets against the brief and fix aesthetic defects even when
technical checks pass. Do not equate a PASS label with a finished design.

New animation ideas start as sketches, not registry layers. Run
`npm run sketch:new -- <id>`, write `src/sketches/<id>/brief.md`, and build
`sketch.tsx` around `defineSketch`. Keep everything the sketch needs inside
its folder; do not edit the registry, shared schema, presets or Root for one.
Sketch components use `useBeat()`, `useCanvas()` and `useSketch().seed()`.
Size in `vmin` or canvas fractions, never literal pixels, so every canvas
works. Shared control names (timing, `canvas`, `customSize`, `transparent`,
`variant`, `debug`) are reserved. Validate musical params in the definition's
`validate`. Then run `npm run preview -- <id>`, open
`out/preview/<id>/sheet.png`, and compare it with the brief: fix a determinism
failure always, and treat a seam warning as a defect unless the seam row
shows an intended hit. Check at least one other canvas with
`--props='{"canvas":"landscape"}'`. Promote code to a registered layer only
when a second sketch needs it.

GIFs, video clips and fonts come from asset collections. The media is in
`public/assets/<collection>/` and is not in git; you cannot watch it. Before
designing a sketch that uses a collection, read
`collections/<collection>/manifest.json` (frame counts, native fps, size,
alpha, whether a clip loops on its own, font weights, axes and missing
characters, plus hand-written descriptions and tags) and open the filmstrip
image of each clip you are considering. Choose clips from that evidence, and
name them in the brief. In code, get references with `clip()` and `font()`
from `src/assets`, list every one in `defineSketch({assets})`, and read them
with `useAsset()`. Draw clips with `<Clip>` or `<ClipFrame>`, with `frame` derived
from `useBeat()`; never place `<AnimatedImage>` or `<Video>` directly, because
they follow the frame clock. Use the returned `fontFamily` for type. If the
user adds or changes media, run `npm run assets:scan`, then fill in
`description` and `tags` for the new entries from their filmstrips; those two
fields are the only ones to edit by hand, and `collections/` is committed.
If a sketch fails with "is missing … Collection media is not in git", the
files are not on this machine: report that instead of working around it.

New layers own their schema, defaults, component and optional extra validator
in one module. Add the exported definition to `src/layers/registry.ts`;
schema fields, rendering, validation and debug divisions derive from it.
Use disabled defaults for opt-in layers so existing presets keep their look.
Add named looks in `src/presets.ts`; overrides merge individual layer fields.
For repeated types, use `layers: [{id, type, props?}]`. Array order is z-order;
IDs must be unique and stable. Instance props inherit the top-level settings
for their type, then override individual fields. A supplied `layers` array
replaces the legacy stack (including `[]`); `layerOrder` applies only when
`layers` is omitted. Preset array overrides replace the complete array.
Namespace randomness with `useLayerInstance().seed('channel')`, never an array
index, so reordering preserves motion. All enabled instances receive shared
and local musical validation. Edit these procedural stacks through props
rather than authoring independent timeline clips.
Layers can use `pattern: {steps, swing?}` (0 = rest, 1 = accent) or `null` for
the fixed division. Use `patternPulse` for modulation and `patternEvents` for
living objects. Keep event indices tied to full-loop slots, and measure tails
in beats, so rests do not reset them. Complete pattern cycles must fit the
loop; nonzero swing requires even slot counts and delays odd slots without
changing pair duration. The shared validator handles these constraints.
When adding a layer, explicitly consume its pattern; schema exposure alone
does not make rendering rhythm-aware. Preserve the legacy path when omitted.
Shared `modulation` maps normalized beat/LFO/noise sources to visual targets;
source arrays use a weighted mean, not an unbounded sum. Use the pure helpers
in `src/beat/modulation.ts` with the existing beat state and instance seed.
`LayerModulation` applies scale, rotation and pixel displacement automatically;
consume `useLayerModulation().color` for layer-specific paint. Do not apply
geometry twice. Beat sources inherit the instance rhythm unless overridden;
their divisions and patterns receive shared validation too. Keep whole-cycle
LFOs and stable noise channels. Omission/null must preserve legacy rendering.
See the beat-loop skill for details and add appropriate loop tests.

Beat-driven media uses `Clip` from `src/assets/Clip.tsx`. Choose `fit` for a
whole clip per N beats/bars, `retrigger` for selected hits (rests keep playing,
then hold), `step` for frame jumps, or `scrub` for a normalized modulation
signal. Use `clipPlaybackSchema` in sketch props and declare the same settings
in `defineSketch({clips: props => [{clip, playback, field}]})` so both metadata
paths reject incompatible settings before rendering. Keep assets declared too.
Fit duration must divide the loop. Step active hits × jump must close whole
source cycles (ping-pong uses 2×(frames−1)), unless `seam: 'wrap'` deliberately
resets. Grid/pattern/swing and scrub sources use shared musical validation.
Non-looping forward fit/step need explicit `cut: 'allow'`, or ping-pong;
fit/retrigger offer `cut: 'fade'` to hide resets. Retrigger always chooses fade
or allow because even seamless media can be interrupted. Scrub beat/saw/square
jumps require allow; smooth signals address 0..last without wrapping at 1.
Read README's mode table and cut rules before choosing from a brief. Use
`useClipPlayback` or Clip's style function for latest accent strength. Box
coordinates are canvas fractions; derive square sizes from useCanvas().vmin.
Clip remains a sketch building block until a second sketch needs a registry layer.

Kinetic typography uses `Type` from `src/type/Type.tsx`, kept at sketch level.
Read font faces/axes/missingAscii first. Use `typeSettingsSchema` and declare
`defineSketch({types: p => [{font, settings: p.title, field: 'title'}]})` plus
assets, so both metadata paths validate coverage, one actual face and musical
compatibility. Text supports printable ASCII plus explicit newlines; name
unsupported characters instead of silently falling back. Box coordinates are
canvas fractions, maximum fontSize is vmin, and fitting shrinks in both axes.
Choose split line/word/letter and mode all/sequence/stagger from the brief.
Sequence assigns only active hits and requires whole visible-unit rounds per
loop. Whitespace consumes no hit. Stagger uses wrapped per-unit offsets.
Map unitStyle's energy to paint/transforms; leave space for effects in the box.
Axis ranges must stay within the selected face. Inherited beat signals follow
unit assignment/offsets; sources with explicit rhythms use shared modulation
rules. Measurement runs only after font loading. Layout slots use default
axes and stay fixed; current glyphs shrink into their slots as needed, never
reflow. See README for fitting tradeoffs and current typography limitations.
