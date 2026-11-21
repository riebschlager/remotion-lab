# Infinite Bloom

## Original brief

> let's make a new sketch. this one is an infinite blooming flower. the petal shapes should be able to display an animated texture. these textures will be pulled from a user-selected folder of animated gif files.

## Idea, look and rhythm

A luminous flower seen from above. Its curled petals emerge as tight buds,
open into broad overlapping fans, and dissolve at the edge as fresh petals
take their place. Fine veins and a seed-like gold center give it an organic
silhouette. The default is coral, blush and plum on a dark aubergine backdrop,
with no text.

Use 108 BPM, four bars of four beats at 30 fps. A new ring begins every two
beats in the default look. Pollen and petal silhouettes breathe at the beat
while the larger opening motion is smooth. With a larger GIF folder, space
enough blooms evenly through the loop to show every GIF.

## Assets and treatment

No folder was supplied, so the default is procedural. Studio's
`textureFolder` selects a scanned folder under `public/assets/`. Each ring
gets one animated GIF from the selected folder in filename order, cropped
inside its petals. Static GIFs and other media are skipped. Color and veins
still define the petals through transparent regions. The default animation
fits a ping-pong play into one bar to avoid a last-to-first source cut.

For a real-media preview, the `test` manifest and filmstrips show a transparent
two-frame computer boil (5 fps, 390×480), an opaque rainbow bust (30 frames,
15 fps, 480×480), an opaque glitch collage (62 frames, 15 fps, 480×480, hard
internal cuts), and a transparent blue smiley (15 frames, 100/7 fps, 480×480).
All except the glitch collage are marked seamless. This mixed folder tests
both alpha and opaque sources and the handling of non-looping files.

## Canvas and success criteria

Portrait first, landscape second. The flower should occupy the shorter axis
with visible breathing room. The center should remain readable as the petals
open. The whole loop should look like growth in one direction and the GIFs
should stay strictly inside the petal silhouettes.

> let's add a zoom so we can zoom way into the flower

Use the Studio `zoom` control to frame the bloom from 1× to 20×. Zoom is
centered on the pollen and stays fixed during the loop. At high magnification,
the inner petals should fill the frame as they open, with the GIFs still
following their outlines. The folder picker stays at the edge of the preview.

## Petal shape and spacing

> let's add more controls to govern petal shape and spacing.

Studio's `petals` sets the number of petals in each ring. `petalLength`
extends the tips from their roots. `petalWidth` trades open gaps for overlap
between neighboring petals, and `petalRoundness` shapes the tips. `petalCurl`
bends each petal in either direction. `ringSpacing` sets the radial distance
between successive rings. The existing settings give the original bloom.
The color, veins and GIF mask should follow the same geometry on both canvases.

## Center dots

> let's make the dots in the center of the flower reflect the colors present in the gifs that are playing beneath

The pollen picks up soft color from the same GIF frames as the petals. The
colors follow the ring fades and texture opacity. Gold shows through clear
parts of the GIFs and supplies the full color when textures are off.

> let's add controls to  manipulate the center of the flower

The `center` controls adjust overall size, dot count and size, static twist,
glow, and the amount of GIF color. Zero dots leaves the glow visible by itself.
Zero GIF color keeps the dots gold even with textured petals. The original
center is the default, and the dots and their GIF mask always share geometry.

## Choosing a GIF folder

Click **Choose GIF folder** at the top left of the Studio preview to use a
local folder directly. Studio reads animated GIFs from that folder and its
subfolders in filename order. **Clear** returns to the collection selected
in `textureFolder`, or to procedural petals when it is set to `None`.
The local selection lasts while this preview is open. Exports use the
collection selected in the sketch props.

To configure a collection for repeatable previews and exports:

1. Put the GIF folder in `public/assets/<folder>`.
2. Run `npm run assets:scan -- <folder>`.
3. In Infinite Bloom's Studio controls, select the folder in `textureFolder`.
   Studio may need a reload after scanning. Choose `None` for procedural petals.
   `textureOpacity` blends the GIF into the petal color and `texturePlayback`
   controls its rhythm.

Studio previews these edits live. For a persistent sketch default, set
`textureFolder` in `sketch.tsx`. To preview a folder from the command line, use
`npm run preview -- infinite-bloom --props='{"textureFolder":"test"}'`.

## Review notes

The [portrait](../../../out/preview/infinite-bloom-portrait/sheet.png) and
[landscape](../../../out/preview/infinite-bloom-landscape/sheet.png) sheets
show the pollen center holding its position as bunches of petals widen and
roll outward. Both passed the determinism and seam checks. The
[GIF test sheet](../../../out/preview/infinite-bloom-textured/sheet.png) also
passed both checks. The animated footage stays inside the petal edges and the
glitch GIF's internal cuts remain visible as part of that source.

The [16× portrait](../../../out/preview/infinite-bloom-zoom-portrait/sheet.png)
and [20× textured landscape](../../../out/preview/infinite-bloom-zoom-landscape/sheet.png)
close-ups passed both checks. The pollen stays centered while the inner
petals open around it. Studio also showed the folder picker at its usual size
during a textured close-up.

The [pointed portrait](../../../out/preview/infinite-bloom-petal-sharp/sheet.png)
shows longer, narrower petals with open gaps and a stronger curl. The
[rounded landscape](../../../out/preview/infinite-bloom-petal-soft/sheet.png)
shows tighter rings, overlapping petals, and GIF textures from `gif-flower`.
Both passed the determinism and seam checks.

The [pollen portrait](../../../out/preview/infinite-bloom-pollen-portrait/sheet.png)
and [pollen close-up](../../../out/preview/infinite-bloom-pollen-landscape/sheet.png)
show the dots taking on the colors of `gif-flower` as the rings change.
Both passed the determinism and seam checks. In Studio the dots shift from
pink and cyan to lime as the playhead moves from frame 108 to frame 142.

The [portrait center study](../../../out/preview/infinite-bloom-center-portrait/sheet.png)
uses 18 larger gold dots with a counterclockwise twist and a softer glow.
The [landscape center study](../../../out/preview/infinite-bloom-center-landscape/sheet.png)
uses 72 GIF-tinted dots with a clockwise twist at 4× zoom. Both passed the
determinism and seam checks.
