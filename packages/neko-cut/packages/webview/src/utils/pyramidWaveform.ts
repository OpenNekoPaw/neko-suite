/**
 * PyramidWaveformGenerator - Multi-resolution waveform for large video files
 *
 * Architecture:
 *   L1 (Overview):   1 point per minute  - for 4GB video full-length display
 *   L2 (Navigation): 100 points per second - for normal editing operations
 *   L3 (Detail):     Original sample rate - on-demand decode for viewport
 *
 * Data flow:
 *   MP4Demuxer → getAudioSamplesAt() → LibavPureAudioDecoder → PCM → Waveform
 *
 * Key features:
 * - On-demand loading: only loads audio samples needed for current viewport
 * - Progressive refinement: starts with L1, refines to L2/L3 as user zooms
 * - Memory efficient: doesn't load entire video file
 * - Supports 4GB+ video files
 */

import { MP4Demuxer, createMP4Demuxer } from '../mediaEngine/demuxers/MP4Demuxer';
import {
  LibavPureAudioDecoder,
  createLibavPureAudioDecoder,
} from '../mediaEngine/libav/LibavPureAudioDecoder';
import type { AudioDescription } from '../mediaEngine/demuxers/types';
import { getMediaInfoService } from '../services/MediaInfoService';

// =============================================================================
// Types
// =============================================================================

/** Waveform resolution level */
export type WaveformLevel = 'L1' | 'L2' | 'L3';

/** Peak data point (min/max for accurate waveform rendering) */
export interface WaveformPeak {
  min: number;
  max: number;
}

/** Waveform data for a specific level */
export interface LevelWaveformData {
  level: WaveformLevel;
  /** Points per second for this level */
  pointsPerSecond: number;
  /** Peak data (min/max pairs) */
  peaks: WaveformPeak[];
  /** Start time in seconds */
  startTime: number;
  /** End time in seconds */
  endTime: number;
  /** Whether this level is complete */
  isComplete: boolean;
}

/** Pyramid waveform data structure */
export interface PyramidWaveformData {
  /** Video duration in seconds */
  duration: number;
  /** Audio sample rate */
  sampleRate: number;
  /** Number of audio channels */
  channelCount: number;
  /** L1 overview data (always complete after init) */
  l1: LevelWaveformData | null;
  /** L2 navigation data (loaded progressively) */
  l2: LevelWaveformData | null;
  /** L3 detail data (loaded on-demand for viewport) */
  l3: LevelWaveformData | null;
}

/** Viewport for on-demand loading */
export interface WaveformViewport {
  startTime: number;
  endTime: number;
  /** Pixels per second (determines required resolution) */
  pixelsPerSecond: number;
}

/** Progress callback */
export type WaveformProgressCallback = (progress: {
  level: WaveformLevel;
  percent: number;
  message: string;
}) => void;

// =============================================================================
// Constants
// =============================================================================

/** L1: 1 point per minute (overview for 4GB+ videos) */
const L1_POINTS_PER_SECOND = 1 / 60;

/** L2: 100 points per second (navigation level) */
const L2_POINTS_PER_SECOND = 100;

/** L3: 1000 points per second (detail level, ~44 samples per point at 44.1kHz) */
const L3_POINTS_PER_SECOND = 1000;

/** Chunk size for progressive loading (seconds) */
const CHUNK_DURATION_SECONDS = 10;

// =============================================================================
// PyramidWaveformGenerator
// =============================================================================

export class PyramidWaveformGenerator {
  private _demuxer: MP4Demuxer | null = null;
  private _decoder: LibavPureAudioDecoder | null = null;
  private _audioDescription: AudioDescription | null = null;
  private _duration = 0;
  private _sampleRate = 0;
  private _channelCount = 0;
  private _disposed = false;

  // Cached waveform data
  private _l1Data: LevelWaveformData | null = null;
  private _l2Data: Map<number, WaveformPeak[]> = new Map(); // chunk index -> peaks
  private _l3Data: Map<number, WaveformPeak[]> = new Map(); // chunk index -> peaks

  constructor() {}

  // ===========================================================================
  // Public Methods
  // ===========================================================================

