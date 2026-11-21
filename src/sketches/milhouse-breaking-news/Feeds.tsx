import {memo, useMemo} from 'react';
import {AbsoluteFill} from 'remotion';
import {lfo, mod, stepRandom} from '../../beat/envelopes';
import {useSketch} from '../define';

export function Orbit({phase, reverse}: {phase: number; reverse: boolean}) {
  const {seed} = useSketch();
  const starSeed = seed('stars');
  const stars = useMemo(() => Array.from({length: 145}, (_, index) => ({
    x: 1200 * stepRandom(starSeed, index, 0),
    y: 1200 * stepRandom(starSeed, index, 1),
    alpha: 0.22 + 0.72 * stepRandom(starSeed, index, 2),
    radius: 0.65 + 2.1 * stepRandom(starSeed, index, 3),
  })), [starSeed]);
  const clouds = useMemo(() => Array.from({length: 88}, (_, index) => ({
    x: 640 * stepRandom(starSeed, index, 4),
    y: 615 * stepRandom(starSeed, index, 5),
    length: 18 + 120 * stepRandom(starSeed, index, 6),
    alpha: 0.08 + 0.48 * stepRandom(starSeed, index, 7),
  })), [starSeed]);
  const drift = 22 * lfo(phase);
  return (
    <AbsoluteFill style={{background: reverse
      ? 'radial-gradient(ellipse at 23% 12%, #2e4770, #111c3d 59%, #080c20)'
      : 'radial-gradient(ellipse at 75% 78%, #163c77, #080f26 53%, #040615 89%)'}}>
      <svg style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}} viewBox="0 0 1200 1200" preserveAspectRatio="none">
        {stars.map(({x, y, alpha, radius}, index) => (
          <circle key={index} cx={mod(x + drift, 1200)} cy={y} r={radius} fill="#d8eafa" opacity={alpha} />
        ))}
      </svg>
      <svg style={{position: 'absolute', width: '100%', height: '100%'}} viewBox="0 0 1000 760" preserveAspectRatio={reverse ? "xMidYMin slice" : "xMidYMax slice"}>
        <defs>
          <clipPath id="news-earth-disc"><circle cx="320" cy="320" r="319" /></clipPath>
          <radialGradient id="news-earth-sea" cx=".35" cy=".17" r=".87">
            <stop stopColor="#8ac7d7" /><stop offset=".45" stopColor="#28699d" />
            <stop offset=".76" stopColor="#16477c" /><stop offset="1" stopColor="#071630" />
          </radialGradient>
          <linearGradient id="news-earth-land" x2=".75" y2="1">
            <stop stopColor="#e5d49f" /><stop offset=".47" stopColor="#80a67c" /><stop offset="1" stopColor="#25798a" />
          </linearGradient>
          <linearGradient id="news-earth-night" x2=".76" y2=".8">
            <stop offset=".24" stopColor="#070b21" stopOpacity="0" /><stop offset="1" stopColor="#070b21" />
          </linearGradient>
          <filter id="news-atmosphere" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="10" />
          </filter>
        </defs>
        <g transform={reverse
          ? `translate(${-250 - drift}, -240) rotate(29 320 320) scale(.92)`
          : `translate(${290 + drift}, 471) rotate(-17 320 320)`}>
          <circle cx="320" cy="320" r="323" fill="none" stroke="#65bdff" strokeWidth="22" opacity=".54" filter="url(#news-atmosphere)" />
          <circle cx="320" cy="320" r="320" fill="url(#news-earth-sea)" stroke="#81d7fc" strokeWidth="4" />
          <g clipPath="url(#news-earth-disc)">
            <g fill="url(#news-earth-land)" stroke="#579f9f" strokeWidth="2">
              <path d="M35 103 58 73 98 58 135 65 155 48 186 53 199 34 221 42 212 58 232 66 232 81 204 95 218 113 209 125 183 126 163 144 149 139 137 155 109 157 98 176 110 196 131 206 142 224 156 230 147 217 170 214 160 178 191 154 215 150 226 132 241 138 236 162 208 182 198 218 174 246 156 239 143 248 135 238 118 228 92 191 67 177 62 141 46 129 17 135Z" />
              <path d="M151 241 178 249 200 244 218 255 246 266 254 284 286 299 280 330 252 368 242 396 211 416 204 445 182 466 160 461 168 443 157 410 164 378 153 351 163 323 152 304 147 279 133 261Z" />
              <path d="M245 43 261 32 292 27 323 41 318 67 301 90 288 119 265 102 268 80 246 68Z" fill="#d9e3ca" />
              <path d="M377 144 392 121 415 126 424 107 452 114 460 95 481 96 495 118 518 113 531 97 564 105 605 88 650 95 642 203 616 203 598 225 583 214 580 189 544 177 529 204 497 210 485 185 468 190 445 162 426 177 409 173 395 188 371 178 363 156Z" />
              <path d="M395 186 425 182 448 190 463 212 476 217 464 242 484 260 473 276 455 283 451 316 428 345 410 347 408 323 389 308 389 286 366 278 351 250 360 218 371 209Z" />
              <path d="M340 125 353 115 364 121 355 133 342 133ZM232 230 249 229 257 237 243 239ZM482 320 494 301 500 310 494 332 481 340Z" />
            </g>
            <g fill="none" stroke="#dceff3" strokeLinecap="round">
              {clouds.map(({x, y, length, alpha}, index) => (
                <path key={index} d={`M${x} ${y} q${length * .37} ${-length * .28} ${length} ${-length * .19}`}
                  strokeWidth={3 + length * .035} opacity={alpha} />
              ))}
            </g>
            <circle cx="320" cy="320" r="320" fill="url(#news-earth-night)" />
          </g>
        </g>
      </svg>
    </AbsoluteFill>
  );
}

