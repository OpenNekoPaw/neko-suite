/**
 * LibavPureAudioDecoder - Pure audio decoder using libav.js
 *
 * This decoder ONLY performs decoding - it accepts EncodedAudioSample[]
 * from MP4Demuxer and decodes them to PCM. It does NOT handle demuxing.
 *
 * Architecture:
 *   MP4Demuxer → EncodedAudioSample[] → LibavPureAudioDecoder → Float32Array (PCM)
 *     (demux)     (encoded samples)           (decode)            (raw audio)
 *
 * Key features:
 * - Pure decoding: accepts pre-demuxed samples
 * - Manually constructs libav Packets from samples
 * - Uses ff_decode_multi for efficient batch decoding
 * - Supports: AAC, MP3, Opus, Vorbis, FLAC
 */

import type { LibAV, Packet, Frame } from 'libav.js';
import { libavCore } from './LibavCore';
import { extractPCMFromFrame, mergeSamples } from './pcmUtils';
import type { EncodedAudioSample } from '../demuxers';

// =============================================================================
// Types
// =============================================================================

export interface LibavPureAudioDecoderConfig {
  /** Audio codec name (aac, mp3, opus, vorbis, flac) */
  codec: string;
  /** Sample rate in Hz */
  sampleRate: number;
  /** Number of audio channels */
  channelCount: number;
  /** Codec-specific configuration (e.g., esds for AAC) */
  codecDescription?: Uint8Array;
}

// =============================================================================
// Constants
// =============================================================================

// Codec name mapping for libav.js decoder lookup
// Use the FFmpeg decoder names
const CODEC_NAME_MAP: Record<string, string> = {
  aac: 'aac',
  mp3: 'mp3',
  opus: 'opus',
  vorbis: 'vorbis',
  flac: 'flac',
};

// Codec ID mapping (from libav/ffmpeg) - fallback
const CODEC_ID_MAP: Record<string, number> = {
  aac: 86018,
  mp3: 86017,
  opus: 86076,
  vorbis: 86021,
  flac: 86028,
};

// =============================================================================
// LibavPureAudioDecoder
// =============================================================================

export class LibavPureAudioDecoder {
  private _config: LibavPureAudioDecoderConfig;
  private _libav: LibAV | null = null;
  private _codecCtx = 0;
  private _pkt = 0;
  private _frame = 0;
  private _isOpen = false;
  private _disposed = false;

  constructor(config: LibavPureAudioDecoderConfig) {
    this._config = config;
  }

  // ===========================================================================
  // Public Methods
  // ===========================================================================

  /**
   * Open and initialize the decoder
   */
  async open(): Promise<void> {
    if (this._isOpen) {
      return;
    }

    if (this._disposed) {
      throw new Error('Decoder has been disposed');
    }

    try {
      // Get libav instance
      this._libav = await libavCore.getLibav();

      // Get codec name for libav
      const codecName = CODEC_NAME_MAP[this._config.codec.toLowerCase()];
      const codecId = CODEC_ID_MAP[this._config.codec.toLowerCase()];

      if (!codecName && !codecId) {
        throw new Error(`Unsupported codec: ${this._config.codec}`);
      }

      // Try to find decoder by name first, then by ID
      let codec = 0;

      // Method 1: Try avcodec_find_decoder_by_name
      if (codecName && typeof this._libav.avcodec_find_decoder_by_name === 'function') {
        try {
          codec = await this._libav.avcodec_find_decoder_by_name(codecName);
        } catch {
          // Method not available or failed
        }
      }

      // Method 2: Try avcodec_find_decoder with ID
      if (!codec && codecId) {
        try {
          codec = await this._libav.avcodec_find_decoder(codecId);
        } catch {
          // Method failed
        }
      }

      // Method 3: Use ff_init_decoder which handles codec lookup internally
      if (!codec) {
        await this._initWithFFInitDecoder(codecId ?? 86018);
        return;
      }

      this._codecCtx = await this._libav.avcodec_alloc_context3(codec);
      if (!this._codecCtx) {
        throw new Error('Failed to allocate codec context');
      }

      // Set basic parameters
      await this._libav.AVCodecContext_sample_rate_s(this._codecCtx, this._config.sampleRate);

      // Set channel layout
      await this._setChannelCount();

      // If codec description available (e.g., esds for AAC), set extradata
      if (this._config.codecDescription && this._config.codecDescription.length > 0) {
        await this._setExtradata(this._config.codecDescription);
      }

      // Open codec
      const ret = await this._libav.avcodec_open2(this._codecCtx, codec, 0);
      if (ret < 0) {
        throw new Error(`Failed to open codec: ${ret}`);
      }

      // Allocate packet and frame
      this._pkt = await this._libav.av_packet_alloc();
      this._frame = await this._libav.av_frame_alloc();

      this._isOpen = true;
    } catch (error) {
      await this._cleanup();
      throw error;
    }
  }

