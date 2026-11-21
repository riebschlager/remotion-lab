import {AbsoluteFill} from 'remotion';
import {z} from 'zod';
import {useBeat} from '../../beat/BeatContext';
import {lfo, loopNoise, mod, pulse, step, stepRandom} from '../../beat/envelopes';
import {useCanvas} from '../canvas';
import {defineSketch, useSketch} from '../define';
import {City, Orbit, Radar} from './Feeds';
import {falling, FallingFigure, useFallingModel} from './Milhouse';

const schema = z.object({
  headline: z.string().trim().min(1).max(24).describe('Main headline'),
  subhead: z.string().trim().min(1).max(31).describe('Second line of the headline'),
  updates: z.array(z.string().trim().min(1).max(100)).min(1).max(6).describe('Stories in the continuous crawl'),
  barsPerFeed: z.number().int().min(1).max(6).describe('Bars between camera cuts'),
  crt: z.number().min(0).max(1).step(0.05).describe('CRT interference strength'),
});

const feeds = [
  {source: 'ORBITAL CAM', status: 'SATELLITE RELAY', pitch: -1.29, yaw: -.29, roll: -.36, x: .47, y: .47,
    wideZoom: .54, tallZoom: .68, light: '#fff1cd', rim: '#79beff'},
  {source: 'SPRINGFIELD', status: 'DOWNTOWN', pitch: -1.97, yaw: .22, roll: .14, x: .50, y: .53,
    wideZoom: 2.04, tallZoom: 1.83, light: '#ffe2b5', rim: '#f19364'},
  {source: 'SHELBYVILLE', status: 'HARBOR CAM', pitch: -1.78, yaw: -.53, roll: -.15, x: .55, y: .51,
    wideZoom: 1.82, tallZoom: 1.63, light: '#ffe1da', rim: '#a3c6ff'},
  {source: 'DOPPLER 6', status: 'WEATHER DESK'},
  {source: 'ORBITAL CAM 2', status: 'OPTICAL TRACK', pitch: -1.47, yaw: .85, roll: .78, x: .5, y: .48,
    wideZoom: .79, tallZoom: .82, light: '#d0f3ff', rim: '#dab5ff'},
] as const;

const ink = '#1b1924';
const paper = '#fff0d0';
const red = '#a92728';
const mono = "'Courier New', monospace";
const display = "'Arial Black', 'Arial', sans-serif";

function Interference({strength, hit, unit}: {strength: number; hit: number; unit: number}) {
  const {loopPhase, frame} = useBeat();
  const {seed} = useSketch();
  const noise = seed('tracking');
  const stripe = Math.max(1, unit * .22);
  if (strength === 0) return null;
  return (
    <AbsoluteFill style={{pointerEvents: 'none', overflow: 'hidden', borderRadius: 'inherit'}}>
      <AbsoluteFill style={{
        background: `repeating-linear-gradient(0deg, #0008 0 ${stripe}px, transparent ${stripe}px ${stripe * 2.4}px)`,
        opacity: strength * .52,
      }} />
      <AbsoluteFill style={{
        background: `repeating-linear-gradient(90deg, #ff455424 0 ${stripe * .35}px, #65ff8c20 ${stripe * .35}px ${stripe * .7}px, #2a69ff38 ${stripe * .7}px ${stripe}px)`,
        opacity: strength * .34,
      }} />
      <div style={{position: 'absolute', left: 0, right: 0, height: '13%',
        top: `${mod(loopPhase * 3 + .43, 1) * 113 - 13}%`,
        background: 'linear-gradient(transparent, #d6e9ff24 76%, #e0edff14 80%, transparent)',
        opacity: strength * .8}} />
      <AbsoluteFill style={{
        background: 'radial-gradient(ellipse at center, transparent 53%, #090818cc 100%)', opacity: strength * .83,
      }} />
      {Array.from({length: 10}, (_, index) => (
        <div key={index} style={{
          position: 'absolute',
          top: `${100 * stepRandom(noise, frame, index * 3)}%`,
          left: `${96 * stepRandom(noise, frame, index * 3 + 1)}%`,
          width: `${3 + 38 * stepRandom(noise, frame, index * 3 + 2)}%`,
          height: stripe * .7,
          opacity: strength * (.045 + hit * .57),
          background: index % 2 === 0 ? '#ffb9aa' : '#a2cce3',
        }} />
      ))}
    </AbsoluteFill>
  );
}

