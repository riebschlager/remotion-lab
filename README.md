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
| `npm run sketches` | List sketches with their tempo, canvas and duration |
| `npm run sketch:new -- <id>` | Scaffold `src/sketches/<id>/` and register it |
| `npm run preview -- <id>` | Contact sheet plus determinism and seam checks → `out/preview/<id>/` |
| `npm run assets:scan` | Describe the collections in `public/assets/` → `collections/<name>/manifest.json` and filmstrips |
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

## Sketches

A sketch is one self-contained animation idea: a folder holding its brief and
its code. Sketches are where new ideas start. They use the whole beat toolkit
but do not touch the layer registry, shared schema or presets, so an
experiment cannot disturb anything else and can be deleted by removing its
folder and its line in `src/sketches/index.ts`.

```bash
npm run sketch:new -- neon-rain "Neon Rain"   # src/sketches/neon-rain/{brief.md,sketch.tsx}
npm run dev                                   # Sketches → neon-rain (and Seams → neon-rain-seam)
npm run preview -- neon-rain                  # look at out/preview/neon-rain/sheet.png
npx remotion render neon-rain out/neon-rain.mp4 --props='{"canvas":"square","bpm":128}'
```

`brief.md` records the idea, rhythm, look and assets in plain language.
`sketch.tsx` default-exports `defineSketch({id, title, description, schema,
defaults, Component, assets?, clips?, types?, validate?, timing?, canvas?, debugDivisions?})`. The `id`
must equal the folder name. `schema` and `defaults` cover only the sketch's
own params; every sketch also receives these shared controls:

| Prop | Default | Meaning |
| --- | --- | --- |
| `bpm`, `bars`, `beatsPerBar`, `fps`, `timingMode` | 120, 4, 4, 30, `visual` | Same timing rules as `BeatLoop`; duration is derived |
| `canvas` | `portrait` | `portrait` 1080×1920, `portrait-4x5` 1080×1350, `square` 1080×1080, `landscape` 1920×1080, or `custom` |
| `customSize` | – | `{width, height}` in even pixels; required for `custom` |
| `transparent` | `false` | Omit the black backdrop for alpha-capable exports |
| `variant` | `0` | Re-rolls every seeded choice without changing the design |
| `debug` | `{enabled: false}` | Beat overlay |

A sketch may change the timing and canvas defaults through `timing` and
`canvas`, but may not declare params with these names. Props are strict:
unknown or invalid fields fail before rendering with a field-specific message.

Inside a sketch component:

- `useBeat()` is still the only clock, and all seven loop rules below apply.
- `useAsset()` and `<ClipFrame>` bring in GIFs, video and fonts from a
  collection; see "Asset collections".
- `useCanvas()` returns `{width, height, vmin, vmax, cx, cy, aspect}`. Size
  everything in `vmin` (1% of the shorter side) or as fractions of the canvas,
  never literal pixels, so one sketch renders correctly on every canvas.
- `useSketch().seed('channel')` namespaces `stepRandom` and `loopNoise` by
  sketch and `variant`.
- `<UseLayer id="backdrop" type="background" props={{…}} />` drops in a
  registered layer with registry defaults and the usual validation. Rings
  sizes are literal pixels tuned for 1080×1920.
- Return extra musical checks from `validate(props, timing)`;
  `divisionIssues('division', props.division, timing)` covers the common case.

`pulse-grid` is the working example, and `sticker-slap` is the example that
uses a video, a GIF and a font from a collection. When a second sketch needs a
piece, consider promoting it to a registered layer (see "Adding a layer").

### From a creative brief

Use `$brief-to-sketch` (the local `.agents/skills/brief-to-sketch/SKILL.md`)
when you want an agent to turn an idea into a finished sketch. It reads the
collection, chooses musical and visual roles, writes the sketch brief, builds,
previews, inspects two canvases and revises before reporting. The beat-loop
skill remains the reference for engine rules and building-block APIs.

A useful brief says what the viewer should feel and notice, gives exact words
if there are any, names a collection or specific assets when they matter, and
states the canvas and things to avoid. Supply tempo/meter if they are part of
the idea; otherwise the agent can choose. Distinguish must-haves from suggestions.
You do not need to specify schema fields or playback math.

For example: “Make a spare, nocturnal loop with one warm shape floating over
indigo. I should feel a pulse without everything blinking together. No text
or media. Choose a slow tempo. Portrait first, but it must also look composed
in landscape.” For a media piece, add the collection and whether the footage
or the typography should lead. For text, provide the exact copy and say whether
it must stay readable throughout or can appear phrase by phrase.

