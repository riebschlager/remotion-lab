# Milhouse Portal Dive

## Original request

> i'd like to create a copy of the milhouse sketch to try out a new motion idea. here's what i'm thinking: i would like milhouse to break into 2 slices, then the camera dives into the portal exposed by the sliced milhouse. and what we find after travelling through that portal is an identical scene with a new milhouse the splits and we fly inside. so it's like we're diving into an infinite series of milhouses that are splitting apart. what do you think? how could we do this? also, help me make this idea better.  i am open to pitches!

## Direction

Fork Milhouse Slices and keep the satin vinyl, softbox lighting, plum studio and cyan/magenta palette. Use the same supplied FBX (`milhouse-01/milhouse-2.fbx`, with an embedded palette texture) in a fixed pose so the silhouette matches exactly between worlds. This sketch uses real horizontal mesh sections. Preserve the 120 BPM, 4/4, four-bar timing and use one dive per bar.

Give the opening and the plunge distinct moments. The upper half floats up and to one side, leaving the lower cut face as the entrance. Hold briefly so the viewer has time to see the next intact Milhouse through its rim. Let the camera pitch into the cut and accelerate on the way in. Project the destination scene onto the actual cut surface and match its framing to the next cycle when it fills the view. Repeat the same shot at each depth. Omit text.

Review portrait and landscape for a readable intact silhouette, a recognizable destination in the opened cut, and a continuous handoff. Expose the split amount, dive timing and rim colors in Studio.

## Review

The upper half now drifts only slightly to the side, which leaves both halves
in view through the hold in portrait. As the dive starts, the upper half leaves
the frame and the cut fills it. The first shot in the next room uses the same
pose, framing and lighting as the opening. This makes a single offscreen pass
sufficient for the repeating illusion.

Reviewed live Studio playback and detailed portrait and landscape sheets.
The center of the portal reads as a smaller figure, and the cyan and magenta
contours make the transition visible before the destination fills the frame.
The dive frame rendered pixel-identically after later frames on both canvases.

- Portrait detail: `out/preview/milhouse-portal-dive-portrait-detail/sheet.png`
- Landscape detail: `out/preview/milhouse-portal-dive-landscape-detail/sheet.png`
- Strict loop previews pass on both canvases. The normalized seam jump is
  0.00079 in portrait and 0.00050 in landscape.
- `npm run check` passes all 101 checks.
- `npm run test:visual` passes all 88 rendered checks, including the original
  Milhouse sketch and the fork's two canvases and seam-view correspondence.

## FBX performance revision

> this is a great start. let's bring in the animation from the fbx.

Use a continuous excerpt of the original skeletal animation. The asset's
silhouette sheet shows a front-facing open-palm gesture around 13 seconds, so
start just before it and carry the gesture through the split. Ease into the
last source pose before the camera enters the cut, giving it a stable target.
The next room previews the starting pose of the same performance so the
handoff lands on the same shot and timing. Keep the four-bar loop, 120 BPM,
camera path, studio lighting and real horizontal cut. Expose source in/out
times (seconds) in Studio. Remove horizontal rig travel to keep the portal
on the studio mark. Review the gesture and the handoff on both canvases.

Default excerpt is 11.8–13.2 seconds. Source keys are sampled directly from
bar phase on a cloned rig. The source pose changes while the horizontal cut
opens, then settles at the last source pose for the plunge. The camera pans
slightly with the upper half to keep the gesture in the portrait frame. The
next room renders the exact starting pose and the excerpt restarts on arrival.
Older Studio props inherit both source defaults.

Reviewed Studio playback, the active cut and the handoff in both canvas sheets.
The active split frame rendered pixel-identically out of order on both canvases.

- Portrait gesture and handoff: `out/preview/milhouse-portal-dive-animation-portrait/sheet.png`
- Landscape gesture and handoff: `out/preview/milhouse-portal-dive-animation-landscape/sheet.png`
- `npm run check` passes all 101 checks. Existing props without source timing
  resolve to the new defaults, and reversed or out-of-range times are rejected.
- Both strict loop previews pass. The full visual suite passed all 88 checks
  on the animated revision before the final framing adjustment.
  The final framing also passes all four targeted portal checks, including
  portrait, landscape and exact seam-view correspondence.

## Continuous motion through the dive

> is there a technical limitation that forces us to stop the animation when the split happens? if not, can we keep it rolling?

The fixed landing pose was a camera choice. Play the source excerpt continuously
through the whole bar, including the plunge. Extend the default out point so the
original gesture still lands around the start of the dive. Recut the posed mesh
at every beat sample and track the current cap's interior and clearance, so the
camera can still fill the frame with the portal. As before, the new room arrives
on the excerpt's starting pose. Check successive late-dive frames on both
canvases for continuing motion and a clear path into the next room.

The default excerpt now spans 11.8–14.35 seconds. Its playback follows bar phase,
so moving `diveStart` only shifts the camera. The hand and head keep changing
pose during the plunge. Reviewed Studio playback and both canvas sheets,
including the expanding cut and the incoming room. Frame 44 reproduced exactly
after later frames on both canvases.

- Portrait dive: `out/preview/milhouse-portal-dive-rolling-portrait/sheet.png`
- Landscape dive: `out/preview/milhouse-portal-dive-rolling-landscape/sheet.png`
- `npm run check` passes all 101 checks.
- Strict previews pass on both canvases. Normalized seam changes measure
  0.00078 in portrait and 0.00046 in landscape.
- `npm run test:visual` passes all 88 checks, including both canvases and
  exact seam-view correspondence for the rolling dive.
