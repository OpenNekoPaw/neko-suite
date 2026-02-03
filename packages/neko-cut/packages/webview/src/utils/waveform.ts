/**
 * Audio waveform generation utilities
 *
 * Supports two modes:
 * - Basic mode: Uses PyramidWaveformGenerator (MP4Box.js + libav.js)
 *   - On-demand loading, supports 4GB+ files
 *   - Multi-resolution: L1 (overview), L2 (navigation), L3 (detail)
 *
 * - Compat mode: Uses Web Audio API with ffmpeg fallback
 *   - Loads first 10MB for large files
 *   - Falls back to ffmpeg for unsupported formats
 */

import { getCachedFileUri, decodeAudioViaExtension, readFileRangeCached } from '../hooks/useVSCodeMessaging';
import {
  createPyramidWaveformGenerator,
  peaksToNormalized,
  type PyramidWaveformGenerator,
  type WaveformViewport,
} from './pyramidWaveform';

export interface WaveformData {
  peaks: number[]; // Normalized peak values (0-1)
  duration: number;
  sampleRate: number;
}

// Re-export WaveformViewport for external use
export type { WaveformViewport } from './pyramidWaveform';

// Cache for generated waveforms
const waveformCache = new Map<string, WaveformData>();

// Pending requests to avoid duplicate fetches
const pendingRequests = new Map<string, Promise<WaveformData>>();

// Pyramid waveform generators cache (for basic mode)
const pyramidGenerators = new Map<string, PyramidWaveformGenerator>();

// 波形生成的最大加载大小 (10MB) - 对于更大的文件只分析前 10MB
const MAX_WAVEFORM_LOAD_SIZE = 10 * 1024 * 1024;

// 完全跳过的文件大小阈值 (500MB) - 超大文件使用占位波形
const SKIP_WAVEFORM_SIZE = 500 * 1024 * 1024;

/**
 * Generate waveform data from an audio/video source
 *
 * @param src Original file path
 * @param options Generation options
 * @param options.samples Number of peaks to generate
 * @param options.channel Audio channel to analyze (0 = left, 1 = right)
 * @param options.mode 'basic' for MP4Box+libav, 'compat' for Web Audio+ffmpeg
 */
export async function generateWaveform(
  src: string,
  options: {
    samples?: number; // Number of peaks to generate
    channel?: number; // Audio channel to analyze (0 = left, 1 = right)
    mode?: 'basic' | 'compat'; // Waveform generation mode
  } = {}
): Promise<WaveformData> {
  const { samples = 200, channel = 0, mode = 'basic' } = options;

  // Check cache
  const cacheKey = `${src}-${samples}-${channel}-${mode}`;
  const cached = waveformCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Check if there's already a pending request
  const pending = pendingRequests.get(cacheKey);
  if (pending) {
    return pending;
  }

  // Use basic mode (MP4Box + libav) for on-demand loading
  if (mode === 'basic') {
    const requestPromise = generateWaveformBasicMode(src, cacheKey, samples);
    pendingRequests.set(cacheKey, requestPromise);

    try {
      const result = await requestPromise;
      return result;
    } finally {
      pendingRequests.delete(cacheKey);
    }
  }

  // Compat mode: use Web Audio API with ffmpeg fallback
  // Get webview URI for the source
  const webviewUri = getCachedFileUri(src);
  if (!webviewUri) {
    console.warn('[Waveform] No webview URI available for:', src);
    return {
      peaks: generatePlaceholderPeaks(samples),
      duration: 0,
      sampleRate: 44100,
    };
  }

  const requestPromise = generateWaveformInternal(src, webviewUri, cacheKey, samples, channel);
  pendingRequests.set(cacheKey, requestPromise);

  try {
    const result = await requestPromise;
    return result;
  } finally {
    pendingRequests.delete(cacheKey);
  }
}

/**
 * Basic mode waveform generation using PyramidWaveformGenerator
 * Uses MP4Box.js for demuxing + libav.js for decoding
 * Supports on-demand loading for 4GB+ files
 */
