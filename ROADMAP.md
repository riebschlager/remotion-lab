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

- **Kinetic Type building block** (segment 3). `src/type/Type.tsx` sets
  explicit lines in bounded, canvas-relative boxes. Line/word/letter units
  use all, sequence or wrapped stagger timing, with per-unit pattern energy
  and manifest-bounded variable-axis signals. Declarative `types` bindings
  validate coverage, faces, axes and rhythm in both metadata paths. Remotion
  measurement plus SVG ink bounds run only after collection fonts load;
  pure layout/timing modules have unit coverage. Slots stay fixed at reference
  axes; current glyphs shrink into them rather than moving neighboring units.
  `type-beat` uses real BBH Bogle on portrait/landscape, with inspected contact
  sheets and Studio. Fixture pixels prove the collection face, variable weight
  changes, stable unit anchors, sequential accents, and bounded multiline fit.
  - Sequence requires complete unit rounds per loop, including only active
    hits. Axis beat sources inherit unit assignment and stagger offsets.
  - Coverage is printable ASCII/newlines, matching the manifest's available
    evidence. No automatic wrapping, rich text, joined scripts, animated reflow
    or custom tracking/leading. Kerning, ligatures and optical sizing are off.
  - The real collection has only a static font; variable axes remain verified
    on generated fixtures until real variable media is added.

- **Brief-to-sketch creative workflow** (segment 4). Local `brief-to-sketch`
  skill plus a shared Claude link; setup checks validate its name, link and
  references. It routes engine details to beat-loop while covering brief
  interpretation, hierarchy, musical roles, evidence-based Clip/Type choices,
  relative composition, critical review and handoff. The scaffold brief now
  records original commitments, copy, asset treatment and review criteria;
  README includes a short guide to writing a brief.
  Three fresh isolated agents tested quiet procedural, graphic type and real
  media briefs at different tempos. All initial technical checks passed;
  the parent rejected the quiet trial's near-invisible response. Guidance now
  distinguishes quiet pacing from invisibility and requires inspecting peaks
  missed by the default sheet. An unchanged quiet brief was rerun with a fourth
  fresh agent; its stronger response was accepted after inspection. Kept
  `dusk-tide`, `off-grid` and `happy-static`, with two canvases each. See
  [evaluation inputs, results and limitations](evaluations/brief-to-sketch/report.md).

- **Export profiles and tempo sidecar** (segment 5). `npm run export -- <id>`
  exports any sketch, `BeatLoop` or `PresetLoop` with preview's `--props`, to
  `out/export/<id>/<id>_<canvas>_<bpm>bpm[_xN][_tag].<ext>` plus `<file>.json`.
  Profiles: `social` (H.264 `yuv420p` MP4, CRF 18), `prores` (ProRes 4444,
  `yuva444p10le`) and `webm` (VP9 `yuva420p`), the alpha settings taken from
  the checked-in Remotion skill and current docs. `--canvas` takes several
  canvases per run. `--repeat` copies the once-encoded loop end to end, so
  repeats are whole loops and decode frame-identically. The sidecar records
  requested and effective BPM, bars, meter, fps, frame counts, durations,
  canvas, codec settings, repeat count, resolved props and a measured alpha
  sample. Missing media, invalid props and options fail before bundling.
  Verified on real renders with both Remotion's bundled ffprobe and a newer
  system build: codec, pixel format, size, frame count, duration and even
  frame spacing against each sidecar; every decoded frame hashed across
  joins; alpha read from decoded frames of a fixture sketch and of
  `clip-duet`. `npm run test:export` keeps the rendered checks (about 40 s)
  out of the default suites and CI.
  - `transparent` removes only the shell's black fill. Six of the seven
    sketches paint their own full-frame backdrop and export fully opaque
    alpha; only `clip-duet` is transparent. The exporter reports this per
    export, but the sketches themselves are unchanged.
  - ffprobe reports ProRes 4444 as `yuva444p12le`, and WebM as `yuv420p` with
    `ALPHA_MODE=1` because ffmpeg's own VP9 decoder drops alpha; decode with
    `-c:v libvpx-vp9`. The sidecar's `ffprobePixelFormat` records both.
  - Cost on this machine at 1080×1920, 240 frames, after about 7 s of
    startup (bundling and browser launch): social 7 s / 5.7 MB, ProRes 10 s / 268 MB, WebM 58 s / 2.9 MB
    (`pulse-grid`); `clip-duet` ProRes is 477 MB per 8 s loop.

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

## Later

Not yet scheduled. Each is worth doing once sketches start asking for it.

- **Sketches that honor `transparent`.** Most sketches paint a full-frame
  backdrop of their own, so their alpha exports are opaque (see segment 5).
  Decide a convention, such as skipping or exposing the backdrop when
  `transparent` is on, apply it to the sketches worth compositing, and add it
  to the scaffold and the brief-to-sketch skill.
- **Not yet tried downstream:** the ProRes and WebM files have been decoded
  with ffmpeg and libvpx only, not opened in an editor, a browser or Safari.

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
