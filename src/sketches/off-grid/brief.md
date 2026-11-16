# Off Grid

## Original brief

> Make a sketch called off-grid: a defiant graphic music poster at 132 BPM,
> four bars of 4/4. The exact words are OFF GRID and ON BEAT. Use BBH Bogle from
> the test collection, no images or clips. Black, paper white and hot coral;
> big type with a clear reading order. Let the two phrases answer one another,
> with some silence between emphases, while I can still read the whole message.
> Make portrait and landscape versions that feel composed, not stretched.

Supplied: tempo, meter, bars, exact copy, font, palette, no media, both
canvases. Assumed: the tilt, the coral panel, the broken rule and the hit
placement below.

## Idea and hierarchy

OFF GRID is a huge paper-white, slightly tilted two-line declaration on black.
ON BEAT answers in black on a hot coral block: steadier and slightly smaller.
A short broken rule frames the first declaration; the coral panel provides the
second phrase with an unmistakable destination. No extra words or pictures.

## Rhythm

132 BPM, four bars of 4/4 (16 beats), visual frame rounding at 30 fps. Both
phrases stay fully readable. OFF GRID accents beats 0 and 8; ON BEAT answers
beats 3 and 11, on a quarter-note grid with 8-slot sparse patterns. Sub-beat
decay leaves substantial silent holds between each call and response, plus an
extended hold before the next call. Accent is a visible inward size kick and
tiny lift, returning to a stable baseline.

## Look and copy

Black, paper white, hot coral. Copy is exactly `OFF\nGRID` and `ON\nBEAT`
(OFF GRID and ON BEAT). Must not appear: flashing or hidden words, extra
copy, images, variable font axes.

## Assets and treatment

- font `test/BBH Bogle`: manifest shows static Regular, weight 400, normal,
  no axes; all printable ASCII covered. Type, split line, mode all, one
  binding per phrase so both are validated. No weight animation is possible.
- No clips or images; no filmstrip applies.

## Canvas and success criteria

Portrait: stacked declaration above, inset coral answer below, generous black
pause between. Landscape: a large left declaration and right coral answer,
with asymmetric margins and a vertical black gutter. Type re-fits its own boxes;
letters retain their proportions. Square follows the stacked composition.

At phone size the eye reads OFF GRID then ON BEAT; both remain visible in every
frame. The two phrases visibly answer instead of pulsing together. No cropping
or effect clipping on either canvas. The beat-zero call is an intended attack,
equivalent to beat eight.

## Review notes

Inspected portrait and landscape contact sheets and a portrait still of the
beat-three answer, which the default sheet does not sample. Enlarged the type
after the first preview to make the declaration poster-scale. Landscape needed
a slightly lower declaration scale to keep the D's complete contour at rest;
confirmed on the revised sheet. Both canvases pass out-of-order determinism and
seam checks. The seam is the intentional beat-zero call, matching the identical
interior call at beat eight.

Sheets: `out/preview/off-grid-portrait/sheet.png`,
`out/preview/off-grid-landscape/sheet.png` (local, not committed).