  /**
   * Initialize the generator with a video source
   *
   * @param source Webview URI for the video
   * @param filePath Original file path for Extension Host reading
   */
  async initialize(source: string, filePath: string): Promise<PyramidWaveformData> {
    if (this._disposed) {
      throw new Error('Generator has been disposed');
    }

    console.log('[PyramidWaveform] Creating demuxer...');

    // Create demuxer
    this._demuxer = createMP4Demuxer({
      source,
      filePath,
    });

    // Initialize demuxer (loads moov, builds sample index)
    console.log('[PyramidWaveform] Initializing demuxer...');
    const mediaInfo = await this._demuxer.initialize();
    console.log('[PyramidWaveform] Demuxer initialized, duration:', mediaInfo.duration, 'audio:', !!mediaInfo.audio);

    if (!mediaInfo.audio) {
      throw new Error('No audio track found in video');
    }

    // For fragmented MP4, demuxer duration may be incomplete
    // Use MediaInfoService which handles mfra box parsing for accurate duration
    let duration = mediaInfo.duration;
    if (duration <= 0 || (mediaInfo.video?.sampleCount && mediaInfo.video.sampleCount < 1000 && duration < 30)) {
      console.log('[PyramidWaveform] Duration seems incomplete, trying MediaInfoService...');
      try {
        const accurateDuration = await getMediaInfoService().getDuration(filePath);
        if (accurateDuration > duration) {
          console.log('[PyramidWaveform] Using MediaInfoService duration:', accurateDuration);
          duration = accurateDuration;
        }
      } catch (e) {
        console.warn('[PyramidWaveform] MediaInfoService fallback failed:', e);
      }
    }

    this._duration = duration;
    this._audioDescription = this._demuxer.getAudioDescription();
    console.log('[PyramidWaveform] Audio description:', this._audioDescription?.codec, this._audioDescription?.sampleRate);

    if (!this._audioDescription) {
      throw new Error('Failed to get audio description');
    }

    this._sampleRate = this._audioDescription.sampleRate;
    this._channelCount = this._audioDescription.channelCount;

    // Create decoder
    console.log('[PyramidWaveform] Creating audio decoder for codec:', this._audioDescription.codec);
    this._decoder = createLibavPureAudioDecoder({
      codec: this._audioDescription.codec,
      sampleRate: this._sampleRate,
      channelCount: this._channelCount,
      codecDescription: this._audioDescription.description,
    });

    console.log('[PyramidWaveform] Opening audio decoder...');
    await this._decoder.open();
    console.log('[PyramidWaveform] Audio decoder opened successfully, final duration:', this._duration);

    return this._buildPyramidData();
  }

  /**
   * Generate L1 overview waveform (fast, for initial display)
   * Samples audio at regular intervals across the entire duration
   */
  async generateL1(onProgress?: WaveformProgressCallback): Promise<LevelWaveformData> {
    if (!this._demuxer || !this._decoder) {
      throw new Error('Generator not initialized');
    }

    const pointCount = Math.ceil(this._duration * L1_POINTS_PER_SECOND);
    const peaks: WaveformPeak[] = [];

    // Sample at regular intervals (1 per minute)
    const intervalSeconds = 60;

    for (let i = 0; i < pointCount; i++) {
      const time = i * intervalSeconds;

      if (time >= this._duration) break;

      try {
        // Load a small chunk of audio at this time
        const samples = await this._demuxer.getAudioSamplesAt(time, 0.5);

        if (samples.length > 0) {
          const pcm = await this._decoder.decode(samples);
          const peak = this._calculatePeak(pcm);
          peaks.push(peak);
        } else {
          peaks.push({ min: 0, max: 0 });
        }
      } catch {
        peaks.push({ min: 0, max: 0 });
      }

      onProgress?.({
        level: 'L1',
        percent: ((i + 1) / pointCount) * 100,
        message: `Generating overview: ${i + 1}/${pointCount}`,
      });
    }

    this._l1Data = {
      level: 'L1',
      pointsPerSecond: L1_POINTS_PER_SECOND,
      peaks,
      startTime: 0,
      endTime: this._duration,
      isComplete: true,
    };

    return this._l1Data;
  }

