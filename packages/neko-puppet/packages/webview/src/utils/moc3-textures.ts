import type { PuppetExternalTextureData } from '@neko/shared';

export interface Moc3TextureDecoder<TImage> {
  decodePng(bytes: Uint8Array, source: PuppetExternalTextureData): Promise<TImage>;
  createPlaceholderTexture(slotIndex: number): Promise<TImage>;
}

export function base64ToBytes(data: string): Uint8Array {
  const base64 = data.replace(/^data:[^;,]+;base64,/i, '').trim();
  if (base64.length === 0) {
    throw new Error('Texture payload is empty.');
  }

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function decodeMoc3ExternalTexturesWithDecoder<TImage>(
  sources: readonly PuppetExternalTextureData[],
  decoder: Moc3TextureDecoder<TImage>,
): Promise<TImage[]> {
  const slots: Array<TImage | undefined> = [];
  const seenIndexes = new Set<number>();

  for (const source of sources) {
    const index = validateTextureIndex(source.index);
    if (seenIndexes.has(index)) {
      throw new Error(`Duplicate Live2D texture index ${index}.`);
    }

    const mimeType = source.mimeType ?? 'image/png';
    if (mimeType !== 'image/png') {
      throw new Error(`Unsupported Live2D texture MIME type: ${mimeType}.`);
    }

    seenIndexes.add(index);
    slots[index] = await decoder.decodePng(base64ToBytes(source.data), source);
  }

  for (let index = 0; index < slots.length; index++) {
    if (slots[index] === undefined) {
      slots[index] = await decoder.createPlaceholderTexture(index);
    }
  }

  return slots as TImage[];
}

export async function decodeMoc3ExternalTextures(
  sources: readonly PuppetExternalTextureData[],
): Promise<ImageBitmap[]> {
  return decodeMoc3ExternalTexturesWithDecoder(sources, browserMoc3TextureDecoder);
}

function validateTextureIndex(index: number): number {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error(`Invalid Live2D texture index ${index}.`);
  }
  return index;
}

const browserMoc3TextureDecoder: Moc3TextureDecoder<ImageBitmap> = {
  async decodePng(bytes) {
    const blobBytes = new Uint8Array(bytes);
    const blob = new Blob([blobBytes.buffer], { type: 'image/png' });
    return createImageBitmap(blob);
  },
  async createPlaceholderTexture() {
    return createImageBitmap(new ImageData(1, 1));
  },
};
