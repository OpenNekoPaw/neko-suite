/**
 * Compositor Types - GPU 渲染层类型定义
 * Type definitions for GPU compositor
 */

import type {
  VignetteParams as SharedVignetteParams,
  ColorWheelsParams as SharedColorWheelsParams,
  ColorWheelValue as SharedColorWheelValue,
  BlendModeType as SharedBlendModeType,
} from '@neko/shared';

import {
  DEFAULT_VIGNETTE_PARAMS as SHARED_DEFAULT_VIGNETTE_PARAMS,
  DEFAULT_COLOR_WHEEL_VALUE as SHARED_DEFAULT_COLOR_WHEEL_VALUE,
} from '@neko/shared';

// Re-export BlendModeType from shared (Single Source of Truth)
export type BlendModeType = SharedBlendModeType;

/**
 * Rendering-layer VignetteParams (omits 'enabled' flag from shared)
 * 渲染层暗角参数（省略 shared 中的 'enabled' 标志）
 */
export type VignetteParams = Omit<SharedVignetteParams, 'enabled'>;

/**
 * Rendering-layer ColorWheelsParams (omits 'global' from shared)
 * 渲染层色轮参数（省略 shared 中的 'global'）
 */
export type ColorWheelsParams = Omit<SharedColorWheelsParams, 'global'>;

/**
 * Re-export ColorWheelValue from shared (identical definition)
 */
export type ColorWheelValue = SharedColorWheelValue;

/**
 * Default vignette parameters (derived from shared)
 */
export const DEFAULT_VIGNETTE_PARAMS: VignetteParams = {
  amount: SHARED_DEFAULT_VIGNETTE_PARAMS.amount,
  midpoint: SHARED_DEFAULT_VIGNETTE_PARAMS.midpoint,
  roundness: SHARED_DEFAULT_VIGNETTE_PARAMS.roundness,
  feather: SHARED_DEFAULT_VIGNETTE_PARAMS.feather,
};

/**
 * Default color wheel value (from shared)
 */
export const DEFAULT_COLOR_WHEEL_VALUE: ColorWheelValue = { ...SHARED_DEFAULT_COLOR_WHEEL_VALUE };

/**
 * Default color wheels parameters
 */
export const DEFAULT_COLOR_WHEELS_PARAMS: ColorWheelsParams = {
  shadows: { ...DEFAULT_COLOR_WHEEL_VALUE },
  midtones: { ...DEFAULT_COLOR_WHEEL_VALUE },
  highlights: { ...DEFAULT_COLOR_WHEEL_VALUE },
};

// =============================================================================
// Shader Types
// =============================================================================

export type ShaderType = 'vertex' | 'fragment';

export interface ShaderSource {
  vertex: string;
  fragment: string;
}

export interface ShaderProgram {
  program: WebGLProgram;
  uniforms: Map<string, WebGLUniformLocation>;
  attributes: Map<string, number>;
}

// =============================================================================
// Texture Types
// =============================================================================

export interface TextureOptions {
  minFilter?: number;
  magFilter?: number;
  wrapS?: number;
  wrapT?: number;
  format?: number;
  type?: number;
  flipY?: boolean;
}

export interface TextureInfo {
  texture: WebGLTexture;
  width: number;
  height: number;
  source?: TexImageSource;
}

export type TexImageSource =
  | HTMLImageElement
  | HTMLVideoElement
  | HTMLCanvasElement
  | ImageBitmap
  | ImageData;

// =============================================================================
// Framebuffer Types
// =============================================================================

export interface FramebufferInfo {
  framebuffer: WebGLFramebuffer;
  texture: TextureInfo;
}

// =============================================================================
// Render Pass Types
// =============================================================================

/**
 * Rendering-layer color correction parameters
 * 渲染层颜色校正参数（简化版，用于 GPU 渲染）
 *
 * Note: This is a subset of shared ColorCorrection, optimized for GPU rendering.
 * Does not include 'clarity' and 'dehaze' which require multi-pass processing.
 */
export interface ColorCorrectionParams {
  // Basic adjustments
  exposure: number;      // -5 to 5
  contrast: number;      // -100 to 100
  highlights: number;    // -100 to 100
  shadows: number;       // -100 to 100
  whites: number;        // -100 to 100
  blacks: number;        // -100 to 100
  temperature: number;   // -100 to 100
  tint: number;          // -100 to 100
  saturation: number;    // -100 to 100
  vibrance: number;      // -100 to 100

  // Vignette (optional)
  vignette?: VignetteParams;

  // Color wheels (optional)
  colorWheels?: ColorWheelsParams;
}

export interface EffectParams {
  type: string;
  enabled: boolean;
  parameters: Record<string, number | string | boolean>;
}