  /**
   * Generate L2 navigation waveform for a time range
   * 100 points per second - suitable for normal editing
   */
  async generateL2Range(
    startTime: number,
    endTime: number,
    onProgress?: WaveformProgressCallback
  ): Promise<LevelWaveformData> {
    if (!this._demuxer || !this._decoder) {
      throw new Error('Generator not initialized');
    }

    // Clamp to valid range
    startTime = Math.max(0, startTime);
    endTime = Math.min(this._duration, endTime);

    const duration = endTime - startTime;
    const peaks: WaveformPeak[] = [];

    // Process in chunks
    const chunkCount = Math.ceil(duration / CHUNK_DURATION_SECONDS);

    for (let chunkIdx = 0; chunkIdx < chunkCount; chunkIdx++) {
      const chunkStart = startTime + chunkIdx * CHUNK_DURATION_SECONDS;
      const chunkEnd = Math.min(chunkStart + CHUNK_DURATION_SECONDS, endTime);
      const chunkDuration = chunkEnd - chunkStart;

      // Check cache
      const cacheKey = Math.floor(chunkStart / CHUNK_DURATION_SECONDS);
      const cached = this._l2Data.get(cacheKey);

      if (cached) {
        peaks.push(...cached);
        continue;
      }

      // Load and decode audio for this chunk
      const samples = await this._demuxer.getAudioSamplesAt(chunkStart, chunkDuration);

      if (samples.length > 0) {
        const pcm = await this._decoder.decode(samples);
        const chunkPeaks = this._calculatePeaksFromPCM(
          pcm,
          chunkDuration,
          L2_POINTS_PER_SECOND
        );
        peaks.push(...chunkPeaks);

        // Cache
        this._l2Data.set(cacheKey, chunkPeaks);
      }

      onProgress?.({
        level: 'L2',
        percent: ((chunkIdx + 1) / chunkCount) * 100,
        message: `Generating navigation waveform: ${chunkIdx + 1}/${chunkCount}`,
      });
    }

    return {
      level: 'L2',
      pointsPerSecond: L2_POINTS_PER_SECOND,
      peaks,
      startTime,
      endTime,
      isComplete: true,
    };
  }

  /**
   * Generate L3 detail waveform for viewport (on-demand)
   * 1000 points per second - for zoomed-in editing
   */
  async generateL3ForViewport(viewport: WaveformViewport): Promise<LevelWaveformData> {
    if (!this._demuxer || !this._decoder) {
      throw new Error('Generator not initialized');
    }

    const { startTime, endTime } = viewport;
    const duration = endTime - startTime;

    // Only generate L3 if viewport is small enough (< 10 seconds)
    if (duration > 10) {
      // Fall back to L2 for larger viewports
      return this.generateL2Range(startTime, endTime);
    }

    const peaks: WaveformPeak[] = [];

    // Load and decode audio for viewport
    const samples = await this._demuxer.getAudioSamplesAt(startTime, duration);

    if (samples.length > 0) {
      const pcm = await this._decoder.decode(samples);
      const viewportPeaks = this._calculatePeaksFromPCM(
        pcm,
        duration,
        L3_POINTS_PER_SECOND
      );
      peaks.push(...viewportPeaks);
    }

    return {
      level: 'L3',
      pointsPerSecond: L3_POINTS_PER_SECOND,
      peaks,
      startTime,
      endTime,
      isComplete: true,
    };
  }

  /**
   * Get waveform data for a viewport, automatically selecting appropriate level
   */
  async getWaveformForViewport(viewport: WaveformViewport): Promise<LevelWaveformData> {
    const { startTime, endTime, pixelsPerSecond } = viewport;
    const duration = endTime - startTime;

    // Determine appropriate level based on zoom
    // If we have more than 1000 pixels per second, use L3
    // If we have more than 100 pixels per second, use L2
    // Otherwise use L1

    if (pixelsPerSecond >= 500 && duration <= 10) {
      return this.generateL3ForViewport(viewport);
    } else if (pixelsPerSecond >= 10) {
      return this.generateL2Range(startTime, endTime);
    } else {
      // Use L1 if available, otherwise generate it
      if (!this._l1Data) {
        await this.generateL1();
      }
      return this._l1Data!;
    }
  }