const towers = [
  {x: 10, y: 486, w: 179, h: 435, shear: 24, color: '#161426', lights: '#ffbd76'},
  {x: 183, y: 570, w: 119, h: 316, shear: 16, color: '#252036', lights: '#f5cf90'},
  {x: 303, y: 653, w: 111, h: 164, shear: 8, color: '#342940', lights: '#ffe0ac'},
  {x: 412, y: 680, w: 113, h: 156, shear: 2, color: '#44324a', lights: '#f8a98a'},
  {x: 529, y: 625, w: 108, h: 241, shear: -7, color: '#312739', lights: '#f6b87b'},
  {x: 640, y: 594, w: 113, h: 258, shear: -12, color: '#231f33', lights: '#ffc97d'},
  {x: 767, y: 502, w: 138, h: 370, shear: -19, color: '#1c172c', lights: '#ffd392'},
  {x: 907, y: 414, w: 154, h: 471, shear: -24, color: '#141323', lights: '#f5a970'},
];
const waterfront = [
  {x: 1, y: 632, w: 136, h: 165, shear: 3, color: '#202c47', lights: '#a7daef'},
  {x: 140, y: 611, w: 112, h: 158, shear: 3, color: '#27304e', lights: '#a3c9ea'},
  {x: 254, y: 660, w: 93, h: 152, shear: 3, color: '#1b233a', lights: '#e5c8d1'},
  {x: 742, y: 601, w: 96, h: 162, shear: -3, color: '#242a4c', lights: '#cfe6ff'},
  {x: 840, y: 549, w: 138, h: 218, shear: -3, color: '#181e36', lights: '#f8c8b4'},
  {x: 973, y: 628, w: 112, h: 166, shear: -3, color: '#222940', lights: '#a4ccfb'},
];

const Buildings = memo(function Buildings({harbor, seed}: {harbor: boolean; seed: string}) {
  return (harbor ? waterfront : towers).map(({x, y, w, h, shear, color, lights}, index) => {
    const columns = Math.floor(w / 18);
    const rows = Math.floor(h / 24);
    return (
      <g key={x} transform={`translate(${x}, ${y}) skewX(${shear})`}>
        <path d={`M0 0 h${w - 18} v-11 h18 v${h + 11} H0Z`} fill={color} stroke="#172235" strokeWidth="2" />
        <path d={`M${w - 18} -11 h18 v${h + 11} h-18Z`} fill="#080f21" opacity=".48" />
        <path d={`M0 2 h${w - 19}`} stroke={lights} opacity=".54" strokeWidth="2" />
        {Array.from({length: rows * columns}, (_, windowIndex) => {
          const alpha = stepRandom(seed, windowIndex, index);
          return <rect key={windowIndex} x={8 + (windowIndex % columns) * 16}
            y={14 + Math.floor(windowIndex / columns) * 21} width="7" height="11"
            fill={alpha > .47 ? lights : '#05091a'} opacity={.14 + .69 * alpha} />;
        })}
      </g>
    );
  });
});

