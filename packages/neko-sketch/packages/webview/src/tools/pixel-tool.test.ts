import { describe, it, expect } from 'vitest';
import { drawPixel, drawLine, floodFill } from './pixel-tool';

const WHITE: readonly [number, number, number, number] = [1, 1, 1, 1];
const RED: readonly [number, number, number, number] = [1, 0, 0, 1];

// jsdom does not provide ImageData; create a minimal stand-in
function makeImageData(w: number, h: number): ImageData {
  return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4), colorSpace: 'srgb' };
}

function px(img: ImageData, x: number, y: number) {
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
}

describe('drawPixel', () => {
  it('draws a single pixel at valid position', () => {
    const img = makeImageData(8, 8);
    drawPixel(img, 3, 4, WHITE, 1);
    expect(px(img, 3, 4)).toEqual([255, 255, 255, 255]);
    expect(px(img, 2, 4)).toEqual([0, 0, 0, 0]);
  });

  it('draws a 2x2 block snapped to grid', () => {
    const img = makeImageData(8, 8);
    drawPixel(img, 3, 3, RED, 2);
    // 3 snaps to 2, so fills (2,2)-(3,3)
    expect(px(img, 2, 2)).toEqual([255, 0, 0, 255]);
    expect(px(img, 3, 3)).toEqual([255, 0, 0, 255]);
    expect(px(img, 4, 4)).toEqual([0, 0, 0, 0]);
  });

  it('does not crash on out-of-bounds', () => {
    const img = makeImageData(4, 4);
    expect(() => drawPixel(img, -5, -5, WHITE, 1)).not.toThrow();
    expect(() => drawPixel(img, 100, 100, WHITE, 1)).not.toThrow();
  });
});

describe('drawLine', () => {
  it('draws a horizontal line', () => {
    const img = makeImageData(8, 8);
    drawLine(img, 1, 2, 5, 2, WHITE, 1);
    for (let x = 1; x <= 5; x++) {
      expect(px(img, x, 2)).toEqual([255, 255, 255, 255]);
    }
    expect(px(img, 0, 2)).toEqual([0, 0, 0, 0]);
  });

  it('draws a diagonal line', () => {
    const img = makeImageData(8, 8);
    drawLine(img, 0, 0, 4, 4, RED, 1);
    for (let i = 0; i <= 4; i++) {
      expect(px(img, i, i)).toEqual([255, 0, 0, 255]);
    }
  });
});

describe('floodFill', () => {
  it('fills an empty canvas', () => {
    const img = makeImageData(4, 4);
    floodFill(img, 0, 0, WHITE);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        expect(px(img, x, y)).toEqual([255, 255, 255, 255]);
      }
    }
  });

  it('respects tolerance for similar colors', () => {
    const img = makeImageData(4, 1);
    // Set pixel 0 to (10,10,10,255), pixel 1 to (12,12,12,255)
    img.data.set([10, 10, 10, 255], 0);
    img.data.set([12, 12, 12, 255], 4);
    img.data.set([200, 200, 200, 255], 8); // pixel 2: far away

    floodFill(img, 0, 0, RED, 5);
    expect(px(img, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(px(img, 1, 0)).toEqual([255, 0, 0, 255]); // within tolerance
    expect(px(img, 2, 0)).toEqual([200, 200, 200, 255]); // outside tolerance
  });
});
