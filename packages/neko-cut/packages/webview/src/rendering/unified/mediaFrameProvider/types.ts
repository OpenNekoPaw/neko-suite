/**
 * MediaFrameProvider Types
 */

import type { MediaInfo } from '@neko/shared';

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * 媒体帧提供器配置
 */
export interface MediaFrameProviderConfig {
  /** URL 解析器 (VSCode webview) */
  urlResolver?: UrlResolver;
  /** 最大视频条目数量 */
  maxVideoEntries?: number;
  /** 图片缓存大小 */
  imageCacheSize?: number;
  /** 导出模式 - 启用低内存策略 */
  exportMode?: boolean;
  /** JPEG quality (2-31, lower is better, default: 3) */
  quality?: number;
  /** Scale factor (0-1, default: 1.0 = no scaling) */
  scale?: number;
  /** Dynamic cache window (seconds, overrides TIME_WINDOW constant) */
  cacheWindow?: number;
}

/**
 * URL 解析器类型
 */
export type UrlResolver = (path: string) => Promise<string> | string;

/**
 * 合成轨道配置
 */
export interface CompositeTrackConfig {
  /** 视频文件路径 */
  videoPath: string;
  /** X 位置（像素） */
  x: number;
  /** Y 位置（像素） */
  y: number;
  /** 宽度（像素） */
  width: number;
  /** 高度（像素） */
  height: number;
  /** 不透明度（0-1，可选） */
  opacity?: number;
  /** 特效列表（可选） */
  effects?: Array<{
    type: 'blur' | 'colorCorrection' | 'brightness' | 'contrast';
    radius?: number;
    brightness?: number;
    contrast?: number;
    saturation?: number;
    hue?: number;
  }>;
}

// =============================================================================
// Video Entry Types
// =============================================================================

/**
 * 当前帧缓存 - 存储最近提取的帧以避免重复请求
 */
export interface CurrentFrameCache {
  /** 帧对象 */
  frame: VideoFrame;
  /** 帧时间 (秒) */
  time: number;
  /** 帧时间戳 (微秒) */
  timestamp: number;
}

/**
 * 预加载帧缓存条目
 */
export interface PreloadedFrameEntry {
  /** 帧对象 */
  frame: VideoFrame;
  /** 帧时间 (秒) */
  time: number;
}

/**
 * 视频媒体条目 (Extension FFmpeg 模式)
 */
export interface VideoMediaEntry {
  /** 文件 URL */
  url: string;
  /** 媒体信息 (从 Extension 获取) */
  mediaInfo: MediaInfo | null;
  /** 最后访问时间 */
  lastAccess: number;
  /** 是否正在初始化 */
  initializing: boolean;
  /** 初始化 Promise */
  initPromise: Promise<void> | null;
  /** 当前帧缓存 - 避免同一帧重复请求 */
  currentFrame: CurrentFrameCache | null;
  /** 正在进行的帧请求 Promise */
  pendingRequest: Promise<VideoFrame | null> | null;
  /** 正在请求的目标时间 */
  pendingRequestTime: number | null;
  /** 上次请求时间戳（用于限制请求频率） */
  lastRequestTimestamp: number;
  /** 预加载帧缓冲区 (time -> frame) - GOP 预渲染 */
  preloadBuffer: Map<number, PreloadedFrameEntry>;
  /** 预加载起始时间 */
  preloadStartTime: number | null;
  /** 预加载结束时间 */
  preloadEndTime: number | null;
  /** 是否正在预加载 */
  preloading: boolean;
  /** 预加载取消令牌 */
  preloadCancelled: boolean;
  /** 预加载请求取消控制器（仅影响 Webview 侧等待） */
  preloadAbortController: AbortController | null;
  /** 播放/非阻塞请求取消控制器（仅影响 Webview 侧等待） */
  playbackAbortController: AbortController | null;
}

// =============================================================================
// Composite Frame Cache Types
// =============================================================================

/**
 * 合成帧缓存条目
 */
export interface CompositeFrameCacheEntry {
  /** 帧对象 */
  frame: VideoFrame;
  /** 帧时间 (秒) */
  time: number;
}

/**
 * 合成帧缓存配置（用于生成缓存键）
 */
export interface CompositeFrameCacheConfig {
  /** 轨道配置（序列化后用于缓存键） */
  tracksKey: string;
  /** 画布宽度 */
  width: number;
  /** 画布高度 */
  height: number;
}

// =============================================================================
// Image Cache Types
// =============================================================================

/**
 * 图片缓存条目
 */
export interface ImageCacheEntry {
  bitmap: ImageBitmap;
  url: string;
  lastAccess: number;
}

// =============================================================================
// Interface
// =============================================================================

/**
 * 媒体帧提供器接口
 */
export interface IMediaFrameProvider {
  /**
   * 获取视频帧（单轨）
   */
  getVideoFrame(
    elementId: string,
    mediaUrl: string,
    time: number,
    nonBlocking?: boolean
  ): Promise<VideoFrame | null>;

  /**
   * 获取合成帧（多轨）
   */
  getCompositeVideoFrame(
    elementId: string,
    tracks: CompositeTrackConfig[],
    time: number,
    width: number,
    height: number,
    nonBlocking?: boolean
  ): Promise<VideoFrame | null>;

  /**
   * 获取图片
   */
  getImageBitmap(elementId: string, imageUrl: string): Promise<ImageBitmap | null>;

  /**
   * 预加载媒体文件
   */
  preload(mediaUrl: string): Promise<void>;

  /**
   * 获取已缓存帧数
   */
  getCachedFrameCount?(): number;

  /**
   * 释放资源
   */
  dispose(): void;
}
