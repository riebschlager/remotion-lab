# Roadmap

The goal: a playground where an agent turns a creative brief, plus a
collection of GIFs, video clips and fonts, into a beat-matched loop that
follows this repo's conventions.

Each segment below has a prompt that starts it in a fresh conversation. Run
them in order unless a segment says otherwise. When a segment is finished,
move it to "Done" so this file stays the source of truth.

## Done

- **Sketches.** `defineSketch`, canvas presets, relative units, `npm run sketch:new`.
- **Preview.** `npm run preview` writes a labelled contact sheet and runs
  determinism and seam checks; the rendered suite applies both to every sketch.
- **Asset collections.** `npm run assets:scan`, committed manifests and
  filmstrips, typed `clip()` and `font()`, font loading, and `ClipFrame` for
  drawing one exact source frame.
- **Asset pipeline proven on real media** (segment 1). `collections/test/` describes a
  real collection: four GIFs, two 1080×1920 H.264 videos and one static font.
  Sizes, frame counts, rates, durations, alpha and font facts were confirmed
  with ffprobe, ImageMagick, fontconfig and a byte-level GIF reader. The
  `sticker-slap` sketch draws a video and a GIF through `ClipFrame` and sets
  type in the collection font; its rendered frames were matched to
  independently decoded source frames on portrait and landscape. Real media
  exposed three defects, each fixed with a fixture test:
  - `loop.seamless` compared the seam only with the frames beside it, so a
    loop drawn on twos or threes (held frames at the seam) read as a cut. It
    now compares with the upper-quartile step across the whole clip;
    `neighborDifference` carries that value.
  - `step(...).phase * frameCount` lands a rounding error below whole frames,
    so `ClipFrame` showed the previous source frame. `sourceFrameIndex` in
    `src/assets` now owns flooring and wrapping.
  - Remotion clamps the frame clock to the composition's length even inside
    `<Freeze>`, so a clip longer than the loop (or the 2 s seam view) could
    not show its later frames. `ClipFrame` now carries clip time through a
    negative `<Sequence from>` instead.

- **Beat-driven Clip building block** (segment 2). `src/assets/Clip.tsx`
  provides fit, retrigger, step and scrub above ClipFrame, with pure selection
  in `clipPlayback.ts`, shared step/pattern/modulation helpers and declarative
  `defineSketch({clips})` validation in both metadata paths. Canvas-relative
  boxes support contain/cover/fill. Latest hit strength is exposed to sketches.
  Non-looping source cuts require explicit handling; ping-pong and fit/retrigger
  fades conceal endpoint/restart cuts. Clip stays sketch-level until a second
  sketch needs a registered layer. `clip-duet` uses a real GIF fitted to a bar
  over a swung, faded retrigger video; portrait/landscape contact sheets and
  Studio are inspected. Fixtures verify exact decoded GIF/video source frames
  for every mode; pure tests cover rests, swing, negative offsets, odd meters,
  closure and seam behavior.
  - Step closure counts active hits, not slots. Ping-pong has 2×(frames−1)
    steps, so it is stricter; `seam: 'wrap'` explicitly permits a reset.
  - Retrigger runs once then holds. Even a seamless source can cut when
    interrupted early, so every retrigger chooses fade or allow.
  - Scrub addresses 0..last without endpoint wrap; discontinuous beat/saw/square
    sources require explicit cut permission. Internal footage cuts remain.

## Decisions already made

These apply to every segment; the prompts do not repeat them.

- Tempo-only sync. No audio work.
- Outputs are both finished social videos and material for downstream
  projects, so everything must work on every canvas.
- Media lives in `public/assets/<collection>/` and is gitignored. Manifests
  and filmstrips in `collections/` are committed.
- New ideas start as sketches. Code moves into the layer registry only when a
  second sketch needs it.
- `useBeat()` is the only clock. No state between frames, no unseeded randomness.

## Carried over from segment 1

What the first real collection did not cover, and what later segments
should know:

- **Not yet seen on real media:** a variable font, a video with alpha, a
  phone-shot clip (rotation metadata, variable frame rate, an audio track),
  WebM, and a GIF with truly uneven delays. These paths are still verified on
  generated fixtures only. Add such files to `public/assets/` and re-run the
  checks from segment 1 before relying on them. Segment 3's variable-axis work
  can only be verified on fixtures until a variable font is added.
- **GIFs that approximate a frame rate** (delays alternating 7 and 6
  hundredths for 15 fps) are recorded as `constant` at that rate, by the same
  one-tick tolerance used for WebM. Frame starts are then off by up to a third
  of a hundredth and `durationSeconds` by up to one hundredth. Frame
  addressing was confirmed correct at these rates; a GIF whose frames are only
  two hundredths long could be mis-addressed under this tolerance and has not
  been tested.
