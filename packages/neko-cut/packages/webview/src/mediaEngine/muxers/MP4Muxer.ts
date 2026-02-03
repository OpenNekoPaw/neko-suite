/**
 * MP4 Muxer
 *
 * Implements IMuxer using mp4-muxer library for MP4 container format.
 * Supports H.264/H.265/VP9/AV1 video and AAC/Opus audio.
 */

import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import type {
	IMuxer,
	MuxerConfig,
	MuxerState,
	MuxerProgress,
	MuxerResult,
	MuxerVideoChunk,
	MuxerAudioChunk,
	MuxerEvent,
} from '@uniedit/shared';

// =============================================================================
// MP4Muxer Implementation
// =============================================================================

export class MP4Muxer implements IMuxer {
	private _state: MuxerState = 'idle';
	private _muxer: Muxer<ArrayBufferTarget> | null = null;
	private _target: ArrayBufferTarget | null = null;

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

		if (config.format !== 'mp4') {
			throw new Error('MP4Muxer only supports MP4 format');
		}

		this._setState('initializing');

		try {
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
				fastStart:
					config.fastStart === true
						? 'in-memory'
						: config.fastStart === false
							? false
							: (config.fastStart ?? 'in-memory'),
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
			undefined, // metadata
			chunk.compositionTimeOffset ?? 0
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
			const blob = new Blob([buffer], { type: 'video/mp4' });

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

	private _mapVideoCodec(codec: string): 'avc' | 'hevc' | 'vp9' | 'av1' {
		switch (codec) {
			case 'h264':
				return 'avc';
			case 'h265':
				return 'hevc';
			case 'vp9':
				return 'vp9';
			case 'av1':
				return 'av1';
			default:
				return 'avc';
		}
	}

	private _mapAudioCodec(codec: string): 'aac' | 'opus' {
		return codec === 'opus' ? 'opus' : 'aac';
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
 * Create a new MP4Muxer instance
 */
export function createMP4Muxer(): MP4Muxer {
	return new MP4Muxer();
}

/**
 * Check if MP4 muxing is available
 */
export function isMP4MuxerAvailable(): boolean {
	try {
		// Check if mp4-muxer is available
		return typeof Muxer !== 'undefined';
	} catch {
		return false;
	}
}
