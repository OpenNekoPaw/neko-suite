/**
 * Media Engine Types
 *
 * Unified type definitions for the progressive media processing architecture.
 *
 * This module provides:
 * - IMediaEngine: Unified engine interface for both basic and compatible modes
 * - IDecoder/IEncoder: Codec interfaces aligned with media-processor-rs
 * - IEffectProcessor: GPU effect processing interface
 * - Capability detection types for mode selection
 *
 * Architecture:
 * ```
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                    IMediaEngine (统一接口)                       │
 * └─────────────────────────────────────────────────────────────────┘
 *                               │
 *               ┌───────────────┴───────────────┐
 *               ▼                               ▼
 * ┌─────────────────────────┐     ┌─────────────────────────┐
 * │   WebMediaEngine        │     │   NativeMediaEngine     │
 * │   (基础模式)             │     │   (兼容模式)             │
 * │   Webview 运行           │     │   Extension Host 运行   │
 * │   ~10MB                  │     │   ~20MB (按需下载)       │
 * └─────────────────────────┘     └─────────────────────────┘
 * ```
 */
// =============================================================================
// Mode Types
// =============================================================================
export { 
// Constants
BASIC_MODE_VIDEO_CODECS, BASIC_MODE_AUDIO_CODECS, BASIC_MODE_CONTAINERS, 
// Helpers
isBasicModeVideoCodec, isBasicModeAudioCodec, isBasicModeContainer, } from './mode';
// =============================================================================
// Capability Types
// =============================================================================
export { 
// Constants
BASIC_MODE_CAPABILITIES, COMPATIBLE_MODE_CAPABILITIES, 
// Helpers
canDecodeVideo, canEncodeVideo, canDecodeAudio, canEncodeAudio, supportsContainer, } from './capabilities';
// =============================================================================
// Decoder Types
// =============================================================================
export { 
// Type Guards
isVideoFrame, isAudioFrame, isVideoDecoder, isAudioDecoder, } from './decoder';
// =============================================================================
// Encoder Types
// =============================================================================
export { 
// Type Guards
isStreamingEncoder, isAudioEncoder, } from './encoder';
// =============================================================================
// Effect Types
// =============================================================================
export { 
// Type Guards
isBatchEffectProcessor, 
// Helpers
createColorCorrection, createBlur, createGreenScreenKey, } from './effects';
// =============================================================================
// Muxer Types
// =============================================================================
export { 
// Type Guards
isVideoChunk, isAudioChunk, } from './muxer';
// =============================================================================
// Engine Types
// =============================================================================
export { 
// Type Guards
isMediaEngine, } from './engine';
//# sourceMappingURL=index.js.map