The generated brief template records the original request, hierarchy, separate
musical roles, asset evidence and treatment, copy, canvas criteria and review
notes. A good handoff includes a Studio link, inspected contact sheets, reasons
for the choices, verification results and any limitations. A preview is not an
export; request an export separately when you want a finished video file. The
[three-brief evaluation](evaluations/brief-to-sketch/report.md) records the trials,
the quiet-response failure, the skill revision and the fresh rerun.

### Previewing a sketch

`npm run preview -- <id> [--props=<json|file>] [--scale=0.2] [--strict]`
works for any composition ID, including `BeatLoop` and `PresetLoop`. It writes
`out/preview/<id>/sheet.png`: one row of frames on the beat, one row half a
beat later, and one row across the loop point with a red line at the seam.
Each frame is labelled with its frame number (`F`) and beat position (`B`).
`report.json` and the individual frames sit beside it.

It also reports two checks. Determinism re-renders frame 0 after everything
else and fails if a single pixel differs. The seam check compares the jump at
the loop point with ordinary motion beside it and with intended hits elsewhere
in the loop; it is a heuristic, so it warns unless `--strict` is given. The
rendered suite runs both checks for every registered sketch on a tall and a
wide canvas, with no per-sketch test code.

Sketch defaults live in the sketch's own file, so Studio's "save default
props" does not apply to them; edit `defaults` in `sketch.tsx` instead.

## Asset collections

A collection is a folder of animated GIFs, video clips and fonts that sketches
are built from: `public/assets/<collection>/`, with any subfolders. Name the
folder with lowercase letters, digits and hyphens. `public/assets/` is
gitignored, so the media itself never enters git.

What is committed is a description of each collection, in `collections/`:

```
collections/
  index.ts                     generated: imports every manifest
  <collection>/manifest.json   measurements, plus your descriptions and tags
  <collection>/filmstrips/     one small image per clip
```

```bash
npm run assets:scan            # every collection folder present on this machine
npm run assets:scan -- retro   # only public/assets/retro/
```

The scan reads `.gif`, `.mp4`, `.m4v`, `.mov` and `.webm` clips and `.ttf`,
`.otf`, `.woff` and `.woff2` fonts with Remotion's bundled ffmpeg, so nothing
else needs installing. Other files are listed as skipped; animated WebP, APNG
and AVIF are not supported. Commit `collections/` after scanning.

### Reading a collection

An agent cannot watch a clip. Before designing a sketch, read the
collection's `manifest.json` and open the filmstrips of the clips you are
considering. A filmstrip shows up to six evenly spaced frames, each labelled
with its source frame (`F0`, `F18`, …); a checkerboard is transparency.

Clips are keyed by file path inside the collection (`"loops/spin.gif"`):

| Field | Meaning |
| --- | --- |
| `description`, `tags` | Hand-written. The only fields to edit; a re-scan keeps them |
| `width`, `height` | Display size in pixels, after any rotation stored in the file |
| `frameCount` | Exact number of source frames; valid frames are `0..frameCount-1` |
| `fps`, `fpsRational` | Native rate as a number and as an exact fraction, e.g. `[30000, 1001]` |
| `timing` | `constant`: frame `i` starts at `i / fps`. `variable`: frames have their own lengths (common in GIFs); `fps` is the average, `fpsRational` is `null` and `frameStarts` lists every start in seconds |
| `durationSeconds` | Start of the first frame to the end of the last |
| `hasAlpha` | At least one pixel is transparent, so the clip can sit over other layers |
| `hasAudio` | The file has a sound track. Sketches ignore it |
| `loop.seamless` | Stepping from the last frame back to the first is no bigger than an ordinary step inside the clip, so the clip loops on its own. `seamDifference` is that step and `neighborDifference` is the ordinary one (the upper quartile of the change between consecutive frames over the whole clip, so held or repeated frames do not count as motion), both 0–1 |
| `filmstrip` | `file` relative to the manifest, and the source `frames` it shows |

Fonts are keyed by family name. Each family lists its `faces`, one per file,
with `weight`, `style`, `subfamily`, variable `axes` (`{wght: {min, default,
max}}`, empty for a static face), named `instances`, `glyphCount`, and
`missingAscii`: the printable ASCII characters the face cannot draw. Check
`missingAscii` before setting text, since display fonts often lack lowercase
or digits.

