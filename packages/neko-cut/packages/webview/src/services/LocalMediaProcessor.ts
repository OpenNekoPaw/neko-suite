/**
 * LocalMediaProcessor - Basic mode local media processing
 *
 * Handles all 5 media operations locally in Webview:
 * 1. probeMediaInfo - Uses MP4Demuxer (mp4box.js)
 * 2. getVideoFrame - Uses WebviewVideoDecoder (WebCodecs)
 * 3. getVideoFrameRange - Uses WebviewVideoDecoder batch
 * 4. decodeAudioSegment - Uses WebviewAudioDecoder (MP4Demuxer + libav.js)
 * 5. extractSubtitles - Returns empty (basic mode limitation)
 */

import type { MediaInfo, ExtractedSubtitleTrack } from '@neko/shared';
import { createMP4Demuxer, type DemuxedMediaInfo } from '../mediaEngine/demuxers';
import { WebviewVideoDecoder } from '../mediaEngine/decoders/WebviewVideoDecoder';
import { WebviewAudioDecoder, createWebviewAudioDecoder } from '../mediaEngine/decoders/WebviewAudioDecoder';
import { isLibavAvailable } from '../mediaEngine/libav';
import type { UrlResolver } from './urlResolverFactory';
import { readFileRangeCached } from '../hooks/useVSCodeMessaging';

// =============================================================================
// Types
// =============================================================================

/**
 * Decoder pool entry with last access time for LRU eviction
 */
interface DecoderPoolEntry {
  decoder: WebviewVideoDecoder;
  lastAccess: number;
}

/**
 * Audio decoder pool entry (new unified decoder)
 */
interface AudioDecoderPoolEntry {
  decoder: WebviewAudioDecoder;
  lastAccess: number;
}

/**
 * LocalMediaProcessor configuration
 */
export interface LocalMediaProcessorConfig {
  /**
   * Use Annex B format for video decoding (default: true)
   * When true:
   * - Video data is converted from AVCC (length-prefixed) to Annex B (start code prefixed)
   * - VideoDecoderConfig.description is not provided
   * - Decoder reads SPS/PPS from bitstream (in-band)
   *
   * This is useful for videos with multiple SPS/PPS sets (in-band parameter sets)
   * where the decoder needs to handle parameter set changes dynamically.
   *
   * Set to false to use AVCC mode with out-of-band SPS/PPS (legacy behavior).
   */
  useAnnexB?: boolean;
}

/**
 * Video info for timeline keyframe preloading
 */
export interface TimelineVideoInfo {
  /** Path to the video file */
  videoPath: string;
  /** Video start time on the timeline (seconds) */
  timelineOffset: number;
  /** Trim start time within the video (seconds) */
  trimStart?: number;
  /** Trim end time within the video (seconds) */
  trimEnd?: number;
}

// =============================================================================
// Constants
// =============================================================================

const MAX_DECODER_POOL_SIZE = 3;
const MAX_AUDIO_DECODER_POOL_SIZE = 3;
const DECODER_IDLE_TIMEOUT = 60000; // 1 minute

// =============================================================================
// LocalMediaProcessor
// =============================================================================

/**
 * Local media processor for basic mode
 *
 * All operations run entirely in Webview using:
 * - mp4box.js for demuxing and metadata
 * - WebCodecs for video decoding
 * - libav.js for audio decoding
 */
export class LocalMediaProcessor {
  private _urlResolver: UrlResolver;
  private _config: LocalMediaProcessorConfig;
  private _decoderPool: Map<string, DecoderPoolEntry> = new Map();
  private _audioDecoderPool: Map<string, AudioDecoderPoolEntry> = new Map();
  private _cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(urlResolver: UrlResolver, config: LocalMediaProcessorConfig = {}) {
    this._urlResolver = urlResolver;
    this._config = config;
    // Start periodic cleanup
    this._cleanupTimer = setInterval(() => this._cleanupIdleDecoders(), DECODER_IDLE_TIMEOUT);
  }

  // ===========================================================================
  // Public Methods - IMediaRequestProxy compatible
  // ===========================================================================

