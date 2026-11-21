import React from 'react';
import {AbsoluteFill} from 'remotion';
import {z} from 'zod';
import {clip, type ClipRef} from '../../assets';
import {useClipPlayback} from '../../assets/Clip';
import {useBeat} from '../../beat/BeatContext';
import {stepRandom} from '../../beat/envelopes';
import {defineSketch, useAsset, useSketch, type SketchBaseProps} from '../define';
import {bloomSettings, InfiniteBloom} from '../infinite-bloom/sketch';
import {MilhousePortalDive, portalDiveSettings, portalTransition} from '../milhouse-portal-dive/sketch';

const flowerRooms = [
  clip('gif-flower', 'Pink Loop GIF by Psyklon.gif'),
  clip('gif-flower', 'Loop Distort GIF by Psyklon.gif'),
  clip('gif-flower', 'Kaleidoscope Visuals GIF by SymmetryInChaos.gif'),
  clip('gif-flower', 'Fun Vintage GIF by Daisy Lemon.gif'),
];

const schema = portalDiveSettings.schema.omit({backdrop: true, floorColor: true}).extend({
  bloom: bloomSettings.schema,
  bloomBrightness: z.number().min(0.2).max(1).step(0.05)
    .describe('Brightness of the petals behind Milhouse'),
  changeRoomTextures: z.boolean().default(true)
    .describe('Bring in a different GIF texture during each dive'),
});
type Props = z.output<typeof schema> & Partial<Pick<SketchBaseProps, 'transparent'>>;

const backgroundClips = ({bloom, changeRoomTextures, transparent}: Props) => {
  if (transparent || bloom.textureOpacity === 0) return [];
  return changeRoomTextures && bloom.textureFolder === 'gif-flower'
    ? flowerRooms : bloomSettings.assets(bloom);
};

const PortalWithPreview: React.FC<{props: Props; next: ClipRef}> = ({props, next}) => {
  const asset = useAsset(next);
  const sample = useClipPlayback(asset, props.bloom.texturePlayback);
  return <MilhousePortalDive {...portalDiveSettings.defaults} {...props}
    transparent revealBackdropThroughPortal destinationPreview={{
      src: asset.src,
      frame: sample.frame,
      width: asset.width,
      height: asset.height,
      opacity: sample.opacity * props.bloom.textureOpacity,
      brightness: props.bloomBrightness,
    }} />;
};

const MilhouseInfiniteBloom: React.FC<Props> = props => {
  const {bloom, bloomBrightness, changeRoomTextures, diveStart, transparent} = props;
  const {barIndex, barPhase, totalBeats, beatsPerBar} = useBeat();
  const {seed, variant} = useSketch();
  const clips = backgroundClips(props);
  const filter = `saturate(1.35) brightness(${bloomBrightness})`;

  if (!changeRoomTextures || clips.length < 2 || totalBeats === beatsPerBar) {
    return <AbsoluteFill>
      {!transparent && <AbsoluteFill style={{filter: clips.length ? filter : `hue-rotate(320deg) ${filter}`}}>
        <InfiniteBloom {...bloom} showFolderPicker={false} textureRefs={clips} />
      </AbsoluteFill>}
      <MilhousePortalDive {...portalDiveSettings.defaults} {...props} transparent revealBackdropThroughPortal />
    </AbsoluteFill>;
  }

  const bars = totalBeats / beatsPerBar;
  const ordered = bloom.textureFolder === 'gif-flower' && variant === 0
    ? clips
    : clips.map((texture, index) => ({texture, position: stepRandom(seed('room-order'), index)}))
      .sort((a, b) => a.position - b.position).map(({texture}) => texture);
  const {handoff} = portalTransition(barPhase, diveStart);
  const next = (barIndex + 1) % bars;
  const textureFor = (room: number) => {
    const index = room % ordered.length;
    // With three or more textures, keep the final room distinct from both neighbors.
    return ordered[room === bars - 1 && index === 0 && ordered.length > 2 ? 1 : index];
  };
  const rooms = [{room: barIndex, opacity: 1}, {room: next, opacity: handoff}];

  return <AbsoluteFill>
    {rooms.map(({room, opacity}, index) => (
      opacity > 0 && (index !== 0 || handoff < 1) && <AbsoluteFill key={room} style={{filter, opacity}}>
        <InfiniteBloom {...bloom} showFolderPicker={false} textureRefs={[textureFor(room)]} />
      </AbsoluteFill>
    ))}
    <PortalWithPreview props={props} next={textureFor(next)} />
  </AbsoluteFill>;
};

const {lift, slide, diveStart, sourceIn, sourceOut, rimColor, echoColor} = portalDiveSettings.defaults;

export default defineSketch({
  id: 'milhouse-infinite-bloom',
  title: 'Milhouse Infinite Bloom',
  description: 'Milhouse dives through a series of portals inside an ever-blooming flower.',
  schema,
  defaults: {
    lift, slide, diveStart, sourceIn, sourceOut, rimColor, echoColor,
    bloomBrightness: 0.7,
    bloom: {
      ...bloomSettings.defaults,
      textureFolder: 'gif-flower',
      textureOpacity: 0.86,
      zoom: 3.8,
      petals: 10,
      petalWidth: 1.2,
      petalCurl: 0.6,
      center: {...bloomSettings.schema.shape.center.parse(undefined), gifColor: 0},
    },
  },
  timing: portalDiveSettings.timing,
  assets: (props) => [...portalDiveSettings.assets, ...backgroundClips(props)],
  clips: (props) => backgroundClips(props).map((texture) => ({
    clip: texture, playback: props.bloom.texturePlayback, field: 'bloom.texturePlayback',
  })),
  validate: portalDiveSettings.validate,
  Component: MilhouseInfiniteBloom,
});
