/**
 * LibavAudioEncoder - libav.js based audio encoder
 *
 * Implements IAudioEncoder using libav.js for audio encoding.
 * Supports AAC and Opus codecs for MP4 and WebM containers.
 *
 * Key features:
 * - Shared libav.js instance (no repeated WASM loading)
 * - Consistent with LibavPureAudioDecoder architecture
 */

import type {
  IAudioEncoder,
  AudioEncoderConfig,
  EncodedAudioChunk,
  EncoderState,
  EncoderProgress,
  EncoderEvent,
} from '@uniedit/shared';
import type { LibAV } from 'libav.js';
import { libavCore } from './LibavCore';

// =============================================================================
// Types
// =============================================================================

/**
 * Buffered sample entry
 */
interface BufferedSamples {
  samples: Float32Array;
  timestamp: number;
}

// =============================================================================
// Constants
// =============================================================================

// Buffer threshold: 2 seconds of audio before encoding
const BUFFER_DURATION_SECONDS = 2;

// Minimum samples to encode (avoid tiny chunks)
const MIN_SAMPLES_TO_ENCODE = 1024;

// Sample format constants
const AV_SAMPLE_FMT_FLT = 3;   // Interleaved float (for Opus)
const AV_SAMPLE_FMT_FLTP = 8;  // Planar float (for AAC)

// =============================================================================
// LibavAudioEncoder Implementation
// =============================================================================

export class LibavAudioEncoder implements IAudioEncoder {
  private _state: EncoderState = 'idle';
  private _config: AudioEncoderConfig | null = null;
  private _libav: LibAV | null = null;

  // Encoder context (from ff_init_encoder)
  private _codecCtx = 0;
  private _frame = 0;
  private _pkt = 0;
  private _frameSize = 0;

  // Sample buffer
  private _sampleBuffer: BufferedSamples[] = [];
  private _totalBufferedSamples = 0;
  private _encodedTimestamp = 0;

  // Encoded output
  private _encodedChunks: EncodedAudioChunk[] = [];
  private _chunkIndex = 0;

  // Event listeners
  private _progressListeners = new Set<(p: EncoderProgress) => void>();
  private _stateListeners = new Set<(s: EncoderState) => void>();
  private _errorListeners = new Set<(e: Error) => void>();

  // =========================================================================
  // Properties
  // =========================================================================

  get state(): EncoderState {
    return this._state;
  }

  get isReady(): boolean {
    return this._state === 'encoding';
  }

  // =========================================================================
  // Lifecycle
  // =========================================================================