- **`loop.seamless` only describes the loop point.** A clip with hard cuts
  inside it (the glitch GIF) is correctly not seamless here, but a clip could
  loop at the seam and still cut in the middle. Segment 2's validation should
  not treat the flag as "safe to cycle" without the filmstrip.
- **Frame selection for segment 2** should go through `sourceFrameIndex`, not
  its own `Math.floor`, and rendered tests should include a loop shorter than
  the clip.
- **Cost on this machine:** scanning the collection (77 MB, 2,215 frames)
  takes 17–18 s. A preview takes 27–33 s, most of it bundling and video
  decoding; the rendered suite takes about 108 s with this sketch in it.
- File names with spaces and capitals work as clip keys, filmstrip names and
  URLs. Names containing `#`, `%` or `?` have not been tried.

## 3. Kinetic Type layer

**Why:** fonts are one of the three asset kinds, and text is what most social
pieces need. Can run before or after segment 2.

**Done when:** a sketch can set words in a collection font, animate them per
word or per letter on a pattern, and pulse a variable-font axis on the beat.

```text
Read README.md, AGENTS.md, ROADMAP.md and the beat-loop skill first. This session is
roadmap segment 3: a kinetic Type building block for sketches, using fonts from asset
collections (see "Asset collections" in the README and src/assets/fonts.ts).

Build a Type component that:
- Sets one or more lines of text in a collection font, sized in useCanvas() units, and
  fits text to a box so it never overflows on any canvas. Check the checked-in Remotion
  skills for the recommended text measuring and fitting approach before writing one.
- Splits text into lines, words or letters, and gives each unit a stable identity so
  hits can address them: all at once, one unit per hit in order, or staggered with a
  per-unit beat offset. Per-unit timing must use wrapped offsets on the beat grid so it
  is seamless, the way src/sketches/pulse-grid delays its tiles.
- Exposes per-unit energy from the existing pattern and envelope helpers so a sketch
  can map it to scale, opacity, position, color or blur.
- Supports variable-font axes as animation targets: map a normalized signal from
  src/beat/modulation.ts to an axis range taken from the manifest, and reject ranges
  outside what the font supports before rendering.
- Uses the manifest's missing-character information to fail validation, with the
  characters named, when the text cannot be set in the chosen font.

Text measurement must be deterministic across frames and must not run before the font
has loaded. Layout must not shift when an axis animates unless the sketch asks for
that; decide how to handle width changes from a weight or width axis and tell me the
choice.

Put layout and timing logic in pure modules with unit tests. Add rendered tests using
the fixture fonts in tests/fixtures/fonts so CI can run them, including one that
proves the collection font was used and not a fallback, and one that shows a
variable axis changing between two beats.

Then build a sketch that uses Type with a real font from public/assets/, preview it on
portrait and landscape, and look at the contact sheets for legibility at phone size.
If there is no real collection, tell me and verify on fixtures only.

Update the README, AGENTS.md and the beat-loop skill. Run npm run check and
npm run test:visual. Report what was built, what was verified and how, and what kinds
of typography it cannot do yet. Update ROADMAP.md. Commit only if I ask.
```

## 4. Brief-to-sketch skill

**Why:** this is the actual goal: hand an agent a brief and a collection and
get a finished, verified sketch back. It comes after segments 2 and 3 so the
skill describes building blocks that exist.

**Done when:** a fresh agent given only a brief produces a sketch that passes
its checks, with a report of what it chose and why, without further guidance.

