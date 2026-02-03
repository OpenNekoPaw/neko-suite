/**
 * TimelineFrameCache - 统一帧缓存管理器
 *
 * Phase 4: Webview 端统一帧缓存
 *
 * 职责：
 * - 管理单轨原始帧缓存 (RawFrameCache)
 * - 统一内存管理和时间窗口驱动的淘汰策略
 *
 * 设计原则：
 * - 单一职责 (S)：只负责帧缓存管理
 * - 开闭原则 (O)：通过配置支持扩展
 * - 依赖倒置 (D)：依赖抽象接口
 */

// =============================================================================
// Types
// =============================================================================

/**
 * 缓存帧条目
 */
export interface CachedFrameEntry {
  /** 帧数据 (VideoFrame) */
  frame: VideoFrame;
  /** 时间点（秒） */
  time: number;
  /** 最后访问时间戳 */
  lastAccess: number;
  /** 估算内存大小（字节） */
  sizeBytes: number;
}

/**
 * 合成帧缓存条目 (保留类型定义以兼容)
 */
export interface CompositeCacheEntry {
  /** 纹理数据 */
  texture: unknown;
  /** 时间点（秒） */
  time: number;
  /** 轨道配置 hash */
  configHash: string;
  /** 最后访问时间戳 */
  lastAccess: number;
  /** 估算内存大小（字节） */
  sizeBytes: number;
}

/**
 * 轨道帧缓存
 */
interface TrackFrameCache {
  /** 轨道 ID */
  trackId: string;
  /** 帧缓存 Map: quantizedTime -> CachedFrameEntry */
  frames: Map<number, CachedFrameEntry>;
  /** FPS (用于时间量化) */
  fps: number;
  /** 当前缓存大小（字节） */
  totalSizeBytes: number;
}

/**
 * 缓存配置
 */
export interface TimelineFrameCacheConfig {
  /** 原始帧缓存最大内存（字节），默认 1.5GB */
  maxRawFrameMemory: number;
  /** 每轨道最大帧数，默认 180 */
  maxFramesPerTrack: number;
  /** 时间窗口大小（秒），默认 3 */
  timeWindow: number;
  /** 时间窗口乘数，默认 2 (缓存 = 窗口 × 乘数) */
  windowMultiplier: number;
  /** 帧时间容差（秒），默认 1/60 */
  frameTolerance: number;
}

/**
 * 默认缓存配置
 */
export const DEFAULT_CACHE_CONFIG: TimelineFrameCacheConfig = {
  maxRawFrameMemory: 1.5 * 1024 * 1024 * 1024, // 1.5GB
  maxFramesPerTrack: 180, // 6s @ 30fps
  timeWindow: 3, // 3s
  windowMultiplier: 2, // 缓存 6s
  frameTolerance: 1 / 60, // ~16ms
};

/**
 * 缓存统计信息
 */
export interface CacheStats {
  /** 原始帧缓存 */
  rawFrames: {
    trackCount: number;
    totalFrames: number;
    totalSizeBytes: number;
    hitCount: number;
    missCount: number;
    hitRate: number;
  };
  /** 合成帧缓存 (保留以兼容) */
  compositeFrames: {
    frameCount: number;
    totalSizeBytes: number;
    hitCount: number;
    missCount: number;
    hitRate: number;
  };
  /** 总内存使用 */
  totalMemoryBytes: number;
}

// =============================================================================
// TimelineFrameCache
// =============================================================================

/**
 * 时间线帧缓存管理器
 *
 * 统一管理 Webview 端的帧缓存：
 * - RawFrameCache - 单轨原始帧（从 Extension 获取）
 */
export class TimelineFrameCache {
  // 配置
  private readonly config: TimelineFrameCacheConfig;

  // 原始帧缓存: trackId -> TrackFrameCache
  private rawFrameCache = new Map<string, TrackFrameCache>();

  // 全局统计
  private rawCacheHitCount = 0;
  private rawCacheMissCount = 0;

  // 总内存使用
  private totalRawMemoryBytes = 0;

  // 是否已销毁
  private disposed = false;

  constructor(config: Partial<TimelineFrameCacheConfig> = {}) {
    this.config = { ...DEFAULT_CACHE_CONFIG, ...config };
  }

  // ===========================================================================
  // Raw Frame Cache API
  // ===========================================================================