async function generateWaveformBasicMode(
  originalPath: string,
  cacheKey: string,
  samples: number
): Promise<WaveformData> {
  try {
    // Get or create pyramid generator for this file
    let generator = pyramidGenerators.get(originalPath);

    if (!generator) {
      generator = createPyramidWaveformGenerator();

      // Get webview URI for the source
      const webviewUri = getCachedFileUri(originalPath);
      if (!webviewUri) {
        console.warn('[Waveform Basic] No webview URI available for:', originalPath);
        return {
          peaks: generatePlaceholderPeaks(samples),
          duration: 0,
          sampleRate: 44100,
        };
      }

      // Initialize generator
      console.log('[Waveform Basic] Initializing PyramidWaveformGenerator for:', originalPath);
      await generator.initialize(webviewUri, originalPath);
      pyramidGenerators.set(originalPath, generator);
    }

    // Generate L1 overview first (fast)
    console.log('[Waveform Basic] Generating L1 overview...');
    const l1Data = await generator.generateL1((progress) => {
      console.log(`[Waveform Basic] L1 progress: ${progress.percent.toFixed(1)}%`);
    });

    // Convert peaks to normalized array
    const normalizedPeaks = peaksToNormalized(l1Data.peaks);

    // Resample to requested sample count
    const resampledPeaks = resamplePeaksArray(normalizedPeaks, samples);

    const pyramidData = generator.getPyramidData();

    const waveformData: WaveformData = {
      peaks: resampledPeaks,
      duration: pyramidData.duration,
      sampleRate: pyramidData.sampleRate,
    };

    // Cache the result
    waveformCache.set(cacheKey, waveformData);

    console.log('[Waveform Basic] Generation complete:', {
      duration: pyramidData.duration,
      sampleRate: pyramidData.sampleRate,
      peakCount: resampledPeaks.length,
    });

    return waveformData;
  } catch (error) {
    console.error('[Waveform Basic] Failed to generate waveform:', error);
    // Return placeholder data
    return {
      peaks: generatePlaceholderPeaks(samples),
      duration: 0,
      sampleRate: 44100,
    };
  }
}

/**
 * Generate waveform for a specific viewport (basic mode only)
 * Uses appropriate resolution level based on zoom
 */
export async function generateWaveformForViewport(
  src: string,
  viewport: WaveformViewport
): Promise<WaveformData> {
  // Get or create pyramid generator
  let generator = pyramidGenerators.get(src);

  if (!generator) {
    // Initialize first
    await generateWaveform(src, { mode: 'basic' });
    generator = pyramidGenerators.get(src);
  }

  if (!generator) {
    return {
      peaks: generatePlaceholderPeaks(100),
      duration: 0,
      sampleRate: 44100,
    };
  }

  // Get waveform for viewport
  const levelData = await generator.getWaveformForViewport(viewport);
  const normalizedPeaks = peaksToNormalized(levelData.peaks);

  const pyramidData = generator.getPyramidData();

  return {
    peaks: normalizedPeaks,
    duration: pyramidData.duration,
    sampleRate: pyramidData.sampleRate,
  };
}

/**
 * Resample peaks array to target size
 */
function resamplePeaksArray(peaks: number[], targetSize: number): number[] {
  if (peaks.length === 0) return generatePlaceholderPeaks(targetSize);
  if (peaks.length === targetSize) return peaks;

  const result: number[] = [];
  const ratio = peaks.length / targetSize;

  for (let i = 0; i < targetSize; i++) {
    const srcStart = Math.floor(i * ratio);
    const srcEnd = Math.min(Math.ceil((i + 1) * ratio), peaks.length);

    let max = 0;
    for (let j = srcStart; j < srcEnd; j++) {
      const val = peaks[j];
      if (val !== undefined && val > max) max = val;
    }
    result.push(max);
  }

  return result;
}

/**
 * Internal waveform generation logic (compat mode)
 * Optimized to avoid loading large files entirely:
 * - Files > 500MB: Use placeholder waveform
 * - Files > 10MB: Use Range request to load only first 10MB
 * - AAC and other unsupported formats: Fallback to ffmpeg via Extension Host
 */
