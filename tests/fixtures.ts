import {LoopProps} from '../src/schema';

// A known musical fixture, independent of the authored composition defaults.
export const fixture: LoopProps = {
  bpm: 120,
  bars: 4,
  beatsPerBar: 4,
  fps: 30,
  timingMode: 'visual',
  layerOrder: ['background', 'rings'],
  background: {
    enabled: true,
    opacity: 1,
    blendMode: 'normal',
    division: '1/4',
    offsetBeats: 0,
    colorA: '#0b0b1a',
    colorB: '#3a1d6e',
    pulseAmount: 0.6,
    rotationsPerLoop: 1,
  },
  rings: {
    enabled: true,
    opacity: 1,
    blendMode: 'screen',
    division: '1/4',
    offsetBeats: 0,
    color: '#7fe7ff',
    accentColor: '#ff4fa3',
    accentEvery: 4,
    lifeSteps: 3,
    maxRadius: 900,
    thickness: 14,
    drift: 80,
  },
  debug: {
    enabled: false,
  },
};
