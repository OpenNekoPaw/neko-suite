import { describe, expect, it } from 'vitest';
import { mergeLayerPixelsDown } from './layer-merge-tool';

if (typeof globalThis.ImageData === 'undefined') {
  Object.defineProperty(globalThis, 'ImageData', {
    value: class TestImageData implements ImageData {
      readonly data: Uint8ClampedArray;
      readonly colorSpace: PredefinedColorSpace = 'srgb';

      constructor(
        readonly width: number,
        readonly height: number,
      ) {
        this.data = new Uint8ClampedArray(width * height * 4);
      }
    },
  });
}

describe('mergeLayerPixelsDown', () => {
  it('alpha-composites a normal layer over the layer below', () => {
    const result = mergeLayerPixelsDown({
      base: { imageData: solidImage(1, 1, [0, 0, 255, 255]), offsetX: 0, offsetY: 0 },
      blend: { imageData: solidImage(1, 1, [255, 0, 0, 128]), offsetX: 0, offsetY: 0 },
      blendMode: 'normal',
      opacity: 1,
    });

    expect(pixelAt(result.imageData, 0, 0)).toEqual([128, 0, 127, 255]);
  });

  it('applies source opacity before compositing', () => {
    const result = mergeLayerPixelsDown({
      base: { imageData: solidImage(1, 1, [0, 0, 255, 255]), offsetX: 0, offsetY: 0 },
      blend: { imageData: solidImage(1, 1, [255, 0, 0, 255]), offsetX: 0, offsetY: 0 },
      blendMode: 'normal',
      opacity: 0.25,
    });

    expect(pixelAt(result.imageData, 0, 0)).toEqual([64, 0, 191, 255]);
  });

  it('supports common blend modes while preserving alpha', () => {
    const result = mergeLayerPixelsDown({
      base: { imageData: solidImage(1, 1, [128, 128, 128, 255]), offsetX: 0, offsetY: 0 },
      blend: { imageData: solidImage(1, 1, [128, 64, 255, 255]), offsetX: 0, offsetY: 0 },
      blendMode: 'multiply',
      opacity: 1,
    });

    expect(pixelAt(result.imageData, 0, 0)).toEqual([64, 32, 128, 255]);
  });

  it('expands the output bounds to include offset layers', () => {
    const result = mergeLayerPixelsDown({
      base: { imageData: solidImage(2, 1, [0, 0, 255, 255]), offsetX: 2, offsetY: 0 },
      blend: { imageData: solidImage(1, 1, [255, 0, 0, 255]), offsetX: 0, offsetY: 1 },
      blendMode: 'normal',
      opacity: 1,
    });

    expect(result.offsetX).toBe(0);
    expect(result.offsetY).toBe(0);
    expect(result.imageData.width).toBe(4);
    expect(result.imageData.height).toBe(2);
    expect(pixelAt(result.imageData, 0, 1)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(result.imageData, 2, 0)).toEqual([0, 0, 255, 255]);
    expect(pixelAt(result.imageData, 3, 0)).toEqual([0, 0, 255, 255]);
  });
});

function solidImage(
  width: number,
  height: number,
  color: readonly [number, number, number, number],
): ImageData {
  const image = new ImageData(width, height);
  for (let i = 0; i < image.data.length; i += 4) {
    image.data[i] = color[0];
    image.data[i + 1] = color[1];
    image.data[i + 2] = color[2];
    image.data[i + 3] = color[3];
  }
  return image;
}

function pixelAt(
  image: ImageData,
  x: number,
  y: number,
): readonly [number, number, number, number] {
  const offset = (y * image.width + x) * 4;
  return [
    image.data[offset]!,
    image.data[offset + 1]!,
    image.data[offset + 2]!,
    image.data[offset + 3]!,
  ];
}
