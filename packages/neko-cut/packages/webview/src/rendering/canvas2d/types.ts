/**
 * Canvas 2D Compositor Types
 * Canvas 2D 合成器类型定义
 *
 * 替代 @uniedit/media-engine 的 ICompositor 接口
 * 使用 Canvas 2D API 实现多图层合成
 */

import type { MaskInstance } from '../../types';

// =============================================================================
// Transform Types
// =============================================================================

/**
 * Canvas 2D Transform
 * 变换参数（与原 ITransform 保持一致）
 */
export interface Canvas2DTransform {
  /** X position (0-1 normalized) */
  x: number;
  /** Y position (0-1 normalized) */
  y: number;
  /** X scale */
  scaleX: number;
  /** Y scale */
  scaleY: number;
  /** Rotation angle in degrees */
  rotation: number;
  /** Anchor X (0-1) */
  anchorX: number;
  /** Anchor Y (0-1) */
  anchorY: number;
}

/**
 * Default transform values
 */
export const DEFAULT_CANVAS2D_TRANSFORM: Canvas2DTransform = {
  x: 0.5,
  y: 0.5,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  anchorX: 0.5,
  anchorY: 0.5,
};

// =============================================================================
// Blend Mode Types
// =============================================================================

/**
 * Blend mode type names (compatible with existing BlendModeType)
 */
export type BlendModeType =
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
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity';

/**
 * Map blend mode types to Canvas globalCompositeOperation
 */
export const BLEND_MODE_MAP: Record<BlendModeType, GlobalCompositeOperation> = {
  'normal': 'source-over',
  'multiply': 'multiply',
  'screen': 'screen',
  'overlay': 'overlay',
  'darken': 'darken',
  'lighten': 'lighten',
  'color-dodge': 'color-dodge',
  'color-burn': 'color-burn',
  'hard-light': 'hard-light',
  'soft-light': 'soft-light',
  'difference': 'difference',
  'exclusion': 'exclusion',
  'hue': 'hue',
  'saturation': 'saturation',
  'color': 'color',
  'luminosity': 'luminosity',
};

// =============================================================================
// Color Correction Types
// =============================================================================

/**
 * Color correction parameters
 * Using CSS filter for performance
 */
export interface Canvas2DColorCorrection {
  /** Brightness adjustment (-1 to 1) */
  brightness?: number;
  /** Contrast adjustment (-1 to 1) */
  contrast?: number;
  /** Saturation adjustment (-1 to 1) */
  saturation?: number;
  /** Hue rotation (degrees) */
  hueRotate?: number;
  /** Invert (0 to 1) */
  invert?: number;
  /** Sepia (0 to 1) */
  sepia?: number;
  /** Grayscale (0 to 1) */
  grayscale?: number;
  /** Blur (pixels) */
  blur?: number;
}

/**
 * Convert color correction params to CSS filter string
 */
export function colorCorrectionToFilter(cc: Canvas2DColorCorrection): string {
  const filters: string[] = [];

  if (cc.brightness !== undefined && cc.brightness !== 0) {
    // brightness: 0 = 100%, -1 = 0%, 1 = 200%
    filters.push(`brightness(${1 + cc.brightness})`);
  }

  if (cc.contrast !== undefined && cc.contrast !== 0) {
    // contrast: 0 = 100%, -1 = 0%, 1 = 200%
    filters.push(`contrast(${1 + cc.contrast})`);
  }

  if (cc.saturation !== undefined && cc.saturation !== 0) {
    // saturation: 0 = 100%, -1 = 0%, 1 = 200%
    filters.push(`saturate(${1 + cc.saturation})`);
  }

  if (cc.hueRotate !== undefined && cc.hueRotate !== 0) {
    filters.push(`hue-rotate(${cc.hueRotate}deg)`);
  }

  if (cc.invert !== undefined && cc.invert > 0) {
    filters.push(`invert(${cc.invert})`);
  }

  if (cc.sepia !== undefined && cc.sepia > 0) {
    filters.push(`sepia(${cc.sepia})`);
  }

  if (cc.grayscale !== undefined && cc.grayscale > 0) {
    filters.push(`grayscale(${cc.grayscale})`);
  }

  if (cc.blur !== undefined && cc.blur > 0) {
    filters.push(`blur(${cc.blur}px)`);
  }

  return filters.length > 0 ? filters.join(' ') : 'none';
}

// =============================================================================
// Layer Types
// =============================================================================

/**
 * Canvas 2D Layer
 * 图层参数
 */
