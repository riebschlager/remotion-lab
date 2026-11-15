# remotion-lab — notes for Claude

Remotion project for 1080×1920 seamless loops with beat-locked motion. See README.md for the full picture.

Non-negotiables when editing layers:
- Time comes only from `useBeat()` (src/beat/BeatContext.tsx). Never `useCurrentFrame()` in a layer.
- Every frame must be a pure function of beat position: no state, no feedback, no `Math.random()`. Use `stepRandom` / `loopNoise` / `lfo` from src/beat/envelopes.ts.
- New layers: schema in src/schema.ts (extend `baseLayerSchema`), component in src/layers/, add to the stack in src/LoopComposition.tsx inside `<Layer>`, and add its division to `BeatDebug`.
- Verify with `npm run typecheck` and `npm run seamcheck`.
