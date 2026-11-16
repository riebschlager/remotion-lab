---
name: brief-to-sketch
description: Turn a creative brief into a finished, verified beat-matched sketch in remotion-lab, choosing collection assets, Clip playback and kinetic Type from the intended mood. Use for new sketches and creative revisions, not engine maintenance or export-only requests.
---

# From a brief to a loop

Make a small piece someone would want to watch twice. A technically periodic
animation is only the starting point: the viewer should recognize a focal idea,
feel a rhythm, and read any important words without chasing them.

Read the repository README.md and AGENTS.md, then the local
[beat-loop skill](../beat-loop/SKILL.md) for engine contracts and API recipes.
Load the official Remotion router and only the references needed for this sketch.
This skill is about creative choices; beat-loop owns clocks, validation,
asset access, Clip/Type constraints and testing mechanics.

## Interpret before building

Separate the brief's commitments (exact copy, tempo, named assets, things to
avoid) from its open choices. Preserve the commitments. Infer reasonable defaults
for open choices and record them in the sketch brief. Ask only when the missing
answer would change the requested meaning or make the work impossible: conflicting
must-haves, unavailable required media, or exact copy that was never supplied.
An unspecified palette or hit pattern is a design decision, not a blocker.

Give the piece one focal idea and a visual hierarchy. Decide what the viewer sees
first, what answers it, and what stays quiet. Translate mood into a musical and
visual relationship, rather than applying a mood word to every parameter:

| Brief language | Useful starting direction, subject to the brief |
| --- | --- |
| Calm, suspended, nocturnal | Fewer attacks, long tails, a restrained palette and slow whole-loop motion; keep defining forms and responses visible |
| Punchy, defiant, graphic | Short attacks, clear size/contrast changes, readable large type, deliberately placed rests |
| Playful, wonky, syncopated | Call-and-response, uneven strengths, swung pairs, independent but related phrases |
| Hypnotic, flowing | Repeating motifs with slower counter-motion, restrained palette, a seamless source or smooth scrub |

Tempo is only one part of the feeling. A quiet piece at a supplied fast BPM can
use half-time phrasing; do not silently replace the requested tempo. Avoid making
every element peak on the same beat unless that unison is the idea. A backdrop
can breathe slowly while a subject answers offbeat. Rests create shape; adding
layers is not a substitute for composing the rhythm. Quiet should come from pace,
space and event density, not from making the promised response disappear. Supporting
gestures can be quieter than the lead while still having enough area, line weight
and contrast to be recognized at the intended viewing size.

## Design from the available material

If media is involved, read the relevant collection manifest before committing to
a layout. Open the filmstrip of every candidate clip. Descriptions, frame count,
alpha, native shape and the loop flag explain what the material can do; a filename
alone does not. Check font faces, axes and missing characters before promising a
typographic treatment. Never invent an axis or quietly substitute missing media.

Choose a playback treatment for the intended gesture:

- Clip **fit** for a repeated action synchronized to a beat/bar phrase.
- **retrigger** for hits that interrupt or launch an action; rests should matter.
- **step** for deliberate stop-motion/collage changes.
- **scrub** for rocking or wandering through footage.
- Type **all** for a unified statement, **sequence** for an ordered emphasis,
  **stagger** for a traveling response; line/word/letter split changes its scale.

Consult beat-loop and README for the actual schemas and closure rules before
choosing numbers. A non-looping clip needs an intentional cut treatment, such as
ping-pong or a reset fade; neither fixes internal cuts. Seamless footage can still
be interrupted mid-action by retriggering. A static font cannot pulse a variable
weight: use a supported visual treatment or explain a real requirement conflict.
Keep important text visible long enough to read the entire phrase. A readable
base state with moving emphasis often works better than flashing isolated words.

## Make the intent concrete

Scaffold with `npm run sketch:new -- <id>`, then write its brief.md before changing
the scaffold animation. Preserve the original request there, and record the chosen
focal idea, musical roles, asset evidence, Clip/Type choices, copy, canvases and
observable success criteria. Keep it current when design changes.

Build inside the sketch folder. Use the existing beat toolkit and sketch-level
building blocks rather than changing the engine for one idea. Author meaningful
content/rhythm controls as props. Use canvas fractions and vmin so the design
survives a change of shape.

All motion belongs to the loop, not only the hits. A drift, rotation, colour cycle
or breath should complete whole cycles over the loop, or over a phrase that divides
it, so the first frame continues from the last instead of snapping back. Think of
these periods in bars and beats, never seconds or frame counts: the loop's actual
length moves with tempo, meter, bars, fps and frame rounding. Slow motion is the
easy one to get wrong, because a half-finished drift looks fine on every interior
frame and only breaks at the join. Derive it from the wrapped beat clock with the
helpers beat-loop describes; a hand-written `time * speed` will not close. Validate exposed timing, asset playback and type
settings using the project's existing bindings/helpers. Do not invent an API
from its name: read a working example or implementation when uncertain.

Open Studio as required by the Remotion guidance. Generated procedural units are
edited through sketch props; do not author separate timeline clips for each hit.
Review the complete composition as well as its parameters.

## Look, judge, revise

Run `npm run preview -- <id>` and open its sheet.png. Read it against the brief,
not just the PASS labels:

- At phone size, is the focal idea obvious? Can the important phrase be read?
- Compare on-beat and later frames. Do intended attacks read as hits, and do
  rests or answering phrases have a visible role? A tiny pulse can pass every test.
- Is there enough quiet space for the subject, or are sources fighting each other?
- Across the seam row, does the join resemble ordinary motion or a documented
  intentional hit? A repeating clock alone does not prove a smooth join.

The default sheet samples a subset of beats. Check its beat labels against the
rhythms you authored: sparse hits, offbeat replies and delayed smooth peaks may
never appear there. Use the computed timing in report.json to render additional
stills just before, at/near the peak, and after a missing defining gesture (the
Remotion render skill documents `npx remotion still`). Inspect those at roughly
phone size, not only enlarged. A claim of call-and-response needs visible evidence
of the response, not only its formula in the source. If it cannot be identified
in its peak frame, revise its visual weight or timing while preserving the mood.

Fix determinism failures. Treat seam warnings as defects unless inspection shows
an intended hit. Also fix visual failures even when the diagnostics pass. Change
the cause (rhythm, hierarchy, scale, source choice), then preview and inspect again.
Do not merely raise a threshold or describe an accidental cut as intentional.

Preview a second canvas, normally landscape after portrait, and inspect its sheet
too. Copy the first preview folder to a canvas-named folder before running the
next one: the preview command overwrites the same output directory. Check cropping,
text fit, effects clipped by Type's box, and focal scale on both. Composition
adaptation may be more appropriate than stretching or shrinking everything.
Run npm run check and the rendered checks required by AGENTS.md. Separate unrelated
existing failures from failures in the new work; preserve user edits.

## Finish with evidence

Deliver the sketch ID and an accessible Studio link, explain the visual/rhythmic
choices and asset treatment, and link the inspected contact sheets. Report what
passed, any unresolved limitations, and whether media-dependent checks could run.
Describe any deliberate cuts or compromises. Do not claim a full export exists
when only previews were requested. Keep the brief and code together. Do not commit
or publish unless asked.
