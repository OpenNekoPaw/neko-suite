/**
 * WebCodecs Video Encoder
 *
 * Implements IEncoder using WebCodecs API for hardware-accelerated
 * video encoding in the browser/Webview environment.
 *
 * Supported codecs: H.264, VP8
 */

import type {
	IStreamingEncoder,
	EncoderConfig,
	EncoderState,
	EncoderProgress,
	EncoderResult,
	EncoderEvent,
} from '@neko/shared';

// =============================================================================
// Types
// =============================================================================

interface EncodedChunk {
	data: Uint8Array;
	timestamp: number;
	type: 'key' | 'delta';
	duration?: number;
}

type EventListener<T> = (data: T) => void;

// =============================================================================
// WebCodecs Video Encoder
// =============================================================================

/**
 * WebCodecs-based video encoder for basic mode
 *
 * Uses the browser's WebCodecs API for hardware-accelerated encoding.
 * Outputs encoded chunks that need to be muxed into a container.
 */
export class WebCodecsEncoder implements IStreamingEncoder {
	private _state: EncoderState = 'idle';
	private _config: EncoderConfig | null = null;
	private _encoder: VideoEncoder | null = null;

	// Encoded output
	private _encodedChunks: EncodedChunk[] = [];
	private _encodedFrames = 0;
	private _startTime = 0;

	// Backpressure control
	private _pendingFrames = 0;
	private _maxQueueSize = 10;
	private _capacityResolvers: Array<() => void> = [];

	// Event listeners
	private _progressListeners: Set<EventListener<EncoderProgress>> = new Set();
	private _stateListeners: Set<EventListener<EncoderState>> = new Set();
	private _errorListeners: Set<EventListener<Error>> = new Set();
	private _backpressureListeners: Set<EventListener<{ shouldPause: boolean; pendingFrames: number }>> = new Set();

	// =========================================================================
	// Properties
	// =========================================================================

	get state(): EncoderState {
		return this._state;
	}

	get config(): EncoderConfig | null {
		return this._config;
	}

	get isReady(): boolean {
		return this._state === 'encoding';
	}

	get canAcceptFrame(): boolean {
		return this._pendingFrames < this._maxQueueSize;
	}

	get pendingFrames(): number {
		return this._pendingFrames;
	}

	get maxQueueSize(): number {
		return this._maxQueueSize;
	}

	// =========================================================================
	// Lifecycle
	// =========================================================================

	async initialize(config: EncoderConfig): Promise<void> {
		if (this._state !== 'idle') {
			throw new Error(`Cannot initialize encoder in state: ${this._state}`);
		}

		this._config = config;
		this._setState('initializing');

		try {
			// Create WebCodecs encoder
			this._encoder = new VideoEncoder({
				output: (chunk, metadata) => this.handleEncodedChunk(chunk, metadata),
				error: (error) => this.handleError(error),
			});

			// Configure encoder
			const videoConfig = config.video;
			if (!videoConfig) {
				throw new Error('Video configuration is required');
			}

			const codecString = this.mapCodecString(videoConfig.codec);

			this._encoder.configure({
				codec: codecString,
				width: videoConfig.width,
				height: videoConfig.height,
				framerate: videoConfig.fps,
				bitrate: videoConfig.bitrate ?? this.getDefaultBitrate(videoConfig.width, videoConfig.height),
				latencyMode: 'quality',
			});

			this._startTime = performance.now();
			this._setState('encoding');
		} catch (error) {
			this._setState('error');
			throw error;
		}
	}

	async cancel(): Promise<void> {
		if (this._encoder) {
			this._encoder.close();
			this._encoder = null;
		}

		this._encodedChunks = [];
		this._setState('cancelled');
	}

	// =========================================================================
	// Encoding
	// =========================================================================