  /**
   * Probe media file metadata using MP4Demuxer (mp4box.js)
   * Falls back to mfra box parsing for fragmented MP4 duration
   */
  async probeMediaInfo(videoPath: string): Promise<MediaInfo> {
    try {
      const url = await this._urlResolver(videoPath);

      // Pass filePath for Extension Host file reading optimization
      const demuxer = createMP4Demuxer({ source: url, filePath: videoPath });
      try {
        const info = await demuxer.initialize();

        let result = this._mapToMediaInfo(info, videoPath);

        // For fragmented MP4, duration from moov may be incomplete
        // Try to get duration from mfra box (only ~4KB at end of file)
        if (result.duration <= 0 || (info.video?.sampleCount && info.video.sampleCount < 1000 && result.duration < 30)) {
          try {
            // Use video track timescale for tfra parsing (not container timescale)
            const videoTimescale = info.video?.timescale ?? 60000;
            const mfraDuration = await this._getDurationFromMfra(videoPath, videoTimescale);
            if (mfraDuration > result.duration) {
              result = { ...result, duration: mfraDuration };
            }
          } catch {
            // mfra fallback failed, use original duration
          }
        }

        return result;
      } finally {
        demuxer.dispose();
      }
    } catch (error) {
      console.error('[LocalMediaProcessor] probeMediaInfo failed:', error);
      throw error;
    }
  }

  /**
   * Get video duration from mfra (Movie Fragment Random Access) box
   * This is efficient for fragmented MP4 - only reads ~4KB from end of file
   */
  private async _getDurationFromMfra(videoPath: string, containerTimescale: number): Promise<number> {
    // Read last 4KB of file to find mfra box
    const MFRA_SEARCH_SIZE = 4096;

    try {
      // Get file size first
      const fileSize = await this._getFileSize(videoPath);
      if (!fileSize || fileSize < MFRA_SEARCH_SIZE) {
        throw new Error('File too small or size unknown');
      }

      const startOffset = fileSize - MFRA_SEARCH_SIZE;
      const endData = await readFileRangeCached(videoPath, startOffset, fileSize - 1);

      // Search for mfra box in the data
      const view = new DataView(endData);
      for (let i = 0; i < endData.byteLength - 8; i++) {
        const boxSize = view.getUint32(i);
        const boxType = String.fromCharCode(
          view.getUint8(i + 4),
          view.getUint8(i + 5),
          view.getUint8(i + 6),
          view.getUint8(i + 7)
        );

        if (boxType === 'mfra' && boxSize > 0 && boxSize <= endData.byteLength - i) {
          return this._parseMfraBox(new Uint8Array(endData, i, boxSize), containerTimescale);
        }
      }

      throw new Error('mfra box not found');
    } catch (e) {
      throw new Error(`Failed to read mfra: ${e}`);
    }
  }

  /**
   * Parse mfra box to extract duration
   * mfra contains tfra (track fragment random access) boxes with timing info
   */
  private _parseMfraBox(data: Uint8Array, containerTimescale: number): number {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let offset = 8; // Skip mfra header

    let maxTime = 0;

    while (offset < data.byteLength - 8) {
      const boxSize = view.getUint32(offset);
      const boxType = String.fromCharCode(
        data[offset + 4] ?? 0,
        data[offset + 5] ?? 0,
        data[offset + 6] ?? 0,
        data[offset + 7] ?? 0
      );

      if (boxSize === 0 || offset + boxSize > data.byteLength) break;

      if (boxType === 'tfra') {
        // Parse tfra box
        const tfraTime = this._parseTfraBox(new Uint8Array(data.buffer, data.byteOffset + offset, boxSize));
        if (tfraTime > maxTime) {
          maxTime = tfraTime;
        }
      }

      offset += boxSize;
    }

    // Convert to seconds using container timescale
    const timescale = containerTimescale > 0 ? containerTimescale : 1000;
    return maxTime / timescale;
  }

