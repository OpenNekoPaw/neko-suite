/**
 * WebM Muxer
 *
 * Implements IMuxer using webm-muxer library for WebM container format.
 * Supports VP8/VP9/AV1 video and Opus/Vorbis audio.
 */

import type {
	IMuxer,
	MuxerConfig,
	MuxerState,
	MuxerProgress,
	MuxerResult,
	MuxerVideoChunk,
	MuxerAudioChunk,
	MuxerEvent,
} from '@neko/shared';

// =============================================================================
// Types
// =============================================================================

/**
 * WebM Muxer instance type (simplified)
 * Full type would come from webm-muxer package
 */
interface WebMMuxerInstance {
	addVideoChunkRaw(
		data: Uint8Array,
		type: 'key' | 'delta',
		timestamp: number,
		duration?: number,
		meta?: unknown
	): void;
	addAudioChunkRaw(
		data: Uint8Array,
		type: 'key' | 'delta',
		timestamp: number,
		duration?: number,
		meta?: unknown
	): void;
	finalize(): void;
}

interface ArrayBufferTargetInstance {
	buffer: ArrayBuffer;
}

// =============================================================================
// WebMMuxer Implementation
// =============================================================================

export class WebMMuxer implements IMuxer {
	private _state: MuxerState = 'idle';
	private _muxer: WebMMuxerInstance | null = null;
	private _target: ArrayBufferTargetInstance | null = null;

	// Statistics
	private _videoFrameCount = 0;
	private _audioChunkCount = 0;
	private _lastTimestamp = 0;

	// Event listeners
	private _progressListeners = new Set<(p: MuxerProgress) => void>();

	// =========================================================================
	// Properties
	// =========================================================================

	get state(): MuxerState {
		return this._state;
	}

	get isReady(): boolean {
		return this._state === 'muxing';
	}

	// =========================================================================
	// Lifecycle
	// =========================================================================

	async initialize(config: MuxerConfig): Promise<void> {
		if (this._state !== 'idle') {
			throw new Error(`Cannot initialize in state: ${this._state}`);
		}

		if (config.format !== 'webm') {
			throw new Error('WebMMuxer only supports WebM format');
		}

		this._setState('initializing');

		try {
			// Dynamically import webm-muxer
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const webmMuxerModule = await import('webm-muxer' as any).catch(() => null);
			if (!webmMuxerModule?.Muxer || !webmMuxerModule?.ArrayBufferTarget) {
				throw new Error('webm-muxer is not available. Please install webm-muxer package.');
			}

			const { Muxer, ArrayBufferTarget } = webmMuxerModule;

			this._target = new ArrayBufferTarget();

			// Map video codec
			const videoCodec = this._mapVideoCodec(config.video.codec);

			// Create Muxer instance
			this._muxer = new Muxer({
				target: this._target,
				video: {
					codec: videoCodec,
					width: config.video.width,
					height: config.video.height,
				},
				audio: config.audio
					? {
							codec: this._mapAudioCodec(config.audio.codec),
							sampleRate: config.audio.sampleRate,
							numberOfChannels: config.audio.channels,
						}
					: undefined,
				firstTimestampBehavior: config.firstTimestampBehavior ?? 'offset',
			});

			this._setState('muxing');
		} catch (error) {
			this._setState('error');
			throw error;
		}
	}

	addVideoChunk(chunk: MuxerVideoChunk): void {
		if (this._state !== 'muxing' || !this._muxer) {
			throw new Error(`Cannot add video chunk in state: ${this._state}`);
		}

		// Use addVideoChunkRaw for raw encoded data
		this._muxer.addVideoChunkRaw(
			chunk.data,
			chunk.type,
			chunk.timestamp,
			chunk.duration ?? 0,
			undefined // metadata
		);

		this._videoFrameCount++;
		this._lastTimestamp = Math.max(this._lastTimestamp, chunk.timestamp);
		this._emitProgress();
	}

	addAudioChunk(chunk: MuxerAudioChunk): void {
		if (this._state !== 'muxing' || !this._muxer) {
			throw new Error(`Cannot add audio chunk in state: ${this._state}`);
		}

		// Use addAudioChunkRaw for raw encoded data
		this._muxer.addAudioChunkRaw(
			chunk.data,
			chunk.isKeyframe ? 'key' : 'delta',
			chunk.timestamp,
			chunk.duration,
			undefined // metadata
		);

		this._audioChunkCount++;
		this._emitProgress();
	}

	async finalize(): Promise<MuxerResult> {
		if (this._state !== 'muxing' || !this._muxer || !this._target) {
			return {
				success: false,
				error: `Cannot finalize in state: ${this._state}`,
			};
		}

		this._setState('finalizing');

		try {
			this._muxer.finalize();

			const buffer = this._target.buffer;
			const blob = new Blob([buffer], { type: 'video/webm' });

			this._setState('completed');

			return {
				success: true,
				blob,
				fileSize: buffer.byteLength,
				duration: this._lastTimestamp / 1_000_000, // microseconds to seconds
			};
		} catch (error) {
			this._setState('error');
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	cancel(): void {
		this._muxer = null;
		this._target = null;
		this._setState('cancelled');
	}

	dispose(): void {
		this._muxer = null;
		this._target = null;
		this._progressListeners.clear();
	}

	// =========================================================================
	// Events
	// =========================================================================

	get onProgress(): MuxerEvent<MuxerProgress> {
		return (listener) => {
			this._progressListeners.add(listener);
			return { dispose: () => this._progressListeners.delete(listener) };
		};
	}

	// =========================================================================
	// Private Methods
	// =========================================================================

	private _mapVideoCodec(codec: string): 'V_VP8' | 'V_VP9' | 'V_AV1' {
		switch (codec) {
			case 'vp8':
				return 'V_VP8';
			case 'vp9':
				return 'V_VP9';
			case 'av1':
				return 'V_AV1';
			default:
				return 'V_VP9'; // Default to VP9 for WebM
		}
	}

	private _mapAudioCodec(codec: string): 'A_OPUS' | 'A_VORBIS' {
		return codec === 'vorbis' ? 'A_VORBIS' : 'A_OPUS';
	}

	private _setState(state: MuxerState): void {
		this._state = state;
	}

	private _emitProgress(): void {
		const progress: MuxerProgress = {
			videoFrames: this._videoFrameCount,
			audioChunks: this._audioChunkCount,
			currentSize: this._target?.buffer?.byteLength ?? 0,
			processedDuration: this._lastTimestamp / 1_000_000,
		};

		for (const listener of this._progressListeners) {
			listener(progress);
		}
	}
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a new WebMMuxer instance
 */
export function createWebMMuxer(): WebMMuxer {
	return new WebMMuxer();
}

/**
 * Check if WebM muxing is available
 */
export async function isWebMMuxerAvailable(): Promise<boolean> {
	try {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const webmMuxerModule = await import('webm-muxer' as any);
		return typeof webmMuxerModule?.Muxer !== 'undefined';
	} catch {
		return false;
	}
}