  /**
   * Get current pyramid data structure
   */
  getPyramidData(): PyramidWaveformData {
    return this._buildPyramidData();
  }

  /**
   * Clear cached data
   */
  clearCache(): void {
    this._l2Data.clear();
    this._l3Data.clear();
  }

  /**
   * Dispose resources
   */
  async dispose(): Promise<void> {
    this._disposed = true;

    if (this._decoder) {
      this._decoder.dispose();
      this._decoder = null;
    }

    if (this._demuxer) {
      this._demuxer.dispose();
      this._demuxer = null;
    }

    this._l1Data = null;
    this._l2Data.clear();
    this._l3Data.clear();
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Build pyramid data structure
   */
  private _buildPyramidData(): PyramidWaveformData {
    return {
      duration: this._duration,
      sampleRate: this._sampleRate,
      channelCount: this._channelCount,
      l1: this._l1Data,
      l2: null, // L2 is loaded progressively
      l3: null, // L3 is loaded on-demand
    };
  }

  /**
   * Calculate peak (min/max) from PCM data
   */
  private _calculatePeak(pcm: Float32Array): WaveformPeak {
    if (pcm.length === 0) {
      return { min: 0, max: 0 };
    }

    let min = Infinity;
    let max = -Infinity;

    for (let i = 0; i < pcm.length; i++) {
      const sample = pcm[i]!;
      if (sample < min) min = sample;
      if (sample > max) max = sample;
    }

    return { min, max };
  }

  /**
   * Calculate peaks from PCM data at specified resolution
   */
  private _calculatePeaksFromPCM(
    pcm: Float32Array,
    durationSeconds: number,
    pointsPerSecond: number
  ): WaveformPeak[] {
    const pointCount = Math.ceil(durationSeconds * pointsPerSecond);
    const samplesPerPoint = Math.floor(pcm.length / pointCount);
    const peaks: WaveformPeak[] = [];

    for (let i = 0; i < pointCount; i++) {
      const start = i * samplesPerPoint;
      const end = Math.min(start + samplesPerPoint, pcm.length);

      let min = Infinity;
      let max = -Infinity;

      for (let j = start; j < end; j++) {
        const sample = pcm[j]!;
        if (sample < min) min = sample;
        if (sample > max) max = sample;
      }

      if (min === Infinity) min = 0;
      if (max === -Infinity) max = 0;

      peaks.push({ min, max });
    }

    return peaks;
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a PyramidWaveformGenerator instance
 */
export function createPyramidWaveformGenerator(): PyramidWaveformGenerator {
  return new PyramidWaveformGenerator();
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Convert WaveformPeak[] to normalized number[] for rendering
 * Uses max absolute value for each peak
 */
export function peaksToNormalized(peaks: WaveformPeak[]): number[] {
  if (peaks.length === 0) return [];

  // Find global max for normalization
  let globalMax = 0;
  for (const peak of peaks) {
    const absMax = Math.max(Math.abs(peak.min), Math.abs(peak.max));
    if (absMax > globalMax) globalMax = absMax;
  }

  if (globalMax === 0) globalMax = 1;

  // Normalize
  return peaks.map((peak) => {
    const absMax = Math.max(Math.abs(peak.min), Math.abs(peak.max));
    return absMax / globalMax;
  });
}

/**
 * Resample peaks to target count
 */
export function resamplePeaks(peaks: WaveformPeak[], targetCount: number): WaveformPeak[] {
  if (peaks.length === 0 || targetCount <= 0) return [];
  if (peaks.length === targetCount) return peaks;

  const result: WaveformPeak[] = [];
  const ratio = peaks.length / targetCount;

  for (let i = 0; i < targetCount; i++) {
    const srcStart = Math.floor(i * ratio);
    const srcEnd = Math.min(Math.ceil((i + 1) * ratio), peaks.length);

    let min = Infinity;
    let max = -Infinity;

    for (let j = srcStart; j < srcEnd; j++) {
      const peak = peaks[j]!;
      if (peak.min < min) min = peak.min;
      if (peak.max > max) max = peak.max;
    }

    if (min === Infinity) min = 0;
    if (max === -Infinity) max = 0;

    result.push({ min, max });
  }

  return result;
}