Write a `description` and `tags` for the collection and for anything worth
finding again. Re-scanning keeps them, rewrites the measurements, removes
entries whose files are gone (and says so), and deletes their filmstrips. A
manifest whose media folder is not on this machine is left untouched.

### Using assets in a sketch

```tsx
import {clip, font} from '../../assets';
import {ClipFrame} from '../../assets/ClipFrame';
import {defineSketch, useAsset} from '../define';

const spin = clip('retro', 'loops/spin.gif');   // names are type-checked against the manifest
const chunk = font('retro', 'Chunk Five');

const Poster: React.FC<Props> = ({beatsPerSpin}) => {
  const {beat} = useBeat();
  const {width, height, vmin} = useCanvas();
  const loop = useAsset(spin);    // adds loop.src
  const type = useAsset(chunk);   // adds type.fontFamily
  return (
    <AbsoluteFill>
      <ClipFrame clip={loop} frame={((beat / beatsPerSpin) % 1) * loop.frameCount}
        width={width} height={height} fit="cover" />
      <div style={{fontFamily: type.fontFamily, fontSize: 12 * vmin}}>SPIN</div>
    </AbsoluteFill>
  );
};

export default defineSketch({/* … */ Component: Poster, assets: [spin, chunk]});
```

- `clip(collection, name)` and `font(collection, family)` return the manifest
  entry, so `frameCount`, `fps`, `hasAlpha`, `axes` and the rest are available
  to the design. A name that is not in the manifest is a type error and a
  runtime error that lists what the collection has.
- List every asset in `assets`. Use `assets: (props) => [...]` when a param
  chooses one; `clipNames(collection)` gives the names for a `z.enum`.
- `useAsset(ref)` returns the usable form and throws if the sketch did not
  declare the asset.
- `<ClipFrame clip frame width height fit? style? />` draws one source frame.
  `frame` is floored and wraps around the clip; a value within a rounding
  error of the next whole frame (5.999999999999979) counts as that frame, so
  the recipes below need no rounding of their own. Do not put `<AnimatedImage>`
  or `<Video>` in a sketch directly: they follow Remotion's frame clock, so
  the clip would drift off the beat and jump at the loop point. Derive `frame`
  from `useBeat()` instead.

  Prefer `Clip` for fit, retrigger, step or scrub playback; see the mode
  guide below. Raw `ClipFrame` is for custom frame selection whose musical
  validation and source cut handling the sketch owns.
- Fonts are registered under a family name scoped to the collection, so use
  `type.fontFamily`, never the bare family name. Every face is loaded before
  the component first mounts and the render waits for it. Drive variable axes
  with `fontVariationSettings`, e.g. `` `"wght" ${100 + 800 * energy}` ``,
  inside the ranges in the manifest.
- Size clips and type in `vmin` or canvas fractions like everything else.

### Choosing Clip playback from a brief

`Clip` in `src/assets/Clip.tsx` is a sketch-level component above `ClipFrame`.
It stays out of the registry until a second sketch needs a registered layer.
Use `clipPlaybackSchema` for Studio controls and list bindings in
`defineSketch({clips: (props) => [{clip: ref, playback: props.playback,
field: 'playback'}]})`. Both metadata paths validate those bindings; a component
cannot validate a sketch's props before mounting by itself. Keep `assets` too.
For custom validation call `clipPlaybackIssues(ref, playback, timing, field)`.

| Brief asks for | Mode and settings | Loop rule |
| --- | --- | --- |
| One wobble per bar | `fit`, `duration: {bars: 1}` (or `{beats: 2}`) | A whole number of plays per loop; bar lengths follow the meter |
| Restart on selected hits | `retrigger`, `division`, optional `pattern`, `durationBeats`, `cut` | Complete grid/pattern cycles; rests never restart; the last hit carries across the seam |
| Stop-motion or frame jumps | `step`, `division`, optional `pattern`, integer `jump` (default 1) | Active hits × jump must be a multiple of source cycle length, or choose `seam: 'wrap'` for a deliberate reset |
| Rock or wander through footage | `scrub`, `division`, `signal` | Existing modulation rules: whole LFO cycles, circular noise, compatible beat patterns |

```tsx
const playback = {mode: 'fit', duration: {bars: 1}} as const;
// ref is declared in assets; playback is also declared in clips above.
<Clip clip={useAsset(ref)} playback={playback}
  x={0.1} y={0.2} width={0.8} height={0.6} fit="contain" />
```