  async initialize(config: AudioEncoderConfig): Promise<void> {
    if (this._state !== 'idle') {
      throw new Error(`Cannot initialize in state: ${this._state}`);
    }

    this._config = config;
    this._setState('initializing');

    try {
      // Get shared libav instance
      this._libav = await libavCore.getLibav();

      // Determine codec and sample format based on config
      const isOpus = config.codec === 'opus';
      const codecName = isOpus ? 'libopus' : 'aac';

      // AAC requires planar float (FLTP), Opus uses interleaved float (FLT)
      const sampleFmt = isOpus ? AV_SAMPLE_FMT_FLT : AV_SAMPLE_FMT_FLTP;

      // Channel layout: stereo = 3 (AV_CH_LAYOUT_STEREO)
      const channelLayout = config.channels === 1 ? 4 : 3; // mono=4, stereo=3

      console.log(`[LibavAudioEncoder] Initializing ${codecName} encoder...`);

      // Initialize encoder
      const result = await this._libav.ff_init_encoder(codecName, {
        ctx: {
          sample_fmt: sampleFmt,
          sample_rate: config.sampleRate,
          channel_layout: channelLayout,
          channels: config.channels,
          bit_rate: config.bitrate ?? 128000,
        },
      });

      // ff_init_encoder returns [codec, codecCtx, frame, pkt, frameSize]
      // We only need codecCtx, frame, pkt, frameSize
      this._codecCtx = result[1] as number;
      this._frame = result[2] as number;
      this._pkt = result[3] as number;
      this._frameSize = result[4] as number;

      console.log(`[LibavAudioEncoder] Initialized: frameSize=${this._frameSize}`);

      this._setState('encoding');
    } catch (error) {
      console.error('[LibavAudioEncoder] Initialization failed:', error);
      this._setState('error');
      this._emitError(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  async encode(samples: Float32Array, timestamp: number): Promise<void> {
    if (this._state !== 'encoding') {
      throw new Error(`Cannot encode in state: ${this._state}`);
    }

    // Buffer samples
    this._sampleBuffer.push({ samples, timestamp });
    this._totalBufferedSamples += samples.length;

    // Check if we should flush the buffer
    const bufferThreshold =
      this._config!.sampleRate * this._config!.channels * BUFFER_DURATION_SECONDS;

    if (this._totalBufferedSamples >= bufferThreshold) {
      await this._flushBuffer(false);
    }
  }

  async finalize(): Promise<EncodedAudioChunk[]> {
    if (this._state !== 'encoding') {
      throw new Error(`Cannot finalize in state: ${this._state}`);
    }

    this._setState('finalizing');

    try {
      // Encode remaining samples
      if (this._sampleBuffer.length > 0 && this._totalBufferedSamples >= MIN_SAMPLES_TO_ENCODE) {
        await this._flushBuffer(true);
      }

      // Cleanup encoder resources
      await this._cleanup();

      this._setState('completed');
      return [...this._encodedChunks];
    } catch (error) {
      this._setState('error');
      this._emitError(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  async cancel(): Promise<void> {
    await this._cleanup();

    this._sampleBuffer = [];
    this._encodedChunks = [];
    this._totalBufferedSamples = 0;
    this._setState('cancelled');
  }

  getEncodedChunks(): EncodedAudioChunk[] {
    const chunks = this._encodedChunks;
    this._encodedChunks = [];
    return chunks;
  }

  // =========================================================================
  // Events
  // =========================================================================

  get onProgress(): EncoderEvent<EncoderProgress> {
    return (listener) => {
      this._progressListeners.add(listener);
      return { dispose: () => this._progressListeners.delete(listener) };
    };
  }

  get onStateChange(): EncoderEvent<EncoderState> {
    return (listener) => {
      this._stateListeners.add(listener);
      return { dispose: () => this._stateListeners.delete(listener) };
    };
  }

  get onError(): EncoderEvent<Error> {
    return (listener) => {
      this._errorListeners.add(listener);
      return { dispose: () => this._errorListeners.delete(listener) };
    };
  }

  // =========================================================================
  // Private Methods
  // =========================================================================

  private async _flushBuffer(fin: boolean): Promise<void> {
    if (!this._libav || !this._config || this._sampleBuffer.length === 0) {
      return;
    }

    // Merge all buffered samples
    const totalLength = this._sampleBuffer.reduce((sum, b) => sum + b.samples.length, 0);
    const combined = new Float32Array(totalLength);
    let offset = 0;

    for (const buffer of this._sampleBuffer) {
      combined.set(buffer.samples, offset);
      offset += buffer.samples.length;
    }

    // Get first timestamp
    const firstTimestamp = this._sampleBuffer[0]?.timestamp ?? this._encodedTimestamp;

    // Clear buffer
    this._sampleBuffer = [];
    this._totalBufferedSamples = 0;

    // Calculate base PTS in samples (for monotonic timestamps)
    // PTS should be relative to the start of the audio stream
    const basePts = Math.round((this._encodedTimestamp / 1_000_000) * this._config.sampleRate);

    // Convert samples to frames for libav.js
    const isOpus = this._config.codec === 'opus';
    const frames = this._prepareFrames(combined, isOpus, basePts);

    if (frames.length === 0) {
      return;
    }

    try {
      // Encode frames
      const packets = await this._libav.ff_encode_multi(
        this._codecCtx,
        this._frame,
        this._pkt,
        frames,
        fin
      );

      // Process encoded packets
      for (const packet of packets) {
        const data = packet.data;
        if (!data || data.length === 0) continue;

        // Calculate duration based on samples per channel
        const samplesPerChannel = totalLength / this._config.channels;
        const durationMicros = (samplesPerChannel / this._config.sampleRate) * 1_000_000;

        const chunk: EncodedAudioChunk = {
          data: new Uint8Array(data),
          timestamp: firstTimestamp + this._chunkIndex * durationMicros / packets.length,
          duration: durationMicros / packets.length,
          isKeyframe: true,
        };

        this._encodedChunks.push(chunk);
        this._chunkIndex++;
      }

      this._encodedTimestamp = firstTimestamp + (totalLength / this._config.channels / this._config.sampleRate) * 1_000_000;

      // Emit progress
      this._emitProgress();
    } catch (error) {
      console.error('[LibavAudioEncoder] Encoding error:', error);
      throw error;
    }
  }

  /**
   * Prepare frames for libav.js encoding
   * Converts interleaved Float32 samples to the format expected by the codec
   * @param samples - Interleaved audio samples
   * @param isOpus - Whether to use Opus format (interleaved) or AAC format (planar)
   * @param basePts - Base PTS offset in samples for monotonic timestamps
   */
  private _prepareFrames(
    samples: Float32Array,
    isOpus: boolean,
    basePts = 0
  ): Array<{ data: Float32Array | Float32Array[]; nb_samples: number; channels: number; channel_layout: number; format: number; sample_rate: number; pts: number }> {
    if (!this._config) return [];

    const channels = this._config.channels;
    const sampleRate = this._config.sampleRate;
    const samplesPerChannel = Math.floor(samples.length / channels);

    // Use codec's frame size or default to a reasonable value
    const frameSize = this._frameSize || 1024;
    const frames: Array<{ data: Float32Array | Float32Array[]; nb_samples: number; channels: number; channel_layout: number; format: number; sample_rate: number; pts: number }> = [];

    let sampleOffset = 0;
    let ptsOffset = basePts; // Start from basePts for monotonic timestamps

    while (sampleOffset < samplesPerChannel) {
      const remainingSamples = samplesPerChannel - sampleOffset;
      const frameSamples = Math.min(frameSize, remainingSamples);

      if (isOpus) {
        // Opus: interleaved float (FLT)
        const frameData = new Float32Array(frameSamples * channels);
        for (let i = 0; i < frameSamples * channels; i++) {
          frameData[i] = samples[sampleOffset * channels + i] ?? 0;
        }

        frames.push({
          data: frameData,
          nb_samples: frameSamples,
          channels,
          channel_layout: channels === 1 ? 4 : 3,
          format: AV_SAMPLE_FMT_FLT,
          sample_rate: sampleRate,
          pts: ptsOffset,
        });
      } else {
        // AAC: planar float (FLTP)
        const channelData: Float32Array[] = [];
        for (let ch = 0; ch < channels; ch++) {
          const chData = new Float32Array(frameSamples);
          for (let i = 0; i < frameSamples; i++) {
            // De-interleave: samples are [L0, R0, L1, R1, ...]
            chData[i] = samples[(sampleOffset + i) * channels + ch] ?? 0;
          }
          channelData.push(chData);
        }

        frames.push({
          data: channelData,
          nb_samples: frameSamples,
          channels,
          channel_layout: channels === 1 ? 4 : 3,
          format: AV_SAMPLE_FMT_FLTP,
          sample_rate: sampleRate,
          pts: ptsOffset,
        });
      }

      sampleOffset += frameSamples;
      ptsOffset += frameSamples;
    }

    return frames;
  }

  private async _cleanup(): Promise<void> {
    if (!this._libav) return;

    try {
      if (this._codecCtx && this._frame && this._pkt) {
        await this._libav.ff_free_encoder(this._codecCtx, this._frame, this._pkt);
      }
    } catch (error) {
      console.warn('[LibavAudioEncoder] Cleanup error:', error);
    }

    this._codecCtx = 0;
    this._frame = 0;
    this._pkt = 0;
    // Note: We don't null out _libav since it's a shared instance
  }

  private _setState(state: EncoderState): void {
    this._state = state;
    for (const listener of this._stateListeners) {
      listener(state);
    }
  }

  private _emitProgress(): void {
    const progress: EncoderProgress = {
      encodedFrames: this._encodedChunks.length,
      percent: 0, // Unknown total
      currentFps: 0,
      elapsedMs: 0,
      currentSize: this._encodedChunks.reduce((sum, c) => sum + c.data.byteLength, 0),
    };

    for (const listener of this._progressListeners) {
      listener(progress);
    }
  }

  private _emitError(error: Error): void {
    for (const listener of this._errorListeners) {
      listener(error);
    }
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a new LibavAudioEncoder instance
 */
export function createLibavAudioEncoder(): LibavAudioEncoder {
  return new LibavAudioEncoder();
}

/**
 * Check if libav.js audio encoding is available
 */
export async function isLibavAudioEncoderAvailable(): Promise<boolean> {
  try {
    await libavCore.getLibav();
    return true;
  } catch {
    return false;
  }
}
