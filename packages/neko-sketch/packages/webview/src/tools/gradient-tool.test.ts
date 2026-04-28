import { describe, expect, it } from 'vitest';
import { paintLinearGradient } from './gradient-tool';

describe('gradient tool', () => {
  it('paints a foreground-to-transparent linear gradient over empty pixels', () => {
    const pixels = new Uint8ClampedArray(3 * 1 * 4);

    paintLinearGradient(pixels, {
      width: 3,
      height: 1,
      startX: 0,
      startY: 0,
      endX: 2,
      endY: 0,
      color: [1, 0, 0, 1],
    });

    expect(Array.from(pixels.slice(0, 4))).toEqual([255, 0, 0, 255]);
    expect(pixels[7]).toBe(128);
    expect(Array.from(pixels.slice(8, 12))).toEqual([0, 0, 0, 0]);
  });

  it('composites gradient pixels over existing straight-alpha pixels', () => {
    const pixels = new Uint8ClampedArray([0, 0, 255, 255]);

    paintLinearGradient(pixels, {
      width: 1,
      height: 1,
      startX: 0,
      startY: 0,
      endX: 1,
      endY: 0,
      color: [1, 0, 0, 0.5],
    });

    expect(Array.from(pixels)).toEqual([128, 0, 128, 255]);
  });
});