Box coordinates are fractions of `useCanvas()` width/height, with defaults
`x=0, y=0, width=1, height=1`. For a square of 60 vmin, divide `60 * vmin`
by canvas width and height. Fitting supports `contain`, `cover` and `fill`.
All timing is beat-driven, independent of native fps; uneven GIF delays are
addressed exactly but source frames receive equal musical time.

`offsetBeats` wraps, including negative offsets. Retrigger plays once in
`durationBeats`, then holds; it does not start again during a rest. The latest
hit's `strength`, `age`, `frame` and `opacity` are available from
`useClipPlayback(ref, playback, channel)` or `Clip`'s `style={(sample) => ...}`.
All-rest hit modes render invisibly. Use stable, distinct `channel` names for
independent scrub noise; defaults deliberately share a channel.

Forward fit/step on `loop.seamless: false` require `cut: 'allow'`, or choose
`direction: 'ping-pong'` to avoid last-to-first jumps. Ping-pong cycles have
`2 * (frameCount - 1)` steps (one for a still), making step closure stricter.
Fit also offers `cut: 'fade'`: a sine-squared envelope is zero at cycle joins.
Retrigger always requires `cut: 'allow'` or `'fade'`, even for seamless media:
a restart may interrupt the clip mid-frame sequence. Its fade is zero at the
previous and next active hit, so it hides that reset even across rests/swing.
Ping-pong retrigger returns to frame zero then holds, but can still be interrupted.

Scrub maps normalized 0..1 to frames 0..last (1 never wraps to 0). Sine,
triangle and noise avoid source wrapping; beat envelopes and saw/square LFOs
can jump, so they require `cut: 'allow'`. Source lists retain the existing
weighted-mean semantics. `seam: 'wrap'` on step deliberately resets at the
first active slot of the shifted rhythm once per loop, rather than claiming frame advancement
closes naturally. Skips and negative jumps are intentional stop-motion cuts.
Neither the manifest flag, ping-pong nor a fade removes hard cuts *inside*
a clip: inspect its filmstrip. `clip-duet` demonstrates fit plus faded,
swung retrigger on real GIF/video media; CI verifies all modes on fixtures.

### Choosing kinetic Type from a brief

`Type` in `src/type/Type.tsx` is a sketch building block, outside the registry.
It sets collection fonts in a bounded canvas-relative box. Read the font's
manifest first, declare it in `assets`, and expose `typeSettingsSchema` in the
sketch schema. Declare matching bindings in `defineSketch({types: p =>
[{font: ref, settings: p.title, field: 'title'}]})`; both metadata paths check
face availability, coverage, axes and rhythm before rendering.

```tsx
import {Type} from '../../type/Type';
// settings is the same object validated in the sketch's types binding.
<Type font={ref} settings={settings} x={0.08} y={0.15}
  width={0.84} height={0.65} fontSize={24}
  unitStyle={({energy}) => ({opacity: 0.5 + 0.5 * energy})} />
```

`x/y/width/height` are canvas fractions; `fontSize` is a maximum in vmin
(default 20), reduced to fit both box dimensions. `align` is left, center
(default) or right. Explicit `\n` controls lines; there is no automatic wrap.
Measurement uses Remotion's `measureText` plus SVG ink bounds after the
collection font finishes loading, including overhangs. Pure fitting logic
lives in `src/type/layout.ts`; timing/validation lives in `src/type/model.ts`.

| Brief asks for | Settings |
| --- | --- |
| Entire title hits together | `split: 'line'`, `mode: 'all'` |
| Alternate words or letters on active hits | `split: 'word'` or `'letter'`, `mode: 'sequence'` |
| A traveling ripple across the phrase | `mode: 'stagger'`, `staggerBeats: 0.125` |
| Pulse a variable weight/width | `axes: {wght: {signal: {type: 'beat'}, range: [100, 900]}}` using the selected face's actual range |

Every settings object supplies `text`, `split`, `mode`, and `division`.
Optional `pattern`, `offsetBeats`, `attack`, `decay`, `curve` use existing beat
helpers. Attack/decay are division units. Stagger offsets wrap, including
negative values; whitespace keeps its layout space but never consumes a hit
or stagger index. Repeated words/letters have distinct source-position IDs.
Sequence counts active hits, skips rests and requires whole unit rounds per
loop: active hits must be divisible by visible units. Choose all/stagger when
that constraint does not suit the phrase. Long envelope tails retain their
unit identity across rests and the loop point. All-rest patterns are silent.

