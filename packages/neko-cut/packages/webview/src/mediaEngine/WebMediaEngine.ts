/**
 * Web Media Engine
 *
 * Basic mode implementation of IMediaEngine using:
 * - WebCodecs for video decoding/encoding
 * - libav.js for audio decoding
 * - WebGPU for effect processing
 *
 * Runs in Webview environment, requires browser APIs.
 */

import type {
	IMediaEngine,
	IDecoder,
	IEncoder,
	IEffectProcessor,
	MediaEngineCapabilities,
	MediaEngineMode,
	MediaEngineState,
	MediaEngineInitOptions,
	MediaEngineError,
	VideoDecoderConfig,
	AudioDecoderConfig,
	EncoderConfig,
	Event,
	VideoCodecCapability,
	MediaInfo,
} from '@uniedit/shared';
import { BASIC_MODE_CAPABILITIES } from '@uniedit/shared';

import {
	WebCodecsVideoDecoder,
	isWebCodecsSupported,
} from './decoders';
import { createWebviewAudioDecoder } from './decoders/WebviewAudioDecoder';
import { WebCodecsEncoder } from './encoders';
import { isWebGPUSupported } from '@uniedit/effects-runtime';

// =============================================================================
// Types
// =============================================================================

type EventListener<T> = (data: T) => void;

// =============================================================================
// Web Media Engine
// =============================================================================

/**
 * Basic mode media engine implementation
 *
 * Uses browser APIs (WebCodecs, WebGPU, libav.js) for media processing.
 * Suitable for H.264/VP8/VP9 video and common audio formats.
 */
export class WebMediaEngine implements IMediaEngine {
	readonly name = 'WebMediaEngine';
	readonly mode: MediaEngineMode = 'basic';

	private _state: MediaEngineState = 'uninitialized';
	private _capabilities: MediaEngineCapabilities = BASIC_MODE_CAPABILITIES;

	// Event listeners
	private _stateListeners: Set<EventListener<MediaEngineState>> = new Set();
	private _errorListeners: Set<EventListener<MediaEngineError>> = new Set();

	// =========================================================================
	// Properties
	// =========================================================================

	get state(): MediaEngineState {
		return this._state;
	}

	get capabilities(): MediaEngineCapabilities {
		return this._capabilities;
	}

	get isReady(): boolean {
		return this._state === 'ready';
	}

	// =========================================================================
	// Lifecycle
	// =========================================================================

	async initialize(_options?: MediaEngineInitOptions): Promise<void> {
		if (this._state !== 'uninitialized') {
			throw new Error(`Cannot initialize in state: ${this._state}`);
		}

		this._setState('initializing');

		try {
			// Check WebCodecs support
			if (!isWebCodecsSupported()) {
				throw new Error('WebCodecs is not supported in this environment');
			}

			// Check WebGPU support (optional, for effects)
			if (isWebGPUSupported()) {
				this._capabilities = {
					...this._capabilities,
					gpuEffects: true,
					gpuBackend: 'webgpu',
				};
			} else {
				console.warn('[WebMediaEngine] WebGPU not available, effects will be limited');
				this._capabilities = {
					...this._capabilities,
					gpuEffects: false,
					gpuBackend: undefined,
				};
			}

			// Update capabilities based on actual codec support
			await this.detectCodecSupport();

			this._setState('ready');
		} catch (error) {
			this._setState('error');
			this.emitError({
				code: 'INIT_FAILED',
				message: error instanceof Error ? error.message : String(error),
				recoverable: false,
			});
			throw error;
		}
	}

	async dispose(): Promise<void> {
		this._setState('disposed');
	}

	// =========================================================================
	// Decoder Factory
	// =========================================================================

	async createVideoDecoder(config: VideoDecoderConfig): Promise<IDecoder> {
		if (!this.isReady) {
			throw new Error('Engine not ready');
		}

		const decoder = new WebCodecsVideoDecoder(config);
		return decoder;
	}

	async createAudioDecoder(config: AudioDecoderConfig): Promise<IDecoder> {
		if (!this.isReady) {
			throw new Error('Engine not ready');
		}

		// Use unified audio decoder (MP4Demuxer + libav.js decode)
		const decoder = createWebviewAudioDecoder({
			source: config.source ?? '',
			sampleRate: config.sampleRate,
			channels: config.channels,
		});
		return decoder as unknown as IDecoder;
	}

	canDecode(codec: string, _container?: string): boolean {
		const codecLower = codec.toLowerCase();

		// Check video codecs
		const videoCodec = this._capabilities.videoCodecs.find(
			(c: VideoCodecCapability) => c.codec === codecLower
		);
		if (videoCodec?.decode) return true;

		// Check audio codecs
		const audioCodec = this._capabilities.audioCodecs.find(
			(c) => c.codec === codecLower
		);
		if (audioCodec?.decode) return true;

		return false;
	}

