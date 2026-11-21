# Milhouse Infinite Bloom

> let's make a new sketch that is a mashup of two existing sketches. i want to use infinite-bloom as the background for milhouse-portal-dive. i like the idea of the psychedelic pattern of the bloom acting as an animated background for the environment milhouse is in.

Keep the animated Milhouse performance, horizontal split, cyan and magenta
portal, and one dive per bar from Milhouse Portal Dive. Use its 120 BPM, 4/4
and four-bar loop. Infinite Bloom's rings expand continuously through all
four dives, with a new ring every two beats in the procedural default.
The bloom should feel like the room around Milhouse and stay visible as the
next Milhouse arrives.

Magnify and cool the procedural flower so the expanding petals fill the
edges of the frame. Keep its center behind the subject and darken the petals
enough to read his silhouette. Start with procedural petals so the piece
runs with the existing `milhouse-01/milhouse-2.fbx`, its original skeletal
animation and embedded palette. Keep Infinite Bloom's collection GIF settings
available in Studio. No copy.

Review portrait and landscape for clear silhouettes and cut rims, visible
petal motion while the cut opens, and a continuous arrival in the next room.

## Review

The [portrait](../../../out/preview/milhouse-infinite-bloom-portrait/sheet.png)
and [landscape](../../../out/preview/milhouse-infinite-bloom-landscape/sheet.png)
previews pass determinism and the strict seam check. The dive studies in
[portrait](../../../out/preview/milhouse-infinite-bloom-portrait-dive/sheet.png)
and [landscape](../../../out/preview/milhouse-infinite-bloom-landscape-dive/sheet.png)
show the next figure growing into the frame while the petals stay in motion.
Frame 49, with the cut filling most of the figure, reproduced pixel for pixel
after the later frames on both canvases.

## New room on every dive

> this is great. is there something we can do to shift the scene visually each time we dive into the character and the large version occludes much of the background? i was thinking we could shuffle the gif texture order so that we get a new set of background images with each pass. the look i'm going for is that we are diving into a new milhouse with a new background.

Give each room a distinct GIF texture while the flower geometry keeps growing
through the whole loop. Bring in the next room during the portal handoff,
when the old figure fills the frame. Keep the texture assignment fixed from
one render to the next, and make the last dive arrive back in the first room
before the loop wraps.

Use four opaque, seamless GIFs from `gif-flower` in the default circuit.
Psyklon's Pink Loop (32 frames) gives the opening room a pink spiral, Loop
Distort (32) gives the next room lime-colored folds, Kaleidoscope Visuals (26)
gives the third room dark prismatic spokes, and Fun Vintage (9) gives the
fourth room a warm mirrored floral repeat. Fit their playback to the bar.
Keep the portal rim and figure legible in front of the changing textures.

The [portrait](../../../out/preview/milhouse-bloom-rooms-portrait/sheet.png)
and [landscape](../../../out/preview/milhouse-bloom-rooms-landscape/sheet.png)
previews pass the strict seam and determinism checks. The first dive
crossfades from pink to lime while the outgoing torso fills the foreground.
The [portrait detail](../../../out/preview/milhouse-bloom-rooms-portrait-detail/sheet.png)
and [landscape detail](../../../out/preview/milhouse-bloom-rooms-landscape-detail/sheet.png)
show all four rooms and the first handoff. Frame 54 reproduced pixel for pixel
on both canvases. Studio's `changeRoomTextures` switches between room changes
and the flower's per-ring texture cycling. `variant` changes the room order.

## See the next room through the cut

> this is great. can we see the next room's gif through the portal before we dive in, while the current background is still visible around milhouse?

Project the incoming room's animated GIF onto the lower cut face as soon as
the split exposes it. Use the same room order and beat-sampled GIF playback as
the petal backgrounds. Keep the smaller Milhouse in front of the preview and
the original rim around it. The outgoing bloom remains visible everywhere
outside the cut until the late-dive crossfade reveals the full incoming bloom.

