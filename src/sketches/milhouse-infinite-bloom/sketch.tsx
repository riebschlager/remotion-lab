import React from 'react';
import {AbsoluteFill} from 'remotion';
import {z} from 'zod';
import {clip, type ClipRef} from '../../assets';
import {useBeat} from '../../beat/BeatContext';
import {stepRandom} from '../../beat/envelopes';
import {defineSketch, type SketchBaseProps} from '../define';
import {bloomSettings, InfiniteBloom} from '../infinite-bloom/sketch';
import {MilhousePortalDive, portalDiveSettings, portalTransition} from '../milhouse-portal-dive/sketch';

const id = 'milhouse-infinite-bloom';
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
    .describe('Give each portal room its own GIF group'),
  gifsPerRoom: z.number().int().min(1).max(5).default(3)
    .describe('Distinct GIFs per room, limited by the number in the selected folder'),
});
type Props = z.output<typeof schema> & Partial<Pick<SketchBaseProps, 'transparent' | 'bars' | 'variant'>>;

const roomTextures = ({bloom, changeRoomTextures, gifsPerRoom, transparent,
  bars = portalDiveSettings.timing.bars, variant = 0}: Props): ClipRef[][] => {
  const clips = transparent ? [] : bloomSettings.assets(bloom);
  if (!changeRoomTextures || clips.length < 2) return Array.from({length: bars}, () => clips);

  const curated = bloom.textureFolder === 'gif-flower';
  const shuffle = (textures: ClipRef[], channel: string) => {
    const seed = JSON.stringify([id, variant, channel]);
    return textures.map((texture, index) => ({texture, rank: stepRandom(seed, index)}))
      .sort((a, b) => a.rank - b.rank).map(({texture}) => texture);
  };
  const leads = curated ? (variant === 0 ? flowerRooms : shuffle(flowerRooms, 'room-order'))
    : shuffle(clips, 'room-order');
  const companions = curated ? shuffle(clips.filter((texture) => !flowerRooms.some((lead) => lead.name === texture.name)), 'room-companions')
    : leads;
  const count = Math.min(gifsPerRoom, clips.length);
  return Array.from({length: bars}, (_, room) => {
    // When the circuit would end on the first lead, use the next lead instead.
    const index = room % leads.length;
    const leadIndex = room > 0 && room === bars - 1 && index === 0 && leads.length > 2 ? 1 : index;
    if (!curated) {
      return Array.from({length: count}, (_, offset) => leads[(leadIndex + offset) % leads.length]);
    }
    const lead = leads[leadIndex];
    const start = companions.length ? (room * (count - 1)) % companions.length : 0;
    const candidates = [...companions.slice(start), ...companions.slice(0, start),
      ...leads.filter((texture) => texture !== lead)];
    return [lead, ...candidates.slice(0, count - 1)];
  });
};

const backgroundClips = (props: Props) => [...new Set(roomTextures(props).flat())];

const MilhouseInfiniteBloom: React.FC<Props> = props => {
  const {bloom, bloomBrightness, diveStart, transparent} = props;
  const {barIndex, barPhase} = useBeat();
  const rooms = roomTextures(props);
  const filter = `${rooms[barIndex].length ? '' : 'hue-rotate(320deg) '}saturate(1.35) brightness(${bloomBrightness})`;
  const {plunge} = portalTransition(barPhase, diveStart);
  const next = (barIndex + 1) % rooms.length;
  const paint = (room: number, bend = 0) => !transparent && <AbsoluteFill style={{filter}}>
    <InfiniteBloom {...bloom} showFolderPicker={false} innerCurl={bend}
      textureRefs={rooms[room]} />
  </AbsoluteFill>;

  return <AbsoluteFill>
    {paint(barIndex, 1.35 * Math.sin(Math.PI * plunge))}
    <MilhousePortalDive {...portalDiveSettings.defaults} {...props} transparent revealBackdropThroughPortal
      throughCut destinationBackdrop={paint(next)} />
  </AbsoluteFill>;
};

const {lift, slide, diveStart, sourceIn, sourceOut, rimColor, echoColor} = portalDiveSettings.defaults;

export default defineSketch({
  id,
  title: 'Milhouse Infinite Bloom',
  description: 'Milhouse dives through a series of portals inside an ever-blooming flower.',
  schema,
  defaults: {
    lift, slide, diveStart, sourceIn, sourceOut, rimColor, echoColor,
    bloomBrightness: 0.7,
    gifsPerRoom: 3,
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
