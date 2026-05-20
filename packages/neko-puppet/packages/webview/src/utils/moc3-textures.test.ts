import { describe, expect, it } from 'vitest';
import type { PuppetExternalTextureData } from '@neko/shared';
import {
  base64ToBytes,
  decodeMoc3ExternalTexturesWithDecoder,
  type Moc3TextureDecoder,
} from './moc3-textures';

interface TestImage {
  readonly kind: 'decoded' | 'fallback';
  readonly slot: number;
  readonly bytes?: readonly number[];
}

const decoder: Moc3TextureDecoder<TestImage> = {
  async decodePng(bytes, source) {
    return { kind: 'decoded', slot: source.index, bytes: [...bytes] };
  },
  async createFallbackTexture(slotIndex) {
    return { kind: 'fallback', slot: slotIndex };
  },
};

describe('moc3 external texture decoding', () => {
  it('decodes base64 data URLs into bytes', () => {
    expect([...base64ToBytes('data:image/png;base64,AQID')]).toEqual([1, 2, 3]);
  });

  it('preserves MOC3 texture indexes and fills gaps with fallback textures', async () => {
    const sources: PuppetExternalTextureData[] = [
      { index: 1, data: 'BAU=', mimeType: 'image/png', name: 'texture_01.png' },
      { index: 0, data: 'AQID', mimeType: 'image/png', name: 'texture_00.png' },
    ];

    const textures = await decodeMoc3ExternalTexturesWithDecoder(sources, decoder);

    expect(textures).toEqual([
      { kind: 'decoded', slot: 0, bytes: [1, 2, 3] },
      { kind: 'decoded', slot: 1, bytes: [4, 5] },
    ]);
  });

  it('keeps sparse texture slots aligned with texture_index references', async () => {
    const textures = await decodeMoc3ExternalTexturesWithDecoder(
      [{ index: 2, data: 'Cg==', mimeType: 'image/png' }],
      decoder,
    );

    expect(textures).toEqual([
      { kind: 'fallback', slot: 0 },
      { kind: 'fallback', slot: 1 },
      { kind: 'decoded', slot: 2, bytes: [10] },
    ]);
  });

  it('rejects duplicate and non-PNG texture payloads', async () => {
    await expect(
      decodeMoc3ExternalTexturesWithDecoder(
        [
          { index: 0, data: 'AQ==', mimeType: 'image/png' },
          { index: 0, data: 'Ag==', mimeType: 'image/png' },
        ],
        decoder,
      ),
    ).rejects.toThrow('Duplicate Live2D texture index 0.');

    await expect(
      decodeMoc3ExternalTexturesWithDecoder(
        [{ index: 0, data: 'AQ==', mimeType: 'image/jpeg' as 'image/png' }],
        decoder,
      ),
    ).rejects.toThrow('Unsupported Live2D texture MIME type: image/jpeg.');
  });
});
