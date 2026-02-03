/**
 * Worker Decoder Pool
 *
 * Manages multiple WebCodecs VideoDecoder instances for multi-track export.
 * Uses LRU eviction when pool is full.
 */

import type { DemuxedMediaInfo } from '../../../mediaEngine/demuxers/types';

// =============================================================================
// Types
// =============================================================================

export interface DecoderPoolConfig {
  /** Maximum number of decoders in pool */
  maxDecoders: number;
}

interface DecoderEntry {
  decoder: VideoDecoder;
  mediaUrl: string;
  lastUsed: number;
  config: VideoDecoderConfig;
  pendingFrames: Map<number, { resolve: (frame: VideoFrame | null) => void; reject: (error: Error) => void }>;
  decodedFrames: Map<number, VideoFrame>;
}

// =============================================================================
// WorkerDecoderPool
// =============================================================================

export class WorkerDecoderPool {
  private _config: DecoderPoolConfig;
  private _decoders = new Map<string, DecoderEntry>();
  private _initPromises = new Map<string, Promise<DecoderEntry>>();

  constructor(config: DecoderPoolConfig) {
    this._config = config;
  }

  // ===========================================================================
  // Public Methods
  // ===========================================================================

  /**
   * Get or create decoder for media URL
   */
  async getDecoder(mediaUrl: string, mediaInfo: DemuxedMediaInfo): Promise<DecoderEntry> {
    // Check if already exists
    const existing = this._decoders.get(mediaUrl);
    if (existing) {
      existing.lastUsed = Date.now();
      return existing;
    }

    // Check if initialization is in progress
    const pending = this._initPromises.get(mediaUrl);
    if (pending) {
      return pending;
    }

    // Create new decoder
    const initPromise = this._createDecoder(mediaUrl, mediaInfo);
    this._initPromises.set(mediaUrl, initPromise);

    try {
      return await initPromise;
    } finally {
      this._initPromises.delete(mediaUrl);
    }
  }

  /**
   * Decode frame at specific timestamp
   */
  async decodeFrame(
    mediaUrl: string,
    mediaInfo: DemuxedMediaInfo,
    chunks: EncodedVideoChunk[],
    targetTimestamp: number
  ): Promise<VideoFrame | null> {
    const entry = await this.getDecoder(mediaUrl, mediaInfo);

    // Check if frame is already decoded
    const cached = entry.decodedFrames.get(targetTimestamp);
    if (cached) {
      // Clone frame since original might be closed
      return cached;
    }

    return new Promise((resolve, reject) => {
      // Register pending frame
      entry.pendingFrames.set(targetTimestamp, { resolve, reject });

      // Feed chunks to decoder
      for (const chunk of chunks) {
        try {
          entry.decoder.decode(chunk);
        } catch (error) {
          console.error('[WorkerDecoderPool] Decode error:', error);
        }
      }
    });
  }

  /**
   * Reset decoder for seeking
   */
  async resetDecoder(mediaUrl: string): Promise<void> {
    const entry = this._decoders.get(mediaUrl);
    if (entry) {
      await entry.decoder.flush();
      entry.decoder.reset();

      // Clear cached frames
      for (const frame of entry.decodedFrames.values()) {
        try { frame.close(); } catch { /* ignore */ }
      }
      entry.decodedFrames.clear();
      entry.pendingFrames.clear();
    }
  }

  /**
   * Check if decoder exists for URL
   */
  has(mediaUrl: string): boolean {
    return this._decoders.has(mediaUrl);
  }

  /**
   * Get pool statistics
   */
  getStats(): { size: number; maxSize: number; urls: string[] } {
    return {
      size: this._decoders.size,
      maxSize: this._config.maxDecoders,
      urls: Array.from(this._decoders.keys()),
    };
  }

  /**
   * Dispose all decoders
   */
  dispose(): void {
    for (const entry of this._decoders.values()) {
      try {
        entry.decoder.close();
      } catch { /* ignore */ }

      // Close cached frames
      for (const frame of entry.decodedFrames.values()) {
        try { frame.close(); } catch { /* ignore */ }
      }
    }
    this._decoders.clear();
    this._initPromises.clear();
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private async _createDecoder(mediaUrl: string, mediaInfo: DemuxedMediaInfo): Promise<DecoderEntry> {
    // Evict if at capacity
    if (this._decoders.size >= this._config.maxDecoders) {
      await this._evictLRU();
    }

    // Build decoder config
    const config: VideoDecoderConfig = {
      codec: mediaInfo.video?.codec ?? 'avc1.42E01E',
      codedWidth: mediaInfo.video?.codedWidth ?? 1920,
      codedHeight: mediaInfo.video?.codedHeight ?? 1080,
      description: mediaInfo.video?.description,
      hardwareAcceleration: 'prefer-hardware',
    };

    // Check codec support
    const support = await VideoDecoder.isConfigSupported(config);
    if (!support.supported) {
      throw new Error(`Video codec ${config.codec} not supported`);
    }

    const entry: DecoderEntry = {
      decoder: null!,
      mediaUrl,
      lastUsed: Date.now(),
      config,
      pendingFrames: new Map(),
      decodedFrames: new Map(),
    };

    // Create decoder with output handler
    entry.decoder = new VideoDecoder({
      output: (frame) => {
        this._handleDecodedFrame(entry, frame);
      },
      error: (error) => {
        console.error('[WorkerDecoderPool] Decoder error:', error);
        // Reject all pending frames
        for (const pending of entry.pendingFrames.values()) {
          pending.reject(error);
        }
        entry.pendingFrames.clear();
      },
    });

    entry.decoder.configure(config);
    this._decoders.set(mediaUrl, entry);

    return entry;
  }

  private _handleDecodedFrame(entry: DecoderEntry, frame: VideoFrame): void {
    const timestamp = frame.timestamp;

    // Check if anyone is waiting for this frame
    const pending = entry.pendingFrames.get(timestamp);
    if (pending) {
      pending.resolve(frame);
      entry.pendingFrames.delete(timestamp);
    } else {
      // Cache frame for later use
      entry.decodedFrames.set(timestamp, frame);

      // Limit cache size
      if (entry.decodedFrames.size > 30) {
        // Remove oldest frames
        const timestamps = Array.from(entry.decodedFrames.keys()).sort((a, b) => a - b);
        for (let i = 0; i < 10; i++) {
          const ts = timestamps[i];
          if (ts !== undefined) {
            const oldFrame = entry.decodedFrames.get(ts);
            if (oldFrame) {
              try { oldFrame.close(); } catch { /* ignore */ }
            }
            entry.decodedFrames.delete(ts);
          }
        }
      }
    }
  }

  private async _evictLRU(): Promise<void> {
    let oldest: DecoderEntry | null = null;
    let oldestUrl: string | null = null;

    for (const [url, entry] of this._decoders) {
      if (!oldest || entry.lastUsed < oldest.lastUsed) {
        oldest = entry;
        oldestUrl = url;
      }
    }

    if (oldest && oldestUrl) {
      try {
        await oldest.decoder.flush();
        oldest.decoder.close();
      } catch { /* ignore */ }

      // Close cached frames
      for (const frame of oldest.decodedFrames.values()) {
        try { frame.close(); } catch { /* ignore */ }
      }

      this._decoders.delete(oldestUrl);
    }
  }
}
