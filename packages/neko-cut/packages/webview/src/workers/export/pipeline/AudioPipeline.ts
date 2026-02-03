/**
 * Audio Pipeline
 *
 * Handles audio processing: demux → decode → mix → encode
 * Uses libav.js for audio decoding and encoding.
 */

import type {
  MultiTrackExportConfig,
  SerializedProjectData,
  SerializedElement,
} from '../protocol/messages';
import { WorkerDemuxerPool } from '../media/WorkerDemuxerPool';
import { WorkerAudioMixer, type AudioTrackInput } from '../media/WorkerAudioMixer';

// =============================================================================
// Types
// =============================================================================

export interface AudioPipelineConfig {
  maxDemuxers: number;
}

export interface AudioPipelineStats {
  // Timing (ms)
  demuxTime: number;
  decodeTime: number;
  mixTime: number;
  encodeTime: number;

  // Audio statistics
  chunksProcessed: number;
  samplesProcessed: number;
  totalDuration: number;

  // Cache statistics
  cacheHits: number;
  cacheMisses: number;

  // Mix statistics
  tracksActive: number;
  peakAmplitude: number;
  clippingEvents: number;
}

interface DecodedAudioCache {
  elementId: string;
  pcm: Float32Array;
  sampleRate: number;
  channels: number;
}

// =============================================================================
// AudioPipeline
// =============================================================================

export class AudioPipeline {
  private _exportConfig: MultiTrackExportConfig | null = null;
  private _project: SerializedProjectData | null = null;

  private _demuxerPool: WorkerDemuxerPool;
  private _mixer: WorkerAudioMixer;

  // Audio cache (decoded PCM for each element)
  private _audioCache = new Map<string, DecodedAudioCache>();

  private _stats: AudioPipelineStats = {
    demuxTime: 0,
    decodeTime: 0,
    mixTime: 0,
    encodeTime: 0,
    chunksProcessed: 0,
    samplesProcessed: 0,
    totalDuration: 0,
    cacheHits: 0,
    cacheMisses: 0,
    tracksActive: 0,
    peakAmplitude: 0,
    clippingEvents: 0,
  };

  constructor(config: AudioPipelineConfig) {
    this._demuxerPool = new WorkerDemuxerPool({ maxDemuxers: config.maxDemuxers });
    this._mixer = new WorkerAudioMixer();
  }

  // ===========================================================================
  // Initialization
  // ===========================================================================

  /**
   * Initialize audio pipeline
   */
  async initialize(
    config: MultiTrackExportConfig,
    project: SerializedProjectData
  ): Promise<void> {
    this._exportConfig = config;
    this._project = project;

    // Initialize mixer
    this._mixer.initialize({
      sampleRate: config.sampleRate,
      channels: config.channels,
    });

    // Preload demuxers for all audio elements
    const mediaUrls = new Set<string>();
    for (const track of project.tracks) {
      for (const element of track.elements) {
        if (element.mediaUrl && element.hasAudio) {
          mediaUrls.add(element.mediaUrl);
        }
      }
    }

    // Preload in parallel
    const preloadPromises = Array.from(mediaUrls).map(url =>
      this._demuxerPool.preload(url).catch(err => {
        console.warn(`[AudioPipeline] Failed to preload ${url}:`, err);
      })
    );
    await Promise.all(preloadPromises);
  }

  // ===========================================================================
  // Audio Processing
  // ===========================================================================

  /**
   * Process audio for a time range
   * Returns mixed PCM data ready for encoding
   */
  async processAudioChunk(startTime: number, duration: number): Promise<Float32Array> {
    if (!this._project || !this._exportConfig) {
      throw new Error('Pipeline not initialized');
    }

    // Get audio elements that overlap with this time range
    const audioElements = this._getAudioElements(startTime, duration);

    // Decode audio for each element (if not cached)
    const tracks: AudioTrackInput[] = [];

    for (const element of audioElements) {
      const decoded = await this._getDecodedAudio(element);
      if (!decoded) continue;

      tracks.push({
        id: element.id,
        pcm: decoded.pcm,
        sourceSampleRate: decoded.sampleRate,
        sourceChannels: decoded.channels,
        timelineStart: element.startTime,
        duration: element.duration,
        mediaOffset: element.mediaOffset,
        params: element.audio ?? {
          volume: 1,
          muted: false,
          fadeIn: 0,
          fadeOut: 0,
        },
      });
    }

    // Mix all tracks
    const mixStart = performance.now();
    const mixed = this._mixer.mix(tracks, startTime, duration);
    this._stats.mixTime += performance.now() - mixStart;

    return mixed;
  }

