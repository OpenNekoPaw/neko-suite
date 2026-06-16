import type { SceneViewportResolution } from '@neko/neko-client';

export type ViewportStreamQualityPreset = 'quarter' | 'half' | 'native';

export interface ViewportStreamQualityConfig {
  readonly preset: ViewportStreamQualityPreset;
  readonly minHeight: number;
  readonly maxWidth: number;
  readonly maxHeight: number;
  readonly maxDevicePixelRatio: number;
  readonly pixelFraction: number;
  readonly maxPixelCount: number;
}

export interface ViewportStreamRect {
  readonly width: number;
  readonly height: number;
}

const VIEWPORT_DIMENSION_BUCKET = 16;
const MIN_VISIBLE_VIEWPORT_DIMENSION = 64;
const UHD_4K_PIXEL_COUNT = 3840 * 2160;
const PERFORMANCE_PIXEL_COUNT_LIMIT = 2880 * 1620;
const CLEAR_PIXEL_COUNT_LIMIT = UHD_4K_PIXEL_COUNT;
const INSPECT_PIXEL_COUNT_LIMIT = 4096 * 3072;

export const VIEWPORT_STREAM_QUALITY_CONFIGS: Readonly<
  Record<ViewportStreamQualityPreset, ViewportStreamQualityConfig>
> = {
  quarter: {
    preset: 'quarter',
    minHeight: 1440,
    maxWidth: 4096,
    maxHeight: 4096,
    maxDevicePixelRatio: 2,
    pixelFraction: 0.5625,
    maxPixelCount: PERFORMANCE_PIXEL_COUNT_LIMIT,
  },
  half: {
    preset: 'half',
    minHeight: 1440,
    maxWidth: 4096,
    maxHeight: 4096,
    maxDevicePixelRatio: 2,
    pixelFraction: 1,
    maxPixelCount: CLEAR_PIXEL_COUNT_LIMIT,
  },
  native: {
    preset: 'native',
    minHeight: 1440,
    maxWidth: 4096,
    maxHeight: 4096,
    maxDevicePixelRatio: 2,
    pixelFraction: 1.25,
    maxPixelCount: INSPECT_PIXEL_COUNT_LIMIT,
  },
};

export const DEFAULT_VIEWPORT_STREAM_QUALITY_PRESET: ViewportStreamQualityPreset = 'half';

export const VIEWPORT_STREAM_QUALITY_ORDER: readonly ViewportStreamQualityPreset[] = [
  'quarter',
  'half',
  'native',
];

export function normalizeViewportStreamQualityPreset(value: unknown): ViewportStreamQualityPreset {
  if (value === 'responsive') {
    return 'quarter';
  }
  if (value === 'sharp') {
    return 'half';
  }
  if (value === 'ultra') {
    return 'native';
  }
  return isViewportStreamQualityPreset(value) ? value : DEFAULT_VIEWPORT_STREAM_QUALITY_PRESET;
}

export function nextViewportStreamQualityPreset(
  current: ViewportStreamQualityPreset,
): ViewportStreamQualityPreset {
  const index = VIEWPORT_STREAM_QUALITY_ORDER.indexOf(current);
  return (
    VIEWPORT_STREAM_QUALITY_ORDER[(index + 1) % VIEWPORT_STREAM_QUALITY_ORDER.length] ?? 'quarter'
  );
}

export function isViewportStreamQualityPreset(
  value: unknown,
): value is ViewportStreamQualityPreset {
  return value === 'quarter' || value === 'half' || value === 'native';
}

export function createViewportStreamSize(
  rect: ViewportStreamRect,
  devicePixelRatio: number,
  preset: ViewportStreamQualityPreset,
): SceneViewportResolution {
  const cssWidth = Math.max(0, rect.width);
  const cssHeight = Math.max(0, rect.height);
  if (cssWidth < MIN_VISIBLE_VIEWPORT_DIMENSION || cssHeight < MIN_VISIBLE_VIEWPORT_DIMENSION) {
    return {
      width: 0,
      height: 0,
      pixelRatio: 1,
    };
  }

  const config = VIEWPORT_STREAM_QUALITY_CONFIGS[preset];
  const pixelRatio = Math.min(Math.max(devicePixelRatio || 1, 1), config.maxDevicePixelRatio);
  const aspectRatio = cssWidth / cssHeight;
  const physicalWidth = cssWidth * pixelRatio;
  const physicalHeight = cssHeight * pixelRatio;
  const physicalPixels = physicalWidth * physicalHeight;
  const targetPixels = Math.min(
    Math.max(physicalPixels, UHD_4K_PIXEL_COUNT) * config.pixelFraction,
    config.maxPixelCount,
  );
  let height = Math.sqrt(targetPixels / aspectRatio);
  let width = height * aspectRatio;
  if (height < config.minHeight) {
    height = config.minHeight;
    width = height * aspectRatio;
  }
  if (width > config.maxWidth) {
    width = config.maxWidth;
    height = width / aspectRatio;
  }
  if (height > config.maxHeight) {
    height = config.maxHeight;
    width = height * aspectRatio;
  }

  return {
    width: bucketStreamDimension(width, config.maxWidth),
    height: bucketStreamDimension(height, config.maxHeight),
    pixelRatio,
  };
}

function bucketStreamDimension(value: number, maxValue: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return VIEWPORT_DIMENSION_BUCKET;
  }
  const bucketed = Math.max(
    VIEWPORT_DIMENSION_BUCKET,
    Math.ceil(value / VIEWPORT_DIMENSION_BUCKET) * VIEWPORT_DIMENSION_BUCKET,
  );
  const clamped = Math.min(bucketed, maxValue);
  return clamped % 2 === 0 ? clamped : clamped + 1;
}
