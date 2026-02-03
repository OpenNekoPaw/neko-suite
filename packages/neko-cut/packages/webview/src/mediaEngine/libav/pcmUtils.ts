/**
 * PCM Utility Functions for Audio Processing
 *
 * Shared utilities for extracting and processing PCM data
 * from various audio frame formats.
 */

import type { Frame } from 'libav.js';

// =============================================================================
// Constants - Sample Format IDs
// =============================================================================

// Interleaved formats
export const AV_SAMPLE_FMT_S16 = 1;
export const AV_SAMPLE_FMT_FLT = 3;

// Planar formats
export const AV_SAMPLE_FMT_S16P = 6;
export const AV_SAMPLE_FMT_S32P = 7;
export const AV_SAMPLE_FMT_FLTP = 8;

// =============================================================================
// PCM Extraction
// =============================================================================

/**
 * Extract PCM data from a decoded audio frame
 *
 * Handles various sample formats:
 * - fltp (planar float) - most common for AAC
 * - flt (interleaved float)
 * - s16p (planar int16)
 * - s16 (interleaved int16)
 * - s32p (planar int32)
 *
 * @param frame Decoded audio frame from libav.js
 * @param targetChannels Target number of channels (used if frame doesn't specify)
 * @returns Float32Array with interleaved PCM data
 */
export function extractPCMFromFrame(
  frame: Frame,
  targetChannels = 2
): Float32Array {
  const format = frame.format;
  const channels = frame.channels ?? targetChannels;
  const nbSamples = frame.nb_samples ?? 0;
  const data = frame.data;

  if (!data || (Array.isArray(data) && data.length === 0)) {
    return new Float32Array(0);
  }

  // Planar float (fltp) - most common for AAC
  if (format === AV_SAMPLE_FMT_FLTP) {
    const result = new Float32Array(nbSamples * channels);
    const dataArray = data as Float32Array[];
    for (let ch = 0; ch < Math.min(channels, dataArray.length); ch++) {
      const channelData = dataArray[ch];
      if (channelData) {
        for (let i = 0; i < nbSamples; i++) {
          result[i * channels + ch] = channelData[i] ?? 0;
        }
      }
    }
    return result;
  }

  // Interleaved float (flt)
  if (format === AV_SAMPLE_FMT_FLT) {
    return new Float32Array(data as ArrayBuffer);
  }

  // Planar S16 (s16p)
  if (format === AV_SAMPLE_FMT_S16P) {
    const result = new Float32Array(nbSamples * channels);
    const dataArray = data as Int16Array[];
    for (let ch = 0; ch < Math.min(channels, dataArray.length); ch++) {
      const channelData = dataArray[ch];
      if (channelData) {
        for (let i = 0; i < nbSamples; i++) {
          result[i * channels + ch] = (channelData[i] ?? 0) / 32768;
        }
      }
    }
    return result;
  }

  // Interleaved S16 (s16)
  if (format === AV_SAMPLE_FMT_S16) {
    const s16Data = new Int16Array(data as ArrayBuffer);
    const result = new Float32Array(s16Data.length);
    for (let i = 0; i < s16Data.length; i++) {
      result[i] = (s16Data[i] ?? 0) / 32768;
    }
    return result;
  }

  // Planar S32 (s32p)
  if (format === AV_SAMPLE_FMT_S32P) {
    const result = new Float32Array(nbSamples * channels);
    const dataArray = data as Int32Array[];
    for (let ch = 0; ch < Math.min(channels, dataArray.length); ch++) {
      const channelData = dataArray[ch];
      if (channelData) {
        for (let i = 0; i < nbSamples; i++) {
          result[i * channels + ch] = (channelData[i] ?? 0) / 2147483648;
        }
      }
    }
    return result;
  }

  console.warn('[pcmUtils] Unknown sample format:', format);
  return new Float32Array(0);
}

// =============================================================================
// Sample Merging
// =============================================================================

/**
 * Merge multiple PCM sample arrays into one
 *
 * @param samples Array of Float32Array PCM samples
 * @returns Single merged Float32Array
 */
export function mergeSamples(samples: Float32Array[]): Float32Array {
  if (samples.length === 0) {
    return new Float32Array(0);
  }

  if (samples.length === 1) {
    return samples[0]!;
  }

  const totalLength = samples.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Float32Array(totalLength);

  let offset = 0;
  for (const sample of samples) {
    result.set(sample, offset);
    offset += sample.length;
  }

  return result;
}

// =============================================================================
// AudioBuffer Creation
// =============================================================================

/**
 * Create an AudioBuffer from interleaved PCM data
 *
 * @param pcmData Interleaved PCM data (Float32Array)
 * @param sampleRate Sample rate in Hz
 * @param channels Number of channels
 * @returns AudioBuffer ready for playback
 */
export function createAudioBufferFromPCM(
  pcmData: Float32Array,
  sampleRate: number,
  channels: number
): AudioBuffer {
  const samplesPerChannel = Math.floor(pcmData.length / channels);

  if (samplesPerChannel === 0) {
    // Return minimal buffer
    const ctx = new OfflineAudioContext(channels, 1, sampleRate);
    return ctx.createBuffer(channels, 1, sampleRate);
  }

  const audioContext = new OfflineAudioContext(channels, samplesPerChannel, sampleRate);
  const audioBuffer = audioContext.createBuffer(channels, samplesPerChannel, sampleRate);

  // De-interleave PCM data to separate channels
  for (let ch = 0; ch < channels; ch++) {
    const channelData = audioBuffer.getChannelData(ch);
    for (let i = 0; i < samplesPerChannel; i++) {
      channelData[i] = pcmData[i * channels + ch] ?? 0;
    }
  }

  return audioBuffer;
}
