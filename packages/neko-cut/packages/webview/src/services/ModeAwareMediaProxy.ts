/**
 * ModeAwareMediaProxy - Mode-based routing for media requests
 *
 * Routes media requests based on current mode:
 * - basic mode: LocalMediaProcessor (Webview-only processing)
 * - compatible mode: MediaRequestProxy (IPC to Extension FFmpeg)
 *
 * Implements IMediaRequestProxy interface for drop-in replacement.
 */

import type { MediaInfo, ExtractedSubtitleTrack, CompositeLayerConfig } from '@neko/shared';
import type { IMediaRequestProxy, MediaRequestOptions } from './MediaRequestProxy';
import type { LocalMediaProcessor, TimelineVideoInfo } from './LocalMediaProcessor';
import type { MediaEngineMode } from '@neko/shared';

// =============================================================================
// Types
// =============================================================================

/**
 * Mode getter function type
 */
export type ModeGetter = () => MediaEngineMode | null;

// =============================================================================
// ModeAwareMediaProxy
// =============================================================================

/**
 * Mode-aware media request proxy
 *
 * Delegates requests to either LocalMediaProcessor (basic mode)
 * or MediaRequestProxy (compatible mode) based on current mode.
 */
export class ModeAwareMediaProxy implements IMediaRequestProxy {
  private _localProcessor: LocalMediaProcessor;
  private _remoteProxy: IMediaRequestProxy;
  private _getMode: ModeGetter;

  constructor(
    localProcessor: LocalMediaProcessor,
    remoteProxy: IMediaRequestProxy,
    getMode: ModeGetter
  ) {
    this._localProcessor = localProcessor;
    this._remoteProxy = remoteProxy;
    this._getMode = getMode;
  }

  // ===========================================================================
  // IMediaRequestProxy Implementation
  // ===========================================================================

  async getVideoFrame(
    videoPath: string,
    timeInSeconds: number,
    options?: MediaRequestOptions
  ): Promise<ImageBitmap> {
    if (this._shouldUseLocalProcessor()) {
      // Pass options to local processor for scale/quality support
      return this._localProcessor.getVideoFrame(videoPath, timeInSeconds, options);
    }
    return this._remoteProxy.getVideoFrame(videoPath, timeInSeconds, options);
  }

  async getVideoFrameRange(
    videoPath: string,
    startTime: number,
    duration: number,
    fps: number,
    options?: MediaRequestOptions
  ): Promise<Array<{ time: number; bitmap: ImageBitmap }>> {
    if (this._shouldUseLocalProcessor()) {
      return this._localProcessor.getVideoFrameRange(
        videoPath,
        startTime,
        duration,
        fps,
        options?.maxFrames
      );
    }
    return this._remoteProxy.getVideoFrameRange(videoPath, startTime, duration, fps, options);
  }

  async decodeAudioSegment(
    videoPath: string,
    startTime: number,
    duration: number,
    sampleRate?: number,
    channels?: number,
    options?: MediaRequestOptions
  ): Promise<AudioBuffer> {
    if (this._shouldUseLocalProcessor()) {
      return this._localProcessor.decodeAudioSegment(
        videoPath,
        startTime,
        duration,
        sampleRate ?? 48000,
        channels ?? 2
      );
    }
    return this._remoteProxy.decodeAudioSegment(
      videoPath,
      startTime,
      duration,
      sampleRate,
      channels,
      options
    );
  }

  async probeMediaInfo(
    videoPath: string,
    options?: MediaRequestOptions
  ): Promise<MediaInfo> {
    if (this._shouldUseLocalProcessor()) {
      return this._localProcessor.probeMediaInfo(videoPath);
    }
    return this._remoteProxy.probeMediaInfo(videoPath, options);
  }

  async extractSubtitles(
    videoPath: string,
    options?: MediaRequestOptions
  ): Promise<ExtractedSubtitleTrack[]> {
    if (this._shouldUseLocalProcessor()) {
      return this._localProcessor.extractSubtitles(videoPath);
    }
    return this._remoteProxy.extractSubtitles(videoPath, options);
  }