  /**
   * Parse tfra (track fragment random access) box to get max time
   */
  private _parseTfraBox(data: Uint8Array): number {
    if (data.byteLength < 16) return 0;

    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let offset = 8; // Skip box header

    const version = data[offset] ?? 0;
    offset += 4; // version + flags

    // Skip trackId (4 bytes)
    offset += 4;

    const lengthFields = data[offset + 3] ?? 0;
    offset += 4;

    const numberOfEntry = view.getUint32(offset);
    offset += 4;

    // Calculate field sizes
    const trafNumberSize = ((lengthFields >> 4) & 0x3) + 1;
    const trunNumberSize = ((lengthFields >> 2) & 0x3) + 1;
    const sampleNumberSize = (lengthFields & 0x3) + 1;

    let maxTime = 0;

    for (let i = 0; i < numberOfEntry && offset < data.byteLength; i++) {
      let time: number;
      if (version === 1) {
        // 64-bit time
        const high = view.getUint32(offset);
        const low = view.getUint32(offset + 4);
        time = high * 0x100000000 + low;
        offset += 8;
        offset += 8; // moof_offset (64-bit)
      } else {
        time = view.getUint32(offset);
        offset += 4;
        offset += 4; // moof_offset (32-bit)
      }

      offset += trafNumberSize + trunNumberSize + sampleNumberSize;

      if (time > maxTime) {
        maxTime = time;
      }
    }

    return maxTime;
  }

  /**
   * Get keyframe times from mfra (Movie Fragment Random Access) box
   * For fragmented MP4, this returns all keyframe times from tfra entries
   * @param videoPath Path to the video file
   * @param videoTimescale Video track timescale (from mediaInfo)
   * @returns Array of keyframe times in seconds, or null if mfra not found
   */
  async getKeyframeTimesFromMfra(videoPath: string, videoTimescale: number): Promise<number[] | null> {
    const fragments = await this.getFragmentInfoFromMfra(videoPath, videoTimescale);
    if (!fragments) return null;
    return fragments.map(f => f.time);
  }

