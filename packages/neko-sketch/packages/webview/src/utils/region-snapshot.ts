import type { RegionSnapshot } from '../types';

export interface PixelRegion {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

type PixelData = Uint8Array | Uint8ClampedArray;

export function findChangedPixelBounds(
  before: PixelData,
  after: PixelData,
  width: number,
  height: number,
): PixelRegion | null {
  const expectedLength = width * height * 4;
  if (before.length < expectedLength || after.length < expectedLength) {
    return null;
  }

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width * 4;
    for (let x = 0; x < width; x++) {
      const index = rowOffset + x * 4;
      if (
        before[index] !== after[index] ||
        before[index + 1] !== after[index + 1] ||
        before[index + 2] !== after[index + 2] ||
        before[index + 3] !== after[index + 3]
      ) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return null;
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

export function extractRegionSnapshot(
  layerId: string,
  pixels: PixelData,
  sourceWidth: number,
  sourceHeight: number,
  region: PixelRegion,
): RegionSnapshot | null {
  const rect = clampRegion(region, sourceWidth, sourceHeight);
  if (!rect) {
    return null;
  }

  const data = new Uint8Array(rect.width * rect.height * 4);
  for (let row = 0; row < rect.height; row++) {
    const sourceStart = ((rect.y + row) * sourceWidth + rect.x) * 4;
    const sourceEnd = sourceStart + rect.width * 4;
    const targetStart = row * rect.width * 4;
    data.set(pixels.subarray(sourceStart, sourceEnd), targetStart);
  }

  return {
    layerId,
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    data,
  };
}

export function restoreRegionSnapshotToPixels(
  target: Uint8Array,
  targetWidth: number,
  targetHeight: number,
  snapshot: RegionSnapshot,
): void {
  const rect = clampRegion(snapshot, targetWidth, targetHeight);
  if (!rect) {
    return;
  }

  const snapshotOffsetX = rect.x - snapshot.x;
  const snapshotOffsetY = rect.y - snapshot.y;
  for (let row = 0; row < rect.height; row++) {
    const sourceStart = ((snapshotOffsetY + row) * snapshot.width + snapshotOffsetX) * 4;
    const sourceEnd = sourceStart + rect.width * 4;
    const targetStart = ((rect.y + row) * targetWidth + rect.x) * 4;
    target.set(snapshot.data.subarray(sourceStart, sourceEnd), targetStart);
  }
}

function clampRegion(region: PixelRegion, width: number, height: number): PixelRegion | null {
  const x = Math.max(0, Math.floor(region.x));
  const y = Math.max(0, Math.floor(region.y));
  const maxX = Math.min(width, Math.ceil(region.x + region.width));
  const maxY = Math.min(height, Math.ceil(region.y + region.height));
  const clampedWidth = maxX - x;
  const clampedHeight = maxY - y;

  if (clampedWidth <= 0 || clampedHeight <= 0) {
    return null;
  }

  return {
    x,
    y,
    width: clampedWidth,
    height: clampedHeight,
  };
}
