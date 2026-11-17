# Rando Wando

## Original brief

Create a video that looks like driving down a city street with tall buildings on either side. The buildings are made of cubes. the faces of these cubes have random gifs from the public assets collection. the blocks hop and settle with the beat, as if they are shaken by a seismic wave of the music.

## Revision request (2026-11-16)

> let's make some updates to rando-wando. first off, i'd like to get rid of the hood and the sun. let's also make sure the lines in the street are going the right way, let's also use the gif-dancimal assets instead. and color-wise, let's use colors that complement those assets. let's also make this have a fisheye lense view. give me a controllable parameter for the lensing effect.

What changed, and the choices made for the open parts:

- Hood and sun are gone (the `hood` prop with them). The hit thump now only bobs the camera.
- Lane dashes were sliding away from the viewer: the CSS background offset ran the wrong way. Dashes are now quads fixed in the world every `PITCH`, so they rush toward the viewer with the buildings by construction.
- Faces use all 25 clips of `gif-dancimal` (Neil Sanders dancing-character stickers) in their own colours; the gradient maps are gone. Every clip is a seamless transparent loop, so each plays forward continuously at close to native speed: its pass length is the power-of-two number of beats (1, 2, 4 or 8) nearest its native duration, then rounded to whole passes per loop. Each sticker is fitted whole inside its face (not cropped) on a flat ground.
- Palette: the stickers are mostly saturated orange, yellow, lime and red, so the world goes to their complement: indigo, violet, cobalt and lilac. Warm stickers sit on violet/cobalt/indigo grounds; the few cool ones (blue bird, teal, small blue dancer) on plum, magenta-plum or pale lilac; the light ones (white cat, pale blue frog) on dark grounds only. Sky runs night indigo to violet to a lilac horizon; distance fades into a lavender haze. The lane dashes are sticker yellow, the one warm note in the street, so the road answers the characters.
- Fisheye: `fisheye` (0 to 1, default 0.7) is an atan-style fisheye centred on the frame. A point the flat camera puts at radius s (in half-diagonals) is drawn at atan(c·s)/c, with c = 1.3 × fisheye. The centre keeps its scale. The edges gather a wider field (up to tan(c)/c half-diagonals at the corners), so the curbs curve, the horizon bends and the facades bow. 0 is the old flat view. A plain polynomial barrel (r(1 + k r²)) was tried first. It barely bent the street, because the street's lines radiate from near the frame centre.
- Implementation: road, curbs, dashes and slabs moved into the WebGL canvas with the cubes. Every quad is drawn as a grid (6×6 cells for cube faces, 48×48 for the road and its markings), and the vertex shader moves each grid point through the camera roll and then the lens, so straight edges bend without an offscreen buffer. The sky is a full-screen pass that runs the inverse lens and roll per pixel, so it curves and rolls with the street. Fog is computed per pixel from distance. Culling uses the lens's wider reach.
- With the bonnet gone the bottom of the frame was an empty road, so the horizon moved up from 0.6 to 0.56 of the height. Back slabs carry less base haze (0.12, was 0.3): a near slab used to show as a pale ghost against the dark sky.

Sections below describe the original version; where they mention the sun, bonnet, gradient maps or `test` clips, the notes above supersede them.

## Idea and hierarchy

We aren't trying to make a realistic street scene here. This is mean to be a highly stylized and abstract geometric scene. The viewer should read it as driving down the street with buildings, but it can veer into the abstract when necessary.

Chosen reading:

1. First: the street itself. One-point perspective, a low sun on the vanishing point, amber lane dashes rushing under an abstract bonnet. This is what says "driving".
2. Answer: the buildings. Each is a single stack of 3 to 7 cubes; the cubes hop apart, tilt and settle as each hit passes.
3. Quiet: a flat slab of "city" behind each stack, the sky gradient and the haze that swallows the far end of the street. None of these hop.

## Rhythm

This should be a 100 bpm scene that feels loose and casual. Almost fun.

- 100 BPM, 4 bars of 4/4 (16 beats, 288 frames at 30 fps, frame exact).
- Drive: the camera passes 3 buildings per bar, 12 per loop, and the street is a ring of 12 buildings per side, so the loop closes on the same block it started from. Three against the four-beat bar is deliberate: the buildings never sit in the same place on consecutive beats, so the drive does not strobe with the hops.
- Hops: an eighth-note grid with swing 0.3, strengths `[1, 0, 0.55, 0, 0.85, 0, 0.55, 0.4]` per bar: a big one, a soft one, a medium one, a soft one, and a swung pickup into the next bar.
- Seismic wave: a hit reaches a building 0.11 beats later per cube size of distance, so each beat visibly ripples away down the street. Inside a stack every cube starts 0.06 beats after the one below it and rides on top of it, so the top of a tower is thrown highest and lands last. One hop is a jump, a smaller bounce and a settle over 0.9 beats.
- Call and response: the right side of the street answers the left half a beat later.
- Slow motion, all in whole cycles per loop: one lane drift left and right, two cycles of camera roll. The sun and bonnet take a small pulse from the hits.

