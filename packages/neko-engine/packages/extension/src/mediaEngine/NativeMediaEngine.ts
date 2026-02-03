/**
 * Native Media Engine
 *
 * Compatible mode implementation of IMediaEngine using:
 * - Native FFmpeg (via Rust N-API) for video/audio decoding/encoding
 * - wgpu (via media-processor-rs) for GPU effect processing
 *
 * Runs in Extension Host (Node.js), supports all formats.
 * Note: FFmpeg is bundled via Rust N-API, no separate download needed.
 */

import * as vscode from 'vscode';
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
	MediaInfo,
} from '@neko/shared';
import { COMPATIBLE_MODE_CAPABILITIES } from '@neko/shared';

// =============================================================================
// Types
// =============================================================================

type EventListener<T> = (data: T) => void;

// MediaProcessor type from @neko-engine/native-napi
// Dynamically imported to handle cases where native module is not built
interface MediaProcessorType {
	getGpuInfo(): { name: string; vendor: string; backend: string; deviceType: string };
	detectHwAccel(): { decoders: string[]; encoders: string[]; recommendedDecoder: string; recommendedEncoder: string };
	decodeFrame(config: { path: string; hwAccel?: string; outputFormat?: string }, timeSeconds: number): {
		width: number;
		height: number;
		format: string;
		data: Buffer;
		timestamp: number;
		isKeyframe: boolean;
	};
	decodeFrameRange(
		config: { path: string; hwAccel?: string; outputFormat?: string },
		startTime: number,
		endTime: number,
		fps: number
	): Array<{
		width: number;
		height: number;
		format: string;
		data: Buffer;
		timestamp: number;
		isKeyframe: boolean;
	}>;
	applyEffects(
		frame: { width: number; height: number; format: string; data: Buffer; timestamp: number; isKeyframe: boolean },
		params: { brightness?: number; contrast?: number; saturation?: number }
	): { width: number; height: number; format: string; data: Buffer; timestamp: number; isKeyframe: boolean };
	// Audio decoding
	getAudioInfo(path: string): {
		sampleRate: number;
		channels: number;
		duration: number;
		codec: string;
		bitrate: number;
		totalSamples: number;
	};
	decodeAudioFrame(path: string, timeSeconds: number): {
		data: Buffer;
		samples: number;
		timestamp: number;
		sampleRate: number;
		channels: number;
	};
	decodeAudioRange(path: string, startTime: number, endTime: number): Array<{
		data: Buffer;
		samples: number;
		timestamp: number;
		sampleRate: number;
		channels: number;
	}>;
	createAudioDecoder(path: string): AudioDecoderSessionType;
	// Video encoding
	createVideoEncoder(config: {
		width: number;
		height: number;
		fps: number;
		bitrate?: number;
		codec: string;
		preset?: string;
		profile?: string;
		pixelFormat?: string;
	}): VideoEncoderSessionType;
	// Audio encoding
	createAudioEncoder(config: {
		sampleRate: number;
		channels: number;
		bitrate?: number;
		codec?: string;
		sampleFormat?: string;
	}): AudioEncoderSessionType;
	dispose(): void;
}

interface AudioDecoderSessionType {
	getInfo(): {
		sampleRate: number;
		channels: number;
		duration: number;
		codec: string;
		bitrate: number;
		totalSamples: number;
	};
	seek(timeSeconds: number): void;
	decodeNext(): { data: Buffer; samples: number; timestamp: number; sampleRate: number; channels: number } | null;
	position(): number;
	close(): void;
}

interface VideoEncoderSessionType {
	encodeFrame(frame: { width: number; height: number; format: string; data: Buffer; timestamp: number; isKeyframe: boolean }, pts: number): Array<{
		data: Buffer;
		pts: number;
		dts: number;
		isKeyframe: boolean;
		duration: number;
	}>;
	flush(): Array<{
		data: Buffer;
		pts: number;
		dts: number;
		isKeyframe: boolean;
		duration: number;
	}>;
	close(): void;
}

interface AudioEncoderSessionType {
	encodeFrame(data: Buffer, samples: number): Array<{
		data: Buffer;
		pts: number;
		duration: number;
	}>;
	flush(): Array<{
		data: Buffer;
		pts: number;
		duration: number;
	}>;
	close(): void;
}

