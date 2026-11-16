# Brief-to-sketch evaluation

## Method

Three fresh subagents received only their original brief, the instruction to use
brief-to-sketch, and an isolated working directory. They had the project and its
real `test` collection, but no parent chat history, expected design, or critique.
Each copy had separate source and output; node_modules and public media were
shared inputs. The parent reviewed code, briefs, reports and both
canvas sheets, then imported accepted sketch folders and registered them.

Original inputs are [quiet](quiet.brief.md), [type](type.brief.md) and
[media](media.brief.md). The skill was revised after the initial trials; the
quiet brief was then sent unchanged to another fresh subagent in a clean copy.
No original quiet source, critique or suggested design was given to that agent.

## Initial results

| Trial | Output and choices | Technical evidence | Creative review |
| --- | --- | --- | --- |
| Quiet / 84 BPM / 3/4 / no media | Dusk Tide: peach crescent breathes once per bar; faint water ellipses answer one beat later | 84 unit tests, 67 rendered tests; both canvas previews deterministic and seam PASS | Focal form and mood worked, but the answering gesture was too faint at phone size; rejected for revision despite technical success |
| Type / 132 BPM / 4/4 / font only | Off Grid: paper-white OFF GRID call at 0/8, coral ON BEAT answer at 3/11; static BBH Bogle; portrait stack, landscape columns | 84 unit tests, 67 rendered tests; both canvas previews PASS; explicit beat-3 answer still inspected | Accepted after the agent enlarged the initial type, caught a cropped D on landscape, and reduced its wide-canvas scale |
| Media / 116 BPM / 4/4 / GIF + video | Happy Static: seamless blue Tarver smiley scrubbed smoothly, swung response bounces over a bounded collage fit with reset fade | 84 unit tests, 67 rendered tests; both canvas previews PASS | Accepted: clear character, visible replies, dark breathing room, blue/yellow hierarchy; internal montage changes remain intentional source cuts |

The type agent's own second-canvas correction is useful positive evidence:
the workflow led it to fix an aesthetic defect that the seam checks did not
identify. It also independently rendered the answer hit that the default sheet
missed. The media trial read the two relevant filmstrips and documented why its
non-looping source needs a fade; it did not simply cycle an arbitrary video.

## Failure and skill revision

The initial quiet result was a creative failure, not a determinism or seam failure.
The parent inspected its response near its delayed peak at frame 54 (about beat
2.5). At 216 pixels wide the answering rings were almost lost against indigo.
The initial wording paired quiet mood with restrained contrast, while the review
questions did not explicitly require finding each promised gesture at its peak.

The skill now says quietness should come from pace, space and event density,
while a defining response still needs sufficient area, line weight and contrast.
It also explains that the contact sheet subsamples beats, and asks for additional
before/peak/after stills when important hits or smooth peaks are absent. This
changes how an agent judges any subtle or syncopated piece; it does not prescribe
a crescent, a palette, a stroke width, or a fix for this one sketch. No seam
thresholds, engine rules or validators were relaxed.

Initial rejected evidence is preserved under
`out/evaluation/brief-to-sketch/dusk-tide-v1-{portrait,landscape}/sheet.png`
and `out/evaluation/brief-to-sketch/quiet-v1-answer-peak.png`.

## Fresh quiet rerun

The revised skill produced a different, broader peach vessel over three water arcs.
The agent checked the response around beats 3.04, 4.48 and 6.02, then increased
its visual weight after its first sheet: stroke 0.19 → 0.32 vmin and base opacity
0.24 → 0.36. The parent inspected both final sheets and accepted this version.
The source keeps the requested 84 BPM and 3/4, using a six-beat main breath and
a 1.5-beat delayed answer. No parent editing or design hint was given to the agent.
The response is still quieter than the focal form; it no longer relies on zooming
the preview to identify it. Both final previews passed determinism and seam checks; the fresh agent also
reported 84 unit tests and 67 rendered tests passing, with no skips.

Accepted source:

- [Dusk Tide](../../src/sketches/dusk-tide/sketch.tsx)
- [Off Grid](../../src/sketches/off-grid/sketch.tsx)
- [Happy Static](../../src/sketches/happy-static/sketch.tsx)

Preserved final sheets are in `out/preview/<id>-portrait/sheet.png` and
`out/preview/<id>-landscape/sheet.png`. Each folder also has the measured report
and individual preview frames; the poster portrait folder includes its answer-hit
still. These generated images are local artifacts rather than committed media.

## Scope and practical limits

The workflow covers ambiguous mood briefs, explicit commitments, collection
research, one focal idea with contrasting musical roles, Clip/Type selection,
relative sizing, preview critique, revision, a second canvas and an evidence-based
handoff. Engine/API constraints remain in beat-loop; official skills are intact.

These trials do not establish a universal taste metric. Briefs asking for exact
reference matching without a visual reference, long narrative edits, many tiny
pieces of copy, unsupported scripts, unavailable variable fonts, or unavailable
required footage will need more context or capabilities than this workflow alone
provides. Tempo-only sync does not infer choreography from an audio recording.
Very sparse and very subtle work still depends on inspecting the right moments.

Studio/browser launch required normal local rendering permissions. The subagent
UI surface could not open tabs; their rendered-image reviews were retained, and
the parent inspected accepted outputs in the main Studio. No video exports,
commits, registry layers, new media or shared engine changes were requested or made.
