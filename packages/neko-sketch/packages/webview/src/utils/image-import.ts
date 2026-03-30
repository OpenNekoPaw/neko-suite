/**
 * Image import utility
 *
 * Decodes images from various sources (base64, Blob, File) and creates
 * new raster layers with the image dimensions.
 */
import type { LayerData } from '../types';
import { generateLayerId } from '../layer';

/**
 * Create a LayerData from a base64-encoded image.
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
  return importImageFromBlob(blob, name);
}

/**
 * Create a LayerData from a Blob or File.
 * Used by clipboard paste and drag-and-drop import.
 */
export async function importImageFromBlob(
  blob: Blob,
  name: string,
): Promise<{ layer: LayerData; bitmap: ImageBitmap }> {
  const bitmap = await createImageBitmap(blob);

  const layer: LayerData = buildLayerData(
    blob instanceof File ? stripExtension(blob.name) : stripExtension(name),
    bitmap.width,
    bitmap.height,
  );

  return { layer, bitmap };
}

/** Supported image MIME types for import validation */
const IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/svg+xml',
]);

/** Check if a MIME type represents an importable image */
export function isImageMimeType(mimeType: string): boolean {
  return IMAGE_MIME_TYPES.has(mimeType);
}

/** Build a raster LayerData with common defaults */
function buildLayerData(name: string, width: number, height: number): LayerData {
  return {
    id: generateLayerId(),
    name,
    type: 'raster',
    visible: true,
    locked: false,
    opacity: 1.0,
    blendMode: 'normal',
    width,
    height,
    offsetX: 0,
    offsetY: 0,
    clippingMask: false,
    maskLayerId: null,
    children: [],
    texture: null, // Will be uploaded by renderer
  };
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