## Look and copy

The look should map the colors of the assets to a palette of amber pink and blue.

- Every clip is reduced to luminance and sent through one of four four-stop gradient maps built from navy, blue, pink, amber and cream, so no source colour survives. Transparent stickers sit on a flat amber, pink, blue or cream face.
- Front faces are shaded darker than street faces so a stack reads as cubes; every face has a thin navy edge.
- Sky runs navy to blue to pink to amber at the horizon. Distance fades to a pink haze.
- No copy.

## Assets and treatment

- use `test/filmstrips`: remap the colors to the palette described above. they are meant to be texture for the block faces.

Assumption: this means the clips of the `test` collection (whose filmstrips are in `collections/test/filmstrips/`), not the filmstrip contact images themselves. All six clips are used, picked per face by a seeded weighted draw; `variant` re-rolls the draw. Each face starts a whole number of beats out of step with its neighbours.

| Clip | Facts from manifest and filmstrip | Treatment |
| --- | --- | --- |
| `Art Animation GIF by Mr Tronch.gif` | 480 square, 30 frames, opaque, loops | One pass per 4 beats |
| `Cartoon Glitch GIF by Santi_OFF.gif` | 480 square, 62 frames, opaque, hard cuts inside, does not loop | One pass per 8 beats; its restart is a cut on a beat, in keeping with the glitch footage |
| `Fun Love Sticker by Tarver.gif` | 480 square, 15 frames, alpha, loops | One pass per 2 beats, on a flat face colour |
| `Animation Cartoon Sticker by FUN WITH FRIDAY.gif` | 390x480, 2 frames, alpha | One pass per beat (flips every half beat), cropped to the square face |
| `slapchop-video-20260824-205001-10s.mp4` | 1080x1920, 300 frames, no loop, changes every second or two | One of three seeded 4-beat excerpts at native speed, centre-cropped; restarts on a beat |
| `movie-2026-10-19-19-57.0.mp4` | 1080x1920, 1806 frames at 60 fps, black ground, no loop | Same as above, read every other frame; the black ground maps to navy |

Pass lengths are rounded to a whole number of passes per loop, so other tempos and bar counts still close.

The clips are not drawn with `Clip` or `ClipFrame`. Over a hundred faces are visible at once, and a player per face ran Studio out of GPU memory. Instead `textures.ts` decodes each clip once, at face size, into luminance and alpha, and `FaceCanvas.tsx` draws every cube face as a textured quad in one WebGL canvas, applying the gradient map, shade, haze and edge there. Frame choice still comes only from the beat (per-face offsets and excerpts). The road, slabs, sky, sun and bonnet remain ordinary elements.

`useVideos: false` leaves the two videos out, which skips decoding their excerpts when the sketch loads.

## Canvas and success criteria

the scene reads and driving down a city street and the motion in the building blocks is fun and bouncy.

- Portrait first (a tall canyon with a strip of sky); landscape must also read as a street.
- Observable: lane dashes and buildings move toward the viewer; gaps open between cubes on the hits and close again before the next strong hit; far buildings hop later than near ones; nothing but amber, pink, blue and their navy and cream ends appears on a face.

## Review notes

- First portrait sheet: a navy band showed between the end of the road and the horizon, and haze washed out the middle distance. The ground below the horizon now continues in haze colour and the haze starts later and stops at 82%.
- Landscape: the facades filled the frame and the road was a thin strip. The street now widens with the canvas aspect (up to 2x) so road and sky keep their share.
- Far background slabs were depth-sorted in front of near tilted cubes by the browser. Slabs and road moved to their own layer behind the stacks; they never stand in front of a cube.
- Both canvases pass determinism and the seam check; the seam row shows ordinary travel.
- Studio became unusable with one `ClipFrame` per face (about 120 canvases and a 115-row timeline). After moving the cubes to shared textures and one WebGL canvas, Studio plays at 30 fps. The cubes now have true depth ordering, so flat patches the old headless render showed on the left side are gone.
- Renders need WebGL 2. The default renderer provided it here; if a machine does not, pass `--gl=angle`.
