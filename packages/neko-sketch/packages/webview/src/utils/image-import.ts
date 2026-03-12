/**
 * Image import utility
 *
 * Decodes a base64-encoded image and creates a new layer
 * with the image dimensions.
 */
import type { LayerData } from '../types';
import { generateLayerId } from '../layer';

/**
 * Create a LayerData from an imported image.
 * Returns the layer and a decoded ImageBitmap for texture upload.
 */
export async function importImageAsLayer(
  name: string,
  base64Data: string,
  mimeType?: string,
): Promise<{ layer: LayerData; bitmap: ImageBitmap }> {
  const mime = mimeType ?? guessMimeType(name);
  const binary = atob(base64Data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  const blob = new Blob([bytes], { type: mime });
  const bitmap = await createImageBitmap(blob);

  const layer: LayerData = {
    id: generateLayerId(),
    name: stripExtension(name),
    type: 'raster',
    visible: true,
    locked: false,
    opacity: 1.0,
    blendMode: 'normal',
    width: bitmap.width,
    height: bitmap.height,
    offsetX: 0,
    offsetY: 0,
    clippingMask: false,
    maskLayerId: null,
    children: [],
    texture: null, // Will be uploaded by renderer
  };

  return { layer, bitmap };
}

function guessMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    svg: 'image/svg+xml',
  };
  return map[ext] ?? 'image/png';
}

function stripExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.substring(0, dot) : name;
}