  /**
   * 获取原始帧
   * @param trackId 轨道 ID
   * @param time 时间点（秒）
   * @param fps 帧率（用于时间量化）
   * @returns VideoFrame 或 null
   */
  getRawFrame(trackId: string, time: number, fps = 30): VideoFrame | null {
    if (this.disposed) return null;

    const trackCache = this.rawFrameCache.get(trackId);
    if (!trackCache) {
      this.rawCacheMissCount++;
      return null;
    }

    // 使用轨道的 fps 进行量化
    const actualFps = trackCache.fps || fps;
    const quantizedTime = Math.round(time * actualFps) / actualFps;

    // 精确匹配
    const exactMatch = trackCache.frames.get(quantizedTime);
    if (exactMatch) {
      exactMatch.lastAccess = Date.now();
      this.rawCacheHitCount++;
      return exactMatch.frame;
    }

    // 容差匹配
    for (const [t, entry] of trackCache.frames) {
      if (Math.abs(t - time) <= this.config.frameTolerance) {
        entry.lastAccess = Date.now();
        this.rawCacheHitCount++;
        return entry.frame;
      }
    }

    this.rawCacheMissCount++;
    return null;
  }

  /**
   * 设置原始帧
   * @param trackId 轨道 ID
   * @param time 时间点（秒）
   * @param frame VideoFrame 对象
   * @param fps 帧率
   */
  setRawFrame(trackId: string, time: number, frame: VideoFrame, fps = 30): void {
    if (this.disposed) return;

    // 获取或创建轨道缓存
    let trackCache = this.rawFrameCache.get(trackId);
    if (!trackCache) {
      trackCache = {
        trackId,
        frames: new Map(),
        fps,
        totalSizeBytes: 0,
      };
      this.rawFrameCache.set(trackId, trackCache);
    }

    // 量化时间
    const quantizedTime = Math.round(time * fps) / fps;

    // 估算帧大小 (RGBA: width * height * 4)
    const frameSize = frame.displayWidth * frame.displayHeight * 4;

    // 检查是否已存在
    const existing = trackCache.frames.get(quantizedTime);
    if (existing) {
      // 替换：先释放旧帧
      existing.frame.close();
      trackCache.totalSizeBytes -= existing.sizeBytes;
      this.totalRawMemoryBytes -= existing.sizeBytes;
    }

    // 内存限制检查：按轨道帧数限制
    while (trackCache.frames.size >= this.config.maxFramesPerTrack) {
      this.evictOldestRawFrame(trackCache);
    }

    // 全局内存限制检查
    while (this.totalRawMemoryBytes + frameSize > this.config.maxRawFrameMemory) {
      this.evictOldestRawFrameGlobal();
    }

    // 添加新帧
    trackCache.frames.set(quantizedTime, {
      frame,
      time: quantizedTime,
      lastAccess: Date.now(),
      sizeBytes: frameSize,
    });
    trackCache.totalSizeBytes += frameSize;
    this.totalRawMemoryBytes += frameSize;
  }

  /**
   * 检查原始帧是否存在
   */
  hasRawFrame(trackId: string, time: number, fps = 30): boolean {
    const trackCache = this.rawFrameCache.get(trackId);
    if (!trackCache) return false;

    const quantizedTime = Math.round(time * fps) / fps;
    if (trackCache.frames.has(quantizedTime)) return true;

    // 容差匹配
    for (const t of trackCache.frames.keys()) {
      if (Math.abs(t - time) <= this.config.frameTolerance) {
        return true;
      }
    }
    return false;
  }

  /**
   * 获取轨道的缓冲时长（playhead 之后）
   * @param trackId 轨道 ID
   * @param playhead 当前播放位置（秒）
   * @returns 缓冲时长（秒）
   */
  getBufferedDuration(trackId: string, playhead: number): number {
    const trackCache = this.rawFrameCache.get(trackId);
    if (!trackCache || trackCache.frames.size === 0) return 0;

    let maxTime = playhead;
    for (const time of trackCache.frames.keys()) {
      if (time > playhead && time > maxTime) {
        maxTime = time;
      }
    }
    return maxTime - playhead;
  }

  /**
   * 驱逐 playhead 之前的帧
   * @param trackId 轨道 ID
   * @param playhead 当前播放位置（秒）
   * @param keepBefore 保留 playhead 之前的时长（秒），默认 1s
   */
  evictFramesBefore(trackId: string, playhead: number, keepBefore = 1): void {
    const trackCache = this.rawFrameCache.get(trackId);
    if (!trackCache) return;

    const evictBefore = playhead - keepBefore;
    const keysToRemove: number[] = [];

    for (const [time, entry] of trackCache.frames) {
      if (time < evictBefore) {
        keysToRemove.push(time);
        entry.frame.close();
        trackCache.totalSizeBytes -= entry.sizeBytes;
        this.totalRawMemoryBytes -= entry.sizeBytes;
      }
    }

    for (const key of keysToRemove) {
      trackCache.frames.delete(key);
    }
  }

  /**
   * 清除轨道缓存
   */
  clearTrackCache(trackId: string): void {
    const trackCache = this.rawFrameCache.get(trackId);
    if (!trackCache) return;

    for (const entry of trackCache.frames.values()) {
      entry.frame.close();
    }
    this.totalRawMemoryBytes -= trackCache.totalSizeBytes;
    this.rawFrameCache.delete(trackId);
  }

