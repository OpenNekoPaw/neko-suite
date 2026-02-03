/**
 * Libav.js Audio Module
 *
 * Provides libav.js based audio decoding and encoding for basic mode.
 *
 * Features:
 * - Range requests (no full file loading)
 * - Segment-based decoding
 * - Decoder/Encoder instance reuse
 * - Support for AAC, MP3, Opus, Vorbis, FLAC
 */

// Core
export { LibavCore, libavCore, isLibavAvailable, type LibAV } from './LibavCore';

// Pure Audio Decoder (decode only, uses pre-demuxed samples)
export {
  LibavPureAudioDecoder,
  createLibavPureAudioDecoder,
  type LibavPureAudioDecoderConfig,
} from './LibavPureAudioDecoder';

// Audio Encoder
export {
  LibavAudioEncoder,
  createLibavAudioEncoder,
  isLibavAudioEncoderAvailable,
} from './LibavAudioEncoder';

// PCM Utilities
export {
  extractPCMFromFrame,
  mergeSamples,
  createAudioBufferFromPCM,
  AV_SAMPLE_FMT_S16,
  AV_SAMPLE_FMT_FLT,
  AV_SAMPLE_FMT_S16P,
  AV_SAMPLE_FMT_S32P,
  AV_SAMPLE_FMT_FLTP,
} from './pcmUtils';
