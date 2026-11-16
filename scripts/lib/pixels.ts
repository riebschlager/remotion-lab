/** Pixel-level drawing shared by contact sheets and filmstrips. */
import type {PNG} from 'pngjs';

// A 3×5 pixel font: enough to stamp frame and beat numbers onto the sheet.
const glyphs: Record<string, string> = {
  0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111',
  4: '101101111001001', 5: '111100111001111', 6: '111100111101111', 7: '111001001001001',
  8: '111101111101111', 9: '111101111001111', '.': '000000000000010', F: '111100110100100',
  B: '110101110101110',
};

export const fill = (png: PNG, x0: number, y0: number, w: number, h: number, [r, g, b]: number[]) => {
  for (let y = Math.max(0, y0); y < Math.min(png.height, y0 + h); y++) {
    for (let x = Math.max(0, x0); x < Math.min(png.width, x0 + w); x++) {
      const i = (y * png.width + x) * 4;
      png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = b; png.data[i + 3] = 255;
    }
  }
};

export const stamp = (png: PNG, text: string, x: number, y: number, size: number) => {
  [...text].forEach((character, index) => {
    const glyph = glyphs[character];
    if (!glyph) return;
    [...glyph].forEach((bit, i) => {
      if (bit === '1') fill(png, x + index * size * 4 + (i % 3) * size, y + Math.floor(i / 3) * size, size, size, [235, 235, 235]);
    });
  });
};
