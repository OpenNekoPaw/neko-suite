import { describe, expect, it, vi } from 'vitest';
import { EngineClient, type PreviewManifest } from '../index';

function createResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

describe('EngineClient preview manifest surface', () => {
  it('registers preview assets through the manifest endpoint', async () => {
    const manifest: PreviewManifest = {
      manifestVersion: 1,
      assetId: 'asset-1',
      token: 'token-1',
      kind: 'image',
      status: 'ready',
      sourceName: 'pano.jpg',
      sourceUrl: 'http://127.0.0.1:3456/v1/preview/file/token-1',
      projection: { type: 'equirectangular', confidence: 'explicit', source: 'metadata' },
      media: {
        dimensions: { width: 4096, height: 2048 },
        fileSizeBytes: 42,
        mimeType: 'image/jpeg',
        dynamicRange: 'sdr',
      },
      variants: [],
      createdAt: '2026-05-07T00:00:00.000Z',
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(createResponse(manifest));
    const client = new EngineClient(3456);

    await expect(
      client.registerPreviewAsset({
        source: '${PROJECT}/assets/pano.jpg',
        kind: 'image',
        expectedProjection: 'equirectangular',
      }),
    ).resolves.toEqual(manifest);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:3456/v1/preview/assets',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          source: '${PROJECT}/assets/pano.jpg',
          kind: 'image',
          expectedProjection: 'equirectangular',
        }),
      }),
    );

    fetchMock.mockRestore();
  });

  it('requests manifest-linked variants and builds token URLs', async () => {
    const variant = {
      id: 'crop-1',
      assetId: 'asset-1',
      role: 'fov-crop',
      url: 'http://127.0.0.1:3456/v1/preview/file/crop-token',
      mimeType: 'image/jpeg',
    } as const;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(createResponse(variant));
    const client = new EngineClient(3456);

    await expect(
      client.requestPreviewVariant('asset-1', {
        role: 'fov-crop',
        viewState: {
          mode: 'sphere',
          yawDeg: 30,
          pitchDeg: 5,
          rollDeg: 0,
          fovDeg: 80,
          exposure: 0,
          toneMapping: 'aces',
        },
        width: 512,
        height: 512,
      }),
    ).resolves.toEqual(variant);
    expect(client.getPreviewTokenUrl('token-1')).toBe(
      'http://127.0.0.1:3456/v1/preview/file/token-1',
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:3456/v1/preview/assets/asset-1/variants',
      expect.objectContaining({ method: 'POST' }),
    );

    fetchMock.mockRestore();
  });

  it('unregisters preview assets best-effort', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('offline'));
    const client = new EngineClient(3456);

    await expect(client.unregisterPreviewAsset('asset-1')).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:3456/v1/preview/assets/asset-1', {
      method: 'DELETE',
    });

    fetchMock.mockRestore();
  });
});