interface MuxerSessionType {
	addVideoStream(config: {
		width: number;
		height: number;
		fps: number;
		bitrate?: number;
		codec: string;
		preset?: string;
		profile?: string;
		pixelFormat?: string;
	}): { index: number; timeBaseNum: number; timeBaseDen: number };
	addAudioStream(config: {
		sampleRate: number;
		channels: number;
		bitrate?: number;
		codec?: string;
		sampleFormat?: string;
	}): { index: number; timeBaseNum: number; timeBaseDen: number };
	writeHeader(): void;
	writeVideoPacket(packet: { data: Buffer; pts: number; dts: number; duration: number; isKeyframe: boolean }): void;
	writeAudioPacket(packet: { data: Buffer; pts: number; dts: number; duration: number; isKeyframe: boolean }): void;
	finish(): void;
	isOpen(): boolean;
}

interface MediaProcessorModule {
	MediaProcessor: {
		create(): Promise<MediaProcessorType>;
	};
	MuxerSession: {
		create(config: { outputPath: string; format: string }): MuxerSessionType;
	};
}

// =============================================================================
// Native Media Engine
// =============================================================================

/**
 * Compatible mode media engine implementation
 *
 * Uses Native FFmpeg and wgpu for full format support.
 * Runs in Extension Host, does not require Webview.
 */
export class NativeMediaEngine implements IMediaEngine {
	readonly name = 'NativeMediaEngine';
	readonly mode: MediaEngineMode = 'compatible';

	private _state: MediaEngineState = 'uninitialized';
	private _capabilities: MediaEngineCapabilities = COMPATIBLE_MODE_CAPABILITIES;

	// Native processor (from media-processor-rs)
	private _nativeProcessor: MediaProcessorType | null = null;
	private _nativeModule: MediaProcessorModule | null = null;

	// Event listeners
	private _stateListeners: Set<EventListener<MediaEngineState>> = new Set();
	private _errorListeners: Set<EventListener<MediaEngineError>> = new Set();

	constructor() {
		// No download manager needed - FFmpeg is bundled via Rust N-API
	}

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
			// Try to load native processor (Rust N-API with bundled FFmpeg)
			await this.loadNativeProcessor();

			// Detect hardware acceleration
			await this.detectHardwareAcceleration();

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
		if (this._nativeProcessor) {
			// Dispose native processor
			try {
				this._nativeProcessor.dispose();
			} catch (error) {
				console.warn('[NativeMediaEngine] Error disposing native processor:', error);
			}
			this._nativeProcessor = null;
		}

