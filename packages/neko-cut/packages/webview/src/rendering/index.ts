/**
 * Rendering Module
 * 渲染层模块导出
 *
 * 预览使用 neko-engine H.264 流，导出使用 Extension FFmpeg
 */

// =============================================================================
// Media Frame Provider (帧数据获取)
// =============================================================================

export {
  CompatibleMediaFrameProvider,
  createCompatibleMediaFrameProvider,
  type CompatibleMediaFrameProviderConfig,
  type FrameTransportMode,
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
