import React from 'react';
import type {FontRef} from '../assets';
import {cssFontFaceFamily} from '../assets/fonts';
import {useBeat} from '../beat/BeatContext';
import {useCanvas} from '../sketches/canvas';
import {useAsset, useSketch} from '../sketches/define';
import {fitType} from './layout';
import {measureType, variationSettings} from './measure';
import {activeUnits, sampleTypeUnit, splitType, typeFace, typeIssues, type TypeSample, type TypeSettings, type TypeUnit} from './model';

export type TypeUnitState = TypeUnit & TypeSample;
/** Box coordinates are canvas fractions; fontSize is vmin. Explicit lines never reflow as axes animate. */
export const Type: React.FC<{
  font: FontRef; settings: TypeSettings; channel?: string;
  x?: number; y?: number; width?: number; height?: number; fontSize?: number;
  align?: 'left' | 'center' | 'right'; color?: string;
  unitStyle?: (unit: TypeUnitState) => React.CSSProperties;
}> = ({font, settings: p, channel = 'type', x = 0, y = 0, width = 1, height = 1, fontSize = 20,
  align = 'center', color = 'white', unitStyle}) => {
  useAsset(font);
  const time = useBeat();
  const canvas = useCanvas();
  const {seed} = useSketch();
  const issues = typeIssues(font, p, {bpm: time.bpm, fps: time.fps, bars: time.totalBeats / time.beatsPerBar, beatsPerBar: time.beatsPerBar});
  if (issues.length) throw new Error(issues.join('; '));
  const face = typeFace(font, p)!;
  const defaults = Object.fromEntries(Object.entries(face.axes).map(([tag, axis]) => [tag, tag === 'wght' ? p.weight ?? axis.default : axis.default]));
  const units = splitType(p.text, p.split);
  const visible = activeUnits(units);
  const metrics = units.map((u) => measureType(font, face, u.text, defaults));
  const layout = fitType(units, metrics, width * canvas.width, height * canvas.height, fontSize * canvas.vmin, align);
  return <div aria-label={p.text} style={{position: 'absolute', left: x * canvas.width, top: y * canvas.height,
    width: width * canvas.width, height: height * canvas.height, overflow: 'hidden', color}}>
    {layout.units.map((unit) => {
      if (!unit.text.trim()) return null;
      const index = visible.findIndex((u) => u.id === unit.id);
      const sample = sampleTypeUnit(p, index, visible.length, {time, division: p.division, offsetBeats: p.offsetBeats ?? 0,
        pattern: p.pattern, seed: (s) => seed(`${channel}:${unit.id}:${s}`)});
      const axes = {...defaults, ...sample.axes};
      const bounds = measureType(font, face, unit.text, axes);
      return <svg key={unit.id} data-type-unit={unit.id} data-energy={sample.energy}
        data-type-x={unit.x} data-type-y={unit.y} data-type-width={unit.width}
        viewBox={`${bounds.left * 100} ${bounds.top * 100} ${bounds.width * 100} ${bounds.height * 100}`}
        preserveAspectRatio="xMinYMid meet" style={{position: 'absolute', left: unit.x, top: unit.y,
          width: unit.width, height: unit.height, overflow: 'visible', ...unitStyle?.({...unit, ...sample})}}>
        <text x={0} y={0} fill="currentColor" style={{fontFamily: cssFontFaceFamily(font, face), fontSize: 100,
          fontWeight: face.weight, fontStyle: face.style, fontVariationSettings: variationSettings(axes),
          fontOpticalSizing: 'none', fontKerning: 'none', fontVariantLigatures: 'none', whiteSpace: 'pre'}}>{unit.text}</text>
      </svg>;
    })}
  </div>;
};
