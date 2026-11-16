/**
 * Entry point for tests/visual/assets.test.ts: one sketch that shows a chosen
 * GIF frame, a chosen video frame and a line of collection type, so the test
 * can read back what the browser decoded and compare it with the manifest.
 *
 * It is also the smallest complete example of a sketch that uses assets.
 */
import manifests from 'asset-fixture-manifests';
import React from 'react';
import {AbsoluteFill, Composition, registerRoot} from 'remotion';
import {z} from 'zod';
import {createAssets} from '../../src/assets';
import {ClipFrame} from '../../src/assets/ClipFrame';
import {useCanvas} from '../../src/sketches/canvas';
import {defineSketch, useAsset} from '../../src/sketches/define';

const {clip, font} = createAssets(manifests);

const schema = z.object({
  gif: z.string(),
  gifFrame: z.number().int().min(0),
  video: z.string(),
  videoFrame: z.number().int().min(0),
  family: z.string(),
  weight: z.number().min(1).max(1000),
  italic: z.boolean(),
  /** Read a clip that `assets` does not list. */
  undeclared: z.boolean(),
});
type Props = z.output<typeof schema>;

const Undeclared: React.FC = () => {
  useAsset(clip('fixture', 'pulse.gif'));
  return null;
};

const Probe: React.FC<Props> = ({gif, gifFrame, video, videoFrame, family, weight, italic, undeclared}) => {
  const {width, height} = useCanvas();
  const band = height / 3;
  const still = useAsset(clip('fixture', gif));
  const moving = useAsset(clip('fixture', video));
  const type = useAsset(font('fixture', family));
  return (
    <AbsoluteFill>
      <ClipFrame clip={still} frame={gifFrame} width={width} height={band} fit="fill"
        style={{position: 'absolute', top: 0, left: 0}} />
      <ClipFrame clip={moving} frame={videoFrame} width={width} height={band} fit="fill"
        style={{position: 'absolute', top: band, left: 0}} />
      <div style={{position: 'absolute', top: 2 * band, left: 0, fontFamily: type.fontFamily, fontSize: band,
        lineHeight: 1, color: 'white', fontWeight: weight, fontStyle: italic ? 'italic' : 'normal',
        fontVariationSettings: `"wght" ${weight}`}}>A</div>
      {undeclared ? <Undeclared /> : null}
    </AbsoluteFill>
  );
};

const probe = defineSketch({
  id: 'asset-probe',
  title: 'Asset Probe',
  description: 'Shows one GIF frame, one video frame and one glyph from the fixture collection.',
  schema,
  defaults: {gif: 'steps.gif', gifFrame: 0, video: 'clips/count.mp4', videoFrame: 0, family: 'Lab Block',
    weight: 400, italic: false, undeclared: false},
  canvas: 'square',
  Component: Probe,
  assets: (props) => [clip('fixture', props.gif), clip('fixture', props.video), font('fixture', props.family)],
});

registerRoot(() => (
  <Composition id={probe.id} component={probe.Loop} schema={probe.schema} defaultProps={probe.defaultProps}
    calculateMetadata={({props}) => probe.metadata(props)} width={1080} height={1080} fps={30} durationInFrames={1} />
));