export function City({harbor, phase, foreground = false}: {harbor: boolean; phase: number; foreground?: boolean}) {
  const {seed} = useSketch();
  const drift = 13 * lfo(phase, 1, 'sine', .15);
  const citySeed = seed(harbor ? 'harbor' : 'springfield');
  if (foreground) {
    return (
      <svg style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}} viewBox="0 0 1000 760" preserveAspectRatio="none">
        <Buildings harbor={harbor} seed={citySeed} />
        {harbor ? (
          <g>
            <path d="M-60 724 1060 662" stroke="#11192d" strokeWidth="16" />
            <path d="M-60 717 1060 655" stroke="#98add4" strokeWidth="3" />
            <path d="M67 664V507l18-15h25 M940 635V481l-17-13h-31" fill="none" stroke="#172138" strokeWidth="7" />
            <path d="M93 492h21 M885 468h20" stroke="#ffdbab" strokeWidth="6" />
          </g>
        ) : (
          <g>
            <path d="M-60 536Q142 622 305 582 M1060 481Q872 618 736 571" fill="none" stroke="#311f33" strokeWidth="3" opacity=".8" />
            <path d="M274 689v-78l14-15h28 M770 670v-84l-14-15h-28" fill="none" stroke="#251a2d" strokeWidth="6" />
            <path d="M310 596h15 M721 571h14" stroke="#ffe5aa" strokeWidth="5" />
            <path d="M113 792V532q0-35 41-35h63" fill="none" stroke="#191520" strokeWidth="9" />
            <path d="M208 496h24v59h-24z" fill="#1a1520" stroke="#423038" strokeWidth="2" />
            <circle cx="220" cy="507" r="5" fill="#68382e" />
            <circle cx="220" cy="525" r="5" fill="#ffc169" />
            <circle cx="220" cy="543" r="5" fill="#333a31" />
          </g>
        )}
      </svg>
    );
  }

  return (
    <AbsoluteFill style={{background: harbor
      ? 'radial-gradient(ellipse at 54% 81%, #e8b4b7, #7c769c 38%, #263656 72%, #101b3c)'
      : 'radial-gradient(ellipse at 51% 87%, #ffc884, #a75150 42%, #572f51 69%, #211c3c)'}}>
      <svg style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}} viewBox="0 0 1000 760" preserveAspectRatio="none">
        <defs>
          <filter id="news-sky-haze" x="-25%" width="150%" y="-60%" height="220%"><feGaussianBlur stdDeviation="10" /></filter>
          <linearGradient id="news-sky-fade" x2="0" y2="1">
            <stop stopColor={harbor ? '#d3b4d5' : '#ffdab0'} stopOpacity=".1" />
            <stop offset="1" stopColor={harbor ? '#f1c8c1' : '#ffb266'} stopOpacity=".8" />
          </linearGradient>
        </defs>
        <g transform={`translate(${drift},0)`} fill="none" filter="url(#news-sky-haze)">
          <path d="M-80 344Q180 283 500 321T1080 239 M-29 434Q280 364 560 414T1070 338" stroke={harbor ? '#b0a3c5' : '#e99c86'} strokeWidth="15" opacity=".48" />
          <path d="M-20 267Q210 324 475 259T1030 224 M550 493Q784 454 1100 462" stroke="#e1c1c4" strokeWidth="7" opacity=".53" />
        </g>
        {harbor && <>
          <circle cx="795" cy="253" r="26" fill="#f1dbc3" opacity=".82" />
          <path d="M0 676Q126 640 247 666T468 676 678 644 1000 631V760H0Z" fill="#48536e" />
          <path d="M0 702H1000V760H0Z" fill="#363e5f" />
          <path d="M120 740h250m122-9h132m-244-12h94m200 28h151" stroke="#c6a4b2" strokeWidth="3" opacity=".46" />
        </>}
        <rect y="508" width="1000" height="252" fill="url(#news-sky-fade)" opacity=".72" />
      </svg>
    </AbsoluteFill>
  );
}

