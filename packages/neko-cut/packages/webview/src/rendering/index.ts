/**
 * Rendering Module
 * 渲染层模块导出
 *
 * 使用 Canvas 2D 实现预览渲染，导出使用 Extension FFmpeg
 */

// =============================================================================
// Canvas 2D Compositor (预览渲染)
// =============================================================================

export {
  // Compositor
  Canvas2DCompositor,
  createCanvas2DCompositor,
  getDefaultCanvas2DCompositor,
  disposeDefaultCanvas2DCompositor,
  // Render Engine
  Canvas2DRenderEngine,
  createCanvas2DRenderEngine,
} from './canvas2d';

export type {
  // Types
  Canvas2DTransform,
  Canvas2DLayer,
  Canvas2DColorCorrection,
  Canvas2DCompositorOptions,
  ICanvas2DCompositor,
  BlendModeType,
  RenderMode,
  RenderQuality,
  RenderableElement,
  Canvas2DFrameResult,
  Canvas2DProgressCallback,
} from './canvas2d';

export {
  // Constants
  DEFAULT_CANVAS2D_TRANSFORM,
  DEFAULT_CANVAS2D_OPTIONS,
  BLEND_MODE_MAP,
  // Utils
  colorCorrectionToFilter,
  createCanvas2DLayer,
} from './canvas2d';

// =============================================================================
// Media Frame Provider (帧数据获取)
// =============================================================================

export {
  WebviewMediaFrameProvider,
  createWebviewMediaFrameProvider,
  getWebviewMediaFrameProvider,
  disposeWebviewMediaFrameProvider,
  BasicModeUnsupportedReason,
  type BasicModeError,
  type WebviewMediaFrameProviderConfig,
  type IMediaFrameProvider,
  type MediaFrameProviderConfig,
} from './unified';

// =============================================================================
// Timeline Frame Cache (Phase 4: 统一帧缓存)
// =============================================================================

export {
  TimelineFrameCache,
  getTimelineFrameCache,
  resetTimelineFrameCache,
  generateConfigHash,
  DEFAULT_CACHE_CONFIG,
} from './TimelineFrameCache';

export type {
  TimelineFrameCacheConfig,
  CachedFrameEntry,
  CompositeCacheEntry,
  CacheStats,
} from './TimelineFrameCache';

// =============================================================================
// Memory Manager (Phase 4: 内存压力管理)
// =============================================================================

export {
  MemoryManager,
  getMemoryManager,
  resetMemoryManager,
  TimelineFrameCacheMemoryAdapter,
  DEFAULT_MEMORY_CONFIG,
} from './MemoryManager';

export type {
  MemoryPressureLevel,
  MemoryStatus,
  MemoryManagerConfig,
  IMemoryObservable,
  MemoryPressureListener,
} from './MemoryManager';
