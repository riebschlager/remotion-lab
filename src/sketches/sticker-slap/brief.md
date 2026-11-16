# Sticker Slap

## Idea

A sticker slapped onto a moving collage. A grinning blue face wobbles in the
middle of the frame, one loud word sits under it, and the wall behind them
keeps changing. The viewer remembers the face.

This sketch exists to exercise the path from brief to manifest to render on
real media: one video and one GIF through `ClipFrame`, and one collection
font. It is deliberately plain.

## Rhythm

120 BPM, 4 bars of 4/4, 30 fps: 240 frames.

- The sticker swells on every quarter note (`division`).
- The word answers on the offbeat, half a step later, so the two do not hit
  together.
- The sticker's wobble plays once every half note (`wobbleDivision`).
- The backdrop cuts to a different part of the video on every bar
  (`cutDivision`) and plays forward at its native speed in between. The cut on
  beat 0 is an intended hit, the same as the three cuts inside the loop.

## Look

Saturated flat collage colour behind; blue and pink sticker in front; the word
in yellow with a black outline so it reads over any part of the video. The
sticker and word are one centred group sized in `vmin`, so the group is the
same on every canvas and only the backdrop crop changes.

## Assets

Collection `test` (collections/test/manifest.json).

- clip `test/slapchop-video-20260824-205001-10s.mp4`: 300 frames, 30 fps,
  10 s, 1080×1920, opaque, does not loop (seam 0.35 against an ordinary step
  of 0.08). Backdrop, `fit="cover"`: exact on portrait, centre-cropped on
  other canvases. Because it does not loop, it is never cycled: each bar
  starts at a seeded frame (`stepRandom` on the wrapped bar index) and plays
  60 source frames forward, one per rendered frame, so the cut always falls on
  a bar line. Starts are limited to the first 240 frames so a bar never runs
  off the end.
- clip `test/Fun Love Sticker by Tarver.gif`: 15 frames, 100/7 fps (1.05 s),
  480×480, transparent, loops on its own. Drawn over the backdrop with
  `fit="contain"`, cycled once per half note: 15 source frames over 30
  rendered frames, close to its native speed, and a whole number of cycles
  per loop.
- font `test/BBH Bogle`: one static face, Regular 400, no variable axes. It
  covers all printable ASCII; `validate` rejects a `word` it cannot draw.

Not used: the Mr Tronch GIF (opaque, loops) and the dancers video (black
ground, 60 fps) would both suit a later sketch; the glitch GIF has hard cuts.

## Notes

- Targets every canvas; checked on portrait and landscape.
- The collection has no variable font, so no axis is animated here.
- Collection media is not in git. Without `public/assets/test/` this sketch
  fails with the list of missing files and its rendered checks are skipped.
