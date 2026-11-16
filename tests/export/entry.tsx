/**
 * Entry point for the rendered export tests: one sketch that needs no media
 * and paints no backdrop, so its alpha exports contain real transparency.
 * `filled` covers the opposite case, a sketch that paints its whole frame.
 */
import React from 'react';
import {AbsoluteFill, Composition, registerRoot} from 'remotion';
import {z} from 'zod';
import {useBeat} from '../../src/beat/BeatContext';
import {pulse} from '../../src/beat/envelopes';
import {useCanvas} from '../../src/sketches/canvas';
import {defineSketch} from '../../src/sketches/define';

const schema = z.object({filled: z.boolean()});
const Probe: React.FC<z.output<typeof schema>> = ({filled}) => {
  const {beat, beatPhase, totalBeats} = useBeat();
  const {vmin, cx, cy} = useCanvas();
  const angle = (beat / totalBeats) * 2 * Math.PI;
  const size = (18 + 8 * pulse(beatPhase, {attack: 0, decay: 0.6, curve: 2})) * vmin;
  return (
    <AbsoluteFill style={filled ? {backgroundColor: '#203060'} : undefined}>
      <div style={{position: 'absolute', left: cx + 22 * vmin * Math.cos(angle) - size / 2,
        top: cy + 22 * vmin * Math.sin(angle) - size / 2, width: size, height: size, backgroundColor: '#ff5fa8'}} />
    </AbsoluteFill>
  );
};

const probe = defineSketch({
  id: 'export-probe', title: 'Export probe', description: 'An orbiting square over nothing',
  schema, defaults: {filled: false}, Component: Probe,
});

registerRoot(() => (
  <Composition id={probe.id} component={probe.Loop} schema={probe.schema} defaultProps={probe.defaultProps}
    calculateMetadata={({props}) => probe.metadata(props)} width={1080} height={1920} fps={30} durationInFrames={1} />
));