async function generateWaveformInternal(
  originalPath: string,
  uri: string,
  cacheKey: string,
  samples: number,
  channel: number
): Promise<WaveformData> {
  try {
    // Step 1: Check file size with HEAD request
    let fileSize: number | null = null;
    try {
      const headResponse = await fetch(uri, { method: 'HEAD' });
      if (headResponse.ok) {
        const contentLength = headResponse.headers.get('content-length');
        if (contentLength) {
          fileSize = parseInt(contentLength, 10);
        }
      }
    } catch {
      // HEAD request failed, continue without size info
      console.warn('[Waveform] HEAD request failed, proceeding without size check');
    }

    // Step 2: For very large files (> 500MB), use placeholder
    if (fileSize && fileSize > SKIP_WAVEFORM_SIZE) {
      console.warn(`[Waveform] File too large (${(fileSize / 1024 / 1024).toFixed(1)}MB), using placeholder`);
      return {
        peaks: generatePlaceholderPeaks(samples),
        duration: 0,
        sampleRate: 44100,
      };
    }

    // Step 3: Fetch audio data using Extension Host for Range support
    // VSCode webview URIs don't support HTTP Range requests, so we use
    // readFileRangeCached() which reads via Extension Host's Node.js fs API
    let arrayBuffer: ArrayBuffer;
    let isPartialLoad = false;

    try {
      if (fileSize && fileSize > MAX_WAVEFORM_LOAD_SIZE) {
        // Large file: load only first 10MB via Extension Host
        console.log(`[Waveform] Large file (${(fileSize / 1024 / 1024).toFixed(1)}MB), loading first ${MAX_WAVEFORM_LOAD_SIZE / 1024 / 1024}MB via Extension Host`);
        arrayBuffer = await readFileRangeCached(originalPath, 0, MAX_WAVEFORM_LOAD_SIZE - 1);
        isPartialLoad = true;
      } else {
        // Small file or unknown size: load entirely via Extension Host
        // Use a reasonable max size (100MB) if size is unknown
        const loadSize = fileSize || 100 * 1024 * 1024;
        console.log(`[Waveform] Loading file via Extension Host: ${originalPath}, size=${loadSize}`);
        arrayBuffer = await readFileRangeCached(originalPath, 0, loadSize - 1);
      }
    } catch (loadError) {
      console.warn('[Waveform] Extension Host load failed, falling back to fetch:', loadError);
      // Fallback to fetch (may not support Range, but try anyway)
      if (fileSize && fileSize > MAX_WAVEFORM_LOAD_SIZE) {
        const rangeResponse = await fetch(uri, {
          headers: { 'Range': `bytes=0-${MAX_WAVEFORM_LOAD_SIZE - 1}` },
        });
        if (!rangeResponse.ok && rangeResponse.status !== 206) {
          throw new Error(`Failed to fetch audio with Range: ${rangeResponse.status}`);
        }
        arrayBuffer = await rangeResponse.arrayBuffer();
        isPartialLoad = true;
      } else {
        const response = await fetch(uri);
        if (!response.ok) {
          throw new Error(`Failed to fetch audio: ${response.status}`);
        }
        arrayBuffer = await response.arrayBuffer();
      }
    }

    // Step 4: Decode audio data
    const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();

    let audioBuffer: AudioBuffer;
    try {
      audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    } catch (decodeError) {
      // Partial load or video file may fail to decode
      // Try ffmpeg fallback to extract audio track directly
      console.warn('[Waveform] Web Audio decode failed, trying ffmpeg fallback:', decodeError);

      try {
        // Request Extension Host to extract audio using ffmpeg
        // For large files, only extract first 30 seconds for waveform preview
        const extractDuration = isPartialLoad ? 30 : 0; // 0 = full file
        const wavBuffer = await decodeAudioViaExtension(originalPath, extractDuration);

        // Decode the WAV data (WAV/PCM is always supported)
        audioBuffer = await audioContext.decodeAudioData(wavBuffer);
      } catch (fallbackError) {
        console.error('[Waveform] FFmpeg fallback failed:', fallbackError);
        await audioContext.close();
        return {
          peaks: generatePlaceholderPeaks(samples),
          duration: 0,
          sampleRate: 44100,
        };
      }
    }

    // Get channel data
    const channelData = audioBuffer.getChannelData(Math.min(channel, audioBuffer.numberOfChannels - 1));

    // Calculate peaks
    const peaks = calculatePeaks(channelData, samples);

    // For partial loads, estimate total duration based on file size ratio
    let estimatedDuration = audioBuffer.duration;
    if (isPartialLoad && fileSize) {
      const loadedRatio = MAX_WAVEFORM_LOAD_SIZE / fileSize;
      estimatedDuration = audioBuffer.duration / loadedRatio;
    }

    const waveformData: WaveformData = {
      peaks,
      duration: estimatedDuration,
      sampleRate: audioBuffer.sampleRate,
    };

    // Cache the result
    waveformCache.set(cacheKey, waveformData);

    // Clean up
    await audioContext.close();

    return waveformData;
  } catch (error) {
    console.error('[Waveform] Failed to generate waveform:', error);
    // Return placeholder data
    return {
      peaks: generatePlaceholderPeaks(samples),
      duration: 0,
      sampleRate: 44100,
    };
  }
}

