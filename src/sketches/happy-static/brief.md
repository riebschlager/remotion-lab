# Happy Static

## Original brief

> Make a sketch called happy-static: playful, wonky and syncopated at 116 BPM,
> four bars of 4/4. Use real media from the test collection: a cheerful sticker
> as the main character and some animated collage behind it. Choose the actual
> clips after looking at the collection. The sticker should feel like it is
> answering the backdrop rather than both moving in lockstep. No words. Bright
> blue and yellow with some dark space; funny and energetic, not an unreadable
> wall of effects. Make it work on portrait and landscape. I want a join I don't
> notice unless it's an intentional musical hit.

Supplied: tempo, meter, bars, collection, sticker plus collage roles, no copy,
palette family, both canvases, seam requirement. Assumed: the specific clips,
the yellow disc, the punctuation dashes and the playback treatments below.

## Idea and hierarchy

A huge blue grinning sticker bounces on a wonky yellow paper disc. A cropped,
tilted collage window lives behind it, surrounded by generous ink-dark space.
Two small blue punctuation dashes echo the rhythm.

## Rhythm

116 BPM, four bars of 4/4, visual timing. The collage fits one four-beat bar,
offset by half a beat. The sticker's squash and lift answer an editable swung
eighth-note pattern (rests and unequal strengths), delayed from the backdrop
phrase. A longer, milder yellow disc sway keeps a quiet base state. No added
sudden reset at beat zero.

## Look and copy

Bright blue and yellow over ink-dark space. No copy and no fonts.

## Assets and treatment

Both filmstrips were inspected before choosing.

- clip `test/Fun Love Sticker by Tarver.gif`: 480×480, alpha, 15 frames at
  14.285714 fps, seamless. The blue face with pink cheeks reads instantly and
  its gentle wobble survives being played on offbeats. Treatment: smooth sine
  scrub over four cycles, offset a quarter cycle, so the character stays
  continuous.
- clip `test/slapchop-video-20260824-205001-10s.mp4`: 1080×1920, 300 frames at
  30 fps, opaque, not seamless. A saturated mirrored tunnel of eye, moon and
  photo fragments with large flat colour areas, so it stays in a bounded window
  rather than filling the frame. Treatment: fit to one bar with a sine-squared
  reset fade; the half-beat offset places the whole-loop join inside the fade
  instead of on the source reset. Internal montage cuts are intentional source
  cuts that the fade does not hide.

## Canvas and success criteria

Portrait places the visible collage edge above the smiley. Landscape keeps the
sticker big and shifts the collage toward the left. Canvas fractions and vmin
only.

The face stays readable, dark margins stay substantial and the collage stays
subordinate throughout. The sticker visibly answers the backdrop rather than
moving with it. Exposed controls: both clip playbacks, response
division/pattern/offset, character scale and the blue/yellow/ink palette, with
clip bindings and the response rhythm validated in metadata.

## Review notes

Inspected portrait and landscape contact sheets: the face remains clear, the
collage stays in its window, and the seam shows ordinary progressive motion.
Both canvases pass pixel determinism and seam diagnostics (portrait jump
0.01297 vs neighbour 0.01156; landscape 0.01059 vs 0.00888). Both are 248
frames at 30 fps; visual timing rounds the requested 116 BPM.

Sheets: `out/preview/happy-static-portrait/sheet.png`,
`out/preview/happy-static-landscape/sheet.png` (local, not committed).
