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

/** Reads RGBA pixels from a WebGL texture and returns base64-encoded PNG data */
function readTextureAsBase64(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture,
  w: number,
  h: number,
): string | undefined {
  const fbo = gl.createFramebuffer();
  if (!fbo) return undefined;

  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fbo);
    return undefined;
  }

  const pixels = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteFramebuffer(fbo);

  // Check if layer is fully transparent (skip empty layers)
  let hasContent = false;
  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i]! > 0) {
      hasContent = true;
      break;
    }
  }
  if (!hasContent) return undefined;

  // Write RGBA to an offscreen canvas, then export as base64 PNG
  const offscreen = document.createElement('canvas');
  offscreen.width = w;
  offscreen.height = h;
  const ctx = offscreen.getContext('2d');
  if (!ctx) return undefined;

  const imageData = new ImageData(new Uint8ClampedArray(pixels.buffer), w, h);
  ctx.putImageData(imageData, 0, 0);
  const dataUrl = offscreen.toDataURL('image/png');
  return dataUrl.split(',')[1];
}

function serializeLayer(layer: LayerData, gl: WebGL2RenderingContext | null): NksLayerData {
  let data: string | undefined;
  if (layer.texture && gl) {
    data = readTextureAsBase64(gl, layer.texture, layer.width, layer.height);
  }

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
    children: layer.children.map((c) => serializeLayer(c, gl)),
    data,
  };
}

/** Serialize current store state to NksDocument for saving */
export function serializeDocument(
  canvas: CanvasConfig,
  layers: LayerData[],
  viewport: ViewportState,
  gl?: WebGL2RenderingContext | null,
): NksDocument {
  return {
    version: '1.0',
    canvas: {
      width: canvas.width,
      height: canvas.height,
      dpi: canvas.dpi,
      backgroundColor: canvas.backgroundColor,
    },
    layers: layers.map((l) => serializeLayer(l, gl ?? null)),
    brushPresets: [],
    palette: [],
    viewport: {
      panX: viewport.panX,
      panY: viewport.panY,
      zoom: viewport.zoom,
    },
  };
}