  /**
   * Initialize using ff_init_decoder (libav.js high-level API)
   * This requires a properly constructed codecpar
   */
  private async _initWithFFInitDecoder(codecId: number): Promise<void> {
    if (!this._libav) throw new Error('LibAV not initialized');

    // Create and configure codecpar
    const codecpar = await this._createCodecpar(codecId);

    try {
      // ff_init_decoder expects (codecId, codecpar) and returns [codec, codecCtx, pkt, frame]
      const [, codecCtx, pkt, frame] = await this._libav.ff_init_decoder(codecId, codecpar);

      this._codecCtx = codecCtx;
      this._pkt = pkt;
      this._frame = frame;

      this._isOpen = true;
    } finally {
      // Free codecpar after initialization
      if (codecpar) {
        await this._libav.avcodec_parameters_free_js(codecpar);
      }
    }
  }

  /**
   * Create and configure codecpar for decoder initialization
   */
  private async _createCodecpar(codecId: number): Promise<number> {
    if (!this._libav) throw new Error('LibAV not initialized');

    // Allocate codecpar
    const codecpar = await this._libav.avcodec_parameters_alloc();
    if (!codecpar) {
      throw new Error('Failed to allocate codecpar');
    }

    // Set codec type to AUDIO (1)
    await this._libav.AVCodecParameters_codec_type_s(codecpar, 1);

    // Set codec ID
    await this._libav.AVCodecParameters_codec_id_s(codecpar, codecId);

    // Set sample rate
    await this._libav.AVCodecParameters_sample_rate_s(codecpar, this._config.sampleRate);

    // Set channel count - try different APIs
    const libavAny = this._libav as unknown as Record<string, unknown>;
    if (typeof libavAny['AVCodecParameters_ch_layout_nb_channels_s'] === 'function') {
      await (libavAny['AVCodecParameters_ch_layout_nb_channels_s'] as (par: number, channels: number) => Promise<void>)(
        codecpar,
        this._config.channelCount
      );
    } else if (typeof libavAny['AVCodecParameters_channels_s'] === 'function') {
      await (libavAny['AVCodecParameters_channels_s'] as (par: number, channels: number) => Promise<void>)(
        codecpar,
        this._config.channelCount
      );
    }

    // Set extradata if available (required for AAC)
    if (this._config.codecDescription && this._config.codecDescription.length > 0) {
      const extradata = await this._libav.malloc(this._config.codecDescription.length);
      await this._libav.copyin_u8(extradata, this._config.codecDescription);
      await this._libav.AVCodecParameters_extradata_s(codecpar, extradata);
      await this._libav.AVCodecParameters_extradata_size_s(codecpar, this._config.codecDescription.length);
    }

    return codecpar;
  }

