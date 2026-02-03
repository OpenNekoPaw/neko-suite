/**
 * Decoders Index
 *
 * Exports all decoder implementations for basic mode.
 */

export {
	WebCodecsVideoDecoder,
	createWebCodecsVideoDecoder,
	isWebCodecsSupported,
	isCodecSupported,
} from './WebCodecsVideoDecoder';

export {
	WebviewVideoDecoder,
	createWebviewVideoDecoder,
	isWebCodecsAvailable,
	checkBasicModeSupport,
	type WebviewVideoDecoderConfig,
	type FormatSupportResult,
} from './WebviewVideoDecoder';

// Unified Audio Decoder (MP4Demuxer + LibavPureAudioDecoder)
export {
	WebviewAudioDecoder,
	createWebviewAudioDecoder,
	type WebviewAudioDecoderConfig,
} from './WebviewAudioDecoder';

// libav.js availability check
export { isLibavAvailable } from '../libav';

// Pure Audio Decoder (decode only, no demux)
export {
	LibavPureAudioDecoder,
	createLibavPureAudioDecoder,
	type LibavPureAudioDecoderConfig,
} from '../libav';