export function Radar({phase, wide, unit}: {phase: number; wide: boolean; unit: number}) {
  const x = 64 + 21 * lfo(phase, 2, 'sine', .18);
  const y = -54 + 17 * lfo(phase, 2, 'sine', .64);
  const beam = 360 * mod(phase * 5 + .12, 1);
  const alt = Math.round(315 + 4 * lfo(phase, 2, 'sine', .3));
  return (
    <AbsoluteFill style={{
      background: 'radial-gradient(ellipse, #1b4d3c, #081f1d 55%, #040f16)',
      display: 'flex', flexDirection: wide ? 'row' : 'column', justifyContent: 'center',
      alignItems: 'center', padding: wide ? '2% 10%' : '8% 7% 5%', gap: '2%',
      color: '#bbefab', fontFamily: "'Courier New', monospace",
    }}>
      <svg viewBox="-210 -210 420 420" style={{width: wide ? '56%' : '100%', height: wide ? '88%' : '58%', overflow: 'visible'}}>
        <defs>
          <clipPath id="news-radar-scope"><circle r="190" /></clipPath>
          <radialGradient id="news-phosphor">
            <stop stopColor="#60a96e" stopOpacity=".31" /><stop offset="1" stopColor="#072924" stopOpacity=".65" />
          </radialGradient>
          <linearGradient id="news-radar-sweep" x1="0" x2="0" y1="1" y2="0">
            <stop stopColor="#a3ff8d" stopOpacity=".58" /><stop offset="1" stopColor="#87e69c" stopOpacity="0" />
          </linearGradient>
        </defs>
        <circle r="190" fill="url(#news-phosphor)" />
        <g clipPath="url(#news-radar-scope)">
          <path d="M-200 39 -170 24 -162 9 -131 15 -119 2 -92 -14 -70 -2 -65 21 -47 31 -51 61 -70 74 -73 102 -103 126 -105 143 -130 169 -143 199H-220Z M180-182l-22 16-31 10-23 31-13 24 17 20 42-9 23 10 48-17v-98Z"
            fill="#306b4b" stroke="#79a77b" strokeWidth="1.2" opacity=".72" />
          <g fill="none" stroke="#8bcf91" strokeWidth="1" opacity=".59">
            {[38, 76, 114, 152, 190].map(r => <circle key={r} r={r} />)}
            <path d="M-190 0H190 M0-190V190 M-135-135 135 135 M135-135-135 135" />
          </g>
          <g transform={`rotate(${beam})`}>
            <path d="M0 0 190 0A190 190 0 0 0 94-165Z" fill="url(#news-radar-sweep)" />
            <path d="M0 0H190" stroke="#c6ffb1" strokeWidth="2.3" opacity=".9" />
          </g>
          <path d="M-78 38 Q-24 38 12 7 T76 -58" fill="none" stroke="#b0ec9b" strokeWidth="1.4" strokeDasharray="4 5" opacity=".6" />
          <g transform={`translate(${x} ${y})`}>
            <path d="M-15-9v-6h6m18 0h6v6m0 18v6h-6m-18 0h-6v-6" fill="none" stroke="#d4ffa4" strokeWidth="2" />
            <circle r={3 + 1.5 * lfo(phase, 8)} fill="#edffc9" />
            <path d="M15-15l16-17h24" fill="none" stroke="#baeb9e" />
            <text x="59" y="-27" fill="#e9ffd1" fontSize="15" fontWeight="bold">MH-01</text>
          </g>
        </g>
        <circle r="190" fill="none" stroke="#99db9b" strokeWidth="2" />
        {Array.from({length: 48}, (_, index) => (
          <path key={index} transform={`rotate(${index * 7.5})`} d={index % 4 === 0 ? 'M0-197v-8' : 'M0-197v-4'}
            stroke="#6daf84" />
        ))}
      </svg>
      <div style={{
        minWidth: wide ? '33%' : '75%', paddingLeft: wide ? unit * 2.5 : 0,
        borderLeft: wide ? `${unit * .15}px solid #5a986f` : undefined,
        fontSize: unit * (wide ? 2.3 : 2.75), lineHeight: 1.25,
      }}>
        <div style={{fontWeight: 700, letterSpacing: '.13em', paddingBottom: '.55em'}}>TARGET LOCKED</div>
        <div style={{borderTop: '1px solid #5a986f', paddingTop: '.65em', display: 'grid', rowGap: '.35em'}}>
          <div>OBJECT&nbsp; MH-01</div>
          <div>ALT&nbsp;&nbsp;&nbsp; {alt} KM</div>
          <div>CLASS&nbsp; BIG KID</div>
        </div>
      </div>
    </AbsoluteFill>
  );
}
