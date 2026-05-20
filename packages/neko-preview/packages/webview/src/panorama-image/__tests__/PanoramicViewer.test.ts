import { describe, expect, it } from 'vitest';
import type { PreviewManifest } from '@neko/shared';
import {
  coverageAngleForViewerProjection,
  projectionTypeForViewMode,
  viewerModesForProjection,
} from '../PanoramicViewer';

function createManifest(): PreviewManifest {
  return {
    manifestVersion: 1,
    assetId: 'asset-1',
    token: 'asset-1',
    kind: 'image',
    status: 'ready',
    sourceName: 'shanghai-morning.jpg',
    sourceUrl: '/v1/preview/file/asset-1',
    projection: { type: 'equirectangular', confidence: 'heuristic', source: 'aspect-ratio' },
    media: {
      dimensions: { width: 9060, height: 2966 },
      fileSizeBytes: 1024,
      mimeType: 'image/jpeg',
      dynamicRange: 'sdr',
      codec: { imageFormat: 'jpeg' },
    },
    variants: [],
    createdAt: '2026-05-07T00:00:00.000Z',
  };
}

describe('PanoramicViewer helpers', () => {
  it('shows legal modes for the active projection plus temporary cylinder entry', () => {
    expect(viewerModesForProjection('equirectangular')).toEqual([
      'sphere',
      'flat',
      'little-planet',
      'cylindrical',
    ]);
    expect(viewerModesForProjection('cylindrical')).toEqual(['cylindrical', 'flat']);
    expect(viewerModesForProjection('flat')).toEqual(['flat', 'cylindrical']);
  });

  it('maps temporary view modes to projection overrides', () => {
    expect(projectionTypeForViewMode('cylindrical', 'equirectangular')).toBe('cylindrical');
    expect(projectionTypeForViewMode('little-planet', 'cylindrical')).toBe('equirectangular');
    expect(projectionTypeForViewMode('flat', 'cylindrical')).toBe('cylindrical');
  });

  it('derives non-default cylindrical coverage from wide image dimensions', () => {
    const coverage = coverageAngleForViewerProjection(createManifest(), 'cylindrical');

    expect(coverage.horizontalDeg).toBeGreaterThan(180);
    expect(coverage.horizontalDeg).toBeLessThan(270);
    expect(coverage.verticalDeg).toBeCloseTo(60, 5);
  });
});
