/**
 * ICompositor - 抽象合成器接口
 * Abstract Compositor Interface for WebGPU/WebGL backends
 *
 * 提供统一的合成器接口，支持 WebGPU 和 WebGL 两种后端实现
 */

import type { MaskInstance } from '@neko/shared';
import type { BlendModeType, ColorCorrectionParams, GPUTransitionType, TransitionRenderParams } from './types';

// =============================================================================
// Backend Types
// =============================================================================

/**
 * 合成器后端类型
 */
export type CompositorBackend = 'webgpu' | 'webgl';

// =============================================================================
// Texture Types
// =============================================================================

/**
 * 原始像素数据纹理源
 * Raw pixel data texture source for zero-copy transfer from Extension
 */
export interface RawTextureSource {
  /** 像素数据 (RGBA format) */
  data: ArrayBuffer | Uint8Array;
  /** 宽度 */
  width: number;
  /** 高度 */
  height: number;
  /** 像素格式 (默认 'rgba8') */
  format?: 'rgba8' | 'bgra8';
}

/**
 * 纹理来源类型
 */
export type TextureSource =
  | HTMLImageElement
  | HTMLVideoElement
  | HTMLCanvasElement
  | OffscreenCanvas
  | ImageBitmap
  | ImageData
  | VideoFrame
  | RawTextureSource;

/**
 * 抽象纹理接口
 */
export interface ITexture {
  /** 纹理宽度 */
  readonly width: number;
  /** 纹理高度 */
  readonly height: number;
  /** 原生纹理对象 (GPUTexture | WebGLTexture) */
  readonly native: unknown;
  /** 纹理 ID (用于缓存管理) */
  readonly id: string;
}

// =============================================================================
// Transform Types
// =============================================================================

/**
 * 变换参数
 */
export interface ITransform {
  /** X 位置 (0-1 标准化) */
  x: number;
  /** Y 位置 (0-1 标准化) */
  y: number;
  /** X 缩放 */
  scaleX: number;
  /** Y 缩放 */
  scaleY: number;
  /** 旋转角度 (度) */
  rotation: number;
  /** 锚点 X (0-1) */
  anchorX: number;
  /** 锚点 Y (0-1) */
  anchorY: number;
}

/**
 * 默认变换参数
 */
export const DEFAULT_TRANSFORM: ITransform = {
  x: 0.5,
  y: 0.5,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  anchorX: 0.5,
  anchorY: 0.5,
};

// =============================================================================
// Layer Types
// =============================================================================

/**
 * 图层参数
 */
export interface ILayer {
  /** 纹理 */
  texture: ITexture;
  /** 变换 */
  transform: ITransform;
  /** 不透明度 (0-1) */
  opacity: number;
  /** 混合模式 */
  blendMode: BlendModeType;
  /** 颜色校正参数 (可选) */
  colorCorrection?: ColorCorrectionParams;
  /** 蒙版列表 (可选) */
  masks?: MaskInstance[];
}

// =============================================================================
// Compositor Options
// =============================================================================

/**
 * 合成器初始化选项
 */
export interface CompositorOptions {
  /** 是否使用抗锯齿 */
  antialias?: boolean;
  /** 是否使用 alpha 通道 */
  alpha?: boolean;
  /** 是否保留绘图缓冲区 */
  preserveDrawingBuffer?: boolean;
  /** 电源偏好 */
  powerPreference?: 'default' | 'high-performance' | 'low-power';
}

/**
 * 默认合成器选项
 */
export const DEFAULT_COMPOSITOR_OPTIONS: Required<CompositorOptions> = {
  antialias: false,
  alpha: true,
  preserveDrawingBuffer: false,
  powerPreference: 'high-performance',
};

// =============================================================================
// ICompositor Interface
// =============================================================================

/**
 * 抽象合成器接口
 *
 * 提供统一的渲染接口，由 WebGPU 和 WebGL 后端分别实现
 */
export interface ICompositor {
  // ---------------------------------------------------------------------------
  // 生命周期
  // ---------------------------------------------------------------------------

  /**
   * 初始化合成器
   * @param canvas 目标画布
   * @param options 初始化选项
   * @returns 是否初始化成功
   */
  initialize(
    canvas: HTMLCanvasElement | OffscreenCanvas,
    options?: CompositorOptions
  ): Promise<boolean>;

  /**
   * 释放资源
   */
  dispose(): void;

  /**
   * 调整渲染尺寸
   * @param width 宽度
   * @param height 高度
   */
  resize(width: number, height: number): void;

  // ---------------------------------------------------------------------------
  // 状态
  // ---------------------------------------------------------------------------

  /**
   * 当前使用的后端
   */
  readonly backend: CompositorBackend;

  /**
   * 是否已初始化
   */
  readonly isInitialized: boolean;

  /**
   * 画布宽度
   */
  readonly width: number;

  /**
   * 画布高度
   */
  readonly height: number;

  /**
   * 获取原生渲染上下文（用于高级操作如异步像素读取）
   * WebGL 后端返回 WebGL2RenderingContext，WebGPU 后端返回 null
   */
  readonly nativeContext: WebGL2RenderingContext | null;

  /**
   * 获取 WebGPU 设备（用于高级操作如异步像素读取）
   * WebGPU 后端返回 GPUDevice，WebGL 后端返回 null
   */
  readonly gpuDevice: GPUDevice | null;

  /**
   * 获取画布实例
   */
  readonly canvas: HTMLCanvasElement | OffscreenCanvas | null;

  // ---------------------------------------------------------------------------
  // 纹理管理
  // ---------------------------------------------------------------------------

  /**
   * 创建纹理
   * @param source 纹理来源
   * @returns 纹理对象，失败返回 null
   */
  createTexture(source: TextureSource): ITexture | null;

