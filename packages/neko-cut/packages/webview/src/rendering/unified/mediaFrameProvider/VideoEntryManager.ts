/**
 * VideoEntryManager - 视频条目管理器
 * 负责视频媒体条目的创建、缓存和生命周期管理
 */

import type { VideoMediaEntry } from './types';
import { getMediaProxy } from '../../../services/mediaProxyFactory';
import {
  DEFAULT_MAX_VIDEO_ENTRIES,
  DEFAULT_FPS,
  PROBE_REQUEST_TIMEOUT,
} from './constants';

/**
 * 视频条目管理器
 */
export class VideoEntryManager {
  private _videoPool = new Map<string, VideoMediaEntry>();
  private _maxEntries: number;
  private _globalFrameCount = 0;

  constructor(maxEntries: number = DEFAULT_MAX_VIDEO_ENTRIES) {
    this._maxEntries = maxEntries;
  }

  get videoPool(): Map<string, VideoMediaEntry> {
    return this._videoPool;
  }

  get globalFrameCount(): number {
    return this._globalFrameCount;
  }

  set globalFrameCount(value: number) {
    this._globalFrameCount = value;
  }

  get size(): number {
    return this._videoPool.size;
  }

  /**
   * 获取视频条目
   */
  get(mediaUrl: string): VideoMediaEntry | undefined {
    return this._videoPool.get(mediaUrl);
  }

  /**
   * 获取或创建视频媒体条目
   */
  async getOrCreate(mediaUrl: string): Promise<VideoMediaEntry | null> {
    const existing = this._videoPool.get(mediaUrl);
    if (existing) {
      if (existing.initializing && existing.initPromise) {
        await existing.initPromise;
      }
      return existing;
    }

    if (this._videoPool.size >= this._maxEntries) {
      this._evictOldest();
    }

    const entry = this._createEntry(mediaUrl);
    this._videoPool.set(mediaUrl, entry);

    entry.initPromise = this._initialize(entry, mediaUrl);

    try {
      await entry.initPromise;
      entry.initializing = false;
      return entry;
    } catch (error) {
      this._videoPool.delete(mediaUrl);
      console.error(`[VideoEntryManager] Failed to initialize video:`, error);
      return null;
    }
  }

  /**
   * 创建新的视频条目
   */
  private _createEntry(mediaUrl: string): VideoMediaEntry {
    return {
      url: mediaUrl,
      mediaInfo: null,
      lastAccess: Date.now(),
      initializing: true,
      initPromise: null,
      currentFrame: null,
      pendingRequest: null,
      pendingRequestTime: null,
      lastRequestTimestamp: 0,
      preloadBuffer: new Map(),
      preloadStartTime: null,
      preloadEndTime: null,
      preloading: false,
      preloadCancelled: false,
      preloadAbortController: null,
      playbackAbortController: null,
    };
  }

  /**
   * 初始化视频条目（获取媒体信息）
   */
  private async _initialize(entry: VideoMediaEntry, mediaUrl: string): Promise<void> {
    try {
      const mediaInfo = await getMediaProxy().probeMediaInfo(mediaUrl, {
        timeoutMs: PROBE_REQUEST_TIMEOUT,
      });
      entry.mediaInfo = mediaInfo;
    } catch (error) {
      console.warn(`[VideoEntryManager] Failed to get media info for ${mediaUrl}:`, error);
      entry.mediaInfo = null;
    }
  }

  /**
   * 驱逐最旧的视频条目
   */
  private _evictOldest(): void {
    let oldestUrl: string | null = null;
    let oldestTime = Infinity;

    for (const [url, entry] of this._videoPool) {
      if (entry.lastAccess < oldestTime) {
        oldestTime = entry.lastAccess;
        oldestUrl = url;
      }
    }

    if (oldestUrl) {
      this.remove(oldestUrl);
    }
  }

  /**
   * 移除视频条目
   */
  remove(mediaUrl: string): void {
    const entry = this._videoPool.get(mediaUrl);
    if (!entry) return;

    this._cleanupEntry(entry);
    this._videoPool.delete(mediaUrl);
  }

  /**
   * 清理条目资源
   */
  private _cleanupEntry(entry: VideoMediaEntry): void {
    entry.preloadCancelled = true;
    entry.preloading = false;

    if (entry.preloadAbortController) {
      entry.preloadAbortController.abort();
      entry.preloadAbortController = null;
    }
    if (entry.playbackAbortController) {
      entry.playbackAbortController.abort();
      entry.playbackAbortController = null;
    }

    // Close preload buffer frames
    for (const cached of entry.preloadBuffer.values()) {
      try {
        cached.frame.close();
      } catch {
        // Ignore
      }
    }
    this._globalFrameCount -= entry.preloadBuffer.size;
    entry.preloadBuffer.clear();

    // Close current frame
    if (entry.currentFrame) {
      try {
        entry.currentFrame.frame.close();
      } catch {
        // Ignore
      }
    }
  }

  /**
   * 清空所有视频条目
   */
  clear(): void {
    for (const entry of this._videoPool.values()) {
      this._cleanupEntry(entry);
    }
    this._videoPool.clear();
    this._globalFrameCount = 0;
  }

  /**
   * 获取帧率
   */
  getFps(entry: VideoMediaEntry): number {
    return entry.mediaInfo?.fps ?? DEFAULT_FPS;
  }
}
