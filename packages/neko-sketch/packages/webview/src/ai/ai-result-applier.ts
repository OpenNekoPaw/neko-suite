import type { BrushSettings, BrushType, LayerData, SelectionMask } from '../types';
import { addCustomPalette, type PaletteDef } from '../utils/custom-palettes';
import { createRasterLayerFromBlob, type RasterLayerImport } from '../utils/raster-source';
import type { BrushPreset } from '@neko/shared';
import type { SketchAIAssetRef, SketchAIResult } from './ai-progress-types';

export interface SketchAIApplyStore {
  getLayers(): readonly LayerData[];
  setLayers(layers: LayerData[]): void;
  setActiveLayer(id: string): void;
  setSelectionMask(mask: SelectionMask | null): void;
  setBrushSettings?(updates: Partial<BrushSettings>): void;
  markDirty(): void;
}

export interface SketchAIResultApplierDependencies {
  loadRasterLayer(
    asset: SketchAIAssetRef,
    options: AIAssetLayerOptions,
  ): Promise<RasterLayerImport>;
  loadSelectionMask(asset: SketchAIAssetRef): Promise<SelectionMask>;
  addPalette(name: string, colors: readonly string[]): PaletteDef | null;
}

export interface AIAssetLayerOptions {
  readonly name: string;
  readonly width?: number;
  readonly height?: number;
  readonly offsetX?: number;
  readonly offsetY?: number;
  readonly opacity?: number;
  readonly blendMode?: LayerData['blendMode'];
}

export type SketchAIApplyResult =
  | { readonly applied: true; readonly target: 'layer'; readonly layerId: string }
  | { readonly applied: true; readonly target: 'selection' }
  | { readonly applied: true; readonly target: 'palette'; readonly paletteId: string }
  | { readonly applied: true; readonly target: 'brushPreset' }
  | { readonly applied: false; readonly reason: string };

export async function applySketchAIResult(
  result: SketchAIResult,
  store: SketchAIApplyStore,
  deps: SketchAIResultApplierDependencies = createBrowserAIResultApplierDependencies(),
): Promise<SketchAIApplyResult> {
  switch (result.kind) {
    case 'layer':
      return applyLayerResult(result, store, deps);
    case 'selection':
      return applySelectionResult(result, store, deps);
    case 'palette':
      return applyPaletteResult(result, deps);
    case 'brushPreset':
      return applyBrushPresetResult(result, store);
    default:
      return assertNever(result);
  }
}

export function rgbaToSelectionMask(
  width: number,
  height: number,
  rgba: Uint8ClampedArray | Uint8Array,
): SelectionMask {
  const data = new Uint8Array(width * height);
  const useLuminance = isOpaqueMask(rgba);
  for (let i = 0; i < data.length; i++) {
    const pixelOffset = i * 4;
    const alpha = rgba[pixelOffset + 3] ?? 0;
    const value = useLuminance
      ? Math.max(rgba[pixelOffset] ?? 0, rgba[pixelOffset + 1] ?? 0, rgba[pixelOffset + 2] ?? 0)
      : alpha;
    data[i] = value > 127 ? 255 : 0;
  }
  return { width, height, data };
}

function applyLayerResult(
  result: Extract<SketchAIResult, { kind: 'layer' }>,
  store: SketchAIApplyStore,
  deps: SketchAIResultApplierDependencies,
): Promise<SketchAIApplyResult> {
  return deps
    .loadRasterLayer(result.data, {
      name: result.name ?? inferAssetName(result.data, 'AI Layer'),
      width: result.width,
      height: result.height,
      offsetX: result.offsetX,
      offsetY: result.offsetY,
      opacity: result.opacity,
      blendMode: result.blendMode,
    })
    .then(({ layer }) => {
      store.setLayers([...store.getLayers(), layer]);
      store.setActiveLayer(layer.id);
      store.markDirty();
      return { applied: true, target: 'layer', layerId: layer.id };
    });
}

async function applySelectionResult(
  result: Extract<SketchAIResult, { kind: 'selection' }>,
  store: SketchAIApplyStore,
  deps: SketchAIResultApplierDependencies,
): Promise<SketchAIApplyResult> {
  const selection = await deps.loadSelectionMask(result.data);
  store.setSelectionMask(selection);
  return { applied: true, target: 'selection' };
}

