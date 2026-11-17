# Milhouse Slices

## Original brief

“ok, let's work on a new sketch idea. i've added an fbx file in milhouse-01 that i would like to feature. i'd like to do an animation where the mesh of this fbx is sliced up horizontally and the slices bounce with the beat. so with each beat, milhouse gets sliced up, the slices bounce, and then reassemble.”

## Idea and hierarchy

Milhouse is the sole focal point. Real horizontal sections of the supplied mesh
separate, bounce and land back in register. Preserve the original palette and
silhouette. Quiet plum studio backdrop, soft floor shadow, no text.

## Premium vinyl toy revision

User request: “let's go with the premium vinyl toy direction. dial back the
ambient light and give him those soft studio lights, satin materials, and a
floor with contact shadows.”

Replace the evenly lit treatment with a large warm key softbox, weaker neutral
fill, and a cool rear strip. Substantially reduce ambient illumination. Keep
the supplied palette, with satin vinyl surfaces and broad controlled highlights;
slightly shinier hair and red glasses, and matte cut faces. Build a real matte
studio floor plus geometry-derived contact shadows that follow the separated
slices. Use a fixed offscreen shadow pass for each beat sample, without temporal
accumulation or random light jitter. Preserve existing motion and tempo. Floor
and shadows disappear in transparent mode. Review rest, peak and both canvases.

## Rhythm and assumptions

Choose 120 BPM, 4/4, four bars, portrait first. Each quarter-note starts assembled,
opens briskly into suspended sections, rebounds once, then rests assembled before
the next hit. Eight slices by default, alternating lateral kicks and twists.
Expose division, slice count, spread, sideways kick, twist and viewing angle.
No source skeletal animation, accumulated state or independent animation clock.

## Assets and treatment

Source: `collections/milhouse-01/milhouse-2.fbx` (3.5 MB, FBX 7700).
Inspection found one skinned mesh with 18,441 vertices and one palette material
with an embedded texture. Bounds approximately 0.753 × 1.286 × 0.557 model units.
Use the rest pose and embedded palette; bake world-space triangles, clip against
horizontal planes, interpolate normals/UVs, and cap closed contours. Real mesh
sections, not screen-space strips.

FBX is outside the clip/font collection API. A byte-for-byte runtime copy lives
at `public/assets/milhouse-01/milhouse-2.fbx`; assets:scan skips FBX and reports
zero clips/fonts. No filmstrip applies. The sketch owns loading/missing-file
errors. Keep the supplied original untouched. No Clip or Type is needed.

## Canvas and success criteria

Portrait and landscape show the entire character including the highest airborne
section. At peak, horizontal air gaps must read at phone size. At rest, the model
must be whole without cracks. Inspect an additional early-beat peak frame because
the standard contact sheet samples beats and half-beats. Transparent mode omits
the background and floor shadow. All world framing derives from canvas aspect.

## Review notes

### Vinyl studio revision

Ambient intensity is now 0.28 (previously 1.7). Three rectangular softboxes give
a warm upper-left key, weaker front-right fill and cool rear rim. The vinyl has
roughness 0.46 with a light clearcoat; the palette's blue hair gets a slightly
glossier finish. Cut faces stay matte. Corrected cap triangle winding to agree
with outward normals, so the newly directional light illuminates top faces
properly; a mesh regression assertion now covers this.

Replaced the flat oval shadow with a matte 3D floor and a fresh bottom-up depth
capture of the actual geometry. Two fixed Gaussian blur passes soften the
contact shadow, and height attenuates distant parts. This pass is recomputed
from the current beat and controls, with no accumulated frames. The rear of the
floor blends into the plum backdrop; a slightly elevated camera reveals contact.
Transparent mode omits the floor, contact pass and background fog.

Inspected rest (frame 0), peak (frame 5), Studio playback and both canvas sheets.
The initial dark floor edge and overly dark cap surfaces were corrected. The
character remains readable, the hair has broad highlights, and the warm interior
surfaces separate clearly from the satin exterior.

- Revised portrait: `out/preview/milhouse-slices-vinyl-portrait/sheet.png`
- Revised landscape: `out/preview/milhouse-slices-vinyl-landscape/sheet.png`
- Rest / peak: `out/preview/milhouse-vinyl-rest.png`, `out/preview/milhouse-vinyl-peak.png`
- `npm run check`: 94 passed. Both final previews pass determinism and seam
  checks with zero seam jump. All four targeted Milhouse rendered tests pass,
  including exact seam-view correspondence after the cap correction.
- `npm run test:visual`: all 83 rendered regression checks passed. The four
  targeted Milhouse tests were rerun after the cap correction and all passed.

### Original slice sketch

Inspected portrait and landscape contact sheets, plus frame 5 near the launch
peak. Both canvases keep the full character and airborne hair section in frame.
Horizontal gaps and warm solid cut surfaces read clearly; on-beat frames restore
the intact silhouette without cracks. The late rebound is visible near frame 237;
frames 239 and 0 are fully assembled, and frame 1 begins the next launch smoothly.
There is no deliberate hard seam cut. Studio playback was opened and inspected.

- Portrait: `out/preview/milhouse-slices-portrait/sheet.png`
- Peak: `out/preview/milhouse-slices-portrait/peak.png`
- Landscape: `out/preview/milhouse-slices-landscape/sheet.png`
- Both preview reports: determinism PASS, seam PASS (zero seam jump).
- `npm run check`: 94 tests passed, including mesh area/UV preservation,
  cap coverage, bounce continuity and both metadata paths' musical validation.
- `npm run test:visual`: all 83 rendered checks passed, including both Milhouse
  canvases, out-of-order determinism, and exact seam-view correspondence.

The original model has more than four skin weights at some vertices; Three's FBX
loader warns when truncating those. This sketch freezes its rest pose rather
than playing skeletal animation. Source palette colors (including white shirt
and red trousers) are retained rather than recoloring to another Milhouse design.
No finished video export was requested or produced.