`unitStyle` receives `id`, `text`, `line`, `index`, `energy`, latest `strength`,
`age` and sampled `axes`. Map energy to scale, opacity, translation, color or
blur; transforms and blur can be clipped by the outer box, so leave room.
Generated units remain procedural; edit the text and rhythm props in Studio.
`channel` provides stable independent noise identity for different Type blocks.

Axis mappings use normalized beat/LFO/noise signals and weighted mixes.
Inherited beat sources follow the unit's sequence assignment or stagger;
explicit source rhythm overrides retain the shared modulation semantics.
A sequence's inherited axis pattern spans the full loop, so overriding its
source division may need a compatible pattern too. Ranges (including reversed
ranges) must stay within one selected face's manifest axes. `weight` defaults
to 400 and `italic` to false; unavailable faces fail rather than synthesize.
Type uses a file-scoped font family so overlapping static and variable faces
cannot silently select a different file.

Layout is deliberately fixed: line breaks, font size and unit slots are
measured at the face's default axes (and selected weight). Each current glyph
is contained within its slot using SVG aspect fitting, shrinking if its ink
or advance grows. Axis changes cannot push neighbors or reflow lines; a wide
axis may therefore reduce that unit's apparent size. Optical sizing, kerning
and ligatures are disabled so split units have predictable geometry.

Coverage is conservatively limited to printable ASCII and newlines because
manifests currently record `missingAscii`, not a complete Unicode character
map. Unsupported characters are named in validation. This version has no
rich text, automatic wrapping, joined-script shaping, reflow animation or
custom tracking/leading. `type-beat` demonstrates traveling letters and
sequential words in the real BBH Bogle font. Variable weight is verified with
Lab Block fixtures; the real collection has no variable font yet.

### When the media is not there

Declared assets are checked against the public folder when a composition's
metadata is calculated, before any frame renders. A sketch whose files are
missing fails with the paths it needs:

```
Invalid sketch "poster": assets: public/assets/retro/loops/spin.gif is missing
(clip "loops/spin.gif" in collection "retro"). Collection media is not in git: …
```

Other compositions are unaffected. `npm run preview` reports the same thing
before it bundles. CI has no media, so the rendered suite skips the loop
checks of any sketch whose files are absent and says which files; it still
checks that such a sketch fails with this message. The scanner and asset
helpers are tested against a small collection generated at test time.

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

The four loop and preset compositions validate resolved props in
`src/metadata.ts` before deriving duration; sketches do the same inside
`defineSketch`. Invalid fields, incomplete nested CLI overrides,
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
Asset checks build a small collection at test time and render every frame of
its GIFs and videos to confirm the browser shows the source frame the manifest
predicts, including clips longer than the loop that shows them, along with
transparency, variable-font weights and the errors for missing, unknown and
undeclared assets. `sticker-slap` runs the same sketch checks on a real
collection wherever `public/assets/test/` is present.
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

Keep all `remotion` and `@remotion/*` dependencies (including
`@remotion/media`, `@remotion/fonts` and `@remotion/studio`, which the asset
helpers use) at the same exact version.
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
  assets/
    manifest.ts         the manifest format
    index.ts            clip(), font(), missing-file checks, frame → time
    fonts.ts            collection font registration
    ClipFrame.tsx       one exact source frame of a GIF or video
    Clip.tsx            beat-driven playback, relative layout and accent hook
    clipPlayback.ts     pure fit/retrigger/step/scrub selection + validation
  type/
    Type.tsx            bounded collection typography and per-unit styling
    model.ts            splitting, rhythm, axes and pre-render validation
    layout.ts           pure fitting from measured metrics
    measure.ts          loaded-font advance and SVG ink measurements
  sketches/
    index.ts            the list of sketches (maintained by sketch:new)
    define.tsx          defineSketch, shared controls, useSketch, divisionIssues
    canvas.ts           canvas presets + useCanvas relative units
    UseLayer.tsx        registered layers inside a sketch
    <id>/brief.md       the idea in plain language
    <id>/sketch.tsx     params, component and definition
collections/
  index.ts              generated list of manifests
  <name>/manifest.json  what public/assets/<name>/ contains
  <name>/filmstrips/    sampled frames of each clip
scripts/
  preview.ts            contact sheet + loop checks for any composition
  new-sketch.ts         scaffold and register a sketch
  scan-assets.ts        write collection manifests and filmstrips
  lib/render.ts         shared still rendering, checks and sheet layout
  lib/scan.ts           clip and font measurement
  lib/pixels.ts         labels for sheets and filmstrips
```