const MilhouseBreakingNews = ({headline, subhead, updates, barsPerFeed, crt}: z.output<typeof schema>) => {
  const {width, height, vmin, aspect} = useCanvas();
  const {beat, totalBeats, beatsPerBar, loopPhase} = useBeat();
  const model = useFallingModel();
  const {seed} = useSketch();
  const wide = aspect >= 1.15;
  // Put the loop point halfway through the satellite feed.
  const span = barsPerFeed * beatsPerBar;
  const clock = step(beat, span, totalBeats, -span / 2);
  const index = clock.index % feeds.length;
  const feed = feeds[index];
  const radar = !('pitch' in feed);
  const figure = radar ? feeds[0] : feed;
  const tracking = index === 4;
  const street = index === 1 || index === 2;
  const harbor = index === 2;
  const cut = pulse(clock.phase, {decay: .055, curve: 1.6});
  const drift = lfo(loopPhase, 2, 'sine', .12);
  const fall = .5 - .5 * lfo(loopPhase, 2, 'sine', .15);
  const verticalDrift = .018 * lfo(loopPhase, 2);
  const margin = Math.max(1, Math.round(vmin * 2.6));
  const border = Math.max(1, Math.round(vmin * .15));
  const headerHeight = Math.round(vmin * (wide ? 6.2 : 8.1));
  const headlineHeight = Math.round(vmin * (wide ? 14.1 : 26));
  const crawlHeight = Math.round(vmin * (wide ? 4.8 : 6.7));
  const feedWidth = width - 2 * margin;
  const feedHeight = height - 2 * margin - headerHeight - headlineHeight - crawlHeight - border;
  const cameraSeed = seed(harbor ? 'harbor camera' : 'downtown camera');
  const pickup = pulse(clock.phase, {decay: .21});
  const pan = street ? vmin * (2.6 * loopNoise(cameraSeed, clock.phase, 4.6, 0) + (harbor ? -4 : 4) * pickup) : 0;
  const tilt = street ? vmin * (2.4 * loopNoise(cameraSeed, clock.phase, 5.4, 4) + 4.5 * pickup) : 0;
  const roll = street ? (harbor ? -2.7 : 2.4) + 3.4 * loopNoise(cameraSeed, clock.phase, 3.6, 8) : 0;
  const overscan = street ? 1.16 + .055 * pickup : 1;
  const exposure = street ? 1 + .11 * loopNoise(cameraSeed, clock.phase, 1.7, 12) + .13 * pickup : 1;
  const headlineSize = Math.min(vmin * (wide ? 7.1 : 9.4), feedWidth * 1.44 / headline.length);
  const subheadSize = Math.min(vmin * (wide ? 3.15 : 5.45), feedWidth * 1.45 / subhead.length);
  const crawl = updates.join('  ///  ');
  const liveSize = Math.min(vmin * 2.75, feedWidth * .035);

  return (
    <AbsoluteFill style={{
      background: 'linear-gradient(140deg,#29263a,#100e1a 49%,#282437)',
      color: paper, fontFamily: display, overflow: 'hidden',
    }}>
      <div style={{position: 'absolute', inset: margin}}>
        <div style={{
          height: headerHeight, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          paddingInline: vmin * .7, gap: vmin * 1.6,
        }}>
          <div style={{display: 'flex', alignItems: 'center', gap: vmin * 1.35}}>
            <span style={{fontSize: Math.min(vmin * 5.1, headerHeight * .8), fontWeight: 900, fontStyle: 'italic',
              lineHeight: .88, letterSpacing: '-.08em', marginRight: vmin * .6}}>6</span>
            <span style={{fontSize: Math.min(vmin * 2.45, feedWidth * .033), lineHeight: 1, letterSpacing: '.14em',
              fontWeight: 900}}>CHANNEL SIX NEWS</span>
          </div>
          <div style={{background: red, display: 'flex', alignItems: 'center', gap: '.5em', padding: '.36em .65em',
            font: `bold ${liveSize}px ${mono}`, letterSpacing: '.12em'}}>
            <span style={{background: '#ffd3a3', borderRadius: '50%', width: '.55em', height: '.55em',
              boxShadow: '0 0 .45em #ff9b80', opacity: .85 + .15 * drift}} /> LIVE
          </div>
        </div>

        <div style={{
          position: 'relative', width: feedWidth, height: feedHeight, isolation: 'isolate', overflow: 'hidden',
          borderRadius: vmin * 1.05, background: '#111426',
          boxShadow: `0 0 0 ${border}px #675c70, inset 0 0 ${vmin * 3}px #0c0a17`,
        }}>
          <AbsoluteFill style={{
            translate: `${pan + cut * crt * vmin * .42}px ${tilt}px`,
            rotate: `${roll}deg`,
            scale: overscan + cut * crt * .025,
            filter: street ? `brightness(${exposure}) saturate(.91) blur(${vmin * pickup * .26}px)` : undefined,
          }}>
            {(index === 0 || tracking) && <Orbit phase={loopPhase} reverse={tracking} />}
            {street && <City harbor={harbor} phase={loopPhase} />}
            <FallingFigure model={model} width={feedWidth} height={feedHeight} visible={!radar}
              progress={fall} street={street} zoom={wide ? figure.wideZoom : figure.tallZoom}
              x={figure.x + .021 * drift} y={figure.y + verticalDrift}
              pitch={figure.pitch + .075 * drift} yaw={figure.yaw + .13 * lfo(loopPhase, 2, 'sine', .42)}
              roll={figure.roll + .065 * drift} light={figure.light} rim={figure.rim} />
            {radar && <Radar phase={loopPhase} wide={wide} unit={vmin} />}
            {street && <City harbor={harbor} phase={loopPhase} foreground />}
            {tracking && <svg viewBox="-100 -100 200 200" style={{
              position: 'absolute', top: `${48 + verticalDrift * 100}%`, left: `${50 + 2.1 * drift}%`,
              width: Math.min(feedWidth, feedHeight) * .85, translate: '-50% -50%', overflow: 'visible',
            }}>
              <path d="M-83-64v-19h19m128 0h19v19m0 128v19h-19m-128 0h-19v-19" fill="none" stroke="#96e8fc" strokeWidth="1.5" opacity=".85" />
              <text x="-83" y="96" fill="#b9eafb" fontFamily={mono} fontSize="7.5" letterSpacing=".9">OBJECT MH-01</text>
            </svg>}
          </AbsoluteFill>
          <div style={{position: 'absolute', top: '4%', left: '3.3%', display: 'flex', gap: '.75em',
            font: `bold ${Math.min(vmin * 2.25, feedWidth * .035)}px ${mono}`, letterSpacing: '.06em'}}>
            <span style={{padding: '.42em .65em', color: ink, background: paper}}>{feed.source}</span>
            <span style={{padding: '.42em .65em', background: '#141526c9'}}>{feed.status}</span>
          </div>
          <Interference strength={crt} hit={cut} unit={vmin} />
        </div>

        <div style={{boxSizing: 'border-box', height: headlineHeight, display: 'flex',
          flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start',
          paddingLeft: wide ? vmin * 2.2 : vmin * 2.5, background: paper,
          color: ink, position: 'relative', marginTop: border,
          borderTop: `${vmin * .44}px solid ${red}`}}>
          <div style={{background: red, color: paper, fontSize: vmin * (wide ? 1.45 : 2.25), fontWeight: 900,
            letterSpacing: '.17em', lineHeight: 1, padding: '.38em .7em', marginBottom: '.31em'}}>BREAKING NEWS</div>
          <div style={{fontSize: headlineSize, lineHeight: .93, fontWeight: 950, letterSpacing: '-.065em',
            whiteSpace: 'nowrap', textShadow: `${crt * vmin * .14}px 0 #bb4b5355, ${-crt * vmin * .14}px 0 #3864a660`}}>{headline}</div>
          <div style={{fontSize: subheadSize, lineHeight: 1.14, marginTop: '.14em', fontWeight: 900,
            letterSpacing: '.085em', color: red, whiteSpace: 'nowrap'}}>{subhead}</div>
        </div>

        <div style={{height: crawlHeight, display: 'flex', alignItems: 'stretch', overflow: 'hidden',
          background: '#20243d', color: '#fff2d5', font: `bold ${vmin * (wide ? 2.05 : 2.85)}px ${mono}`,
          whiteSpace: 'nowrap', letterSpacing: '.065em'}}>
          <div style={{display: 'grid', placeItems: 'center', paddingInline: '.85em', background: red}}>UPDATE</div>
          <div style={{position: 'relative', flex: 1, overflow: 'hidden'}}>
            <div style={{position: 'absolute', insetBlock: 0, left: 0, display: 'flex', width: 'max-content', minWidth: '200%',
              translate: `${-loopPhase * 50}% 0`}}>
              {[0, 1].map(copy => <div key={copy} style={{flex: '1 0 auto', display: 'flex', alignItems: 'center', paddingInline: '1em'}}>
                {crawl} &nbsp;///
              </div>)}
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

export default defineSketch({
  id: 'milhouse-breaking-news',
  title: 'Milhouse Breaking News',
  description: 'A CRT news bulletin cuts between orbital, street and radar feeds as a giant Milhouse floats over Earth.',
  schema,
  defaults: {
    headline: 'GIANT MILHOUSE',
    subhead: 'FLOATS ABOVE EARTH',
    updates: [
      'FAA REROUTES AROUND LEFT SHOE',
      'MOON DECLINES TO COMMENT',
      'TIDES NOW PRESCRIPTION STRENGTH',
      'LOCAL MOM PACKS ORBITAL LUNCH',
    ],
    barsPerFeed: 2,
    crt: .65,
  },
  Component: MilhouseBreakingNews,
  assets: [falling],
  timing: {bpm: 120, bars: 10, beatsPerBar: 4},
  validate: ({barsPerFeed}, {bars}) => bars % (feeds.length * barsPerFeed) === 0
    ? [] : [`barsPerFeed: all five feeds must fit evenly into the loop; use a bar count divisible by ${feeds.length * barsPerFeed}.`],
});
