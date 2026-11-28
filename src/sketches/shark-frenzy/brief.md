# Shark Frenzy

## Original brief

> let's create a new sketch that showcases ~/Downloads/exported-model.glb which
> is a shark animated model. it should take advantage of any animation
> available in the file

Supplied facts: the model file, and the instruction to showcase it with every
animation it contains. Everything else (tempo, staging, palette, the absence of
copy) is an assumption made here.

Revision:

> let's include ~/Downloads/exported-model(1).glb in the scene. it doesn't have
> to make sense. the weirder the better.

That file is a man in a T-shirt and jeans (`shark-01/guy.glb`). Interpretation: he rides the shark.
He cheers on its back through the swim and looks confused as it turns to the camera. Then he
somersaults onto its tongue and ground-pounds as the jaws chomp around him, with the impact on
beat 13. He bows as he flips back onto its back across the seam. Four giant copies of him tumble
in the fog as translucent silhouettes, each looping one of his takes a whole number of times per
phrase. Every one of his five takes is used.

- Rider takes: cheer for beats 0.25–8 (one cycle per 2 beats). Confused for beats 8–10.5.
  Chest_Open for 10.5–11.8 (the hop). Ground pound for 11.8–14.5: it does not loop, so it plays
  once inside its window, with its deepest crouch on beat 13. Bow from 14.5 across the seam.
  Cross-fades last half a beat.
- The rider's position is read from the shark's bones each frame: the `pelvis` bone (plus a lift)
  for his spot on the back, and `mouth_tip` for the tongue. He therefore rides the swim undulation
  and sinks with the jaw. When the jaws close on him, his limbs poke out between the teeth. That
  is intended.
- Drifters: Confused (4 beats), Bow (8 beats), Chest_Open (2 beats), Cheering (2 beats). They are
  unlit, fog-tinted silhouettes at 50% opacity, so they never compete with the shark.

## Idea and hierarchy

A shark circles in a deep blue water column, slows, turns to face the viewer,
and snaps its jaws on three straight beats before it peels away and starts
the circle again. The shark is the only subject; it is seen first and stays
large. Light shafts and marine snow are quiet supporting texture that gives the
water depth and scale. The bite is the climax: the camera has moved in, the
jaws fill the frame, and each snap lands with a shake and a burst of bubbles.

## Rhythm

100 BPM, 4/4, 4 bars (one 16-beat phrase; longer loops repeat whole phrases).
At 100 BPM a beat is 0.6 s, close to the native 0.54 s spacing of the bite
take's chomps, so the bite plays at nearly its authored speed.

- Beats 0–8, **Swim**: Swim_Vertical plays one cycle per bar (4 beats, ~1.4×
  native), so the tail beats with the bar. The shark goes once around a wide
  ellipse, banking into the turn and fading slightly in the fog as it goes
  around the far side.
- Beats 8–11, **Idle**: a cross-fade into Idle as the shark coasts to the
  front and turns to face the camera. The camera eases in. This is the held
  breath before the hit.
- Beats 11–16, **Bite**: the Bite take is time-warped so its three jaw
  closures land exactly on beats 12, 13 and 14 (bar 4 beats 1–3). Each
  closure gets a short forward lunge, a camera kick and a bubble burst from
  the mouth. Beat 15 is a deliberate rest while the take settles and the
  shark turns away; the camera pulls back across the seam as the bite
  cross-fades into the swim.

Background light shafts sway once over the loop, and the snow drifts by whole
cycles. Neither competes with the beat.

## Look and copy

The water runs from cyan-teal at the surface to near-black navy, with soft,
additive light shafts from above. Scene fog matches the mid-water colour, so
the far side of the circle reads as depth. The shark keeps its flat-palette,
low-poly texture (nearest-neighbour sampling, no bleeding between swatches).
Pale cool lighting from above with a cyan rim. No copy.

## Assets and treatment

- file `shark-01/shark.glb` (`collectionFile`): three.js GLTFExporter r187.
  Two skinned meshes share a 33-joint rig and one 1024² palette atlas. The
  shark is about 5.6 units nose to tail and faces +Z in bind space.
  - Bite: 2.96 s, three chomps (jaw fully closed at 0.62 / 1.17 / 1.71 s),
    then about 1.2 s of settling.
  - Idle: 2.50 s gentle hover, with a small jaw twitch.
  - Swim_Vertical: 3.33 s full-body undulation.
  - All three takes start and end within 1° of the same pose, so each loops cleanly. Cross-fades
    between takes are blended in one AnimationMixer, with weights summing to 1. Every action's time
    and weight is a pure function of the beat, and the mixer is updated
    with a zero delta.

## Canvas and success criteria

Portrait first, then landscape. On both canvases:

- The whole shark stays in frame and large while it swims, and the jaws dominate the frame during
  the bite.
- The three snaps read as hits in their own frames: jaw closed, lunge, shake, bubbles.
- Beat 15 is visibly calmer.
- The seam frames look like ordinary swim motion. The camera and the shark keep moving through the
  join instead of snapping.

## Review notes

- First pass: the swim camera watched the centre of the ellipse from about 32 units away (portrait),
  and the fog was fixed at 6–30 units, so the shark nearly vanished on beats 2–6. Fix: the swim
  camera now trails the shark (65% follow) with an 8.6 × 6.4 frame, and the fog scales with the
  shot (0.85×–3.2× of camera reach). The key light is brighter.
- Second pass: the shark stays large and crisp on the near side of the circle and shrinks into the
  fog on the far side. Beat 12 shows the closed-jaw lunge, beat 12.5 the jaws wide open between
  snaps, and beat 14 the bubble burst. The seam frames are ordinary swim motion with
  the camera still moving. Determinism and seam checks pass on both canvases.
- Landscape: the swim fits with room to spare. The bite close-up fills the frame, and at the beat 14
  lunge the dorsal fin just touches the top edge (accepted for the close-up).
- On the far side of the circle (beats 2–3) the shark heads away and is seen from above. It reads as
  part of the turn rather than as a separate pose.
- Rider revision: in the first pass he disappeared during the bite. The `mouth_1` bone sits inside
  the head, so the anchor moved to `mouth_tip`. The drifters rendered fully lit and dominated the
  swim shots, so they became silhouettes. Stills at frames 225 and 234 (beats 12.5 and 13) confirm
  him crouched on the tongue and then clamped in the jaws. At the seam he is mid-somersault back
  to the shark's back. Determinism and seam checks pass on both canvases.
- Sheets: `out/preview/shark-frenzy-portrait/sheet.png`,
  `out/preview/shark-frenzy-landscape/sheet.png`.
