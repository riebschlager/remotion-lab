import type {TypeUnit} from './model';

/** Metrics are supplied by the loaded-font adapter; these functions have no browser dependency. */
export type TypeMetrics = {left: number; top: number; width: number; height: number};
export const fitType = (units: TypeUnit[], metrics: TypeMetrics[], boxWidth: number, boxHeight: number,
  maxSize: number, align: 'left' | 'center' | 'right' = 'center', lineGap = 0.1) => {
  if (![boxWidth, boxHeight, maxSize].every((v) => Number.isFinite(v) && v > 0) || metrics.length !== units.length) {
    throw new Error('type.box: positive finite dimensions and one metric per unit are required');
  }
  if (metrics.some((m) => ![m.left, m.top, m.width, m.height].every(Number.isFinite) || m.width < 0 || m.height <= 0)) {
    throw new Error('type.metrics: finite bounds with nonnegative width and positive height are required');
  }
  const rows = Math.max(1, ...units.map((u) => u.line + 1));
  const widths = Array.from({length: rows}, (_, row) => units.reduce((w, u, i) => w + (u.line === row ? metrics[i].width : 0), 0));
  const rowHeight = Math.max(1, ...metrics.map((m) => m.height));
  const height = rows * rowHeight + (rows - 1) * lineGap;
  const size = Math.min(maxSize, boxWidth / Math.max(...widths, 1e-9), boxHeight / height);
  const positions = widths.map((w) => align === 'left' ? 0 : (boxWidth - w * size) * (align === 'right' ? 1 : 0.5));
  return {size, units: units.map((u, i) => {
    const x = positions[u.line];
    positions[u.line] += metrics[i].width * size;
    return {...u, x, y: (boxHeight - height * size) / 2 + u.line * (rowHeight + lineGap) * size,
      width: metrics[i].width * size, height: rowHeight * size};
  })};
};