  // ===========================================================================
  // Statistics API
  // ===========================================================================

  /**
   * 获取缓存统计信息
   */
  getStats(): CacheStats {
    let totalRawFrames = 0;
    for (const cache of this.rawFrameCache.values()) {
      totalRawFrames += cache.frames.size;
    }

    const rawTotalRequests = this.rawCacheHitCount + this.rawCacheMissCount;

    return {
      rawFrames: {
        trackCount: this.rawFrameCache.size,
        totalFrames: totalRawFrames,
        totalSizeBytes: this.totalRawMemoryBytes,
        hitCount: this.rawCacheHitCount,
        missCount: this.rawCacheMissCount,
        hitRate: rawTotalRequests > 0 ? this.rawCacheHitCount / rawTotalRequests : 0,
      },
      compositeFrames: {
        frameCount: 0,
        totalSizeBytes: 0,
        hitCount: 0,
        missCount: 0,
        hitRate: 0,
      },
      totalMemoryBytes: this.totalRawMemoryBytes,
    };
  }

  /**
   * 重置统计计数
   */
  resetStats(): void {
    this.rawCacheHitCount = 0;
    this.rawCacheMissCount = 0;
  }

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  /**
   * 清除所有缓存
   */
  clear(): void {
    // 清除原始帧缓存
    for (const trackCache of this.rawFrameCache.values()) {
      for (const entry of trackCache.frames.values()) {
        entry.frame.close();
      }
    }
    this.rawFrameCache.clear();
    this.totalRawMemoryBytes = 0;

    // 重置统计
    this.resetStats();
  }

  /**
   * 销毁缓存管理器
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clear();
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  /**
   * 驱逐轨道内最久未访问的帧
   */
  private evictOldestRawFrame(trackCache: TrackFrameCache): void {
    let oldestKey: number | null = null;
    let oldestTime = Infinity;

    for (const [time, entry] of trackCache.frames) {
      if (entry.lastAccess < oldestTime) {
        oldestTime = entry.lastAccess;
        oldestKey = time;
      }
    }

    if (oldestKey !== null) {
      const entry = trackCache.frames.get(oldestKey);
      if (entry) {
        entry.frame.close();
        trackCache.totalSizeBytes -= entry.sizeBytes;
        this.totalRawMemoryBytes -= entry.sizeBytes;
        trackCache.frames.delete(oldestKey);
      }
    }
  }

  /**
   * 驱逐全局最久未访问的原始帧
   */
  private evictOldestRawFrameGlobal(): void {
    let oldestTrackCache: TrackFrameCache | null = null;
    let oldestKey: number | null = null;
    let oldestTime = Infinity;

    for (const trackCache of this.rawFrameCache.values()) {
      for (const [time, entry] of trackCache.frames) {
        if (entry.lastAccess < oldestTime) {
          oldestTime = entry.lastAccess;
          oldestKey = time;
          oldestTrackCache = trackCache;
        }
      }
    }

    if (oldestTrackCache && oldestKey !== null) {
      const entry = oldestTrackCache.frames.get(oldestKey);
      if (entry) {
        entry.frame.close();
        oldestTrackCache.totalSizeBytes -= entry.sizeBytes;
        this.totalRawMemoryBytes -= entry.sizeBytes;
        oldestTrackCache.frames.delete(oldestKey);
      }
    }
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * 生成轨道配置 hash
 * @param tracks 轨道配置列表
 * @returns 配置 hash 字符串
 */
export function generateConfigHash(
  tracks: Array<{
    id: string;
    opacity?: number;
    blendMode?: string;
    effects?: unknown[];
  }>
): string {
  // 简单的配置序列化（可用更高效的 hash 算法替换）
  const configStr = tracks
    .map(t => `${t.id}:${t.opacity ?? 1}:${t.blendMode ?? 'normal'}:${t.effects?.length ?? 0}`)
    .join('|');

  // 简单 hash (DJB2)
  let hash = 5381;
  for (let i = 0; i < configStr.length; i++) {
    hash = ((hash << 5) + hash) + configStr.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

// =============================================================================
// Singleton Instance
// =============================================================================

let timelineFrameCacheInstance: TimelineFrameCache | null = null;

/**
 * 获取 TimelineFrameCache 单例
 */
export function getTimelineFrameCache(
  config?: Partial<TimelineFrameCacheConfig>
): TimelineFrameCache {
  if (!timelineFrameCacheInstance) {
    timelineFrameCacheInstance = new TimelineFrameCache(config);
  }
  return timelineFrameCacheInstance;
}

/**
 * 重置 TimelineFrameCache 单例（用于测试）
 */
export function resetTimelineFrameCache(): void {
  if (timelineFrameCacheInstance) {
    timelineFrameCacheInstance.dispose();
    timelineFrameCacheInstance = null;
  }
}