  /**
   * Get all keyframe times in the video (basic mode only)
   * Returns empty array in compatible mode (FFmpeg doesn't expose this easily)
   */
  async getKeyframeTimes(videoPath: string): Promise<number[]> {
    if (this._shouldUseLocalProcessor()) {
      return this._localProcessor.getKeyframeTimes(videoPath);
    }
    // Compatible mode: return empty array (FFmpeg-based extraction not implemented)
    return [];
  }

  /**
   * Preload keyframes for multiple videos on the timeline (basic mode only)
   * Loads keyframes in timeline order, limited to maxCount
   *
   * @param videos Array of video info with timeline offsets
   * @param maxCount Maximum number of keyframes to preload (default: 100)
   * @param signal Optional AbortSignal for cancellation
   * @returns Number of keyframes successfully preloaded
   */
  async preloadKeyframesForTimeline(
    videos: TimelineVideoInfo[],
    maxCount = 100,
    signal?: AbortSignal
  ): Promise<number> {
    if (this._shouldUseLocalProcessor()) {
      return this._localProcessor.preloadKeyframesForTimeline(videos, maxCount, signal);
    }
    // Compatible mode: no preloading (frames are fetched on-demand via IPC)
    return 0;
  }

  // ===========================================================================
  // Compatible Mode Methods
  // ===========================================================================

  async compatibleGetVideoFrame(
    videoPath: string,
    timeInSeconds: number,
    width?: number,
    height?: number,
    options?: MediaRequestOptions
  ): Promise<ImageBitmap> {
    // Always use remote proxy for compatible mode methods
    return this._remoteProxy.compatibleGetVideoFrame(
      videoPath,
      timeInSeconds,
      width,
      height,
      options
    );
  }

  async renderCompositeFrame(
    layers: CompositeLayerConfig[],
    time: number,
    width: number,
    height: number,
    backgroundColor?: [number, number, number, number],
    options?: MediaRequestOptions
  ): Promise<ImageBitmap> {
    // Always use remote proxy for compatible mode methods
    return this._remoteProxy.renderCompositeFrame(
      layers,
      time,
      width,
      height,
      backgroundColor,
      options
    );
  }

  // ===========================================================================
  // Performance Stats Methods (delegate to remote proxy)
  // ===========================================================================

  async getPerformanceStats(): Promise<{
    cpuUsage: number;
    memoryUsedMB: number;
    memoryTotalMB: number;
    cachedFrames: number;
    cacheHitCount: number;
    cacheMissCount: number;
    cacheHitRate: number;
    droppedFrames: number;
    decodeErrors: number;
    avgDecodeTimeMs: number;
    avgRenderTimeMs: number;
  }> {
    return this._remoteProxy.getPerformanceStats();
  }

  async getMediaBitrate(mediaPath: string): Promise<{
    videoBitrate: number;
    audioBitrate: number;
    totalBitrate: number;
    videoBitrateStr: string;
    totalBitrateStr: string;
  }> {
    return this._remoteProxy.getMediaBitrate(mediaPath);
  }

  cancelAllPendingRequests(): void {
    // Only the remote proxy has pending requests to cancel
    this._remoteProxy.cancelAllPendingRequests();
  }

  get pendingRequestCount(): number {
    // Local processor doesn't track pending requests
    return this._remoteProxy.pendingRequestCount;
  }

  dispose(): void {
    this._localProcessor.dispose();
    this._remoteProxy.dispose();
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Determine if local processor should be used
   * Default to basic mode (local processor) when mode is null or 'basic'
   */
  private _shouldUseLocalProcessor(): boolean {
    const mode = this._getMode();
    // Use local processor for basic mode or when mode is not set (null)
    // This ensures audio decoding works even before mode is resolved
    return mode === 'basic' || mode === null;
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a ModeAwareMediaProxy instance
 */
export function createModeAwareMediaProxy(
  localProcessor: LocalMediaProcessor,
  remoteProxy: IMediaRequestProxy,
  getMode: ModeGetter
): ModeAwareMediaProxy {
  return new ModeAwareMediaProxy(localProcessor, remoteProxy, getMode);
}
