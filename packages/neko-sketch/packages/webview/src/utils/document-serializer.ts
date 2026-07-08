/**
 * Document serialization/deserialization for .nks format
 *
 * Converts between the on-disk NksDocument format and
 * the in-memory Zustand store state.
 */
import type { LayerData, BlendMode, LayerType, CanvasConfig, ViewportState } from '../types';
import type {
  FillStyle,
  PathSegment,
  StrokeStyle,
  VectorLayerData,
  VectorNodeRef,
  VectorPath,
} from '../types/vector';
import type { Scene } from '../types/scene';
import type { AppliedFilter } from '../types/filter';
import { DEFAULT_AMBIENT_LIGHT } from '../types/light';
import { DEFAULT_CAMERA, DEFAULT_ATMOSPHERE } from '../types/scene';
import { CURRENT_NKS_VERSION, migrateNks } from '@neko/shared/nks';

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
  readonly source?: import('@neko/shared').NksLayerSourceRef;
  readonly normalData?: string;
  readonly alphaLock?: boolean;
  readonly adjustmentFilter?: string;
  readonly adjustmentParams?: Record<string, number>;
  readonly vectorData?: VectorLayerData;
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
    readonly rotation?: number;
  };
  /** v1.1: scene data including lighting, camera, atmosphere */
  readonly scenes?: readonly Scene[];
  /** v1.1: global filter stack */
  readonly filters?: readonly AppliedFilter[];
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

function deserializeVectorLayerData(raw: unknown): VectorLayerData | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const value = raw as Partial<VectorLayerData>;
  const paths = Array.isArray(value.paths) ? value.paths.filter(isVectorPath) : [];
  return {
    paths,
    selectedPathId:
      typeof value.selectedPathId === 'string' || value.selectedPathId === null
        ? value.selectedPathId
        : (paths[0]?.id ?? null),
    selectedNodeRefs: Array.isArray(value.selectedNodeRefs)
      ? value.selectedNodeRefs.filter(isVectorNodeRef)
      : [],
    handleModes: Array.isArray(value.handleModes)
      ? value.handleModes.filter(isVectorHandleModeAssignment)
      : [],
  };
}

function serializeVectorLayerData(
  vectorData: VectorLayerData | undefined,
): VectorLayerData | undefined {
  if (!vectorData) {
    return undefined;
  }
  return {
    paths: vectorData.paths,
    selectedPathId: vectorData.selectedPathId ?? null,
    selectedNodeRefs: vectorData.selectedNodeRefs ?? [],
    handleModes: vectorData.handleModes ?? [],
  };
}

function isVectorPath(value: unknown): value is VectorPath {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const path = value as Partial<VectorPath>;
  return (
    typeof path.id === 'string' &&
    Array.isArray(path.segments) &&
    path.segments.every(isPathSegment) &&
    typeof path.closed === 'boolean' &&
    (path.fill === null || isFillStyle(path.fill)) &&
    (path.stroke === null || isStrokeStyle(path.stroke))
  );
}

function isPathSegment(value: unknown): value is PathSegment {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const segment = value as Partial<PathSegment>;
  return (
    (segment.type === 'move' ||
      segment.type === 'line' ||
      segment.type === 'cubic' ||
      segment.type === 'quadratic') &&
    Array.isArray(segment.points) &&
    segment.points.every(isPointTuple)
  );
}

function isFillStyle(value: unknown): value is FillStyle {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const fill = value as Partial<FillStyle>;
  return isColorTuple(fill.color) && (fill.rule === 'evenodd' || fill.rule === 'nonzero');
}

function isStrokeStyle(value: unknown): value is StrokeStyle {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const stroke = value as Partial<StrokeStyle>;
  return (
    isColorTuple(stroke.color) &&
    typeof stroke.width === 'number' &&
    (stroke.cap === 'butt' || stroke.cap === 'round' || stroke.cap === 'square') &&
    (stroke.join === 'miter' || stroke.join === 'round' || stroke.join === 'bevel')
  );
}