	// =========================================================================
	// Encoder Factory
	// =========================================================================

	async createEncoder(config: EncoderConfig): Promise<IEncoder> {
		if (!this.isReady) {
			throw new Error('Engine not ready');
		}

		const encoder = new WebCodecsEncoder();
		await encoder.initialize(config);
		return encoder;
	}

	canEncode(codec: string, _container?: string): boolean {
		const codecLower = codec.toLowerCase();

		// Check video codecs
		const videoCodec = this._capabilities.videoCodecs.find(
			(c: VideoCodecCapability) => c.codec === codecLower
		);
		if (videoCodec?.encode) return true;

		// Check audio codecs
		const audioCodec = this._capabilities.audioCodecs.find(
			(c) => c.codec === codecLower
		);
		if (audioCodec?.encode) return true;

		return false;
	}

	// =========================================================================
	// Effect Processor
	// =========================================================================

	async getEffectProcessor(): Promise<IEffectProcessor> {
		// Effect processing has been moved to @uniedit/effects-runtime
		// Use createEffectRunner() from @uniedit/effects-runtime instead
		throw new Error(
			'getEffectProcessor is deprecated. Use createEffectRunner() from @uniedit/effects-runtime instead.'
		);
	}

	// =========================================================================
	// Utility Methods
	// =========================================================================

	async probeMedia(_source: string): Promise<MediaInfo> {
		// In basic mode, we need to request media info from Extension Host
		// via IPC, as we can't directly access the file system
		throw new Error(
			'probeMedia not available in basic mode. Use IPC to request from Extension Host.'
		);
	}

	canProcess(mediaInfo: MediaInfo): boolean {
		// Check video codec
		if (mediaInfo.codec && !this.canDecode(mediaInfo.codec)) {
			return false;
		}

		// Check audio codec
		if (mediaInfo.audioCodec && !this.canDecode(mediaInfo.audioCodec)) {
			return false;
		}

		// Check resolution
		if (
			mediaInfo.width > this._capabilities.maxResolution.width ||
			mediaInfo.height > this._capabilities.maxResolution.height
		) {
			return false;
		}

		return true;
	}

	// =========================================================================
	// Events
	// =========================================================================

	get onStateChange(): Event<MediaEngineState> {
		return (listener: (state: MediaEngineState) => void) => {
			this._stateListeners.add(listener);
			return {
				dispose: () => this._stateListeners.delete(listener),
			};
		};
	}

	get onError(): Event<MediaEngineError> {
		return (listener: (error: MediaEngineError) => void) => {
			this._errorListeners.add(listener);
			return {
				dispose: () => this._errorListeners.delete(listener),
			};
		};
	}

	// =========================================================================
	// Private Methods
	// =========================================================================

	private _setState(state: MediaEngineState): void {
		this._state = state;
		for (const listener of this._stateListeners) {
			listener(state);
		}
	}

	private emitError(error: MediaEngineError): void {
		for (const listener of this._errorListeners) {
			listener(error);
		}
	}

	private async detectCodecSupport(): Promise<void> {
		// Test actual codec support via WebCodecs
		const videoCodecs = await Promise.all(
			this._capabilities.videoCodecs.map(async (codec: VideoCodecCapability) => {
				const codecStrings: Record<string, string> = {
					h264: 'avc1.42E01E',
					vp8: 'vp8',
					vp9: 'vp09.00.10.08',
				};

				const codecString = codecStrings[codec.codec];
				if (!codecString) return codec;

				try {
					const decodeSupport = await VideoDecoder.isConfigSupported({
						codec: codecString,
					});

					const encodeSupport = await VideoEncoder.isConfigSupported({
						codec: codecString,
						width: 1920,
						height: 1080,
					});

					return {
						...codec,
						decode: decodeSupport.supported ?? false,
						encode: encodeSupport.supported ?? false,
					};
				} catch {
					return { ...codec, decode: false, encode: false };
				}
			})
		);

		this._capabilities = {
			...this._capabilities,
			videoCodecs,
		};
	}
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a WebMediaEngine instance
 */
export async function createWebMediaEngine(
	options?: MediaEngineInitOptions
): Promise<WebMediaEngine> {
	const engine = new WebMediaEngine();
	await engine.initialize(options);
	return engine;
}

/**
 * Check if basic mode is available in this environment
 */
export function isBasicModeAvailable(): boolean {
	return isWebCodecsSupported();
}
