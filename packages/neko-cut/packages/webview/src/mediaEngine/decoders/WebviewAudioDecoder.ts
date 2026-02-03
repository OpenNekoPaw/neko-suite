/**
 * WebviewAudioDecoder - Unified audio decoder for Webview
 *
 * Integrates MP4Demuxer (demux) + LibavPureAudioDecoder (decode) to provide
 * a simple decodeSegment(time, duration) interface with segment caching.
 *
 * Architecture:
 *   MP4Demuxer → EncodedAudioSample[] → LibavPureAudioDecoder → AudioBuffer
 *     (demux)     (encoded samples)           (decode)          (playable)
 *
 * This unified architecture mirrors the video decoder path:
 *   MP4Demuxer → EncodedVideoChunk[] → WebCodecsVideoDecoder → VideoFrame
 *
 * Benefits:
 * - MP4Demuxer handles Range requests efficiently
 * - LibavPureAudioDecoder focuses on pure decoding
 * - Avoids "Invalid data found" errors from combined demux+decode
 */

import {
  MP4Demuxer,
  createMP4Demuxer,
  type DemuxedMediaInfo,
  type AudioDescription,
} from '../demuxers';
import {
  LibavPureAudioDecoder,
  createLibavPureAudioDecoder,
} from '../libav/LibavPureAudioDecoder';
import { createAudioBufferFromPCM } from '../libav/pcmUtils';

// =============================================================================
// Types
// =============================================================================

export interface WebviewAudioDecoderConfig {
  /** Audio source URL */
  source: string;
  /**
   * File path relative to .jvi file (for Extension Host file reading)
   * If provided, uses Extension Host for on-demand loading instead of fetch
   */
  filePath?: string;
  /** Target sample rate (default: 48000) */
  sampleRate?: number;
  /** Target channels (default: 2) */
  channels?: number;
  /** Enable segment caching (default: true) */
  enableCache?: boolean;
  /** Max cache size in bytes (default: 50MB) */
  maxCacheSize?: number;
}

interface DecodedAudioSegment {
  startTime: number;
  duration: number;
  pcmData: Float32Array;
  sampleRate: number;
  channels: number;
}

type DecoderState = 'idle' | 'initializing' | 'ready' | 'error' | 'disposed';

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_SAMPLE_RATE = 48000;
const DEFAULT_CHANNELS = 2;
const DEFAULT_MAX_CACHE_SIZE = 50 * 1024 * 1024; // 50MB

// =============================================================================
// WebviewAudioDecoder
// =============================================================================

export class WebviewAudioDecoder {
  private _config: Omit<Required<WebviewAudioDecoderConfig>, 'filePath'> & { filePath?: string };
  private _demuxer: MP4Demuxer | null = null;
  private _decoder: LibavPureAudioDecoder | null = null;
  private _state: DecoderState = 'idle';
  private _mediaInfo: DemuxedMediaInfo | null = null;
  private _audioDescription: AudioDescription | null = null;
  private _lastError: Error | null = null;

  // Segment cache
  private _segmentCache = new Map<string, DecodedAudioSegment>();
  private _cacheSize = 0;

  constructor(config: WebviewAudioDecoderConfig) {
    this._config = {
      source: config.source,
      filePath: config.filePath,
      sampleRate: config.sampleRate ?? DEFAULT_SAMPLE_RATE,
      channels: config.channels ?? DEFAULT_CHANNELS,
      enableCache: config.enableCache ?? true,
      maxCacheSize: config.maxCacheSize ?? DEFAULT_MAX_CACHE_SIZE,
    };
  }

  // ===========================================================================
  // Public Methods
  // ===========================================================================

  /**
   * Open the decoder and initialize
   */
  async open(): Promise<DemuxedMediaInfo> {
    if (this._state !== 'idle') {
      if (this._mediaInfo) return this._mediaInfo;
      throw new Error(`Cannot open: decoder is in ${this._state} state`);
    }

    this._state = 'initializing';

    try {
      // Step 1: Initialize demuxer (pass filePath for Extension Host optimization)
      this._demuxer = createMP4Demuxer({
        source: this._config.source,
        filePath: this._config.filePath,
      });
      this._mediaInfo = await this._demuxer.initialize();

      if (!this._mediaInfo.audio) {
        throw new Error('No audio track found in file');
      }

      // Step 2: Get audio description for decoder initialization
      this._audioDescription = this._demuxer.getAudioDescription();

      if (!this._audioDescription) {
        throw new Error('Failed to get audio description');
      }

      // Step 3: Create and initialize pure decoder
      this._decoder = createLibavPureAudioDecoder({
        codec: this._audioDescription.codec,
        sampleRate: this._audioDescription.sampleRate,
        channelCount: this._audioDescription.channelCount,
        codecDescription: this._audioDescription.description,
      });

      await this._decoder.open();

      this._state = 'ready';

      return this._mediaInfo;
    } catch (error) {
      this._state = 'error';
      this._lastError = error instanceof Error ? error : new Error(String(error));
      throw this._lastError;
    }
  }

