import React from 'react';
import {AbsoluteFill} from 'remotion';
import {useBeat} from '../beat/BeatContext';
import {divisionBeats, divisionFitsLoop, Division} from '../beat/envelopes';
import {isFrameExact} from '../beat/timing';
import type {BeatPattern} from '../beat/patterns';

type Props = {
  /** Divisions in use by other layers, checked against the loop length */
  divisions: Division[];
  patterns?: Array<{id: string; division: Division; pattern: BeatPattern}>;
};

/**
 * Overlay showing where you are on the grid, plus warnings for anything that
 * will break the loop. Turn off before final renders.
 */
export const BeatDebug: React.FC<Props> = ({divisions, patterns = []}) => {
  const b = useBeat();

  const warnings: string[] = [];
  if (!isFrameExact({bpm: b.bpm, bars: b.totalBeats / b.beatsPerBar, beatsPerBar: b.beatsPerBar, fps: b.fps})) {
    warnings.push(`Tempo stretched to ${b.effectiveBpm.toFixed(3)} BPM to fit whole frames`);
  }
  for (const d of new Set(divisions)) {
    if (!divisionFitsLoop(divisionBeats(d, b.beatsPerBar), b.totalBeats)) {
      warnings.push(`Division "${d}" doesn't fit the loop — it will pop at the seam`);
    }
  }

  const cell = 56;

  return (
    <AbsoluteFill
      style={{
        fontFamily: 'ui-monospace, Menlo, monospace',
        color: 'white',
        padding: 48,
        justifyContent: 'flex-end',
        gap: 16,
        textShadow: '0 2px 6px rgba(0,0,0,0.8)',
      }}
    >
      {warnings.map((w) => (
        <div key={w} style={{fontSize: 26, color: '#ff6b6b'}}>
          ⚠ {w}
        </div>
      ))}
      {patterns.map(({id, division, pattern}) => (
        <div key={id} style={{fontSize: 22}}>
          <div>{id} · {division} · swing {Math.round((pattern.swing ?? 0) * 100)}%</div>
          <div style={{display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6}}>
            {pattern.steps.map((strength, index) => (
              <span key={index} style={{minWidth: 28, textAlign: 'center', padding: 4,
                background: `rgba(255,255,255,${strength * 0.35})`, borderRadius: 4}}>
                {strength === 0 ? '·' : strength}
              </span>
            ))}
          </div>
        </div>
      ))}
      <div style={{fontSize: 40}}>
        bar {b.barIndex + 1}.{(b.beatIndex % b.beatsPerBar) + 1} · {b.bpm} BPM
      </div>
      <div style={{fontSize: 26, opacity: 0.8}}>
        frame {b.frame} / {b.loopDurationInFrames} · {b.fps}fps · {b.totalBeats} beats
      </div>
      <div style={{display: 'flex', gap: 10}}>
        {Array.from({length: b.beatsPerBar}).map((_, i) => {
          const active = i === b.beatIndex % b.beatsPerBar;
          return (
            <div
              key={i}
              style={{
                width: cell,
                height: cell,
                borderRadius: 8,
                border: '3px solid white',
                background: active ? `rgba(255,255,255,${1 - b.beatPhase * 0.7})` : 'transparent',
              }}
            />
          );
        })}
      </div>
      <div style={{height: 10, background: 'rgba(255,255,255,0.2)', borderRadius: 5}}>
        <div
          style={{
            width: `${b.loopPhase * 100}%`,
            height: '100%',
            background: 'white',
            borderRadius: 5,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
