import React, {useId, useMemo} from 'react';
import {AbsoluteFill, useRemotionEnvironment} from 'remotion';
import {z} from 'zod';
import {manifests} from '../../../collections';
import {clip, clipNames, type ClipRef} from '../../assets';
import {Clip, type PlayableClip} from '../../assets/Clip';
import {clipPlaybackIssues, clipPlaybackSchema, type ClipPlayback} from '../../assets/clipPlayback';
import {useBeat} from '../../beat/BeatContext';
import {stepRandom} from '../../beat/envelopes';
import {mod} from '../../beat/timing';
import {useCanvas} from '../canvas';
import {defineSketch, useAsset, useSketch, type SketchBaseProps} from '../define';
import {LocalGifFolderPicker, useLocalGifFolder} from './LocalGifFolder';

const textureFolders = new Map(
  (Object.keys(manifests) as Array<keyof typeof manifests>).map((folder) => [
    folder,
    clipNames(folder).sort().map((name) => clip(folder, name))
      .filter((asset) => asset.format === 'gif' && asset.frameCount > 1),
  ] as const).filter(([, clips]) => clips.length > 0),
);
const folderNames = ['None', ...textureFolders.keys()] as const;
type TextureFolder = (typeof folderNames)[number];
const folderClips = (folder: TextureFolder) => folder === 'None' ? [] : textureFolders.get(folder) ?? [];

const petalControls = z.object({
  petalLength: z.number().min(0.6).max(1.4).step(0.05)
    .describe('Length from the petal root to its tip').default(1),
  petalWidth: z.number().min(0.4).max(1.5).step(0.05)
    .describe('Side-to-side width. Lower values leave gaps between neighboring petals.').default(1),
  petalRoundness: z.number().min(0.1).max(1.5).step(0.05)
    .describe('Roundness of the petal tips. Lower values sharpen the tips.').default(1),
  petalCurl: z.number().min(-1).max(1).step(0.05)
    .describe('Bend the petal tips clockwise or counterclockwise. Zero keeps the original curve.').default(0),
  ringSpacing: z.number().min(0.65).max(1.35).step(0.05)
    .describe('Radial distance between petal rings').default(1),
});
type PetalControls = z.output<typeof petalControls>;

const centerControls = z.object({
  size: z.number().min(0.4).max(3).step(0.05).describe('Overall size of the center').default(1),
  dotCount: z.number().int().min(0).max(120).describe('Number of pollen dots').default(37),
  dotSize: z.number().min(0.35).max(3).step(0.05).describe('Size of each dot').default(1),
  twist: z.number().min(-2).max(2).step(0.05).describe('Twist from the center outwards, in turns').default(0),
  glow: z.number().min(0).max(1).step(0.05).describe('Opacity of the glow behind the dots').default(1),
  gifColor: z.number().min(0).max(1).step(0.05).describe('Amount of GIF color mixed into the gold dots').default(1),
});
type CenterControls = z.output<typeof centerControls>;

const schema = z.object({
  zoom: z.number().min(1).max(20).step(0.1).default(1)
    .describe('Magnification around the flower center, from 1× to 20×'),
  petals: z.number().int().min(5).max(14).describe('Petals per bloom'),
  ...petalControls.shape,
  center: centerControls.default(centerControls.parse({})),
  textureFolder: z.enum(folderNames).describe('GIF texture folder'),
  textureOpacity: z.number().min(0).max(1).describe('GIF texture opacity'),
  texturePlayback: clipPlaybackSchema.describe('GIF texture playback'),
});

const tau = 2 * Math.PI;
const petalRoot = 0.23;
const tipTurn = -0.27;
type PetalSource = ClipRef | PlayableClip;
type Ring = {slot: number; progress: number; texture?: PetalSource};
const smooth = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};
const ringOpacity = (progress: number) => smooth(progress / 0.13) * smooth((1 - progress) / 0.36);

const CollectionTexture: React.FC<{texture: ClipRef; box: Omit<React.ComponentProps<typeof Clip>, 'clip'>}> =
  ({texture, box}) => <Clip clip={useAsset(texture)} {...box} />;

const BloomTexture: React.FC<{
  texture: PetalSource; playback: ClipPlayback; radius: number; opacity: number; blur?: number;
}> = ({texture, playback, radius, opacity, blur}) => {
  const {width, height} = useCanvas();
  const box = {playback, fit: 'cover' as const,
    x: 0.5 - radius / width, y: 0.5 - radius / height,
    width: 2 * radius / width, height: 2 * radius / height,
    style: {opacity, filter: blur ? `blur(${blur}px)` : undefined}};
  return 'src' in texture ? <Clip clip={texture} {...box} /> : <CollectionTexture texture={texture} box={box} />;
};

