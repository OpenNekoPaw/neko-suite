/**
 * GPU Compositor Module
 * GPU 合成器模块
 *
 * 提供 WebGPU 和 WebGL 两种 GPU 加速渲染后端
 */

// Core interfaces and types
export type {
  ICompositor,
  CompositorBackend,
  CompositorOptions,
  TextureSource,
  RawTextureSource,
  ITexture,
  ITransform,
  ILayer,
  CreateLayerParams,
} from './ICompositor';

export { DEFAULT_TRANSFORM, DEFAULT_COMPOSITOR_OPTIONS, createLayer } from './ICompositor';

// Types
export type {
  BlendModeType,
  VignetteParams,
  ColorWheelsParams,
  ColorWheelValue,
  ColorCorrectionParams,
  GPUTransitionType,
  TransitionRenderParams,
} from './types';

export {
  DEFAULT_VIGNETTE_PARAMS,
  DEFAULT_COLOR_WHEEL_VALUE,
  DEFAULT_COLOR_WHEELS_PARAMS,
  GPU_TRANSITION_TYPE_MAP,
} from './types';

// Compositor Factory
export type { CompositorFactoryOptions } from './CompositorFactory';

export {
  isWebGPUSupported,
  isWebGL2Supported,
  getAvailableBackends,
  createCompositor,
  getDefaultCompositor,
  disposeDefaultCompositor,
} from './CompositorFactory';

// Compositor Backends (lazy loaded by factory, but exported for direct use if needed)
export { WebGPUCompositor, createWebGPUCompositor } from './webgpu/WebGPUCompositor';
export { WebGLCompositor, createWebGLCompositor } from './webgl/WebGLCompositor';

// GPU Render Engine
export type {
  RenderMode,
  RenderQuality,
  GPURenderContext,
  GPURenderableElement,
  GPUFrameResult,
  GPUProgressCallback,
  GPURenderEngineOptions,
  IExportRenderEngine,
  FrameProviderMode,
  FrameProviderOptions,
  FramePerformanceStats,
  GPUStats,
} from './GPURenderEngine';

export {
  GPURenderEngine,
  createGPURenderEngine,
  GPURenderEngineExportAdapter,
  createExportAdapter,
} from './GPURenderEngine';

// Render Engine Factory
export type {
  RenderEngineBackend,
  RenderEngineType,
  IRenderEngine,
  RenderEngineFactoryOptions,
  RenderEngineOptions,
  CreateRenderEngineResult,
} from './RenderEngineFactory';

export {
  isGPURenderingAvailable,
  getBestAvailableEngine,
  createRenderEngine,
  createGPURenderEngine as createGPURenderEngineFactory,
  createCanvas2DRenderEngine,
  getDefaultRenderEngine,
  disposeDefaultRenderEngine,
} from './RenderEngineFactory';

