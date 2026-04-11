/**
 * Core types for neko-sketch webview
 */

import type { SketchBlendMode } from '@neko/shared';
export type { SketchBlendMode };

// ─── Brush Types ───

export type BrushType =
  | 'pencil'
  | 'pen'
  | 'watercolor'
  | 'airbrush'
  | 'eraser'
  | 'marker'
  | 'pixel';

export interface StrokePoint {
  readonly x: number;
  readonly y: number;
  readonly pressure: number; // 0.0~1.0
  readonly tiltX: number; // -90~90
  readonly tiltY: number; // -90~90
  readonly timestamp: number;
}

export interface BrushSettings {
  readonly type: BrushType;
  readonly size: number; // px
  readonly opacity: number; // 0.0~1.0
  readonly hardness: number; // 0.0~1.0
  readonly spacing: number; // 0.0~1.0 (fraction of brush size)
  readonly color: string; // hex
  readonly pressureSizeEnabled: boolean;
  readonly pressureOpacityEnabled: boolean;
}

export interface StrokeResult {
  readonly points: StrokePoint[];
  readonly bounds: { x: number; y: number; width: number; height: number };
  readonly layerId: string;
}

// ─── Layer Types ───

export type LayerType = 'raster' | 'group' | 'vector' | 'text' | 'fill' | 'adjustment';

/** CSS/WebGL blend mode for sketch layers. @see SketchBlendMode from @neko/shared */
export type BlendMode = SketchBlendMode;

export interface LayerData {
  readonly id: string;
  readonly name: string;
  readonly type: LayerType;
  readonly visible: boolean;
  readonly locked: boolean;
  readonly opacity: number;
  readonly blendMode: BlendMode;
  readonly width: number;
  readonly height: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly clippingMask: boolean;
  readonly maskLayerId: string | null;
  readonly children: LayerData[];
  texture: WebGLTexture | null;
  /** Base64 PNG data from .nks file, consumed once to create WebGL texture */
  pendingData?: string;
  /** P1: Normal map texture, RGB encodes (nx*0.5+0.5, ny*0.5+0.5, nz*0.5+0.5) */
  normalTexture?: WebGLTexture | null;
  /** P1: Base64 normal map data from .nks file, consumed on first render */
  pendingNormalData?: string;
  /** Alpha lock: paint without altering layer transparency */
  readonly alphaLock: boolean;
}

// ─── Tool Types ───

export type ToolType =
  | 'brush'
  | 'eraser'
  | 'select-rect'
  | 'select-lasso'
  | 'select-wand'
  | 'move'
  | 'shape'
  | 'transform'
  | 'eyedropper'
  | 'fill'
  | 'zoom'
  | 'pixel'
  | 'vector';

export type ShapeType = 'rectangle' | 'ellipse' | 'line' | 'polygon' | 'star' | 'path';

// ─── Selection Types ───

export interface SelectionMask {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

// ─── Viewport Types ───

export interface ViewportState {
  readonly panX: number;
  readonly panY: number;
  readonly zoom: number;
  readonly rotation: number;
}

// ─── Document Types ───

export interface CanvasConfig {
  readonly width: number;
  readonly height: number;
  readonly dpi: number;
  readonly backgroundColor: string;
}

// ─── History Types ───

export type HistoryActionType =
  | 'stroke'
  | 'layer-add'
  | 'layer-remove'
  | 'layer-reorder'
  | 'layer-property'
  | 'layer-merge'
  | 'transform'
  | 'selection'
  | 'fill'
  | 'clear';

export interface HistoryEntry {
  readonly id: string;
  readonly type: HistoryActionType;
  readonly label: string;
  readonly timestamp: number;
  readonly snapshot: RegionSnapshot | null;
}

export interface RegionSnapshot {
  readonly layerId: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

// ─── Message Protocol (Extension ↔ Webview) ───

// ─── Selection response payload (used by request:selectionMask) ───

export interface SketchSelectionResponse {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Grayscale mask PNG (base64): white = selected, black = unselected */
  mask: string;
  /** Composite canvas PNG (base64) used as inpaint source image */
  layerImageData: string;
}

export type ExtensionToWebviewMessage =
  | { type: 'document:load'; data: unknown }
  | { type: 'document:revert' }
  | { type: 'document:save' }
  | { type: 'document:saveAs'; path: string }
  | { type: 'file:imported'; name: string; data: string; path: string }
  | { type: 'file:exportResult'; success: boolean; path?: string; error?: string }
  | { type: 'keyboardAction'; action: string }
  | { type: 'setLocale'; locale: string }
  // Phase 2: export request from extension
  | { type: 'request:exportCanvas'; requestId: string }
  // Phase 3: data read requests from extension
  | { type: 'request:canvasImageData'; requestId: string }
  | { type: 'request:layerImageData'; requestId: string; layerId?: string }
  | { type: 'request:selectionMask'; requestId: string };

export type WebviewToExtensionMessage =
  | { type: 'ready' }
  | { type: 'document:save'; data: unknown }
  | { type: 'file:import' }
  | { type: 'file:export'; data: { format: string; data: string } }
  | { type: 'file:dropRequest'; uris: string }
  | { type: 'status:update'; data: unknown }
  | { type: 'layer:outline'; data: unknown }
  // Phase 2: export response
  | { type: 'response:exportCanvas'; requestId: string; data: string | null }
  // Phase 3: data read responses
  | { type: 'response:canvasImageData'; requestId: string; data: string | null }
  | { type: 'response:layerImageData'; requestId: string; data: string | null }
  | { type: 'response:selectionMask'; requestId: string; data: SketchSelectionResponse | null };