/**
 * Calculate peak values from audio samples
 */
function calculatePeaks(channelData: Float32Array, numPeaks: number): number[] {
  const blockSize = Math.floor(channelData.length / numPeaks);
  const peaks: number[] = [];

  for (let i = 0; i < numPeaks; i++) {
    const start = i * blockSize;
    const end = Math.min(start + blockSize, channelData.length);

    let max = 0;
    for (let j = start; j < end; j++) {
      const abs = Math.abs(channelData[j]);
      if (abs > max) {
        max = abs;
      }
    }

    peaks.push(max);
  }

  // Normalize peaks to 0-1 range
  const maxPeak = Math.max(...peaks, 0.001);
  return peaks.map(p => p / maxPeak);
}

/**
 * Generate placeholder peaks for when audio can't be loaded
 */
function generatePlaceholderPeaks(count: number): number[] {
  return Array.from({ length: count }, (_, i) => {
    // Generate a pseudo-random but smooth wave pattern
    const t = i / count;
    const wave1 = Math.sin(t * Math.PI * 4) * 0.3;
    const wave2 = Math.sin(t * Math.PI * 8) * 0.2;
    const wave3 = Math.sin(t * Math.PI * 16) * 0.1;
    return Math.max(0.1, Math.min(1, 0.5 + wave1 + wave2 + wave3));
  });
}

/**
 * Generate waveform for a specific time range
 */
export async function generateWaveformRange(
  src: string,
  startTime: number,
  endTime: number,
  samples: number = 100
): Promise<number[]> {
  const fullWaveform = await generateWaveform(src, { samples: 1000 });

  if (fullWaveform.duration === 0) {
    return generatePlaceholderPeaks(samples);
  }

  // Calculate which portion of the full waveform to extract
  const startRatio = startTime / fullWaveform.duration;
  const endRatio = endTime / fullWaveform.duration;

  const startIndex = Math.floor(startRatio * fullWaveform.peaks.length);
  const endIndex = Math.ceil(endRatio * fullWaveform.peaks.length);

  // Extract and resample
  const extracted = fullWaveform.peaks.slice(startIndex, endIndex);

  if (extracted.length === 0) {
    return generatePlaceholderPeaks(samples);
  }

  // Resample to desired number of samples
  return resamplePeaks(extracted, samples);
}

/**
 * Resample peaks array to a different size
 */
function resamplePeaks(peaks: number[], targetSize: number): number[] {
  if (peaks.length === targetSize) {
    return peaks;
  }

  const result: number[] = [];
  const ratio = peaks.length / targetSize;

  for (let i = 0; i < targetSize; i++) {
    const srcIndex = i * ratio;
    const srcIndexFloor = Math.floor(srcIndex);
    const srcIndexCeil = Math.min(srcIndexFloor + 1, peaks.length - 1);
    const t = srcIndex - srcIndexFloor;

    // Linear interpolation
    result.push(peaks[srcIndexFloor] * (1 - t) + peaks[srcIndexCeil] * t);
  }

  return result;
}

/**
 * Clear waveform cache
 */
export function clearWaveformCache(): void {
  waveformCache.clear();

  // Dispose all pyramid generators
  for (const generator of pyramidGenerators.values()) {
    generator.dispose().catch(() => {});
  }
  pyramidGenerators.clear();
}

/**
 * Clear waveform cache for a specific file
 */
export function clearWaveformCacheForFile(src: string): void {
  // Clear from waveform cache
  for (const key of waveformCache.keys()) {
    if (key.startsWith(src)) {
      waveformCache.delete(key);
    }
  }

  // Dispose pyramid generator
  const generator = pyramidGenerators.get(src);
  if (generator) {
    generator.dispose().catch(() => {});
    pyramidGenerators.delete(src);
  }
}

/**
 * Get cache statistics
 */
export function getWaveformCacheStats(): { size: number; keys: string[] } {
  return {
    size: waveformCache.size,
    keys: Array.from(waveformCache.keys()),
  };
}