function applyPaletteResult(
  result: Extract<SketchAIResult, { kind: 'palette' }>,
  deps: SketchAIResultApplierDependencies,
): SketchAIApplyResult {
  const name =
    typeof result.metadata?.['name'] === 'string'
      ? result.metadata['name']
      : typeof result.metadata?.['paletteName'] === 'string'
        ? result.metadata['paletteName']
        : 'AI Palette';
  const palette = deps.addPalette(name, result.data);
  if (!palette) {
    return { applied: false, reason: 'AI palette result did not contain valid colors' };
  }
  return { applied: true, target: 'palette', paletteId: palette.id };
}

function applyBrushPresetResult(
  result: Extract<SketchAIResult, { kind: 'brushPreset' }>,
  store: SketchAIApplyStore,
): SketchAIApplyResult {
  if (!store.setBrushSettings) {
    return { applied: false, reason: 'AI brush preset application is not available' };
  }
  store.setBrushSettings(normalizeBrushPreset(result.data));
  return { applied: true, target: 'brushPreset' };
}

function normalizeBrushPreset(preset: BrushPreset): Partial<BrushSettings> {
  return {
    type: toBrushType(preset.type),
    size: clampNumber(preset.size, 1, 500, 6),
    opacity: clampNumber(preset.opacity, 0, 1, 1),
    hardness: clampNumber(preset.hardness, 0, 1, 0.85),
    spacing: clampNumber(preset.spacing, 0.01, 1, 0.1),
  };
}

function toBrushType(type: string): BrushType {
  return isBrushType(type) ? type : 'pen';
}

function isBrushType(type: string): type is BrushType {
  return (
    type === 'pencil' ||
    type === 'pen' ||
    type === 'watercolor' ||
    type === 'airbrush' ||
    type === 'eraser' ||
    type === 'marker' ||
    type === 'pixel' ||
    type === 'stamp'
  );
}

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, value));
}

function createBrowserAIResultApplierDependencies(): SketchAIResultApplierDependencies {
  return {
    async loadRasterLayer(asset, options) {
      const blob = await fetchAssetBlob(asset);
      return createRasterLayerFromBlob(blob, { ...options, name: options.name });
    },
    async loadSelectionMask(asset) {
      const blob = await fetchAssetBlob(asset);
      return decodeSelectionMaskBlob(blob);
    },
    addPalette(name, colors) {
      return addCustomPalette(name, colors);
    },
  };
}

async function fetchAssetBlob(asset: SketchAIAssetRef): Promise<Blob> {
  if (asset.kind !== 'webviewUri') {
    throw new Error(`AI asset kind "${asset.kind}" cannot be loaded in the webview`);
  }
  const response = await fetch(asset.ref);
  if (!response.ok) {
    throw new Error(`Failed to load AI asset: HTTP ${response.status}`);
  }
  return response.blob();
}

async function decodeSelectionMaskBlob(blob: Blob): Promise<SelectionMask> {
  const source = await decodeBlob(blob);
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to create 2D canvas for AI selection mask');
  }
  ctx.drawImage(source.image, 0, 0, source.width, source.height);
  if ('close' in source.image && typeof source.image.close === 'function') {
    source.image.close();
  }
  const imageData = ctx.getImageData(0, 0, source.width, source.height);
  return rgbaToSelectionMask(source.width, source.height, imageData.data);
}

async function decodeBlob(
  blob: Blob,
): Promise<{
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

function inferAssetName(asset: SketchAIAssetRef, fallback: string): string {
  const segment = asset.ref.split('/').pop()?.split('?')[0];
  if (!segment) return fallback;
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function isOpaqueMask(rgba: Uint8ClampedArray | Uint8Array): boolean {
  for (let i = 3; i < rgba.length; i += 4) {
    if ((rgba[i] ?? 0) !== 255) return false;
  }
  return true;
}

function assertNever(value: never): SketchAIApplyResult {
  return { applied: false, reason: `Unsupported AI result: ${String(value)}` };
}