  /**
   * Get fragment info (time and moof offset) from mfra box
   * For fragmented MP4, this returns all fragment entries from tfra
   * @param videoPath Path to the video file
   * @param videoTimescale Video track timescale (from mediaInfo)
   * @returns Array of fragment info, or null if mfra not found
   */
  async getFragmentInfoFromMfra(videoPath: string, videoTimescale: number): Promise<Array<{time: number; moofOffset: number}> | null> {
    const MFRA_SEARCH_SIZE = 8192; // 8KB to handle larger mfra boxes

    try {
      const fileSize = await this._getFileSize(videoPath);
      if (!fileSize || fileSize < MFRA_SEARCH_SIZE) {
        return null;
      }

      const startOffset = fileSize - MFRA_SEARCH_SIZE;
      const endData = await readFileRangeCached(videoPath, startOffset, fileSize - 1);

      const view = new DataView(endData);
      for (let i = 0; i < endData.byteLength - 8; i++) {
        const boxSize = view.getUint32(i);
        const boxType = String.fromCharCode(
          view.getUint8(i + 4),
          view.getUint8(i + 5),
          view.getUint8(i + 6),
          view.getUint8(i + 7)
        );

        if (boxType === 'mfra' && boxSize > 0 && boxSize <= endData.byteLength - i) {
          return this._parseFragmentInfoFromMfra(new Uint8Array(endData, i, boxSize), videoTimescale);
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Parse mfra box to extract fragment info (time and moof offset)
   */
  private _parseFragmentInfoFromMfra(data: Uint8Array, videoTimescale: number): Array<{time: number; moofOffset: number}> {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let offset = 8; // Skip mfra header

    const fragments: Array<{time: number; moofOffset: number}> = [];
    const timescale = videoTimescale > 0 ? videoTimescale : 1000;

    while (offset < data.byteLength - 8) {
      const boxSize = view.getUint32(offset);
      const boxType = String.fromCharCode(
        data[offset + 4] ?? 0,
        data[offset + 5] ?? 0,
        data[offset + 6] ?? 0,
        data[offset + 7] ?? 0
      );

      if (boxSize === 0 || offset + boxSize > data.byteLength) break;

      if (boxType === 'tfra') {
        const tfraFragments = this._parseFragmentInfoFromTfra(
          new Uint8Array(data.buffer, data.byteOffset + offset, boxSize),
          timescale
        );
        fragments.push(...tfraFragments);
      }

      offset += boxSize;
    }

    // Sort by time and deduplicate by moof offset
    const seen = new Set<number>();
    return fragments
      .sort((a, b) => a.time - b.time)
      .filter(f => {
        if (seen.has(f.moofOffset)) return false;
        seen.add(f.moofOffset);
        return true;
      });
  }

  /**
   * Parse tfra box to extract fragment info (time and moof offset)
   */
  private _parseFragmentInfoFromTfra(data: Uint8Array, timescale: number): Array<{time: number; moofOffset: number}> {
    if (data.byteLength < 16) return [];

    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let offset = 8; // Skip box header

    const version = data[offset] ?? 0;
    offset += 4; // version + flags

    // Skip trackId (4 bytes)
    offset += 4;

    const lengthFields = data[offset + 3] ?? 0;
    offset += 4;

    const numberOfEntry = view.getUint32(offset);
    offset += 4;

    // Calculate field sizes
    const trafNumberSize = ((lengthFields >> 4) & 0x3) + 1;
    const trunNumberSize = ((lengthFields >> 2) & 0x3) + 1;
    const sampleNumberSize = (lengthFields & 0x3) + 1;

    const fragments: Array<{time: number; moofOffset: number}> = [];

    for (let i = 0; i < numberOfEntry && offset < data.byteLength; i++) {
      let time: number;
      let moofOffset: number;

      if (version === 1) {
        // 64-bit time and moof_offset
        const timeHigh = view.getUint32(offset);
        const timeLow = view.getUint32(offset + 4);
        time = timeHigh * 0x100000000 + timeLow;
        offset += 8;

        const offsetHigh = view.getUint32(offset);
        const offsetLow = view.getUint32(offset + 4);
        moofOffset = offsetHigh * 0x100000000 + offsetLow;
        offset += 8;
      } else {
        time = view.getUint32(offset);
        offset += 4;
        moofOffset = view.getUint32(offset);
        offset += 4;
      }

      offset += trafNumberSize + trunNumberSize + sampleNumberSize;

      // Convert time to seconds
      fragments.push({ time: time / timescale, moofOffset });
    }

    return fragments;
  }

  /**
   * Get file size via Extension Host
   */
  private async _getFileSize(videoPath: string): Promise<number> {
    // Read first 8 bytes and check response to infer file size
    // This is a workaround - ideally we'd have a dedicated API
    try {
      // Try to read a large range - the actual returned size tells us the file size
      const largeOffset = 1024 * 1024 * 1024; // 1GB
      const data = await readFileRangeCached(videoPath, 0, largeOffset);
      // If we got less than requested, the file is smaller
      return data.byteLength;
    } catch {
      return 0;
    }
  }

  /**
   * Extract a single video frame at specified time
   * Supports optional scale parameter for thumbnail-sized output
   */
  async getVideoFrame(
    videoPath: string,
    timeInSeconds: number,
    options?: { scale?: number; useThumbnailMode?: boolean }
  ): Promise<ImageBitmap> {
    try {
      const decoder = await this._getOrCreateDecoder(videoPath);

      // Use keyframe preview for thumbnail mode (faster, uses separate decoder)
      // This is better for non-sequential access patterns like thumbnail generation
      let frame: VideoFrame | null;
      if (options?.useThumbnailMode) {
        frame = await decoder.getKeyframePreview(timeInSeconds);
      } else {
        frame = await decoder.getFrameAt(timeInSeconds);
      }

      if (!frame) {
        throw new Error(`Failed to decode frame at ${timeInSeconds}s`);
      }

      try {
        // If scale is specified, create a pre-scaled ImageBitmap
        if (options?.scale && options.scale < 1) {
          const targetWidth = Math.max(1, Math.round(frame.displayWidth * options.scale));
          const targetHeight = Math.max(1, Math.round(frame.displayHeight * options.scale));
          return await createImageBitmap(frame, {
            resizeWidth: targetWidth,
            resizeHeight: targetHeight,
            resizeQuality: 'medium',
          });
        }
        return await createImageBitmap(frame);
      } finally {
        frame.close();
      }
    } catch (error) {
      console.error('[LocalMediaProcessor] getVideoFrame failed:', error);
      throw error;
    }
  }

  /**
   * Extract multiple video frames in a time range
   */
  async getVideoFrameRange(
    videoPath: string,
    startTime: number,
    duration: number,
    fps: number,
    maxFrames?: number
  ): Promise<Array<{ time: number; bitmap: ImageBitmap }>> {
    const decoder = await this._getOrCreateDecoder(videoPath);
    const endTime = startTime + duration;
    const frameInterval = 1 / fps;

    // Calculate frame times
    const frameTimes: number[] = [];
    for (let t = startTime; t < endTime; t += frameInterval) {
      frameTimes.push(t);
      if (maxFrames && frameTimes.length >= maxFrames) break;
    }

    // Decode frames
    const results: Array<{ time: number; bitmap: ImageBitmap }> = [];
    for (const time of frameTimes) {
      try {
        const frame = await decoder.getFrameAt(time);
        if (frame) {
          const bitmap = await createImageBitmap(frame);
          frame.close();
          results.push({ time, bitmap });
        }
      } catch (error) {
        console.warn(`[LocalMediaProcessor] Failed to decode frame at ${time}s:`, error);
        // Continue with other frames
      }
    }

    return results;
  }

  /**
   * Decode audio segment using WebviewAudioDecoder
   *
   * Unified architecture:
   *   MP4Demuxer → EncodedAudioSample[] → LibavPureAudioDecoder → AudioBuffer
   *
   * Features:
   * - Range requests (no full file loading)
   * - Decoder instance reuse
   * - Segment caching
   */
  async decodeAudioSegment(
    videoPath: string,
    startTime: number,
    duration: number,
    sampleRate = 48000,
    channels = 2
  ): Promise<AudioBuffer> {
    const url = await this._urlResolver(videoPath);

    // Check if libav.js is available
    if (!(await isLibavAvailable())) {
      throw new Error('[LocalMediaProcessor] libav.js not available for audio decoding');
    }

    // Get or create audio decoder
    const decoder = await this._getOrCreateAudioDecoder(videoPath, url, sampleRate, channels);

    // Decode segment
    return await decoder.decodeSegment(startTime, duration);
  }

  /**
   * Extract subtitles from video file
   *
   * Note: Basic mode does NOT support embedded subtitle extraction.
   * Users should import external subtitle files (SRT/VTT/ASS).
   */
  async extractSubtitles(_videoPath: string): Promise<ExtractedSubtitleTrack[]> {
    console.warn('[LocalMediaProcessor] Embedded subtitle extraction not supported in basic mode. Import external subtitle files instead.');
    return [];
  }

  /**
   * Get all keyframe times in the video
   * Useful for thumbnail generation - thumbnails should be at keyframe positions
   * For fragmented MP4, tries to get keyframe times from mfra box
   * @returns Array of keyframe times in seconds, sorted ascending
   */
  async getKeyframeTimes(videoPath: string): Promise<number[]> {
    try {
      const decoder = await this._getOrCreateDecoder(videoPath);
      let keyframeTimes = await decoder.getKeyframeTimes();

      // For fragmented MP4, demuxer may only have partial keyframes
      // Try to get complete keyframe list from mfra box
      if (keyframeTimes.length < 10) {
        const mediaInfo = decoder.mediaInfo;
        const videoTimescale = mediaInfo?.video?.timescale ?? 60000;
        const mfraKeyframes = await this.getKeyframeTimesFromMfra(videoPath, videoTimescale);
        if (mfraKeyframes && mfraKeyframes.length > keyframeTimes.length) {
          console.log(`[LocalMediaProcessor] Using mfra keyframes: ${mfraKeyframes.length} (demuxer had ${keyframeTimes.length})`);
          keyframeTimes = mfraKeyframes;
        }
      }

      return keyframeTimes;
    } catch (error) {
      console.error('[LocalMediaProcessor] getKeyframeTimes failed:', error);
      return [];
    }
  }

  /**
   * Preload keyframes for multiple videos on the timeline
   * Loads keyframes in timeline order (by timeline time), limited to maxCount
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
    if (videos.length === 0) return 0;

    // Collect all keyframes with their timeline times and video paths
    interface KeyframeEntry {
      videoPath: string;
      videoTime: number;      // Time within the video
      timelineTime: number;   // Time on the timeline
    }

    const allKeyframes: KeyframeEntry[] = [];

    // Gather keyframes from all videos
    for (const video of videos) {
      if (signal?.aborted) break;

      try {
        const decoder = await this._getOrCreateDecoder(video.videoPath);
        const keyframeTimes = await decoder.getKeyframeTimes();

        const trimStart = video.trimStart ?? 0;
        const trimEnd = video.trimEnd ?? 0;

        // Filter keyframes within trim range and map to timeline time
        for (const videoTime of keyframeTimes) {
          // Skip keyframes outside trim range
          if (videoTime < trimStart) continue;
          if (trimEnd > 0 && videoTime > trimEnd) continue;

          // Calculate timeline time
          const timelineTime = video.timelineOffset + (videoTime - trimStart);

          allKeyframes.push({
            videoPath: video.videoPath,
            videoTime,
            timelineTime,
          });
        }
      } catch (error) {
        console.warn(`[LocalMediaProcessor] Failed to get keyframes for ${video.videoPath}:`, error);
      }
    }

    // Sort by timeline time
    allKeyframes.sort((a, b) => a.timelineTime - b.timelineTime);

    // Take only the first maxCount keyframes
    const keyframesToPreload = allKeyframes.slice(0, maxCount);

    // Preload keyframes
    let preloadedCount = 0;

    for (const entry of keyframesToPreload) {
      if (signal?.aborted) {
        break;
      }

      try {
        const decoder = await this._getOrCreateDecoder(entry.videoPath);
        const frame = await decoder.getKeyframePreview(entry.videoTime);
        if (frame) {
          preloadedCount++;
          frame.close(); // We only need it in cache
        }
      } catch (error) {
        console.warn(`[LocalMediaProcessor] Failed to preload keyframe at ${entry.videoTime.toFixed(3)}s:`, error);
      }
    }

    return preloadedCount;
  }

  /**
   * Preload keyframes starting from playhead position
   * According to docs/principle.md:
   * - Get keyframes after playhead position
   * - Sort by time after playhead
   * - Preload first 80 IDR frames
   *
   * @param videos Timeline video elements
   * @param playheadTime Current playhead position (seconds)
   * @param maxCount Maximum keyframes to preload (default: 80)
   * @param signal Optional AbortSignal for cancellation
   * @returns Number of keyframes successfully preloaded
   */
  async preloadKeyframesFromPlayhead(
    videos: TimelineVideoInfo[],
    playheadTime: number,
    maxCount = 80,
    signal?: AbortSignal
  ): Promise<number> {
    if (videos.length === 0) return 0;

    interface KeyframeEntry {
      videoPath: string;
      videoTime: number;
      timelineTime: number;
    }

    const keyframesAfterPlayhead: KeyframeEntry[] = [];

    // Gather keyframes from all videos that are after playhead
    for (const video of videos) {
      if (signal?.aborted) break;

      try {
        const decoder = await this._getOrCreateDecoder(video.videoPath);
        const keyframeTimes = await decoder.getKeyframeTimes();

        const trimStart = video.trimStart ?? 0;
        const trimEnd = video.trimEnd ?? 0;

        for (const videoTime of keyframeTimes) {
          if (videoTime < trimStart) continue;
          if (trimEnd > 0 && videoTime > trimEnd) continue;

          const timelineTime = video.timelineOffset + (videoTime - trimStart);

          // Only include keyframes after playhead
          if (timelineTime >= playheadTime) {
            keyframesAfterPlayhead.push({
              videoPath: video.videoPath,
              videoTime,
              timelineTime,
            });
          }
        }
      } catch (error) {
        console.warn(`[LocalMediaProcessor] Failed to get keyframes for ${video.videoPath}:`, error);
      }
    }

    // Sort by timeline time (ascending, closest to playhead first)
    keyframesAfterPlayhead.sort((a, b) => a.timelineTime - b.timelineTime);

    // Take only the first maxCount keyframes
    const keyframesToPreload = keyframesAfterPlayhead.slice(0, maxCount);

    let preloadedCount = 0;

    for (const entry of keyframesToPreload) {
      if (signal?.aborted) break;

      try {
        const decoder = await this._getOrCreateDecoder(entry.videoPath);
        const frame = await decoder.getKeyframePreview(entry.videoTime);
        if (frame) {
          preloadedCount++;
          frame.close();
        }
      } catch (error) {
        console.warn(`[LocalMediaProcessor] Failed to preload keyframe at ${entry.videoTime.toFixed(3)}s:`, error);
      }
    }

    return preloadedCount;
  }

  /**
   * Clear all keyframe caches in decoder pool
   * Called when mode switches or timeline reopens
   */
  clearAllKeyframeCaches(): void {
    for (const entry of this._decoderPool.values()) {
      entry.decoder.clearKeyframeCache();
    }
  }

  /**
   * Dispose all resources
   */
  dispose(): void {
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = null;
    }

    // Cleanup video decoders
    for (const entry of this._decoderPool.values()) {
      entry.decoder.close().catch(() => {});
    }
    this._decoderPool.clear();

    // Cleanup audio decoders
    for (const entry of this._audioDecoderPool.values()) {
      entry.decoder.dispose();
    }
    this._audioDecoderPool.clear();
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Map DemuxedMediaInfo to MediaInfo
   */
  private _mapToMediaInfo(info: DemuxedMediaInfo, videoPath: string): MediaInfo {
    const format = this._getFormat(videoPath);

    return {
      duration: info.duration,
      width: info.video?.codedWidth ?? 0,
      height: info.video?.codedHeight ?? 0,
      fps: info.video?.fps ?? 0,
      codec: info.video?.codec ?? '',
      format,
      bitrate: info.video?.bitrate,
      hasAudio: !!info.audio,
      audioCodec: info.audio?.codec,
      audioSampleRate: info.audio?.sampleRate,
      audioChannels: info.audio?.channelCount,
      audioBitrate: info.audio?.bitrate,
      hasSubtitles: false, // mp4box.js doesn't easily expose subtitle tracks
    };
  }

  /**
   * Get or create a video decoder for the given path
   */
  private async _getOrCreateDecoder(videoPath: string): Promise<WebviewVideoDecoder> {
    const cacheKey = videoPath;

    // Check existing decoder
    const existing = this._decoderPool.get(cacheKey);
    if (existing) {
      existing.lastAccess = Date.now();
      return existing.decoder;
    }

    // Evict oldest if pool is full
    if (this._decoderPool.size >= MAX_DECODER_POOL_SIZE) {
      this._evictOldestDecoder();
    }

    // Create new decoder
    const url = await this._urlResolver(videoPath);
    const decoder = new WebviewVideoDecoder({
      source: url,
      filePath: videoPath, // Enable Extension Host file reading for Range requests
      useAnnexB: this._config.useAnnexB,
    });

    try {
      await decoder.open();

      // For fragmented MP4, set fragment info for on-demand loading
      // Detection: if demuxer has few keyframes, try to get more from mfra
      const mediaInfo = decoder.mediaInfo;
      if (mediaInfo?.video) {
        const demuxerKeyframes = await decoder.getKeyframeTimes();
        const videoTimescale = mediaInfo.video.timescale ?? 60000;

        // Try to get fragment info from mfra (only reads ~8KB from end of file)
        const fragmentInfo = await this.getFragmentInfoFromMfra(videoPath, videoTimescale);

        // If mfra has more fragments than demuxer has keyframes, it's a fragmented MP4
        // that needs on-demand loading
        if (fragmentInfo && fragmentInfo.length > demuxerKeyframes.length) {
          console.log(`[LocalMediaProcessor] Setting ${fragmentInfo.length} fragment entries for on-demand loading (demuxer had ${demuxerKeyframes.length} keyframes)`);
          decoder.setFragmentInfo(fragmentInfo);
        }
      }
    } catch (error) {
      console.error('[LocalMediaProcessor] Decoder open failed:', error);
      throw error;
    }

    this._decoderPool.set(cacheKey, {
      decoder,
      lastAccess: Date.now(),
    });

    return decoder;
  }

  /**
   * Evict the oldest decoder from the pool
   */
  private _evictOldestDecoder(): void {
    let oldest: { key: string; time: number } | null = null;

    for (const [key, entry] of this._decoderPool.entries()) {
      if (!oldest || entry.lastAccess < oldest.time) {
        oldest = { key, time: entry.lastAccess };
      }
    }

    if (oldest) {
      const entry = this._decoderPool.get(oldest.key);
      if (entry) {
        entry.decoder.close().catch(() => {});
        this._decoderPool.delete(oldest.key);
      }
    }
  }

  /**
   * Get or create an audio decoder for the given path
   * Uses the new unified WebviewAudioDecoder architecture
   */
  private async _getOrCreateAudioDecoder(
    videoPath: string,
    url: string,
    sampleRate: number,
    channels: number
  ): Promise<WebviewAudioDecoder> {
    const cacheKey = videoPath;

    // Check existing decoder
    const existing = this._audioDecoderPool.get(cacheKey);
    if (existing) {
      existing.lastAccess = Date.now();
      return existing.decoder;
    }

    // Evict oldest if pool is full
    if (this._audioDecoderPool.size >= MAX_AUDIO_DECODER_POOL_SIZE) {
      this._evictOldestAudioDecoder();
    }

    // Create new unified audio decoder (MP4Demuxer + LibavPureAudioDecoder)
    const decoder = createWebviewAudioDecoder({
      source: url,
      sampleRate,
      channels,
    });

    try {
      await decoder.open();
    } catch (error) {
      console.error('[LocalMediaProcessor] Audio decoder open failed:', error);
      throw error;
    }

    this._audioDecoderPool.set(cacheKey, {
      decoder,
      lastAccess: Date.now(),
    });

    return decoder;
  }

  /**
   * Evict the oldest audio decoder from the pool
   */
  private _evictOldestAudioDecoder(): void {
    let oldest: { key: string; time: number } | null = null;

    for (const [key, entry] of this._audioDecoderPool.entries()) {
      if (!oldest || entry.lastAccess < oldest.time) {
        oldest = { key, time: entry.lastAccess };
      }
    }

    if (oldest) {
      const entry = this._audioDecoderPool.get(oldest.key);
      if (entry) {
        entry.decoder.dispose();
        this._audioDecoderPool.delete(oldest.key);
      }
    }
  }

  /**
   * Cleanup idle decoders
   */
  private _cleanupIdleDecoders(): void {
    const now = Date.now();

    // Cleanup video decoders
    for (const [key, entry] of this._decoderPool.entries()) {
      if (now - entry.lastAccess > DECODER_IDLE_TIMEOUT) {
        entry.decoder.close().catch(() => {});
        this._decoderPool.delete(key);
      }
    }

    // Cleanup audio decoders
    for (const [key, entry] of this._audioDecoderPool.entries()) {
      if (now - entry.lastAccess > DECODER_IDLE_TIMEOUT) {
        entry.decoder.dispose();
        this._audioDecoderPool.delete(key);
      }
    }
  }

  /**
   * Get file format from path
   */
  private _getFormat(path: string): string {
    const ext = path.split('.').pop()?.toLowerCase() ?? '';
    const formatMap: Record<string, string> = {
      mp4: 'mp4',
      m4v: 'mp4',
      mov: 'mov',
      webm: 'webm',
      mkv: 'mkv',
      avi: 'avi',
    };
    return formatMap[ext] ?? ext;
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a LocalMediaProcessor instance
 */
export function createLocalMediaProcessor(urlResolver: UrlResolver): LocalMediaProcessor {
  return new LocalMediaProcessor(urlResolver);
}
