import type { TextureStampPattern } from '../types';
import type { TextureStampAsset } from '../types';

export const TEXTURE_STAMP_PATTERNS: readonly TextureStampPattern[] = [
  'grain',
  'crosshatch',
  'bristle',
];

const TEXTURE_STAMP_PATTERN_INDEX: Readonly<Record<TextureStampPattern, number>> = {
  grain: 1,
  crosshatch: 2,
  bristle: 3,
};

const TEXTURE_STAMP_PATTERN_LABEL: Readonly<Record<TextureStampPattern, string>> = {
  grain: 'sketch.brush.stampPattern.grain',
  crosshatch: 'sketch.brush.stampPattern.crosshatch',
  bristle: 'sketch.brush.stampPattern.bristle',
};

export function coerceTextureStampPattern(value: unknown): TextureStampPattern {
  switch (value) {
    case 'grain':
    case 'crosshatch':
    case 'bristle':
      return value;
    default:
      return 'grain';
  }
}

export function getTextureStampPatternIndex(pattern: TextureStampPattern | undefined): number {
  return TEXTURE_STAMP_PATTERN_INDEX[coerceTextureStampPattern(pattern)];
}

export function getTextureStampPatternLabelKey(pattern: TextureStampPattern): string {
  return TEXTURE_STAMP_PATTERN_LABEL[pattern];
}

export async function createTextureStampAssetFromBase64(
  name: string,
  base64Data: string,
  mimeType = 'image/png',
): Promise<TextureStampAsset> {
  const blob = base64ToBlob(base64Data, mimeType);
  const bitmap = await createImageBitmap(blob);
  const asset: TextureStampAsset = {
    id: createTextureStampAssetId(name),
    name,
    dataUrl: `data:${mimeType};base64,${base64Data}`,
    mimeType,
    width: bitmap.width,
    height: bitmap.height,
    createdAt: Date.now(),
  };
  bitmap.close();
  return asset;
}

export async function decodeTextureStampAssetPixels(asset: TextureStampAsset): Promise<{
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}> {
  const response = await fetch(asset.dataUrl);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    throw new Error('Could not create stamp asset canvas context');
  }

  ctx.drawImage(bitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  const data = normalizeTextureStampAssetAlpha(imageData.data);
  const result = {
    width: bitmap.width,
    height: bitmap.height,
    data,
  };
  bitmap.close();
  return result;
}

export function normalizeTextureStampAssetAlpha(source: Uint8ClampedArray): Uint8Array {
  const hasTransparency = source.some((value, index) => index % 4 === 3 && value < 255);
  const data = new Uint8Array(source.length);
  for (let i = 0; i < source.length; i += 4) {
    const alpha = source[i + 3]!;
    const mask = hasTransparency
      ? alpha
      : Math.round(source[i]! * 0.299 + source[i + 1]! * 0.587 + source[i + 2]! * 0.114);
    data[i] = 255;
    data[i + 1] = 255;
    data[i + 2] = 255;
    data[i + 3] = mask;
  }
  return data;
}

function createTextureStampAssetId(name: string): string {
  const safeName =
    name
      .trim()
      .toLowerCase()
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'asset';
  return `stamp-${safeName}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function base64ToBlob(base64Data: string, mimeType: string): Blob {
  const binary = atob(base64Data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}
