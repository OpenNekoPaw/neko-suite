import type { BlendMode, LayerData } from '../types';

export interface MergeLayerPixelsInput {
  readonly base: MergeLayerImage;
  readonly blend: MergeLayerImage;
  readonly blendMode: BlendMode;
  readonly opacity: number;
}

export interface MergeLayerImage {
  readonly imageData: ImageData;
  readonly offsetX: number;
  readonly offsetY: number;
}

export interface MergeLayerPixelsResult {
  readonly imageData: ImageData;
  readonly offsetX: number;
  readonly offsetY: number;
}

type RGB = readonly [number, number, number];

export function canMergeLayerPixels(layer: LayerData, belowLayer: LayerData | undefined): boolean {
  return (
    layer.type === 'raster' &&
    belowLayer?.type === 'raster' &&
    !layer.locked &&
    !belowLayer.locked &&
    layer.visible &&
    belowLayer.visible &&
    !layer.clippingMask &&
    !belowLayer.clippingMask &&
    !layer.maskLayerId &&
    !belowLayer.maskLayerId &&
    belowLayer.opacity === 1 &&
    belowLayer.blendMode === 'normal'
  );
}

export function mergeLayerPixelsDown(input: MergeLayerPixelsInput): MergeLayerPixelsResult {
  const baseLeft = Math.round(input.base.offsetX);
  const baseTop = Math.round(input.base.offsetY);
  const blendLeft = Math.round(input.blend.offsetX);
  const blendTop = Math.round(input.blend.offsetY);

  const left = Math.min(baseLeft, blendLeft);
  const top = Math.min(baseTop, blendTop);
  const right = Math.max(
    baseLeft + input.base.imageData.width,
    blendLeft + input.blend.imageData.width,
  );
  const bottom = Math.max(
    baseTop + input.base.imageData.height,
    blendTop + input.blend.imageData.height,
  );
  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);
  const merged = new ImageData(width, height);

  copyImageDataInto(merged, input.base.imageData, baseLeft - left, baseTop - top);
  blendImageDataInto(
    merged,
    input.blend.imageData,
    blendLeft - left,
    blendTop - top,
    input.blendMode,
    clamp01(input.opacity),
  );

  return {
    imageData: merged,
    offsetX: left,
    offsetY: top,
  };
}

function copyImageDataInto(target: ImageData, source: ImageData, offsetX: number, offsetY: number) {
  for (let y = 0; y < source.height; y++) {
    const ty = y + offsetY;
    if (ty < 0 || ty >= target.height) continue;
    for (let x = 0; x < source.width; x++) {
      const tx = x + offsetX;
      if (tx < 0 || tx >= target.width) continue;
      const sourceIndex = (y * source.width + x) * 4;
      const targetIndex = (ty * target.width + tx) * 4;
      target.data[targetIndex] = source.data[sourceIndex]!;
      target.data[targetIndex + 1] = source.data[sourceIndex + 1]!;
      target.data[targetIndex + 2] = source.data[sourceIndex + 2]!;
      target.data[targetIndex + 3] = source.data[sourceIndex + 3]!;
    }
  }
}

function blendImageDataInto(
  target: ImageData,
  source: ImageData,
  offsetX: number,
  offsetY: number,
  blendMode: BlendMode,
  opacity: number,
) {
  for (let y = 0; y < source.height; y++) {
    const ty = y + offsetY;
    if (ty < 0 || ty >= target.height) continue;
    for (let x = 0; x < source.width; x++) {
      const tx = x + offsetX;
      if (tx < 0 || tx >= target.width) continue;

      const sourceIndex = (y * source.width + x) * 4;
      const targetIndex = (ty * target.width + tx) * 4;
      const sourceAlpha = (source.data[sourceIndex + 3]! / 255) * opacity;
      if (sourceAlpha <= 0) continue;

      const targetAlpha = target.data[targetIndex + 3]! / 255;
      const outAlpha = sourceAlpha + targetAlpha * (1 - sourceAlpha);
      if (outAlpha <= 0) {
        target.data[targetIndex] = 0;
        target.data[targetIndex + 1] = 0;
        target.data[targetIndex + 2] = 0;
        target.data[targetIndex + 3] = 0;
        continue;
      }

      const baseRgb = readRgb(target.data, targetIndex);
      const blendRgb = readRgb(source.data, sourceIndex);
      const blendedRgb = blendRgbByMode(baseRgb, blendRgb, blendMode);
      const baseWeight = targetAlpha * (1 - sourceAlpha);

      target.data[targetIndex] = toByte(
        (blendedRgb[0] * sourceAlpha + baseRgb[0] * baseWeight) / outAlpha,
      );
      target.data[targetIndex + 1] = toByte(
        (blendedRgb[1] * sourceAlpha + baseRgb[1] * baseWeight) / outAlpha,
      );
      target.data[targetIndex + 2] = toByte(
        (blendedRgb[2] * sourceAlpha + baseRgb[2] * baseWeight) / outAlpha,
      );
      target.data[targetIndex + 3] = toByte(outAlpha);
    }
  }
}