export interface RenderLayerParams {
  texture: TextureInfo;
  transform: {
    x: number;         // 0-1 normalized position
    y: number;
    scaleX: number;
    scaleY: number;
    rotation: number;  // degrees
    anchorX: number;   // 0-1
    anchorY: number;
  };
  opacity: number;     // 0-1
  blendMode: BlendModeType;
  colorCorrection?: ColorCorrectionParams;
  effects?: EffectParams[];
  masks?: MaskParams[];
}

export interface MaskParams {
  type: 'rectangle' | 'ellipse' | 'polygon' | 'bezier';
  inverted: boolean;
  feather: number;
  expansion: number;
  opacity: number;
  // Shape-specific data
  data: {
    centerX?: number;
    centerY?: number;
    width?: number;
    height?: number;
    rotation?: number;
    cornerRadius?: number;
    points?: Array<{ x: number; y: number }>;
  };
}

// =============================================================================
// Transition Types
// =============================================================================

/**
 * GPU transition type mapping
 * 转场类型到 GPU 着色器整数的映射
 */
export type GPUTransitionType =
  | 'none'           // 0
  | 'fade'           // 1
  | 'dissolve'       // 2
  | 'slide-left'     // 3
  | 'slide-right'    // 4
  | 'slide-up'       // 5
  | 'slide-down'     // 6
  | 'zoom-in'        // 7
  | 'zoom-out'       // 8
  | 'cross-zoom'     // 9
  | 'wipe-left'      // 10
  | 'wipe-right'     // 11
  | 'wipe-up'        // 12
  | 'wipe-down'      // 13
  | 'iris-in'        // 14
  | 'iris-out'       // 15
  | 'clock-wipe'     // 16
  | 'clock-wipe-ccw' // 17
  | 'blinds-horizontal' // 18
  | 'blinds-vertical'   // 19
  | 'dip-to-black'   // 20
  | 'dip-to-white'   // 21
  | 'dip-to-color'   // 22
  | 'radial-wipe';   // 23

/**
 * Transition render parameters
 * 转场渲染参数
 */
export interface TransitionRenderParams {
  /** Transition type */
  type: GPUTransitionType;
  /** Transition progress (0-1) */
  progress: number;
  /** Edge softness for wipe transitions (0-1) */
  softness?: number;
  /** Number of blinds for blinds transitions */
  blindsCount?: number;
  /** Start angle for clock wipe (degrees) */
  startAngle?: number;
  /** Color for dip-to-color (hex or rgb) */
  dipColor?: [number, number, number];
}

/**
 * Mapping from transition type string to shader int
 */
export const GPU_TRANSITION_TYPE_MAP: Record<GPUTransitionType, number> = {
  'none': 0,
  'fade': 1,
  'dissolve': 2,
  'slide-left': 3,
  'slide-right': 4,
  'slide-up': 5,
  'slide-down': 6,
  'zoom-in': 7,
  'zoom-out': 8,
  'cross-zoom': 9,
  'wipe-left': 10,
  'wipe-right': 11,
  'wipe-up': 12,
  'wipe-down': 13,
  'iris-in': 14,
  'iris-out': 15,
  'clock-wipe': 16,
  'clock-wipe-ccw': 17,
  'blinds-horizontal': 18,
  'blinds-vertical': 19,
  'dip-to-black': 20,
  'dip-to-white': 21,
  'dip-to-color': 22,
  'radial-wipe': 23,
};

// =============================================================================
// Render Pipeline Types
// =============================================================================

export interface RenderTarget {
  width: number;
  height: number;
  framebuffer: FramebufferInfo | null; // null = render to canvas
}

export interface RenderContext {
  gl: WebGL2RenderingContext;
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  pixelRatio: number;
}

// =============================================================================
// WebGL Manager Interface
// =============================================================================

export interface IWebGLManager {
  // Lifecycle
  initialize(canvas: HTMLCanvasElement): boolean;
  dispose(): void;
  resize(width: number, height: number): void;

  // Texture management
  createTexture(source: TexImageSource, options?: TextureOptions): TextureInfo | null;
  updateTexture(texture: TextureInfo, source: TexImageSource): void;
  deleteTexture(texture: TextureInfo): void;

  // Framebuffer management
  createFramebuffer(width: number, height: number): FramebufferInfo | null;
  deleteFramebuffer(fb: FramebufferInfo): void;

  // Rendering
  clear(r?: number, g?: number, b?: number, a?: number): void;
  renderLayer(params: RenderLayerParams, target?: RenderTarget): void;
  renderComposite(layers: RenderLayerParams[], target?: RenderTarget): void;

  // Shader programs
  getProgram(name: string): ShaderProgram | null;

  // State
  readonly isInitialized: boolean;
  readonly context: RenderContext | null;
}