	async encodeVideoFrame(
		frame: Uint8Array | VideoFrame,
		timestamp: number
	): Promise<void> {
		if (this._state !== 'encoding' || !this._encoder) {
			throw new Error(`Cannot encode frame in state: ${this._state}`);
		}

		// Wait for capacity if queue is full
		if (!this.canAcceptFrame) {
			await this.waitForCapacity();
		}

		this._pendingFrames++;

		let videoFrame: VideoFrame;

		if (frame instanceof VideoFrame) {
			videoFrame = frame;
		} else {
			// Create VideoFrame from raw pixels
			const config = this._config?.video;
			if (!config) {
				throw new Error('Video configuration not available');
			}

			videoFrame = new VideoFrame(frame, {
				format: 'RGBA',
				codedWidth: config.width,
				codedHeight: config.height,
				timestamp,
			});
		}

		// Determine if this should be a keyframe
		const keyFrame = this._encodedFrames % (this._config?.video?.gopSize ?? 30) === 0;

		this._encoder.encode(videoFrame, { keyFrame });

		// Close the frame if we created it
		if (!(frame instanceof VideoFrame)) {
			videoFrame.close();
		}
	}

	async encodeAudioSamples(
		_samples: Float32Array,
		_timestamp: number
	): Promise<void> {
		// WebCodecs VideoEncoder doesn't handle audio
		// Audio encoding would need a separate AudioEncoder
		console.warn('[WebCodecsEncoder] Audio encoding not implemented in basic mode');
	}

