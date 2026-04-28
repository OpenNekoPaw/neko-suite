/**
 * Sketch document types - .nks file format
 *
 * Core format types are defined in @neko/shared and re-exported here
 * for backwards compatibility. Extension-specific UI types remain local.
 */

// Re-export format types from shared package
export type { SketchBlendMode } from '@neko/shared';
export type { LayerType, NksLayerData, NksDocument, BrushPreset } from '@neko/shared';

/** Layer outline data for tree view */
export interface LayerOutlineData {
  readonly name: string;
  readonly layers: LayerOutlineEntry[];
}

export interface LayerOutlineEntry {
  readonly id: string;
  readonly name: string;
  readonly type: import('@neko/shared').LayerType;
  readonly visible: boolean;
  readonly locked: boolean;
  readonly children: LayerOutlineEntry[];
}

/** Status bar info */
export interface SketchStatusInfo {
  readonly layerCount: number;
  readonly canvasSize: string;
  readonly zoom: number;
  readonly rotation?: number;
  readonly activeTool: string;
  readonly brushSize: number;
}

/** Export format options */
export type ExportFormat = 'png' | 'jpeg' | 'webp' | 'svg';

export interface ExportOptions {
  readonly format: ExportFormat;
  readonly quality: number;
  readonly scale: number;
  readonly selectedLayersOnly: boolean;
}