  /**
   * Get all audio elements that overlap with time range
   */
  private _getAudioElements(startTime: number, duration: number): SerializedElement[] {
    if (!this._project) return [];

    const endTime = startTime + duration;
    const elements: SerializedElement[] = [];

    for (const track of this._project.tracks) {
      for (const element of track.elements) {
        if (!element.hasAudio || !element.mediaUrl) continue;

        const elementEnd = element.startTime + element.duration;

        // Check overlap
        if (element.startTime < endTime && elementEnd > startTime) {
          elements.push(element);
        }
      }
    }

    return elements;
  }

  /**
   * Get decoded audio for element (from cache or decode)
   */
  private async _getDecodedAudio(element: SerializedElement): Promise<DecodedAudioCache | null> {
    // Check cache
    const cached = this._audioCache.get(element.id);
    if (cached) {
      return cached;
    }

    // Decode audio
    if (!element.mediaUrl) return null;

    try {
      const decoded = await this._decodeElementAudio(element);
      if (decoded) {
        this._audioCache.set(element.id, decoded);
      }
      return decoded;
    } catch (error) {
      console.error(`[AudioPipeline] Failed to decode audio for ${element.id}:`, error);
      return null;
    }
  }

  /**
   * Decode audio for element using libav.js
   * Note: This is a simplified implementation. Full implementation would use
   * LibavPureAudioDecoder for proper audio decoding.
   */
  private async _decodeElementAudio(element: SerializedElement): Promise<DecodedAudioCache | null> {
    if (!element.mediaUrl || !this._exportConfig) return null;

    const demuxStart = performance.now();

    // Get demuxer
    const demuxer = await this._demuxerPool.getDemuxer(element.mediaUrl);
    const mediaInfo = await this._demuxerPool.getMediaInfo(element.mediaUrl);

    if (!mediaInfo?.audio) {
      return null;
    }

    // Get audio samples
    const samples = await demuxer.getAudioSamplesAt(
      element.mediaOffset,
      element.mediaDuration
    );

    this._stats.demuxTime += performance.now() - demuxStart;

    if (samples.length === 0) {
      return null;
    }

    // TODO: Use LibavPureAudioDecoder for proper decoding
    // For now, return placeholder
    console.warn(`[AudioPipeline] Audio decoding not fully implemented for ${element.id}`);

    // Create silent audio as placeholder
    const sampleRate = this._exportConfig.sampleRate;
    const channels = this._exportConfig.channels;
    const totalSamples = Math.ceil(element.mediaDuration * sampleRate);
    const pcm = new Float32Array(totalSamples * channels);

    return {
      elementId: element.id,
      pcm,
      sampleRate,
      channels,
    };
  }

  // ===========================================================================
  // Statistics
  // ===========================================================================

  /**
   * Get pipeline statistics
   */
  getStats(): AudioPipelineStats {
    return { ...this._stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this._stats = {
      demuxTime: 0,
      decodeTime: 0,
      mixTime: 0,
      encodeTime: 0,
      chunksProcessed: 0,
      samplesProcessed: 0,
      totalDuration: 0,
      cacheHits: 0,
      cacheMisses: 0,
      tracksActive: 0,
      peakAmplitude: 0,
      clippingEvents: 0,
    };
  }

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  /**
   * Clear audio cache
   */
  clearCache(): void {
    this._audioCache.clear();
  }

  /**
   * Dispose pipeline resources
   */
  dispose(): void {
    this._demuxerPool.dispose();
    this._mixer.dispose();
    this._audioCache.clear();
  }
}