The [portrait](../../../out/preview/milhouse-portal-peek-portrait-detail/sheet.png)
and [landscape](../../../out/preview/milhouse-portal-peek-landscape-detail/sheet.png)
close-ups show the lime GIF inside the cut while the pink room still surrounds
Milhouse. At frame 31 the pixel changes are confined to the cut face, and the
frame reproduced exactly after rendering later rooms. The
[portrait loop](../../../out/preview/milhouse-portal-peek-portrait/sheet.png)
and [landscape loop](../../../out/preview/milhouse-portal-peek-landscape/sheet.png)
passed the strict seam and determinism checks.

## Smooth the last frames of the dive

> there seems to be some unwanted flashes during the dive in animation. it almost appears as if there is some z fighting happening that is causing the flicker.

Keep the next GIF contained within the cut during the preview. During the
last stretch of the plunge, blend the remaining outgoing geometry into the
same opening shot already visible through the portal. The outgoing shirt
and cap should leave smoothly on both canvases even when the cut face has
not covered every corner. Keep the room order, 120 BPM and GIF timing.

The [portrait](../../../out/preview/milhouse-dive-smooth-portrait/comparison.png)
and [landscape](../../../out/preview/milhouse-dive-smooth-landscape/comparison.png)
comparisons show the outgoing torso dropping out gradually during frames
51–55. The frame 54–55 change fell by about 70% on both canvases. Reviewed
[all four room changes](../../../out/preview/milhouse-dive-all-rooms/sheet.png)
and verified that after the dissolve the transparent render matches the
opening shot pixel for pixel. Both canvas loops passed the strict seam and
determinism checks.

## Cross the threshold

> i like the general direction and look of the milhouse-infinite-bloom sketch, but i would like to reevaluate the approach to how the background is integrated into this sketch. currently, the background fades between 'rooms' in a noticeable way. this makes it appear that the background is a slideshow of different looks that are simply fading into each other. the look i would like to see is that you are truly diving into a different world inside the recently split apart milhouse. i am open to visual tricks and stagecraft to obscure the transition, as long as the net effect make it appear that we are clearly transitioning from one world and diving into another. perhaps we can investigate other visual elements, such as displacement or distortion that could help visually sell this move.

The approved direction is a window through the actual horizontal cut, with a
small bend in the departing flower. The first opening should show the lime bloom
and its Milhouse together. Keep that same flower in motion as the rim overtakes
the corners. Let the moving edge and foreground shirt convey the crossing.
Keep the four rooms, original performance and one dive per bar at 120 BPM.
Check the first crossing closely in portrait and landscape, then the other
three arrivals, including the return to pink.

The camera follows the lower cut and finishes the approach with optical
magnification. Both views use the same animated flower as the landing shot.
The destination stays sharp. Only the inner rings of the departing flower
get extra curl. A tight split carries the upper half a little further
sideways during the plunge to keep it clear of the lens.

In the first dive the lime petals surround the smaller figure while pink
petals and the shirt still occupy the edges. The rim clears the frame by
the arrival in both formats. Reviewed the four crossings in
[portrait](../../../out/preview/bloom-window-portrait/sheet.png) and
[landscape](../../../out/preview/bloom-window-landscape/sheet.png).
Frame 49 repeated pixel for pixel on both. Both full-loop previews passed
the strict seam check.

## GIF groups in each room

> this is great. can we make it so that the "rooms" can be made to show collections of gifs from the selected folder rather than single gifs from the folder? it's ok if these are randomly seeded.

Use three GIFs per room by default, distributed across the petal rings.
Keep the four recognizable lead GIFs in the default flower circuit and draw
their companions from the selected folder. Use Variant to reroll the groups.
The portal preview and the landing shot show the same group. The GIFs keep
playing on the existing beat clock through the crossing.

The first crossing pairs the lime folds with copper spirals and neon
chevrons. The ring layers stay recognizable as the opening expands.
Reviewed all four crossings and the return to the opening group in
[portrait](../../../out/preview/bloom-groups-portrait/sheet.png) and
[landscape](../../../out/preview/bloom-groups-landscape/sheet.png).
Both loops passed the strict seam check. The active crossing at frame 52
repeated pixel for pixel on both canvases at the standard preview scale.