	async finalize(): Promise<EncoderResult> {
		if (this._state !== 'encoding' || !this._encoder) {
			return {
				success: false,
				error: `Cannot finalize in state: ${this._state}`,
			};
		}

		this._setState('finalizing');

		try {
			// Flush remaining frames
			await this._encoder.flush();
			this._encoder.close();
			this._encoder = null;

			const totalTime = performance.now() - this._startTime;

			// Note: Actual file writing and muxing happens externally
			// This encoder only produces encoded chunks

			this._setState('completed');

			return {
				success: true,
				totalTimeMs: totalTime,
				averageFps: (this._encodedFrames / totalTime) * 1000,
			};
		} catch (error) {
			this._setState('error');
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	// =========================================================================
	// Backpressure Control
	// =========================================================================

	async waitForCapacity(signal?: AbortSignal): Promise<void> {
		if (this.canAcceptFrame) {
			return;
		}

		return new Promise((resolve, reject) => {
			if (signal?.aborted) {
				reject(new Error('Aborted'));
				return;
			}

			const onAbort = () => {
				reject(new Error('Aborted'));
			};

			signal?.addEventListener('abort', onAbort, { once: true });

			this._capacityResolvers.push(() => {
				signal?.removeEventListener('abort', onAbort);
				resolve();
			});
		});
	}

	/**
	 * Get encoded chunks (for muxer integration)
	 */
	getEncodedChunks(): EncodedChunk[] {
		const chunks = this._encodedChunks;
		this._encodedChunks = [];
		return chunks;
	}

	// =========================================================================
	// Events
	// =========================================================================

	get onProgress(): EncoderEvent<EncoderProgress> {
		return (listener: (progress: EncoderProgress) => void) => {
			this._progressListeners.add(listener);
			return {
				dispose: () => this._progressListeners.delete(listener),
			};
		};
	}

	get onStateChange(): EncoderEvent<EncoderState> {
		return (listener: (state: EncoderState) => void) => {
			this._stateListeners.add(listener);
			return {
				dispose: () => this._stateListeners.delete(listener),
			};
		};
	}

	get onError(): EncoderEvent<Error> {
		return (listener: (error: Error) => void) => {
			this._errorListeners.add(listener);
			return {
				dispose: () => this._errorListeners.delete(listener),
			};
		};
	}

	get onBackpressure(): EncoderEvent<{ shouldPause: boolean; pendingFrames: number }> {
		return (listener: (data: { shouldPause: boolean; pendingFrames: number }) => void) => {
			this._backpressureListeners.add(listener);
			return {
				dispose: () => this._backpressureListeners.delete(listener),
			};
		};
	}

	// =========================================================================
	// Private Methods
	// =========================================================================

	private handleEncodedChunk(
		chunk: EncodedVideoChunk,
		_metadata?: EncodedVideoChunkMetadata
	): void {
		// Copy chunk data
		const data = new Uint8Array(chunk.byteLength);
		chunk.copyTo(data);

		this._encodedChunks.push({
			data,
			timestamp: chunk.timestamp,
			type: chunk.type,
			duration: chunk.duration ?? undefined,
		});

		this._encodedFrames++;
		this._pendingFrames = Math.max(0, this._pendingFrames - 1);

		// Emit progress
		this.emitProgress();

		// Check backpressure
		this.checkBackpressure();

		// Resolve capacity waiters
		if (this.canAcceptFrame && this._capacityResolvers.length > 0) {
			const resolver = this._capacityResolvers.shift();
			resolver?.();
		}
	}

	private handleError(error: DOMException): void {
		console.error('[WebCodecsEncoder] Encode error:', error);
		this._setState('error');

		for (const listener of this._errorListeners) {
			listener(new Error(error.message));
		}
	}

	private _setState(state: EncoderState): void {
		this._state = state;
		for (const listener of this._stateListeners) {
			listener(state);
		}
	}

	private emitProgress(): void {
		const elapsed = performance.now() - this._startTime;
		const progress: EncoderProgress = {
			encodedFrames: this._encodedFrames,
			totalFrames: this._config?.totalFrames,
			percent: this._config?.totalFrames
				? (this._encodedFrames / this._config.totalFrames) * 100
				: 0,
			currentFps: (this._encodedFrames / elapsed) * 1000,
			elapsedMs: elapsed,
			currentSize: this._encodedChunks.reduce((sum, c) => sum + c.data.byteLength, 0),
		};

		for (const listener of this._progressListeners) {
			listener(progress);
		}
	}

	private checkBackpressure(): void {
		const shouldPause = !this.canAcceptFrame;

		for (const listener of this._backpressureListeners) {
			listener({ shouldPause, pendingFrames: this._pendingFrames });
		}
	}

	private mapCodecString(codec: string): string {
		// Get resolution to determine appropriate AVC level
		const width = this._config?.video?.width ?? 1920;
		const height = this._config?.video?.height ?? 1080;
		const pixels = width * height;

		// Determine AVC level based on resolution
		// Level 3.0 (1E): max 414720 pixels (~720x576)
		// Level 3.1 (1F): max 921600 pixels (~1280x720)
		// Level 4.0 (28): max 2097152 pixels (1920x1080)
		// Level 4.1 (29): max 2097152 pixels (1920x1080, higher bitrate)
		// Level 5.0 (32): max 8912896 pixels (4K)
		// Level 5.1 (33): max 8912896 pixels (4K, higher framerate)
		let level = '1E'; // Default Level 3.0
		if (pixels > 2097152) {
			level = '33'; // Level 5.1 for 4K+
		} else if (pixels > 921600) {
			level = '29'; // Level 4.1 for 1080p
		} else if (pixels > 414720) {
			level = '1F'; // Level 3.1 for 720p
		}

		const codecMap: Record<string, string> = {
			h264: `avc1.4200${level}`,        // Baseline Profile
			'h264-main': `avc1.4D00${level}`, // Main Profile
			'h264-high': `avc1.6400${level}`, // High Profile
			vp8: 'vp8',
			vp9: 'vp09.00.10.08',
		};

		return codecMap[codec.toLowerCase()] ?? codec;
	}

	private getDefaultBitrate(width: number, height: number): number {
		const pixels = width * height;

		if (pixels <= 640 * 480) return 1_000_000; // 1 Mbps for SD
		if (pixels <= 1280 * 720) return 2_500_000; // 2.5 Mbps for 720p
		if (pixels <= 1920 * 1080) return 5_000_000; // 5 Mbps for 1080p
		return 10_000_000; // 10 Mbps for 4K
	}
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a WebCodecs encoder
 */
export function createWebCodecsEncoder(): WebCodecsEncoder {
	return new WebCodecsEncoder();
}

/**
 * Check if a codec is supported for encoding
 */
export async function isEncoderCodecSupported(codec: string): Promise<boolean> {
	if (typeof VideoEncoder === 'undefined') {
		return false;
	}

	// Use Level 4.1 for 1080p support check
	const codecMap: Record<string, string> = {
		h264: 'avc1.420029',      // Baseline Profile, Level 4.1
		'h264-main': 'avc1.4D0029', // Main Profile, Level 4.1
		'h264-high': 'avc1.640029', // High Profile, Level 4.1
		vp8: 'vp8',
		vp9: 'vp09.00.10.08',
	};

	const codecString = codecMap[codec.toLowerCase()] ?? codec;

	try {
		const support = await VideoEncoder.isConfigSupported({
			codec: codecString,
			width: 1920,
			height: 1080,
		});
		return support.supported ?? false;
	} catch {
		return false;
	}
}