function readRgb(data: Uint8ClampedArray, index: number): RGB {
  return [data[index]! / 255, data[index + 1]! / 255, data[index + 2]! / 255];
}

function blendRgbByMode(base: RGB, blend: RGB, mode: BlendMode): RGB {
  switch (mode) {
    case 'multiply':
      return [base[0] * blend[0], base[1] * blend[1], base[2] * blend[2]];
    case 'screen':
      return [
        1 - (1 - base[0]) * (1 - blend[0]),
        1 - (1 - base[1]) * (1 - blend[1]),
        1 - (1 - base[2]) * (1 - blend[2]),
      ];
    case 'overlay':
      return [
        overlayChannel(base[0], blend[0]),
        overlayChannel(base[1], blend[1]),
        overlayChannel(base[2], blend[2]),
      ];
    case 'darken':
      return [
        Math.min(base[0], blend[0]),
        Math.min(base[1], blend[1]),
        Math.min(base[2], blend[2]),
      ];
    case 'lighten':
      return [
        Math.max(base[0], blend[0]),
        Math.max(base[1], blend[1]),
        Math.max(base[2], blend[2]),
      ];
    case 'color-dodge':
      return [
        colorDodgeChannel(base[0], blend[0]),
        colorDodgeChannel(base[1], blend[1]),
        colorDodgeChannel(base[2], blend[2]),
      ];
    case 'color-burn':
      return [
        colorBurnChannel(base[0], blend[0]),
        colorBurnChannel(base[1], blend[1]),
        colorBurnChannel(base[2], blend[2]),
      ];
    case 'hard-light':
      return [
        hardLightChannel(base[0], blend[0]),
        hardLightChannel(base[1], blend[1]),
        hardLightChannel(base[2], blend[2]),
      ];
    case 'soft-light':
      return [
        softLightChannel(base[0], blend[0]),
        softLightChannel(base[1], blend[1]),
        softLightChannel(base[2], blend[2]),
      ];
    case 'difference':
      return [
        Math.abs(base[0] - blend[0]),
        Math.abs(base[1] - blend[1]),
        Math.abs(base[2] - blend[2]),
      ];
    case 'exclusion':
      return [
        base[0] + blend[0] - 2 * base[0] * blend[0],
        base[1] + blend[1] - 2 * base[1] * blend[1],
        base[2] + blend[2] - 2 * base[2] * blend[2],
      ];
    case 'normal':
    default:
      return blend;
  }
}

function overlayChannel(base: number, blend: number): number {
  return base < 0.5 ? 2 * base * blend : 1 - 2 * (1 - base) * (1 - blend);
}

function hardLightChannel(base: number, blend: number): number {
  return blend < 0.5 ? 2 * base * blend : 1 - 2 * (1 - base) * (1 - blend);
}

function softLightChannel(base: number, blend: number): number {
  if (blend <= 0.5) {
    return base - (1 - 2 * blend) * base * (1 - base);
  }
  const d = base <= 0.25 ? ((16 * base - 12) * base + 4) * base : Math.sqrt(base);
  return base + (2 * blend - 1) * (d - base);
}

function colorDodgeChannel(base: number, blend: number): number {
  return blend >= 1 ? 1 : Math.min(1, base / (1 - blend));
}

function colorBurnChannel(base: number, blend: number): number {
  return blend <= 0 ? 0 : Math.max(0, 1 - (1 - base) / blend);
}

function toByte(value: number): number {
  return Math.round(clamp01(value) * 255);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
