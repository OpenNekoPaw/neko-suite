/**
 * Core types for neko-sketch webview
 */

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

export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion';

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
  | 'zoom';

export type ShapeType = 'rectangle' | 'ellipse' | 'line';

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

export type ExtensionToWebviewMessage =
  | { type: 'document:load'; data: unknown }
  | { type: 'document:revert' }
  | { type: 'document:save' }
  | { type: 'document:saveAs'; path: string }
  | { type: 'file:imported'; name: string; data: string; path: string }
  | { type: 'file:exportResult'; success: boolean; path?: string; error?: string }
  | { type: 'keyboardAction'; action: string }
  | { type: 'setLocale'; locale: string };

export type WebviewToExtensionMessage =
  | { type: 'ready' }
  | { type: 'document:save'; data: unknown }
  | { type: 'file:import' }
  | { type: 'file:export'; data: { format: string; data: string } }
  | { type: 'status:update'; data: unknown }
  | { type: 'layer:outline'; data: unknown };