```text
Read README.md, AGENTS.md, ROADMAP.md and the beat-loop skill first. This session is
roadmap segment 4: a skill that takes an agent from a creative brief to a finished,
verified sketch.

The reader of this skill is a capable agent in a fresh conversation that knows nothing
about this repo. I will give it a brief in loose, creative language, sometimes naming
an asset collection, and I want a sketch back that I would be willing to post.

1. Create a local skill in .agents/skills/ with a .claude/skills link, following how
   beat-loop is set up, and extend scripts/check-skills.mjs to cover it. The beat-loop
   skill stays the reference for engine rules; this one is about the creative workflow
   and should point to beat-loop, not repeat it.
2. The skill should explain the purpose and the judgment involved, not only list
   steps. It needs to cover: reading the brief and asking me only when something is
   truly undecidable; reading a collection's manifest and filmstrips before designing;
   translating mood words into tempo, pattern, palette, motion and the Clip and Type
   options; writing brief.md first so the intent is on record; building in relative
   units; using npm run preview and critically reading its own contact sheet against
   the brief; iterating before reporting; checking a second canvas; and what the final
   report to me should contain.
3. Describe what good looks like in this medium and where agents tend to go wrong:
   everything hitting on the same beat, hits that are too subtle to read at phone size,
   motion that ignores the loop length, clips shown without regard to whether they
   loop, text that is unreadable for the time it is on screen.
4. Revise the brief template in scripts/new-sketch.ts if writing the skill shows it is
   missing something, and add a short guide for me on how to write a brief that gets
   good results.

Then test it for real. Write three briefs that differ in mood, tempo and asset use, and
for each one start a fresh subagent with only the brief and an instruction to use the
skill. Read what each produced: the sketch, its contact sheets and its report. Where an
agent went wrong, work out what in the skill led it there, fix the skill's explanation
instead of adding a special-case rule, and re-run that brief. Keep the three sketches
if they are good; delete any that are not.

Report what the skill covers, how the three trial runs went including the failures,
what you changed as a result, and what kinds of brief you expect it to handle badly.
Update ROADMAP.md. Commit only if I ask.
```

## 5. Export profiles and tempo sidecar

**Why:** finished loops need to leave the repo in the right form for social
posts and for downstream projects. Independent of segments 2 to 4; can run any time.

**Done when:** one command exports any sketch or preset for either use, and
each export says what tempo it is.

```text
Read README.md, AGENTS.md, ROADMAP.md and the beat-loop skill first. This session is
roadmap segment 5: exporting finished loops. Outputs go two places: social posts, and
downstream projects that composite or play the loops themselves.

Build an export command, for example npm run export -- <composition-id>, that works
for any sketch or preset and accepts the same --props as npm run preview. It needs:
- A social profile: H.264 MP4, with a repeat count so a short loop can fill a longer
  post. Repeats must be whole loops and the joins must be as clean as the loop itself.
- A downstream profile with an alpha channel, for sketches rendered with the existing
  transparent prop. Check the checked-in Remotion skills and docs for the current
  recommended transparent codecs and pixel formats before choosing, offer at least one
  editing-grade format and one web-friendly format, and tell me the trade-offs.
- A canvas option, so one sketch can be exported to several canvases in one run.
- A sidecar JSON beside every output recording composition id, props, requested and
  effective BPM, bars, beats per bar, fps, frame count, duration, canvas size, codec
  and repeat count, so a downstream tool never has to guess the tempo.
- Predictable output names under out/ that include the id, canvas and tempo.
- A clear failure before rendering when a sketch's asset files are missing, reusing
  the existing check.

Verify with real renders, not only by reading the command: confirm with ffprobe that
each profile has the codec, pixel format, dimensions, frame count and duration the
sidecar claims; confirm the alpha output has real transparency by reading pixels from a
decoded frame; and confirm a repeated export is frame-identical across its joins. Add
tests for the naming, sidecar contents and option validation. Keep long renders out of
the default test suites.

The existing render scripts in package.json should keep working. Update the README and
AGENTS.md. Report what was built, what was verified and how, file sizes and render
times for one sketch in each profile, and anything about the transparent formats I
should know before using them downstream. Update ROADMAP.md. Commit only if I ask.
```

## Later

Not yet scheduled. Each is worth doing once sketches start asking for it.

- **Arrangement within the loop.** Bar-scoped cues such as "enters at bar 3"
  or "fill on bar 4", so loops feel composed instead of merely periodic.
- **Variants from one brief.** Render several `variant` values on one contact
  sheet and pick a direction.
- **Gallery.** A generated index of every sketch with thumbnail, brief and
  render command, so the playground is browsable and agents can find prior art.
- **Modulation on any numeric param.** Today it targets scale, rotation,
  color and displacement only.
- **Palettes.** Shared palette tokens, including palettes extracted from a collection.
- **More building blocks.** Particles, grids, masks, and post effects such as
  glow and blur, promoted from sketches as they recur.
- **Resolution-independent Rings.** It still measures in literal pixels
  tuned for 1080×1920.
- **Split AGENTS.md.** Separate the hard rules from the recipes.

Prompt for picking one of these up:

```text
Read README.md, AGENTS.md, ROADMAP.md and the beat-loop skill first. I want to take on
"<item>" from the Later list in ROADMAP.md. Look at the existing sketches and building
blocks to see what the item needs to work with, then propose a design: what I would be
able to do afterwards, how it stays seamless and deterministic, what it changes for
existing sketches and presets, and how you would test it. Give me your recommendation
and wait for my go-ahead before building.
```