export interface Canvas2DLayer {
  /** Image source */
  source: CanvasImageSource;
  /** Transform */
  transform: Canvas2DTransform;
  /** Opacity (0-1) */
  opacity: number;
  /** Blend mode */
  blendMode: BlendModeType;
  /** Color correction (optional) */
  colorCorrection?: Canvas2DColorCorrection;
  /** Mask instances (optional) */
  masks?: MaskInstance[];
  /** Source width (for proper scaling, optional - will use source.width if not provided) */
  sourceWidth?: number;
  /** Source height (for proper scaling, optional - will use source.height if not provided) */
  sourceHeight?: number;
}

/**
 * Create a layer with default values
 */
export function createCanvas2DLayer(
  source: CanvasImageSource,
  overrides?: Partial<Canvas2DLayer>
): Canvas2DLayer {
  return {
    source,
    transform: { ...DEFAULT_CANVAS2D_TRANSFORM, ...overrides?.transform },
    opacity: overrides?.opacity ?? 1,
    blendMode: overrides?.blendMode ?? 'normal',
    colorCorrection: overrides?.colorCorrection,
    masks: overrides?.masks,
    sourceWidth: overrides?.sourceWidth,
    sourceHeight: overrides?.sourceHeight,
  };
}

// =============================================================================
// Compositor Options
// =============================================================================

/**
 * Canvas 2D Compositor options
 */
export interface Canvas2DCompositorOptions {
  /** Enable alpha channel */
  alpha?: boolean;
  /** Image smoothing (anti-aliasing) */
  imageSmoothingEnabled?: boolean;
  /** Image smoothing quality */
  imageSmoothingQuality?: ImageSmoothingQuality;
  /** Will read frequently (for getImageData performance) */
  willReadFrequently?: boolean;
  /** Background color (null for transparent) */
  backgroundColor?: string | null;
}

/**
 * Default compositor options
 */
export const DEFAULT_CANVAS2D_OPTIONS: Required<Canvas2DCompositorOptions> = {
  alpha: true,
  imageSmoothingEnabled: true,
  imageSmoothingQuality: 'high',
  willReadFrequently: false,
  backgroundColor: null,
};

// =============================================================================
// Compositor Interface
// =============================================================================

/**
 * Canvas 2D Compositor Interface
 */
export interface ICanvas2DCompositor {
  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Initialize the compositor with a canvas
   */
  initialize(
    canvas: HTMLCanvasElement | OffscreenCanvas,
    options?: Canvas2DCompositorOptions
  ): Promise<boolean>;

  /**
   * Dispose resources
   */
  dispose(): void;

  /**
   * Resize the compositor
   */
  resize(width: number, height: number): void;

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  /** Whether the compositor is initialized */
  readonly isInitialized: boolean;

  /** Canvas width */
  readonly width: number;

  /** Canvas height */
  readonly height: number;

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  /**
   * Begin a new frame (clear canvas)
   */
  beginFrame(): void;

  /**
   * Draw a single layer
   */
  drawLayer(layer: Canvas2DLayer): void;

  /**
   * Draw multiple layers
   */
  drawLayers(layers: Canvas2DLayer[]): void;

  /**
   * End the frame
   */
  endFrame(): void;

  // -------------------------------------------------------------------------
  // Export
  // -------------------------------------------------------------------------

  /**
   * Export to ImageData
   */
  toImageData(): ImageData;

  /**
   * Export to Blob
   */
  toBlob(type?: string, quality?: number): Promise<Blob>;

  /**
   * Export to ImageBitmap
   */
  toImageBitmap(): Promise<ImageBitmap>;
}

// =============================================================================
// Render Engine Types
// =============================================================================

/**
 * Render mode
 */
export type RenderMode = 'preview' | 'export';

/**
 * Render quality
 */
export type RenderQuality = 'preview' | 'final';

/**
 * Renderable element
 */
export interface RenderableElement {
  /** Element ID */
  id: string;
  /** Image source */
  source: CanvasImageSource;
  /** Transform */
  transform: Canvas2DTransform;
  /** Opacity */
  opacity: number;
  /** Blend mode */
  blendMode: BlendModeType;
  /** Color correction */
  colorCorrection?: Canvas2DColorCorrection;
  /** Masks */
  masks?: MaskInstance[];
  /** Z-index for ordering */
  zIndex: number;
  /** Source width */
  sourceWidth?: number;
  /** Source height */
  sourceHeight?: number;
}

/**
 * Frame result
 */
export interface Canvas2DFrameResult {
  /** Frame index */
  frameIndex: number;
  /** Total frames */
  totalFrames: number;
  /** Render time in milliseconds */
  renderTime: number;
  /** ImageData (for preview) */
  imageData?: ImageData;
  /** ImageBitmap (for further processing) */
  imageBitmap?: ImageBitmap;
}

/**
 * Progress callback
 */
export type Canvas2DProgressCallback = (
  frameIndex: number,
  totalFrames: number,
  percent: number
) => void;
