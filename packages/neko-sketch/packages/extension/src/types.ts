/**
 * Sketch document types - .nks file format
 */

/** Layer blend mode types (subset of @neko/shared BlendModeType) */
export type SketchBlendMode =
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

/** Layer types in a sketch document */
export type LayerType = 'raster' | 'group' | 'vector' | 'text' | 'fill' | 'adjustment';

/** Serialized layer data in .nks file */
export interface NksLayerData {
  readonly id: string;
  readonly name: string;
  readonly type: LayerType;
  readonly visible: boolean;
  readonly locked: boolean;
  readonly opacity: number;
  readonly blendMode: SketchBlendMode;
  readonly width: number;
  readonly height: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly clippingMask: boolean;
  readonly maskLayerId: string | null;
  readonly children: NksLayerData[];
  /** Base64-encoded pixel data for raster layers */
  readonly data?: string;
}

/** .nks document format */
export interface NksDocument {
  readonly version: string;
  readonly canvas: {
    readonly width: number;
    readonly height: number;
    readonly dpi: number;
    readonly backgroundColor: string;
  };
  readonly layers: NksLayerData[];
  readonly brushPresets: BrushPreset[];
  readonly palette: string[];
  readonly viewport: {
    readonly panX: number;
    readonly panY: number;
    readonly zoom: number;
  };
}

/** Brush preset stored in .nks */
export interface BrushPreset {
  readonly name: string;
  readonly type: string;
  readonly size: number;
  readonly opacity: number;
  readonly hardness: number;
  readonly spacing: number;
}

/** Layer outline data for tree view */
export interface LayerOutlineData {
  readonly name: string;
  readonly layers: LayerOutlineEntry[];
}

export interface LayerOutlineEntry {
  readonly id: string;
  readonly name: string;
  readonly type: LayerType;
  readonly visible: boolean;
  readonly locked: boolean;
  readonly children: LayerOutlineEntry[];
}

/** Status bar info */
export interface SketchStatusInfo {
  readonly layerCount: number;
  readonly canvasSize: string;
  readonly zoom: number;
  readonly activeTool: string;
  readonly brushSize: number;
}

/** Export format options */
export type ExportFormat = 'png' | 'jpeg' | 'webp' | 'svg' | 'psd';

export interface ExportOptions {
  readonly format: ExportFormat;
  readonly quality: number;
  readonly scale: number;
  readonly selectedLayersOnly: boolean;
}
