// =============================================================================
// Sketch Document Types — .nks file format
//
// Persisted structure for 2D drawing projects. Raster pixel data is stored
// as base64-encoded strings within NksLayerData.data.
// =============================================================================

import type { SketchBlendMode } from './blendMode';

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