const PetalRing: React.FC<Ring & {
  petals: number; pulse: number; shape: PetalControls; playback: ClipPlayback; textureOpacity: number;
}> = ({progress, slot, petals, pulse, shape, texture, playback, textureOpacity}) => {
  const {width, height, cx, cy, vmin} = useCanvas();
  const {seed} = useSketch();
  const gradient = useId();
  const opening = smooth(progress / 0.67);
  const radius = (3 + 44 * shape.ringSpacing * progress ** 0.9) * (1 + 0.016 * pulse) * vmin;
  const stretch = (distance: number) => distance + (distance - petalRoot) * (shape.petalLength - 1);
  const paintRadius = radius * stretch(1);
  const spread = Math.PI / petals;
  const span = spread * (0.55 + 0.7 * opening) * shape.petalWidth;
  const rotation = -Math.PI / 2 + spread * (slot % 2 + stepRandom(seed('petal-angle'), slot) * 0.55)
    + 0.82 * opening;
  const opacity = ringOpacity(progress);
  const hue = 24 - 70 * progress + 12 * stepRandom(seed('petal-color'), slot);

  const blades = Array.from({length: petals}, (_, index) => {
    const angle = rotation + index * 2 * spread;
    const length = radius * (0.91 + 0.09 * stepRandom(seed(`petal-length:${slot}`), index));
    const point = (distance: number, turn: number) => {
      const bend = shape.petalCurl * spread * (distance - petalRoot) / (1 - petalRoot);
      const a = angle + span * turn + bend;
      const r = length * stretch(distance);
      return `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
    };
    const root = point(petalRoot, -0.64);
    const tip = point(0.96, tipTurn);
    const tipIn = point(0.81, tipTurn - 0.96 * shape.petalRoundness);
    const tipOutDistance = 1.12 - 0.28 * Math.max(0, 1 - shape.petalRoundness);
    const tipOut = point(tipOutDistance, tipTurn + 0.99 * shape.petalRoundness);
    return {
      index,
      shape: `M ${root} C ${point(0.46, -1.5)} ${tipIn} ${tip} C ${tipOut} ${point(0.91, 1.24)} ${point(0.64, 1)} C ${point(0.45, 0.81)} ${point(0.35, -0.07)} ${root} Z`,
      vein: `M ${point(0.32, -0.55)} Q ${point(0.63, -0.52)} ${point(0.93, 0.27)}`,
    };
  });
  const silhouette = blades.map(({shape}) => shape).join(' ');

  return <AbsoluteFill style={{opacity}}>
    <svg width={width} height={height} style={{position: 'absolute', inset: 0}}>
      <defs>
        <radialGradient id={gradient} gradientUnits="userSpaceOnUse" cx={cx} cy={cy} r={paintRadius}>
          <stop offset="20%" stopColor={`hsl(${hue - 18} 58% 15%)`} />
          <stop offset="55%" stopColor={`hsl(${hue - 12} 69% 34%)`} />
          <stop offset="82%" stopColor={`hsl(${hue} 82% 63%)`} />
          <stop offset="100%" stopColor={`hsl(${hue + 13} 94% 82%)`} />
        </radialGradient>
      </defs>
      <path d={silhouette} fill={`url(#${gradient})`} />
    </svg>
    {texture && textureOpacity > 0 && <AbsoluteFill style={{clipPath: `path("${silhouette}")`}}>
      <BloomTexture texture={texture} playback={playback} radius={paintRadius} opacity={textureOpacity} />
    </AbsoluteFill>}
    <svg width={width} height={height} style={{position: 'absolute', inset: 0}} fill="none">
      <defs><clipPath id={`${gradient}-veins`}><path d={silhouette} /></clipPath></defs>
      <path d={silhouette} stroke={`hsl(${hue + 8} 95% 85% / 0.55)`}
        strokeWidth={vmin * 0.09} strokeLinejoin="round" />
      <g clipPath={`url(#${gradient}-veins)`}>
        {blades.map(({index, vein}) => <path key={index} d={vein} stroke="#ffe1c0" strokeOpacity={0.3}
          strokeWidth={vmin * 0.08} strokeLinecap="round" />)}
      </g>
    </svg>
  </AbsoluteFill>;
};

const Pollen: React.FC<{
  pulse: number; rings: Ring[]; playback: ClipPlayback; textureOpacity: number; center: CenterControls;
}> = ({pulse, rings, playback, textureOpacity, center}) => {
  const {width, height, cx, cy, vmin} = useCanvas();
  const core = useId();
  const dotMask = useId();
  const coreRadius = (3.3 + 0.25 * pulse) * vmin * center.size;
  const gifOpacity = textureOpacity * center.gifColor;
  const tintDots = center.dotCount > 0 && gifOpacity > 0;
  const blur = 0.4 * vmin;
  const textureRadius = Math.max(coreRadius * 1.24, coreRadius + 0.26 * vmin * center.dotSize + blur);
  const dots = Array.from({length: center.dotCount}, (_, index) => {
    const distance = Math.sqrt(index / center.dotCount);
    const angle = index * Math.PI * (3 - Math.sqrt(5)) + tau * center.twist * distance;
    return {index, cx: cx + coreRadius * distance * Math.cos(angle),
      cy: cy + coreRadius * distance * Math.sin(angle), r: (0.17 + 0.09 * (1 - distance)) * vmin * center.dotSize,
      opacity: 0.9 - 0.36 * distance};
  });

  return <>
    <svg width={width} height={height} style={{position: 'absolute', inset: 0}}>
      <defs>
        <radialGradient id={core}>
          <stop stopColor="#8e372a" />
          <stop offset="73%" stopColor="#431526" />
          <stop offset="100%" stopColor="#431526" stopOpacity={0} />
        </radialGradient>
        {tintDots && <mask id={dotMask} maskUnits="userSpaceOnUse" x={0} y={0} width={width} height={height}>
          {dots.map(({index, ...geometry}) => <circle key={index} {...geometry} fill="white" />)}
        </mask>}
      </defs>
      <circle cx={cx} cy={cy} r={coreRadius * 1.36} fill={`url(#${core})`} opacity={center.glow} />
      {dots.map(({index, ...geometry}) => <circle key={index} {...geometry}
        fill={index % 3 === 0 ? '#ffcc83' : '#ee935a'} />)}
    </svg>
    {tintDots && <div style={{position: 'absolute', inset: 0, maskImage: `url("#${dotMask}")`}}>
      {rings.map(({slot, progress, texture}) => texture && <BloomTexture key={slot} texture={texture}
        playback={playback} radius={textureRadius} blur={blur}
        opacity={gifOpacity * ringOpacity(progress)} />)}
    </div>}
  </>;
};

const InfiniteBloom: React.FC<z.output<typeof schema> & Partial<Pick<SketchBaseProps, 'transparent'>>> = ({
  zoom, center, textureFolder, textureOpacity, texturePlayback, petals, transparent, ...shape
}) => {
  const {loopPhase, beatPhase, totalBeats, beatsPerBar, bpm, fps} = useBeat();
  const {isStudio, isRendering} = useRemotionEnvironment();
  const local = useLocalGifFolder();
  const playbackError = useMemo(() => {
    if (!local.clips || textureOpacity === 0) return undefined;
    const timing = {bpm, fps, beatsPerBar, bars: totalBeats / beatsPerBar};
    for (const texture of local.clips) {
      const [issue] = clipPlaybackIssues(texture, texturePlayback, timing, 'texturePlayback');
      if (issue) return issue;
    }
  }, [local.clips, texturePlayback, textureOpacity, bpm, fps, beatsPerBar, totalBeats]);
  const textures = playbackError ? [] : local.clips ?? folderClips(textureFolder);
  const events = Math.max(8, textures.length);
  const position = loopPhase * events;
  const latest = Math.floor(position);
  const pulse = (1 + Math.cos(tau * beatPhase)) / 2;
  const rings = Array.from({length: 5}, (_, index): Ring => {
    // Oldest first. A ring fades to zero at both ends of its life.
    const birth = latest - (4 - index);
    const slot = mod(birth, events);
    return {slot, progress: (position - birth) / 5,
      texture: textures.length ? textures[slot % textures.length] : undefined};
  });

  return <AbsoluteFill style={{overflow: 'hidden', background: transparent ? undefined :
    'radial-gradient(circle closest-side, #351128 0%, #1a0a20 68%, #100814 100%)'}}>
    <div style={{position: 'absolute', inset: 0, scale: zoom === 1 ? undefined : zoom}}>
      {rings.map((ring) => <PetalRing key={ring.slot} {...ring} petals={petals} shape={shape}
        pulse={pulse} playback={texturePlayback} textureOpacity={textureOpacity} />)}
      <Pollen pulse={pulse} center={center} rings={rings} playback={texturePlayback}
        textureOpacity={textures.length ? textureOpacity : 0} />
    </div>
    {isStudio && !isRendering && <LocalGifFolderPicker folder={local.folder}
      onFolderChange={local.setFolder} playbackError={playbackError} />}
  </AbsoluteFill>;
};

export default defineSketch({
  id: 'infinite-bloom',
  title: 'Infinite Bloom',
  description: 'A flower that keeps opening, with animated GIFs clipped inside its petals.',
  schema,
  defaults: {
    zoom: 1,
    textureFolder: 'None',
    textureOpacity: 0.78,
    texturePlayback: {mode: 'fit', duration: {bars: 1}, direction: 'ping-pong'},
    petals: 8,
  },
  timing: {bpm: 108},
  Component: InfiniteBloom,
  assets: (props) => props.textureOpacity > 0 ? folderClips(props.textureFolder) : [],
  clips: (props) => props.textureOpacity > 0 ? folderClips(props.textureFolder)
    .map((texture) => ({clip: texture, playback: props.texturePlayback, field: 'texturePlayback'})) : [],
});
