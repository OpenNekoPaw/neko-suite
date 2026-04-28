/**
 * PSD import contracts.
 *
 * The parser implementation is intentionally not coupled to ag-psd types.
 * Future adapters should normalize external parser output into this contract,
 * then map the normalized layer tree to sketch LayerData.
 */
import type {
  PsdDocumentTreeWire,
  PsdImportIssue,
  PsdImportIssueCode,
  PsdImportIssueSeverity,
  PsdLayerNodeWire,
  SketchBlendMode,
} from '@neko/shared';
import type { CanvasConfig, LayerData } from '../types';

export type {
  PsdDocumentTreeWire,
  PsdImportIssue,
  PsdImportIssueCode,
  PsdImportIssueSeverity,
  PsdLayerNodeWire,
};

export const PSD_IMPORT_CONTRACT_VERSION = 1;

export interface PsdImportSource {
  readonly fileName: string;
  readonly bytes: ArrayBuffer;
  readonly mimeType?: string;
}

export interface PsdImportOptions {
  readonly includeHiddenLayers: boolean;
  readonly fallbackBlendMode: SketchBlendMode;
  readonly rasterizeUnsupportedLayers: boolean;
  readonly maxTextureSize?: number;
}

export const DEFAULT_PSD_IMPORT_OPTIONS: PsdImportOptions = {
  includeHiddenLayers: true,
  fallbackBlendMode: 'normal',
  rasterizeUnsupportedLayers: true,
};

export type PsdLayerKind = 'group' | 'raster';

export type PsdPixelSource =
  | { readonly kind: 'imageData'; readonly data: ImageData }
  | { readonly kind: 'bitmap'; readonly bitmap: ImageBitmap }
  | { readonly kind: 'canvas'; readonly canvas: HTMLCanvasElement | OffscreenCanvas }
  | { readonly kind: 'encoded'; readonly dataBase64: string; readonly mimeType: string };

export interface PsdLayerBase {
  readonly id?: string;
  readonly name: string;
  readonly visible: boolean;
  readonly opacity: number;
  readonly blendMode: SketchBlendMode | string;
  readonly clippingMask: boolean;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface PsdGroupLayerNode extends PsdLayerBase {
  readonly kind: 'group';
  readonly children: readonly PsdLayerNode[];
}

export interface PsdRasterLayerNode extends PsdLayerBase {
  readonly kind: 'raster';
  readonly pixels: PsdPixelSource | null;
}

export type PsdLayerNode = PsdGroupLayerNode | PsdRasterLayerNode;

export interface PsdDocumentTree {
  readonly canvas: CanvasConfig;
  readonly layers: readonly PsdLayerNode[];
}

export interface PsdLayerPixelSource {
  readonly layerId: string;
  readonly pixels: PsdPixelSource;
}

export interface PsdImportResult {
  readonly canvas: CanvasConfig;
  readonly layers: readonly LayerData[];
  readonly pixelSources: readonly PsdLayerPixelSource[];
  readonly issues: readonly PsdImportIssue[];
}

export interface PsdParser {
  parse(source: PsdImportSource, options: PsdImportOptions): Promise<PsdDocumentTree>;
}

export interface PsdLayerMapper {
  map(document: PsdDocumentTree, options: PsdImportOptions): Promise<PsdImportResult>;
}

export interface PsdImportPipeline {
  importDocument(
    source: PsdImportSource,
    options?: Partial<PsdImportOptions>,
  ): Promise<PsdImportResult>;
}