  /**
   * 更新纹理内容
   * @param texture 要更新的纹理
   * @param source 新的纹理来源
   */
  updateTexture(texture: ITexture, source: TextureSource): void;

  /**
   * 删除纹理
   * @param texture 要删除的纹理
   */
  deleteTexture(texture: ITexture): void;

  // ---------------------------------------------------------------------------
  // 池化纹理管理 (Frame Texture Pooling)
  // ---------------------------------------------------------------------------

  /**
   * 从池中获取或创建纹理，并可选更新内容
   * Acquire a texture from the pool (or create if needed), optionally updating its content.
   *
   * 用于视频帧纹理的池化复用，避免每帧重新分配 GPU 纹理。
   * Used for video frame texture pooling to avoid per-frame GPU allocation.
   *
   * @param width 纹理宽度
   * @param height 纹理高度
   * @param source 纹理源（可选，提供时直接更新内容）
   * @returns 池化纹理，失败返回 null
   */
  acquirePooledFrameTexture(
    width: number,
    height: number,
    source?: TextureSource
  ): ITexture | null;

  /**
   * 释放池化纹理（标记为可复用，不销毁）
   * Release a pooled texture back to the pool (marks as reusable, does not destroy).
   *
   * @param texture 要释放的纹理
   */
  releasePooledFrameTexture(texture: ITexture): void;

  // ---------------------------------------------------------------------------
  // 渲染
  // ---------------------------------------------------------------------------

  /**
   * 开始帧渲染
   * 清空画布并准备渲染
   */
  beginFrame(): void;

  /**
   * 绘制图层
   * @param layer 图层参数
   */
  drawLayer(layer: ILayer): void;

  /**
   * 绘制多个图层 (合成)
   * @param layers 图层列表 (按 z-order 排序)
   */
  drawLayers(layers: ILayer[]): void;

  /**
   * 使用外部纹理绘制图层（零拷贝 VideoFrame）
   * Draw layer using external texture (zero-copy VideoFrame rendering)
   *
   * Only supported by WebGPU backend via importExternalTexture.
   * WebGL backend does not support this — caller should fallback to drawLayer.
   *
   * @param layer 图层参数（不含 texture，因为使用 VideoFrame）
   * @param videoFrame VideoFrame 对象
   */
  drawLayerWithExternalTexture?(
    layer: Omit<ILayer, 'texture'>,
    videoFrame: VideoFrame
  ): void;

  /**
   * 批量使用外部纹理绘制多个图层（零拷贝 VideoFrame）
   * Batch draw multiple layers using external textures (zero-copy VideoFrame rendering)
   *
   * This is more efficient than calling drawLayerWithExternalTexture multiple times
   * because it uses a single command encoder and submit for all layers.
   *
   * Only supported by WebGPU backend via importExternalTexture.
   *
   * @param layers 图层和 VideoFrame 的数组
   */
  drawLayersWithExternalTextures?(
    layers: Array<{ layer: Omit<ILayer, 'texture'>; videoFrame: VideoFrame }>
  ): void;

  /**
   * 结束帧渲染
   * 提交渲染命令
   */
  endFrame(): void;

  // ---------------------------------------------------------------------------
  // 导出
  // ---------------------------------------------------------------------------

  /**
   * 导出为 VideoFrame
   * @param timestamp 时间戳 (微秒)
   * @returns VideoFrame 对象
   */
  toVideoFrame(timestamp: number): VideoFrame;

  /**
   * 导出为 ImageData
   * @returns ImageData 对象
   */
  toImageData(): ImageData;

  /**
   * 异步导出为 ImageData (WebGPU 需要异步操作)
   * @returns ImageData 对象
   */
  toImageDataAsync(): Promise<ImageData>;

  /**
   * 导出为 Blob
   * @param type MIME 类型 (默认 'image/png')
   * @param quality 质量 (0-1, 仅对 image/jpeg 有效)
   * @returns Blob 对象
   */
  toBlob(type?: string, quality?: number): Promise<Blob>;

  // ---------------------------------------------------------------------------
  // 转场渲染
  // ---------------------------------------------------------------------------

  /**
   * 渲染转场效果
   * @param fromTexture 源纹理 (outgoing clip)
   * @param toTexture 目标纹理 (incoming clip)
   * @param params 转场参数
   * @param toScreen 是否直接渲染到屏幕 (默认 true)
   * @returns 如果不渲染到屏幕，返回结果纹理
   */
  renderTransition(
    fromTexture: ITexture,
    toTexture: ITexture,
    params: TransitionRenderParams,
    toScreen?: boolean
  ): ITexture | null;

  /**
   * 检查转场类型是否支持 GPU 加速
   * @param type 转场类型
   */
  isTransitionSupported(type: string): boolean;

  /**
   * 获取所有支持 GPU 加速的转场类型
   */
  getSupportedTransitions(): GPUTransitionType[];
}

// =============================================================================
// Utility Types
// =============================================================================

/**
 * 创建图层参数的便捷函数参数
 */
export interface CreateLayerParams {
  texture: ITexture;
  transform?: Partial<ITransform>;
  opacity?: number;
  blendMode?: BlendModeType;
  colorCorrection?: ColorCorrectionParams;
  masks?: MaskInstance[];
}

/**
 * 创建图层对象
 */
export function createLayer(params: CreateLayerParams): ILayer {
  return {
    texture: params.texture,
    transform: {
      ...DEFAULT_TRANSFORM,
      ...params.transform,
    },
    opacity: params.opacity ?? 1,
    blendMode: params.blendMode ?? 'normal',
    colorCorrection: params.colorCorrection,
    masks: params.masks,
  };
}