  /**
   * Decode audio segment at specified time range
   *
   * @param startTime Start time in seconds
   * @param duration Duration in seconds
   * @returns AudioBuffer ready for playback
   */
  async decodeSegment(startTime: number, duration: number): Promise<AudioBuffer> {
    // Ensure decoder is open
    if (this._state === 'idle') {
      await this.open();
    }

    if (this._state === 'disposed') {
      throw new Error('Decoder has been disposed');
    }

    if (this._state === 'error') {
      throw this._lastError ?? new Error('Decoder is in error state');
    }

    if (!this._demuxer || !this._decoder) {
      throw new Error('Decoder not initialized');
    }

    // Check cache
    const cacheKey = this._getCacheKey(startTime, duration);
    if (this._config.enableCache) {
      const cached = this._segmentCache.get(cacheKey);
      if (cached) {
        return this._createAudioBuffer(cached);
      }
    }

    try {
      // Step 1: Get encoded samples from demuxer
      const samples = await this._demuxer.getAudioSamplesAt(startTime, duration);

      if (samples.length === 0) {
        return this._createEmptyAudioBuffer();
      }

      // Step 2: Decode samples to PCM
      const pcmData = await this._decoder.decode(samples);

      if (pcmData.length === 0) {
        return this._createEmptyAudioBuffer();
      }

      // Create segment
      const segment: DecodedAudioSegment = {
        startTime,
        duration,
        pcmData,
        sampleRate: this._config.sampleRate,
        channels: this._config.channels,
      };

      // Add to cache
      if (this._config.enableCache) {
        this._addToCache(cacheKey, segment);
      }

      return this._createAudioBuffer(segment);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Close and release resources
   */
  async close(): Promise<void> {
    if (this._state === 'disposed') return;

    this._demuxer?.dispose();
    this._demuxer = null;

    this._decoder?.dispose();
    this._decoder = null;

    this._segmentCache.clear();
    this._cacheSize = 0;

    this._mediaInfo = null;
    this._audioDescription = null;
    this._state = 'disposed';
  }

  /**
   * Dispose the decoder
   */
  dispose(): void {
    this.close().catch(() => {});
  }

  /**
   * Clear segment cache
   */
  clearCache(): void {
    this._segmentCache.clear();
    this._cacheSize = 0;
  }

  // ===========================================================================
  // Getters
  // ===========================================================================

  get state(): DecoderState {
    return this._state;
  }

  get mediaInfo(): DemuxedMediaInfo | null {
    return this._mediaInfo;
  }

  get lastError(): Error | null {
    return this._lastError;
  }

  get isOpen(): boolean {
    return this._state === 'ready';
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Generate cache key
   */
  private _getCacheKey(startTime: number, duration: number): string {
    // Round to avoid floating point issues
    const start = Math.round(startTime * 1000) / 1000;
    const dur = Math.round(duration * 1000) / 1000;
    return `${start}_${dur}`;
  }

  /**
   * Add segment to cache with eviction
   */
  private _addToCache(key: string, segment: DecodedAudioSegment): void {
    const segmentSize = segment.pcmData.byteLength;

    // Evict old entries if needed
    while (this._cacheSize + segmentSize > this._config.maxCacheSize && this._segmentCache.size > 0) {
      const firstKey = this._segmentCache.keys().next().value;
      if (firstKey) {
        const evicted = this._segmentCache.get(firstKey);
        if (evicted) {
          this._cacheSize -= evicted.pcmData.byteLength;
        }
        this._segmentCache.delete(firstKey);
      }
    }

    this._segmentCache.set(key, segment);
    this._cacheSize += segmentSize;
  }

  /**
   * Create AudioBuffer from decoded segment
   */
  private _createAudioBuffer(segment: DecodedAudioSegment): AudioBuffer {
    return createAudioBufferFromPCM(
      segment.pcmData,
      segment.sampleRate,
      segment.channels
    );
  }

  /**
   * Create an empty AudioBuffer
   */
  private _createEmptyAudioBuffer(): AudioBuffer {
    const ctx = new OfflineAudioContext(
      this._config.channels,
      1,
      this._config.sampleRate
    );
    return ctx.createBuffer(this._config.channels, 1, this._config.sampleRate);
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a WebviewAudioDecoder instance
 */
export function createWebviewAudioDecoder(config: WebviewAudioDecoderConfig): WebviewAudioDecoder {
  return new WebviewAudioDecoder(config);
}
