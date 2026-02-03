/**
 * Media Engine - Basic Mode
 *
 * Provides WebCodecs + libav.js based media processing
 * for the Webview environment.
 *
 * Note: Effect processing has been moved to @neko/effects-runtime.
 * For GPU effects, use:
 * ```typescript
 * import { createEffectRunner } from '@neko/effects-runtime';
 * ```
 *
 * Usage:
 * ```typescript
 * import { createWebMediaEngine, isBasicModeAvailable } from './mediaEngine';
 *
 * if (isBasicModeAvailable()) {
 *   const engine = await createWebMediaEngine();
 *
 *   // Create decoder
 *   const decoder = await engine.createVideoDecoder({ source: 'video.mp4' });
 *   await decoder.open();
 *   const frame = await decoder.decodeAt(1.0);
 *
 *   // Cleanup
 *   await decoder.close();
 *   await engine.dispose();
 * }
 * ```
 */

// Main engine
export { WebMediaEngine, createWebMediaEngine, isBasicModeAvailable } from './WebMediaEngine';

// Decoders
export {
	WebCodecsVideoDecoder,
	createWebCodecsVideoDecoder,
	isWebCodecsSupported,
	isCodecSupported,
	// Webview-based decoder
	WebviewVideoDecoder,
	createWebviewVideoDecoder,
	isWebCodecsAvailable,
	checkBasicModeSupport,
	type WebviewVideoDecoderConfig,
	type FormatSupportResult,
	// Unified audio decoder (MP4Demuxer + libav.js)
	WebviewAudioDecoder,
	createWebviewAudioDecoder,
	isLibavAvailable,
	type WebviewAudioDecoderConfig,
	// Pure audio decoder (decode only)
	LibavPureAudioDecoder,
	createLibavPureAudioDecoder,
	type LibavPureAudioDecoderConfig,
} from './decoders';

// Demuxers
export {
	MP4Demuxer,
	createMP4Demuxer,
	isVideoCodecSupported,
	type DemuxedMediaInfo,
	type EncodedAudioSample,
	type MP4DemuxerConfig,
	type IDemuxer,
} from './demuxers';

// Encoders
export {
	WebCodecsEncoder,
	createWebCodecsEncoder,
	isEncoderCodecSupported,
} from './encoders';

// libav.js audio encoder
export {
	LibavAudioEncoder,
	createLibavAudioEncoder,
	isLibavAudioEncoderAvailable,
} from './libav';
