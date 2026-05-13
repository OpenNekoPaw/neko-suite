import { describe, expect, it } from 'vitest';
import type {
  EnvironmentPlacement,
  PanoramaViewState,
  PreviewManifest,
  PreviewProjectionMetadata,
  PreviewVariant,
} from '../../index';
import { DEFAULT_PANORAMA_VIEW_STATE } from '../../index';

function expectJsonSerializable(value: unknown): void {
  expect(JSON.parse(JSON.stringify(value))).toEqual(value);
}

describe('engine-first preview shared contracts', () => {
  it('models panoramic manifests and variants as platform-neutral JSON DTOs', () => {
    const viewState: PanoramaViewState = {
      ...DEFAULT_PANORAMA_VIEW_STATE,
      yawDeg: 45,
      pitchDeg: -10,
      fovDeg: 70,
    };
    const projection: PreviewProjectionMetadata = {
      type: 'equirectangular',
      confidence: 'explicit',
      source: 'metadata',
    };
    const variant: PreviewVariant = {
      id: 'variant-source',
      assetId: 'asset-1',
      role: 'source',
      token: 'token-1',
      url: 'http://127.0.0.1:3000/v1/preview/file/token-1',
      mimeType: 'image/jpeg',
      dimensions: { width: 4096, height: 2048 },
      viewState,
    };
    const manifest: PreviewManifest = {
      manifestVersion: 1,
      assetId: 'asset-1',
      token: 'token-1',
      kind: 'image',
      status: 'ready',
      sourceName: 'studio_360.jpg',
      sourceUrl: variant.url,
      projection,
      media: {
        dimensions: { width: 4096, height: 2048 },
        fileSizeBytes: 1_024,
        mimeType: 'image/jpeg',
        dynamicRange: 'sdr',
      },
      defaultViewState: viewState,
      variants: [variant],
      createdAt: '2026-05-07T00:00:00.000Z',
    };

    expect(manifest.projection.type).toBe('equirectangular');
    expect(manifest.variants[0]?.viewState?.yawDeg).toBe(45);
    expectJsonSerializable(manifest);
  });

  it('models manual projection metadata as a persisted asset decision', () => {
    const projection: PreviewProjectionMetadata = {
      type: 'flat',
      confidence: 'manual',
      source: 'manual',
      requiresConfirmation: false,
    };

    expect(projection.confidence).toBe('manual');
    expectJsonSerializable(projection);
  });

  it('keeps preview view state separate from model environment placement', () => {
    const viewState: PanoramaViewState = {
      ...DEFAULT_PANORAMA_VIEW_STATE,
      yawDeg: 120,
      pitchDeg: 20,
    };
    const placement: EnvironmentPlacement = {
      sourceAssetId: 'asset-1',
      sourceUri: '${PROJECT}/textures/studio_360.hdr',
      mode: 'background-and-ibl',
      rotationDeg: 0,
      intensity: 1,
      exposure: viewState.exposure,
      visibleAsBackground: true,
    };

    expect(placement.rotationDeg).not.toBe(viewState.yawDeg);
    expectJsonSerializable(viewState);
    expectJsonSerializable(placement);
  });
});
