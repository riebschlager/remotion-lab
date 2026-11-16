# Working in remotion-lab

Start with README.md. This is a beat-locked, deterministic animation platform;
the musical clock and periodic behavior are its core contract.

- Read `.agents/skills/remotion-best-practices/SKILL.md` for Remotion work and
  `.agents/skills/beat-loop/SKILL.md` for timing, envelopes or layers. Load only
  relevant upstream references. The project's beat clock specializes Remotion's
  frame-driven animation guidance: layers use `useBeat()`; only `BeatProvider`
  calls `useCurrentFrame()`.
- Frames may render in any order. No wall clocks, accumulated state, unseeded
  randomness, CSS animations or transitions. Use the beat helpers.
- Validate resolved props through `validateLoopProps` in both metadata paths.
  Add cross-field checks for new timing-dependent parameters. Disabled layers
  do not participate in division compatibility checks.
- Keep final defaults free of diagnostics. Enable `debug` explicitly for
  inspection. Keep authored composition selector/timing defaults inline so
  Studio can save edits; procedural layer defaults belong in `defineLayer`.
- Run `npm run check` after changes. For rendered motion or timing changes,
  also run `npm run test:visual`; inspect Studio for aesthetic changes.
  `npm run seamcheck` is a manual diagnostic, not an automated pass/fail test.
- Official skills and `skills-lock.json` are checked in. Use
  `npm run skills:update` deliberately, review the diff, then run
  `npm run skills:check`. Keep upstream skills intact; put local conventions
  in the beat-loop skill.

New layers own their schema, defaults, component and optional extra validator
in one module. Add the exported definition to `src/layers/registry.ts`;
schema fields, rendering, validation and debug divisions derive from it.
Use disabled defaults for opt-in layers so existing presets keep their look.
Add named looks in `src/presets.ts`; overrides merge individual layer fields.
For repeated types, use `layers: [{id, type, props?}]`. Array order is z-order;
IDs must be unique and stable. Instance props inherit the top-level settings
for their type, then override individual fields. A supplied `layers` array
replaces the legacy stack (including `[]`); `layerOrder` applies only when
`layers` is omitted. Preset array overrides replace the complete array.
Namespace randomness with `useLayerInstance().seed('channel')`, never an array
index, so reordering preserves motion. All enabled instances receive shared
and local musical validation. Edit these procedural stacks through props
rather than authoring independent timeline clips.
See the beat-loop skill for details and add appropriate loop tests.
