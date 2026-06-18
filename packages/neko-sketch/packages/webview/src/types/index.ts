/**
 * Core types for neko-sketch webview
 */

import type {
  ProjectFileSnapshotRequestMessage,
  PsdImportPayloadWire,
  SketchAICancelMessage,
  SketchAIErrorMessage,
  SketchFeatureFlagsMessage,
  SketchAIOpenAgentMessage,
  SketchAIProgressMessage,
  SketchAIResultAppliedMessage,
  SketchAIResultApplyMessage,
  SketchBlendMode,
} from '@neko/shared';
import type { VectorLayerData } from './vector';
export type { SketchBlendMode };

// ─── Brush Types ───

export type BrushType =
  | 'pencil'
  | 'pen'
  | 'watercolor'
  | 'airbrush'
  | 'eraser'
  | 'marker'
  | 'pixel'
  | 'stamp';

export type TextureStampPattern = 'grain' | 'crosshatch' | 'bristle';

export interface TextureStampAsset {
  readonly id: string;
  readonly name: string;
  readonly dataUrl: string;
  readonly mimeType: string;
  readonly width: number;
  readonly height: number;
  readonly createdAt: number;
}

export interface StrokePoint {
  readonly x: number;
  readonly y: number;
  readonly pressure: number; // 0.0~1.0
  readonly tiltX: number; // -90~90
  readonly tiltY: number; // -90~90
  readonly timestamp: number;
  readonly shiftKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly altKey?: boolean;
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
  readonly stampPattern?: TextureStampPattern;
  readonly stampAssetId?: string | null;
}

export type FillPatternType = 'solid' | 'checker' | 'dots' | 'diagonal';

export interface FillSettings {
  readonly pattern: FillPatternType;
  readonly patternSize: number;
}

export interface StrokeResult {
  readonly points: StrokePoint[];
  readonly bounds: { x: number; y: number; width: number; height: number };
  readonly layerId: string;
}

// ─── Symmetry Types ───

export type SymmetryMode = 'none' | 'vertical' | 'horizontal' | 'both' | 'radial';

export interface SymmetryConfig {
  readonly mode: SymmetryMode;
  /** Axis X position in document pixels (default: canvas center) */
  readonly axisX: number;
  /** Axis Y position in document pixels (default: canvas center) */
  readonly axisY: number;
  /** Number of axes for radial mode (2-16) */
  readonly radialCount: number;
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
  /** Adjustment layer: which filter to apply (references FilterDef.id) */
  readonly adjustmentFilter?: string;
  /** Adjustment layer: filter parameter overrides */
  readonly adjustmentParams?: Record<string, number>;
  /** Vector layer payload: editable source paths for shape/path editing */
  readonly vectorData?: VectorLayerData;
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
  | 'vector'
  | 'gradient'
  | 'text'
  | 'clone';

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

// ─── Perspective Grid Types ───

export type PerspectiveGridMode = 'one-point' | 'two-point' | 'three-point';
export type PerspectiveVanishingPointKey = 'center' | 'left' | 'right' | 'vertical';

export interface DocumentPoint {
  readonly x: number;
  readonly y: number;
}

export interface PerspectiveGridState {
  readonly enabled: boolean;
  readonly snapEnabled: boolean;
  readonly mode: PerspectiveGridMode;
  readonly divisions: number;
  readonly opacity: number;
  readonly vanishingPoints: Readonly<Record<PerspectiveVanishingPointKey, DocumentPoint>>;
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
  readonly snapshot: RegionSnapshotPair | null;
  readonly stateSnapshot?: HistoryStateSnapshotPair;
}

export interface RegionSnapshot {
  readonly layerId: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

export interface RegionSnapshotPair {
  readonly before: RegionSnapshot;
  readonly after: RegionSnapshot;
}

export interface HistoryStateSnapshot {
  readonly layers?: readonly LayerData[];
  readonly activeLayerId?: string | null;
  readonly selection?: SelectionMask | null;
}

export interface HistoryStateSnapshotPair {
  readonly before: HistoryStateSnapshot;
  readonly after: HistoryStateSnapshot;
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

export type FileImportFailureCode =
  | 'kill-switch-disabled'
  | 'import-failed'
  | 'parser-unavailable'
  | 'parse-failed';

export type ExtensionToWebviewMessage =
  | { type: 'document:load'; data: unknown }
  | { type: 'document:revert' }
  | { type: 'document:save' }
  | { type: 'document:saveAs'; path: string }
  | ProjectFileSnapshotRequestMessage
  | { type: 'file:imported'; name: string; data: string; path: string }
  | { type: 'file:importedPsdTree'; payload: PsdImportPayloadWire }
  | { type: 'stamp:imported'; name: string; data: string; mimeType: string }
  | {
      type: 'file:importResult';
      success: boolean;
      code?: FileImportFailureCode;
      error?: string;
      name?: string;
    }
  | { type: 'file:exportResult'; success: boolean; path?: string; error?: string }
  | SketchFeatureFlagsMessage
  | SketchAIProgressMessage
  | SketchAIResultApplyMessage
  | SketchAIErrorMessage
  | SketchAICancelMessage
  | { type: 'keyboardFocus'; focused: boolean }
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
  | { type: 'webviewKeyboardFocus'; focused: boolean }
  | { type: 'document:save'; data: unknown }
  | { type: 'stamp:import' }
  | { type: 'file:export'; data: { format: string; data: string } }
  | { type: 'project:addSource'; request: import('@neko/shared').ProjectSourceAddRequest }
  | { type: 'operationApplied'; operation: unknown }
  | SketchAIOpenAgentMessage
  | SketchAIResultAppliedMessage
  | SketchAICancelMessage
  | { type: 'status:update'; data: unknown }
  | { type: 'layer:outline'; data: unknown }
  // Phase 2: export response
  | { type: 'response:exportCanvas'; requestId: string; data: string | null }
  // Phase 3: data read responses
  | { type: 'response:canvasImageData'; requestId: string; data: string | null }
  | { type: 'response:layerImageData'; requestId: string; data: string | null }
  | { type: 'response:selectionMask'; requestId: string; data: SketchSelectionResponse | null };
