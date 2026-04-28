/**
 * Image import utility
 *
 * Decodes images from various sources (base64, Blob, File) and creates
 * new raster layers with the image dimensions.
 */
import type { LayerData } from '../types';
import {
  createRasterLayerFromBase64,
  createRasterLayerFromBlob,
  isImageMimeType,
} from './raster-source';

/**
 * Create a LayerData from a base64-encoded image.
 * Returns the layer and a decoded ImageBitmap for texture upload.
 */
export async function importImageAsLayer(
  name: string,
  base64Data: string,
  mimeType?: string,
): Promise<{ layer: LayerData; bitmap: ImageBitmap }> {
  const { layer } = await createRasterLayerFromBase64(name, base64Data, mimeType);
  return { layer, bitmap: await pendingLayerToBitmap(layer) };
}

/**
 * Create a LayerData from a Blob or File.
 * Used by clipboard paste and drag-and-drop import.
 */
export async function importImageFromBlob(
  blob: Blob,
  name: string,
): Promise<{ layer: LayerData; bitmap: ImageBitmap }> {
  const { layer } = await createRasterLayerFromBlob(blob, {
    name: blob instanceof File ? blob.name : name,
  });
  return { layer, bitmap: await pendingLayerToBitmap(layer) };
}

export { isImageMimeType };

async function pendingLayerToBitmap(layer: LayerData): Promise<ImageBitmap> {
  if (!layer.pendingData) {
    throw new Error('Imported raster layer has no pending pixel data');
  }
  const binary = atob(layer.pendingData);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return createImageBitmap(new Blob([bytes], { type: 'image/png' }));
}