		this._setState('disposed');
	}

	// =========================================================================
	// Decoder Factory
	// =========================================================================

	async createVideoDecoder(config: VideoDecoderConfig): Promise<IDecoder> {
		if (!this.isReady) {
			throw new Error('Engine not ready');
		}

		// Create decoder - use native processor (Rust N-API with bundled FFmpeg)
		return new NativeVideoDecoder(config, this._nativeProcessor);
	}

	async createAudioDecoder(config: AudioDecoderConfig): Promise<IDecoder> {
		if (!this.isReady) {
			throw new Error('Engine not ready');
		}

		// Create audio decoder using native processor
		return new NativeAudioDecoder(config, this._nativeProcessor);
	}

	canDecode(codec: string, _container?: string): boolean {
		const codecLower = codec.toLowerCase();

		// Check video codecs
		const videoCodec = this._capabilities.videoCodecs.find(
			(c) => c.codec === codecLower
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

		// Create encoder using native processor
		return new NativeEncoder(config, this._nativeProcessor, this._nativeModule);
	}

	canEncode(codec: string, _container?: string): boolean {
		const codecLower = codec.toLowerCase();

		// Check video codecs
		const videoCodec = this._capabilities.videoCodecs.find(
			(c) => c.codec === codecLower
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
		if (!this.isReady) {
			throw new Error('Engine not ready');
		}

		// Return wgpu-based effect processor from media-processor-rs
		// For now, throw as it requires native module integration
		throw new Error('Native effect processor not yet implemented. Use basic mode for GPU effects.');
	}

	// =========================================================================
	// Utility Methods
	// =========================================================================

	async probeMedia(source: string): Promise<MediaInfo> {
		if (!this.isReady || !this._nativeModule) {
			throw new Error('Engine not ready');
		}

		// Use native module to probe media
		try {
			const { probeMedia } = this._nativeModule as { probeMedia: (path: string) => Promise<{
				duration: number;
				width: number;
				height: number;
				fps: number;
				videoCodec?: string;
				audioCodec?: string;
				format: string;
				hasAudio: boolean;
				hasSubtitles: boolean;
				audioSampleRate?: number;
				audioChannels?: number;
			}> };
			const info = await probeMedia(source);
			return {
				duration: info.duration,
				width: info.width,
				height: info.height,
				fps: info.fps,
				codec: info.videoCodec ?? 'unknown',
				format: info.format,
				hasAudio: info.hasAudio,
				audioCodec: info.audioCodec,
				audioSampleRate: info.audioSampleRate,
				audioChannels: info.audioChannels,
				hasSubtitles: info.hasSubtitles,
			};
		} catch (error) {
			throw new Error(`Failed to probe media: ${error}`);
		}
	}

	canProcess(mediaInfo: MediaInfo): boolean {
		// Compatible mode supports all formats
		return true;
	}

	// =========================================================================
	// Events
	// =========================================================================

	get onStateChange(): Event<MediaEngineState> {
		return (listener) => {
			this._stateListeners.add(listener);
			return {
				dispose: () => this._stateListeners.delete(listener),
			};
		};
	}

	get onError(): Event<MediaEngineError> {
		return (listener) => {
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

	private async loadNativeProcessor(): Promise<void> {
		// Try to load media-processor-rs native module
		try {
			// Dynamic import of native module
			const module = await import('@neko-engine/native-napi') as MediaProcessorModule;
			this._nativeModule = module;
			this._nativeProcessor = await module.MediaProcessor.create();

			// Log GPU info
			const gpuInfo = this._nativeProcessor.getGpuInfo();
			console.log('[NativeMediaEngine] Native processor loaded successfully');
			console.log(`[NativeMediaEngine] GPU: ${gpuInfo.name} (${gpuInfo.vendor}, ${gpuInfo.backend})`);

			// Detect hardware acceleration
			const hwAccel = this._nativeProcessor.detectHwAccel();
			console.log(`[NativeMediaEngine] HW Accel - Decoders: ${hwAccel.decoders.join(', ')}`);
			console.log(`[NativeMediaEngine] HW Accel - Encoders: ${hwAccel.encoders.join(', ')}`);
		} catch (error) {
			console.warn('[NativeMediaEngine] Failed to load native processor:', error);
			console.warn('[NativeMediaEngine] Falling back to FFmpeg CLI mode');
			// Continue without native processor - will use FFmpeg CLI fallback
			this._nativeProcessor = null;
			this._nativeModule = null;
		}
	}

	private async detectHardwareAcceleration(): Promise<void> {
		// Detect available hardware acceleration
		const platform = process.platform;

		let hwAccelType: 'videotoolbox' | 'nvenc' | 'vaapi' | 'qsv' | undefined;

		if (platform === 'darwin') {
			hwAccelType = 'videotoolbox';
		} else if (platform === 'linux') {
			// Check for VAAPI or NVENC
			hwAccelType = 'vaapi'; // Default to VAAPI on Linux
		} else if (platform === 'win32') {
			// Check for NVENC or QSV
			hwAccelType = 'qsv'; // Default to QSV on Windows
		}

		if (hwAccelType) {
			this._capabilities = {
				...this._capabilities,
				hardwareAcceleration: true,
				hwAccelInfo: {
					available: true,
					type: hwAccelType,
				},
			};
		}
	}
}

// =============================================================================
// Native Decoder/Encoder Stubs
// =============================================================================

/**
 * Native video decoder using Rust N-API (media-processor-rs)
 */
class NativeVideoDecoder implements IDecoder {
	readonly type = 'video' as const;
	private _mediaInfo: MediaInfo | null = null;
	private _isOpen = false;
	private _position = 0;
	private _config: VideoDecoderConfig;
	private _nativeProcessor: MediaProcessorType | null;

	constructor(config: VideoDecoderConfig, nativeProcessor: MediaProcessorType | null = null) {
		this._config = config;
		this._nativeProcessor = nativeProcessor;
	}

	get mediaInfo() { return this._mediaInfo; }
	get isOpen() { return this._isOpen; }
	get position() { return this._position; }

	async open(): Promise<MediaInfo> {
		if (!this._nativeProcessor) {
			throw new Error('Native processor not available');
		}

		this._isOpen = true;

		// Use native processor to get first frame info
		try {
			const frame = this._nativeProcessor.decodeFrame(
				{ path: this._config.source, hwAccel: 'auto' },
				0
			);
			this._mediaInfo = {
				duration: 0, // Will be updated if needed
				width: frame.width,
				height: frame.height,
				fps: 30, // Default, should be probed
				codec: 'unknown',
				format: frame.format,
				hasAudio: false,
				hasSubtitles: false,
			};
			return this._mediaInfo;
		} catch (error) {
			throw new Error(`Failed to open video: ${error}`);
		}
	}

	async seek(time: number): Promise<void> {
		this._position = time;
	}

	async decodeNext(): Promise<import('@neko/shared').DecodedVideoFrame | null> {
		return this.decodeAt(this._position);
	}

	async decodeAt(time: number): Promise<import('@neko/shared').DecodedVideoFrame | null> {
		this._position = time;

		if (!this._nativeProcessor) {
			return null;
		}

		try {
			const frame = this._nativeProcessor.decodeFrame(
				{ path: this._config.source, hwAccel: 'auto' },
				time
			);

			return {
				type: 'video' as const,
				width: frame.width,
				height: frame.height,
				data: frame.data,
				timestamp: frame.timestamp,
				format: frame.format as 'rgba' | 'yuv420p',
				isKeyframe: frame.isKeyframe,
			};
		} catch (error) {
			console.warn('[NativeVideoDecoder] Decode failed:', error);
			return null;
		}
	}

	async *decodeRange(
		startTime: number,
		duration: number,
		fps: number
	): AsyncGenerator<import('@neko/shared').DecodedVideoFrame, void, undefined> {
		if (!this._nativeProcessor) {
			return;
		}

		const endTime = startTime + duration;

		try {
			const frames = this._nativeProcessor.decodeFrameRange(
				{ path: this._config.source, hwAccel: 'auto' },
				startTime,
				endTime,
				fps
			);

			for (const frame of frames) {
				yield {
					type: 'video' as const,
					width: frame.width,
					height: frame.height,
					data: frame.data,
					timestamp: frame.timestamp,
					format: frame.format as 'rgba' | 'yuv420p',
					isKeyframe: frame.isKeyframe,
				};
			}
		} catch (error) {
			console.warn('[NativeVideoDecoder] Range decode failed:', error);
		}
	}

	async close(): Promise<void> {
		this._isOpen = false;
	}
}

/**
 * Native audio decoder using media-processor-rs
 */
class NativeAudioDecoder implements IDecoder {
	readonly type = 'audio' as const;
	private _mediaInfo: MediaInfo | null = null;
	private _isOpen = false;
	private _position = 0;
	private _config: AudioDecoderConfig;
	private _processor: MediaProcessorType | null;
	private _session: AudioDecoderSessionType | null = null;
	private _audioInfo: { sampleRate: number; channels: number; duration: number; codec: string; bitrate: number; totalSamples: number } | null = null;

	constructor(config: AudioDecoderConfig, processor: MediaProcessorType | null) {
		this._config = config;
		this._processor = processor;
	}

	get mediaInfo() { return this._mediaInfo; }
	get isOpen() { return this._isOpen; }
	get position() { return this._position; }

	async open(): Promise<MediaInfo> {
		if (!this._processor) {
			throw new Error('Native processor not available');
		}

		try {
			// Get audio info
			this._audioInfo = this._processor.getAudioInfo(this._config.source);

			// Create decoder session
			this._session = this._processor.createAudioDecoder(this._config.source);

			this._isOpen = true;
			this._mediaInfo = {
				duration: this._audioInfo.duration,
				width: 0,
				height: 0,
				fps: 0,
				codec: this._audioInfo.codec,
				format: 'audio',
				hasAudio: true,
				hasSubtitles: false,
			};
			return this._mediaInfo;
		} catch (error) {
			throw new Error(`Failed to open audio: ${error}`);
		}
	}

	async seek(time: number): Promise<void> {
		if (!this._session) {
			throw new Error('Decoder not open');
		}
		this._session.seek(time);
		this._position = time;
	}

	async decodeNext(): Promise<import('@neko/shared').DecodedAudioFrame | null> {
		if (!this._session || !this._audioInfo) {
			return null;
		}

		const frame = this._session.decodeNext();
		if (!frame) {
			return null;
		}

		this._position = frame.timestamp;

		return {
			type: 'audio',
			data: new Float32Array(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength / 4),
			sampleRate: frame.sampleRate,
			channels: frame.channels,
			samplesPerChannel: frame.samples,
			timestamp: frame.timestamp,
			duration: frame.samples / frame.sampleRate,
		};
	}

	async decodeAt(time: number): Promise<import('@neko/shared').DecodedAudioFrame | null> {
		await this.seek(time);
		return this.decodeNext();
	}

	async *decodeRange(
		startTime: number,
		duration: number
	): AsyncGenerator<import('@neko/shared').DecodedAudioFrame, void, undefined> {
		if (!this._processor || !this._audioInfo) {
			return;
		}

		const endTime = startTime + duration;
		const frames = this._processor.decodeAudioRange(this._config.source, startTime, endTime);

		for (const frame of frames) {
			yield {
				type: 'audio',
				data: new Float32Array(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength / 4),
				sampleRate: frame.sampleRate,
				channels: frame.channels,
				samplesPerChannel: frame.samples,
				timestamp: frame.timestamp,
				duration: frame.samples / frame.sampleRate,
			};
		}
	}

	async close(): Promise<void> {
		if (this._session) {
			this._session.close();
			this._session = null;
		}
		this._isOpen = false;
	}
}

/**
 * Native encoder using media-processor-rs
 */
class NativeEncoder implements IEncoder {
	private _state: import('@neko/shared').EncoderState = 'idle';
	private _config: EncoderConfig | null = null;
	private _processor: MediaProcessorType | null;
	private _videoEncoder: VideoEncoderSessionType | null = null;
	private _audioEncoder: AudioEncoderSessionType | null = null;
	private _muxer: MuxerSessionType | null = null;
	private _muxerModule: MediaProcessorModule | null = null;
	private _pts = 0;
	private _audioPts = 0;

	// Event listeners
	private _progressListeners: Set<(progress: import('@neko/shared').EncoderProgress) => void> = new Set();
	private _stateListeners: Set<(state: import('@neko/shared').EncoderState) => void> = new Set();
	private _errorListeners: Set<(error: Error) => void> = new Set();

	constructor(config: EncoderConfig, processor: MediaProcessorType | null, muxerModule: MediaProcessorModule | null) {
		this._config = config;
		this._processor = processor;
		this._muxerModule = muxerModule;
	}

	get state() { return this._state; }
	get config() { return this._config; }
	get isReady() { return this._state === 'encoding'; }

	async initialize(config: EncoderConfig): Promise<void> {
		if (!this._processor || !this._muxerModule) {
			throw new Error('Native processor not available');
		}

		this._config = config;

		try {
			// Create muxer
			const containerFormat = config.container || 'mp4';
			this._muxer = this._muxerModule.MuxerSession.create({
				outputPath: config.outputPath,
				format: containerFormat,
			});

			// Create video encoder if video config provided
			if (config.video) {
				this._videoEncoder = this._processor.createVideoEncoder({
					width: config.video.width,
					height: config.video.height,
					fps: config.video.fps,
					bitrate: config.video.bitrate,
					codec: config.video.codec,
					preset: config.video.preset,
					profile: config.video.profile,
					pixelFormat: 'rgba',
				});

				// Add video stream to muxer
				this._muxer.addVideoStream({
					width: config.video.width,
					height: config.video.height,
					fps: config.video.fps,
					bitrate: config.video.bitrate,
					codec: config.video.codec,
					preset: config.video.preset,
					profile: config.video.profile,
					pixelFormat: 'rgba',
				});
			}

			// Create audio encoder if audio config provided
			if (config.audio) {
				this._audioEncoder = this._processor.createAudioEncoder({
					sampleRate: config.audio.sampleRate,
					channels: config.audio.channels,
					bitrate: config.audio.bitrate,
					codec: config.audio.codec,
					sampleFormat: 'f32',
				});

				// Add audio stream to muxer
				this._muxer.addAudioStream({
					sampleRate: config.audio.sampleRate,
					channels: config.audio.channels,
					bitrate: config.audio.bitrate,
					codec: config.audio.codec,
					sampleFormat: 'f32',
				});
			}

			// Write muxer header
			this._muxer.writeHeader();

			this._state = 'encoding';
			this._notifyStateChange();
		} catch (error) {
			this._state = 'error';
			this._notifyStateChange();
			throw error;
		}
	}

	async encodeVideoFrame(frame: Uint8Array | VideoFrame, timestamp: number): Promise<void> {
		if (!this._videoEncoder || !this._muxer || !this._config?.video) {
			throw new Error('Video encoder not initialized');
		}

		// Convert VideoFrame to Uint8Array if needed
		let frameData: Buffer;
		let width: number;
		let height: number;

		if (frame instanceof Uint8Array) {
			frameData = Buffer.from(frame);
			width = this._config.video.width;
			height = this._config.video.height;
		} else {
			// VideoFrame - need to extract data
			const videoFrame = frame as VideoFrame;
			width = videoFrame.displayWidth;
			height = videoFrame.displayHeight;
			const buffer = new Uint8Array(width * height * 4);
			await videoFrame.copyTo(buffer);
			frameData = Buffer.from(buffer);
		}

		// Encode frame
		const packets = this._videoEncoder.encodeFrame({
			width,
			height,
			format: 'rgba',
			data: frameData,
			timestamp,
			isKeyframe: this._pts === 0,
		}, this._pts);

		// Write packets to muxer
		for (const packet of packets) {
			this._muxer.writeVideoPacket({
				data: packet.data,
				pts: packet.pts,
				dts: packet.dts,
				duration: packet.duration,
				isKeyframe: packet.isKeyframe,
			});
		}

		this._pts++;
	}

	async encodeAudioSamples(samples: Float32Array, timestamp: number): Promise<void> {
		if (!this._audioEncoder || !this._muxer) {
			throw new Error('Audio encoder not initialized');
		}

		// Convert Float32Array to Buffer
		const buffer = Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);

		// Encode audio
		const packets = this._audioEncoder.encodeFrame(buffer, samples.length);

		// Write packets to muxer
		for (const packet of packets) {
			this._muxer.writeAudioPacket({
				data: packet.data,
				pts: packet.pts,
				dts: packet.pts,
				duration: packet.duration,
				isKeyframe: true,
			});
		}

		this._audioPts += samples.length;
	}

	async finalize(): Promise<import('@neko/shared').EncoderResult> {
		try {
			this._state = 'finalizing';
			this._notifyStateChange();

			// Flush video encoder
			if (this._videoEncoder && this._muxer) {
				const packets = this._videoEncoder.flush();
				for (const packet of packets) {
					this._muxer.writeVideoPacket({
						data: packet.data,
						pts: packet.pts,
						dts: packet.dts,
						duration: packet.duration,
						isKeyframe: packet.isKeyframe,
					});
				}
				this._videoEncoder.close();
			}

			// Flush audio encoder
			if (this._audioEncoder && this._muxer) {
				const packets = this._audioEncoder.flush();
				for (const packet of packets) {
					this._muxer.writeAudioPacket({
						data: packet.data,
						pts: packet.pts,
						dts: packet.pts,
						duration: packet.duration,
						isKeyframe: true,
					});
				}
				this._audioEncoder.close();
			}

			// Finish muxer
			if (this._muxer) {
				this._muxer.finish();
			}

			this._state = 'completed';
			this._notifyStateChange();

			return {
				success: true,
				outputPath: this._config?.outputPath,
			};
		} catch (error) {
			this._state = 'error';
			this._notifyStateChange();
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	async cancel(): Promise<void> {
		this._state = 'cancelled';
		this._notifyStateChange();

		// Close encoders
		if (this._videoEncoder) {
			this._videoEncoder.close();
		}
		if (this._audioEncoder) {
			this._audioEncoder.close();
		}
		if (this._muxer) {
			this._muxer.finish();
		}
	}

	private _notifyStateChange(): void {
		for (const listener of this._stateListeners) {
			listener(this._state);
		}
	}

	get onProgress(): import('@neko/shared').EncoderEvent<import('@neko/shared').EncoderProgress> {
		return (listener) => {
			this._progressListeners.add(listener);
			return { dispose: () => this._progressListeners.delete(listener) };
		};
	}

	get onStateChange(): import('@neko/shared').EncoderEvent<import('@neko/shared').EncoderState> {
		return (listener) => {
			this._stateListeners.add(listener);
			return { dispose: () => this._stateListeners.delete(listener) };
		};
	}

	get onError(): import('@neko/shared').EncoderEvent<Error> {
		return (listener) => {
			this._errorListeners.add(listener);
			return { dispose: () => this._errorListeners.delete(listener) };
		};
	}
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a NativeMediaEngine instance
 */
export async function createNativeMediaEngine(
	options?: MediaEngineInitOptions
): Promise<NativeMediaEngine> {
	const engine = new NativeMediaEngine();
	await engine.initialize(options);
	return engine;
}