  /**
   * Set channel count using available API
   */
  private async _setChannelCount(): Promise<void> {
    if (!this._libav || !this._codecCtx) return;

    try {
      const libavAny = this._libav as unknown as Record<string, unknown>;
      if (typeof libavAny['AVCodecContext_ch_layout_nb_channels_s'] === 'function') {
        await (libavAny['AVCodecContext_ch_layout_nb_channels_s'] as (ctx: number, channels: number) => Promise<void>)(
          this._codecCtx,
          this._config.channelCount
        );
      } else if (typeof libavAny['AVCodecContext_channels_s'] === 'function') {
        await (libavAny['AVCodecContext_channels_s'] as (ctx: number, channels: number) => Promise<void>)(
          this._codecCtx,
          this._config.channelCount
        );
      }
    } catch {
      // Could not set channel count, will use codec default
    }
  }

  /**
   * Decode encoded audio samples to PCM
   *
   * @param samples Encoded audio samples from MP4Demuxer
   * @returns Interleaved PCM data (Float32Array)
   */
  async decode(samples: EncodedAudioSample[]): Promise<Float32Array> {
    if (!this._isOpen || !this._libav) {
      throw new Error('Decoder not open');
    }

    if (samples.length === 0) {
      return new Float32Array(0);
    }

    try {
      // Convert samples to libav Packets
      const packets = this._samplesToPackets(samples);

      // Decode all packets
      const frames = await this._libav.ff_decode_multi(
        this._codecCtx,
        this._pkt,
        this._frame,
        packets,
        { ignoreErrors: true }
      );

      // Extract PCM from frames
      const allPCM: Float32Array[] = [];
      for (const frame of frames) {
        const pcm = extractPCMFromFrame(frame as Frame, this._config.channelCount);
        if (pcm.length > 0) {
          allPCM.push(pcm);
        }
      }

      // Merge all PCM data
      const result = mergeSamples(allPCM);

      return result;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Close and release resources
   */
  async close(): Promise<void> {
    await this._cleanup();
  }

  /**
   * Dispose the decoder
   */
  dispose(): void {
    this._disposed = true;
    this.close().catch(() => {});
  }

  // ===========================================================================
  // Getters
  // ===========================================================================

  get isOpen(): boolean {
    return this._isOpen;
  }

  get config(): Readonly<LibavPureAudioDecoderConfig> {
    return this._config;
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Set codec extradata (e.g., esds for AAC)
   */
  private async _setExtradata(data: Uint8Array): Promise<void> {
    if (!this._libav || !this._codecCtx) return;

    try {
      // Allocate memory for extradata
      const extradata = await this._libav.malloc(data.length);
      await this._libav.copyin_u8(extradata, data);

      // Set extradata pointer and size
      await this._libav.AVCodecContext_extradata_s(this._codecCtx, extradata);
      await this._libav.AVCodecContext_extradata_size_s(this._codecCtx, data.length);
    } catch {
      // Failed to set extradata
    }
  }

  /**
   * Convert EncodedAudioSamples to libav Packets
   */
  private _samplesToPackets(samples: EncodedAudioSample[]): Packet[] {
    return samples.map((sample) => ({
      data: sample.data,
      pts: sample.timestamp,
      dts: sample.timestamp,
      // Use 0 for stream identification
      // This matches what ff_decode_multi expects
      stream_index: 0,
    } as Packet));
  }

  /**
   * Cleanup resources
   */
  private async _cleanup(): Promise<void> {
    if (!this._libav) return;

    try {
      if (this._codecCtx) {
        await this._libav.avcodec_free_context_js(this._codecCtx);
        this._codecCtx = 0;
      }
      if (this._pkt) {
        await this._libav.av_packet_free_js(this._pkt);
        this._pkt = 0;
      }
      if (this._frame) {
        await this._libav.av_frame_free_js(this._frame);
        this._frame = 0;
      }
    } catch {
      // Cleanup error
    }

    this._isOpen = false;
    this._libav = null;
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a LibavPureAudioDecoder instance
 */
export function createLibavPureAudioDecoder(config: LibavPureAudioDecoderConfig): LibavPureAudioDecoder {
  return new LibavPureAudioDecoder(config);
}