function isVectorNodeRef(value: unknown): value is VectorNodeRef {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const ref = value as Partial<VectorNodeRef>;
  return (
    typeof ref.pathId === 'string' &&
    typeof ref.segmentIndex === 'number' &&
    typeof ref.pointIndex === 'number' &&
    (ref.role === 'anchor' ||
      ref.role === 'control-in' ||
      ref.role === 'control-out' ||
      ref.role === 'control')
  );
}

function isVectorHandleModeAssignment(
  value: unknown,
): value is NonNullable<VectorLayerData['handleModes']>[number] {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const assignment = value as Partial<NonNullable<VectorLayerData['handleModes']>[number]>;
  return (
    isVectorNodeRef(assignment.anchor) &&
    (assignment.mode === 'corner' || assignment.mode === 'smooth' || assignment.mode === 'mirrored')
  );
}

function isPointTuple(value: unknown): value is readonly [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number'
  );
}

function isColorTuple(value: unknown): value is readonly [number, number, number, number] {
  return (
    Array.isArray(value) && value.length === 4 && value.every((item) => typeof item === 'number')
  );
}

/** Convert serialized NksLayerData[] to in-memory LayerData[] */
function deserializeLayers(raw: NksLayerData[]): LayerData[] {
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
    pendingData: l.data,
    source: l.source,
    pendingNormalData: l.normalData,
    alphaLock: l.alphaLock ?? false,
    adjustmentFilter: l.adjustmentFilter,
    adjustmentParams: l.adjustmentParams,
    vectorData: deserializeVectorLayerData(l.vectorData),
  }));
}

/** Parse a full NksDocument into store-ready state */
export function deserializeDocument(data: unknown): {
  canvas: Partial<CanvasConfig>;
  layers: LayerData[];
  viewport: Partial<ViewportState>;
  scenes: Scene[];
  filters: AppliedFilter[];
} | null {
  if (!data || typeof data !== 'object') return null;
  const doc = migrateNks(data).data as Partial<NksDocument>;

  // Deserialize scenes with defaults for missing lighting fields
  const rawScenes = (doc.scenes as Scene[] | undefined) ?? [];
  const scenes: Scene[] = rawScenes.map((s) => ({
    id: s.id,
    name: s.name,
    layers: s.layers ?? [],
    camera: s.camera ?? DEFAULT_CAMERA,
    atmosphere: s.atmosphere ?? DEFAULT_ATMOSPHERE,
    ambientLight: s.ambientLight ?? DEFAULT_AMBIENT_LIGHT,
    lightingEnabled: s.lightingEnabled ?? false,
  }));

  return {
    canvas: doc.canvas ?? {},
    layers: deserializeLayers(doc.layers ?? []),
    viewport: doc.viewport ?? {},
    scenes,
    filters: (doc.filters as AppliedFilter[] | undefined) ?? [],
  };
}

// ─── Serialization (save) ───

/** Reads RGBA pixels from a WebGL texture and returns base64-encoded PNG data */
export function readTextureAsBase64(
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
    source: layer.source,
    normalData:
      layer.normalTexture && gl
        ? readTextureAsBase64(gl, layer.normalTexture, layer.width, layer.height)
        : undefined,
    alphaLock: layer.alphaLock || undefined,
    adjustmentFilter: layer.adjustmentFilter,
    adjustmentParams: layer.adjustmentParams,
    vectorData: serializeVectorLayerData(layer.vectorData),
  };
}

/** Serialize current store state to NksDocument for saving */
export function serializeDocument(
  canvas: CanvasConfig,
  layers: LayerData[],
  viewport: ViewportState,
  gl?: WebGL2RenderingContext | null,
  scenes?: readonly Scene[],
  filters?: readonly AppliedFilter[],
): NksDocument {
  return {
    version: CURRENT_NKS_VERSION,
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
      rotation: viewport.rotation,
    },
    scenes: scenes && scenes.length > 0 ? scenes : undefined,
    filters: filters && filters.length > 0 ? filters : undefined,
  };
}
