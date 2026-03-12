/**
 * Document serialization/deserialization for .nks format
 *
 * Converts between the on-disk NksDocument format and
 * the in-memory Zustand store state.
 */
import type { LayerData, BlendMode, LayerType, CanvasConfig, ViewportState } from '../types';

// ─── NksDocument shape (matches extension/src/types.ts) ───

interface NksLayerData {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly visible: boolean;
  readonly locked: boolean;
  readonly opacity: number;
  readonly blendMode: string;
  readonly width: number;
  readonly height: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly clippingMask: boolean;
  readonly maskLayerId: string | null;
  readonly children: NksLayerData[];
  readonly data?: string;
}

interface NksDocument {
  readonly version: string;
  readonly canvas: {
    readonly width: number;
    readonly height: number;
    readonly dpi: number;
    readonly backgroundColor: string;
  };
  readonly layers: NksLayerData[];
  readonly brushPresets: unknown[];
  readonly palette: string[];
  readonly viewport: {
    readonly panX: number;
    readonly panY: number;
    readonly zoom: number;
  };
}

// ─── Deserialization (load) ───

const VALID_LAYER_TYPES = new Set<LayerType>([
  'raster',
  'group',
  'vector',
  'text',
  'fill',
  'adjustment',
]);

const VALID_BLEND_MODES = new Set<BlendMode>([
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
]);

function toLayerType(raw: string): LayerType {
  return VALID_LAYER_TYPES.has(raw as LayerType) ? (raw as LayerType) : 'raster';
}

function toBlendMode(raw: string): BlendMode {
  return VALID_BLEND_MODES.has(raw as BlendMode) ? (raw as BlendMode) : 'normal';
}

/** Convert serialized NksLayerData[] to in-memory LayerData[] */
export function deserializeLayers(raw: NksLayerData[]): LayerData[] {
  return raw.map((l) => ({
    id: l.id,
    name: l.name,
    type: toLayerType(l.type),
    visible: l.visible ?? true,
    locked: l.locked ?? false,
    opacity: l.opacity ?? 1,
    blendMode: toBlendMode(l.blendMode),
    width: l.width,
    height: l.height,
    offsetX: l.offsetX ?? 0,
    offsetY: l.offsetY ?? 0,
    clippingMask: l.clippingMask ?? false,
    maskLayerId: l.maskLayerId ?? null,
    children: deserializeLayers(l.children ?? []),
    texture: null,
  }));
}

/** Parse a full NksDocument into store-ready state */
export function deserializeDocument(data: unknown): {
  canvas: Partial<CanvasConfig>;
  layers: LayerData[];
  viewport: Partial<ViewportState>;
} | null {
  if (!data || typeof data !== 'object') return null;
  const doc = data as Partial<NksDocument>;

  return {
    canvas: doc.canvas ?? {},
    layers: deserializeLayers(doc.layers ?? []),
    viewport: doc.viewport ?? {},
  };
}

// ─── Serialization (save) ───

function serializeLayer(layer: LayerData): NksLayerData {
  return {
    id: layer.id,
    name: layer.name,
    type: layer.type,
    visible: layer.visible,
    locked: layer.locked,
    opacity: layer.opacity,
    blendMode: layer.blendMode,
    width: layer.width,
    height: layer.height,
    offsetX: layer.offsetX,
    offsetY: layer.offsetY,
    clippingMask: layer.clippingMask,
    maskLayerId: layer.maskLayerId,
    children: layer.children.map(serializeLayer),
    // TODO(P2): read pixel data from WebGL texture
  };
}

/** Serialize current store state to NksDocument for saving */
export function serializeDocument(
  canvas: CanvasConfig,
  layers: LayerData[],
  viewport: ViewportState,
): NksDocument {
  return {
    version: '1.0',
    canvas: {
      width: canvas.width,
      height: canvas.height,
      dpi: canvas.dpi,
      backgroundColor: canvas.backgroundColor,
    },
    layers: layers.map(serializeLayer),
    brushPresets: [],
    palette: [],
    viewport: {
      panX: viewport.panX,
      panY: viewport.panY,
      zoom: viewport.zoom,
    },
  };
}
