/**
 * Worker Demuxer Pool
 *
 * Manages multiple MP4Demuxer instances for multi-track export.
 * Uses LRU eviction when pool is full.
 */

import { MP4Demuxer } from '../../../mediaEngine/demuxers/MP4Demuxer';
import type { DemuxedMediaInfo } from '../../../mediaEngine/demuxers/types';

// =============================================================================
// Types
// =============================================================================

export interface DemuxerPoolConfig {
  /** Maximum number of demuxers in pool */
  maxDemuxers: number;
}

interface DemuxerEntry {
  demuxer: MP4Demuxer;
  mediaUrl: string;
  lastUsed: number;
  mediaInfo: DemuxedMediaInfo | null;
}

// =============================================================================
// WorkerDemuxerPool
// =============================================================================

export class WorkerDemuxerPool {
  private _config: DemuxerPoolConfig;
  private _demuxers = new Map<string, DemuxerEntry>();
  private _initPromises = new Map<string, Promise<DemuxerEntry>>();

  constructor(config: DemuxerPoolConfig) {
    this._config = config;
  }

  // ===========================================================================
  // Public Methods
  // ===========================================================================

  /**
   * Get or create demuxer for media URL
   */
  async getDemuxer(mediaUrl: string): Promise<MP4Demuxer> {
    // Check if already exists
    const existing = this._demuxers.get(mediaUrl);
    if (existing) {
      existing.lastUsed = Date.now();
      return existing.demuxer;
    }

    // Check if initialization is in progress
    const pending = this._initPromises.get(mediaUrl);
    if (pending) {
      const entry = await pending;
      return entry.demuxer;
    }

    // Create new demuxer
    const initPromise = this._createDemuxer(mediaUrl);
    this._initPromises.set(mediaUrl, initPromise);

    try {
      const entry = await initPromise;
      return entry.demuxer;
    } finally {
      this._initPromises.delete(mediaUrl);
    }
  }

  /**
   * Get media info for URL (cached)
   */
  async getMediaInfo(mediaUrl: string): Promise<DemuxedMediaInfo | null> {
    const entry = this._demuxers.get(mediaUrl);
    if (entry) {
      return entry.mediaInfo;
    }

    // Initialize demuxer to get media info
    await this.getDemuxer(mediaUrl);
    return this._demuxers.get(mediaUrl)?.mediaInfo ?? null;
  }

  /**
   * Preload demuxer for URL
   */
  async preload(mediaUrl: string): Promise<void> {
    await this.getDemuxer(mediaUrl);
  }

  /**
   * Check if demuxer exists for URL
   */
  has(mediaUrl: string): boolean {
    return this._demuxers.has(mediaUrl);
  }

  /**
   * Get pool statistics
   */
  getStats(): { size: number; maxSize: number; urls: string[] } {
    return {
      size: this._demuxers.size,
      maxSize: this._config.maxDemuxers,
      urls: Array.from(this._demuxers.keys()),
    };
  }

  /**
   * Dispose all demuxers
   */
  dispose(): void {
    for (const entry of this._demuxers.values()) {
      entry.demuxer.dispose();
    }
    this._demuxers.clear();
    this._initPromises.clear();
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private async _createDemuxer(mediaUrl: string): Promise<DemuxerEntry> {
    // Evict if at capacity
    if (this._demuxers.size >= this._config.maxDemuxers) {
      this._evictLRU();
    }

    // Create and initialize demuxer
    const demuxer = new MP4Demuxer({ source: mediaUrl });
    const mediaInfo = await demuxer.initialize();

    const entry: DemuxerEntry = {
      demuxer,
      mediaUrl,
      lastUsed: Date.now(),
      mediaInfo,
    };

    this._demuxers.set(mediaUrl, entry);
    return entry;
  }

  private _evictLRU(): void {
    let oldest: DemuxerEntry | null = null;
    let oldestUrl: string | null = null;

    for (const [url, entry] of this._demuxers) {
      if (!oldest || entry.lastUsed < oldest.lastUsed) {
        oldest = entry;
        oldestUrl = url;
      }
    }

    if (oldest && oldestUrl) {
      oldest.demuxer.dispose();
      this._demuxers.delete(oldestUrl);
    }
  }
}
