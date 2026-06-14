/**
 * Raster source utilities.
 *
 * Normalizes imported image-like inputs into sketch raster layers with
 * PNG-backed pendingData. The WebGL canvas texture restore path already knows
 * how to consume pendingData, so this keeps imports consistent across regular
 * images, PSD layers, and future AI result assets.
 */
import type { PsdEncodedPixelsWire } from '@neko/shared';
import type { LayerData } from '../types';
import { generateLayerId } from '../layer';

export interface RasterLayerImport {
  readonly layer: LayerData;
}

export interface RasterLayerOptions {
  readonly name: string;
  readonly width?: number;
  readonly height?: number;
  readonly offsetX?: number;
  readonly offsetY?: number;
  readonly visible?: boolean;
  readonly opacity?: number;
  readonly blendMode?: LayerData['blendMode'];
  readonly clippingMask?: boolean;
}

export async function createRasterLayerFromBase64(
  name: string,
  base64Data: string,
  mimeType?: string,
): Promise<RasterLayerImport> {
  const blob = base64ToBlob(base64Data, mimeType ?? guessMimeType(name));
  return createRasterLayerFromBlob(blob, { name });
}

export async function createRasterLayerFromBlob(
  blob: Blob,
  options: RasterLayerOptions,
): Promise<RasterLayerImport> {
  const png = await blobToPngBase64(blob);
  const layer = buildRasterLayer({
    ...options,
    name: stripExtension(options.name),
    width: png.width,
    height: png.height,
  });
  layer.pendingData = png.base64;
  return { layer };
}

export function createRasterLayerFromEncodedPng(
  pixels: PsdEncodedPixelsWire,
  options: RasterLayerOptions,
): RasterLayerImport {
  const layer = buildRasterLayer(options);
  layer.pendingData = pixels.dataBase64;
  return { layer };
}

export function buildRasterLayer(options: RasterLayerOptions): LayerData {
  return {
    id: generateLayerId(),
    name: options.name,
    type: 'raster',
    visible: options.visible ?? true,
    locked: false,
    opacity: options.opacity ?? 1.0,
    blendMode: options.blendMode ?? 'normal',
    width: options.width ?? 1,
    height: options.height ?? 1,
    offsetX: options.offsetX ?? 0,
    offsetY: options.offsetY ?? 0,
    clippingMask: options.clippingMask ?? false,
    maskLayerId: null,
    children: [],
    texture: null,
    alphaLock: false,
  };
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

async function blobToPngBase64(
  blob: Blob,
): Promise<{ readonly base64: string; readonly width: number; readonly height: number }> {
  const source = await decodeBlob(blob);
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to create 2D canvas for raster import');
  }
  ctx.drawImage(source.image, 0, 0, source.width, source.height);
  if ('close' in source.image && typeof source.image.close === 'function') {
    source.image.close();
  }
  const dataUrl = canvas.toDataURL('image/png');
  return {
    base64: dataUrl.split(',')[1] ?? '',
    width: source.width,
    height: source.height,
  };
}

async function decodeBlob(blob: Blob): Promise<{
  readonly image: CanvasImageSource & { close?: () => void };
  readonly width: number;
  readonly height: number;
}> {
  try {
    const bitmap = await createImageBitmap(blob);
    return { image: bitmap, width: bitmap.width, height: bitmap.height };
  } catch {
    return decodeBlobWithImageElement(blob);
  }
}

async function decodeBlobWithImageElement(
  blob: Blob,
): Promise<{ readonly image: HTMLImageElement; readonly width: number; readonly height: number }> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { image: img, width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function base64ToBlob(base64Data: string, mimeType: string): Blob {
  const binary = atob(base64Data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
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
