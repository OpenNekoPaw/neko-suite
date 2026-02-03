/**
 * StreamingAudioDecoderService
 *
 * 流式音频解码服务 - Compat 模式实时预览音频
 *
 * 职责：
 * - 使用 Rust N-API 实时解码和混音多轨道音频
 * - 输出 PCM 音频数据（f32le 格式，适配 Web Audio API）
 * - 支持播放控制（播放、暂停、seek）
 *
 * 架构（符合 docs/principle.md）：
 * ```
 * Rust N-API（解封+解码）→ TypeScript 混音 → WebSocket 输出 → Webview 播放音频
 * ```
 */

import type { ProjectData } from '@uniedit/shared';
import { getAudioCompositionService } from './AudioCompositionService';
import * as path from 'path';

// =============================================================================
// Types
// =============================================================================

/**
 * 音频解码器配置
 */
export interface AudioDecoderConfig {
	/** 采样率（默认 48000） */
	sampleRate?: number;
	/** 声道数（默认 2） */
	channels?: number;
	/** 缓冲区大小（样本数，默认 4096） */
	bufferSize?: number;
}

/**
 * 音频数据回调
 */
export type AudioDataCallback = (pcmData: Float32Array, timestamp: number) => void;

/**
 * 解码器状态
 */
export type AudioDecoderState = 'idle' | 'starting' | 'decoding' | 'paused' | 'completed' | 'error';

/**
 * 音频轨道信息
 */
interface AudioTrack {
	path: string;
	startTime: number;
	duration: number;
	volume: number;
	decoder: any; // AudioDecoderSession
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_SAMPLE_RATE = 48000;
const DEFAULT_CHANNELS = 2;
const DEFAULT_BUFFER_SIZE = 4096; // ~85ms at 48kHz

// =============================================================================
// Service Implementation
// =============================================================================

export class StreamingAudioDecoderService {
	private _config: Required<AudioDecoderConfig>;
	private _state: AudioDecoderState = 'idle';
	private _currentTime = 0;
	private _isDisposed = false;
	private _dataCallback: AudioDataCallback | null = null;
	private _projectRoot = '';
	private _decodingInterval: ReturnType<typeof setInterval> | null = null;
	private _audioTracks: AudioTrack[] = [];
	private _endTime = 0;

	constructor(config: AudioDecoderConfig) {
		this._config = {
			sampleRate: config.sampleRate ?? DEFAULT_SAMPLE_RATE,
			channels: config.channels ?? DEFAULT_CHANNELS,
			bufferSize: config.bufferSize ?? DEFAULT_BUFFER_SIZE,
		};
	}

	// ---------------------------------------------------------------------------
	// Public API
	// ---------------------------------------------------------------------------

	/**
	 * 获取当前状态
	 */
	get state(): AudioDecoderState {
		return this._state;
	}

	/**
	 * 获取当前播放时间
	 */
	get currentTime(): number {
		return this._currentTime;
	}

	/**
	 * 设置音频数据回调
	 */
	setDataCallback(callback: AudioDataCallback | null): void {
		this._dataCallback = callback;
	}

	/**
	 * 开始播放项目音频
	 * @param project 项目数据
	 * @param projectRoot 项目根目录
	 * @param startTime 开始时间（秒）
	 * @param duration 总时长（秒）
	 */
	async startPlayback(
		project: ProjectData,
		projectRoot: string,
		startTime: number,
		duration: number
	): Promise<void> {
		// Stop any existing playback
		this.stop();

		this._projectRoot = projectRoot;
		this._currentTime = startTime;
		this._endTime = startTime + duration;
		this._state = 'starting';

		// Get audio sources from project
		const audioService = getAudioCompositionService();
		const filterChain = audioService.buildAudioFilterChain(
			project,
			projectRoot,
			duration,
			this._config.sampleRate,
			this._config.channels
		);

		if (!filterChain) {
			console.log('[StreamingAudioDecoderService] No audio sources in project');
			this._state = 'completed';
			return;
		}

		try {
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const { MediaProcessor } = require('@vedit/media-processor-rs');
			const processor = await MediaProcessor.create();

			// Initialize audio decoders for each input
			this._audioTracks = [];
			for (const inputPath of filterChain.inputs) {
				try {
					const decoder = processor.createAudioDecoder(inputPath);
					decoder.seek(startTime);

					this._audioTracks.push({
						path: inputPath,
						startTime: 0,
						duration: decoder.getInfo().duration,
						volume: 1.0,
						decoder,
					});
				} catch (error) {
					console.warn(`[StreamingAudioDecoderService] Failed to create decoder for ${inputPath}:`, error);
				}
			}

			processor.dispose();

			if (this._audioTracks.length === 0) {
				console.log('[StreamingAudioDecoderService] No valid audio tracks');
				this._state = 'completed';
				return;
			}

			console.log(
				`[StreamingAudioDecoderService] Starting audio playback: ` +
				`startTime=${startTime}s, duration=${duration}s, ` +
				`tracks=${this._audioTracks.length}`
			);

			this._state = 'decoding';
			this._startDecodingLoop();
		} catch (error) {
			console.error('[StreamingAudioDecoderService] Failed to start playback:', error);
			this._state = 'error';
		}
	}

	/**
	 * 开始播放单个音频文件
	 * @param audioPath 音频文件路径
	 * @param startTime 开始时间（秒）
	 * @param volume 音量（0-1）
	 */
	async startSingleFile(
		audioPath: string,
		startTime: number,
		volume = 1.0
	): Promise<void> {
		// Stop any existing playback
		this.stop();

		this._currentTime = startTime;
		this._state = 'starting';

		try {
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const { MediaProcessor } = require('@vedit/media-processor-rs');
			const processor = await MediaProcessor.create();

			const decoder = processor.createAudioDecoder(audioPath);
			const info = decoder.getInfo();
			decoder.seek(startTime);

			this._audioTracks = [{
				path: audioPath,
				startTime: 0,
				duration: info.duration,
				volume,
				decoder,
			}];

			this._endTime = info.duration;

			processor.dispose();

			console.log(
				`[StreamingAudioDecoderService] Starting single file playback: ` +
				`${audioPath}, startTime=${startTime}s, volume=${volume}`
			);

			this._state = 'decoding';
			this._startDecodingLoop();
		} catch (error) {
			console.error('[StreamingAudioDecoderService] Failed to start single file:', error);
			this._state = 'error';
		}
	}

	/**
	 * 暂停播放
	 */
	pause(): void {
		if (this._state === 'decoding') {
			this._stopDecodingLoop();
			this._state = 'paused';
		}
	}

	/**
	 * 恢复播放
	 */
	resume(): void {
		if (this._state === 'paused') {
			this._state = 'decoding';
			this._startDecodingLoop();
		}
	}

	/**
	 * 停止播放
	 */
	stop(): void {
		this._stopDecodingLoop();

		// Close all decoders
		for (const track of this._audioTracks) {
			try {
				track.decoder.close();
			} catch {
				// Ignore close errors
			}
		}
		this._audioTracks = [];

		this._state = 'idle';
		this._currentTime = 0;
	}

	/**
	 * 释放资源
	 */
	dispose(): void {
		if (this._isDisposed) return;
		this._isDisposed = true;
		this.stop();
		this._dataCallback = null;
	}

	// ---------------------------------------------------------------------------
	// Private Methods
	// ---------------------------------------------------------------------------

	/**
	 * 启动解码循环
	 */
	private _startDecodingLoop(): void {
		if (this._decodingInterval) return;

		const intervalMs = (this._config.bufferSize / this._config.sampleRate) * 1000;

		this._decodingInterval = setInterval(() => {
			this._decodeAndMixBuffer();
		}, intervalMs * 0.8); // Slightly faster to prevent underrun
	}

	/**
	 * 停止解码循环
	 */
	private _stopDecodingLoop(): void {
		if (this._decodingInterval) {
			clearInterval(this._decodingInterval);
			this._decodingInterval = null;
		}
	}

	/**
	 * 解码并混音一个缓冲区
	 */
	private _decodeAndMixBuffer(): void {
		if (this._state !== 'decoding') return;

		// Check if we've reached the end
		if (this._currentTime >= this._endTime) {
			this._state = 'completed';
			this._stopDecodingLoop();
			return;
		}

		const bufferSize = this._config.bufferSize;
		const channels = this._config.channels;
		const mixedBuffer = new Float32Array(bufferSize * channels);

		let hasData = false;

		// Decode and mix all tracks
		for (const track of this._audioTracks) {
			try {
				const frame = track.decoder.decodeNext();
				if (!frame) continue;

				hasData = true;

				// Convert to Float32 and mix
				const frameData = new Float32Array(
					frame.data.buffer,
					frame.data.byteOffset,
					frame.samples * frame.channels
				);

				// Mix with volume
				const volume = track.volume;
				const samplesToMix = Math.min(frameData.length, mixedBuffer.length);

				for (let i = 0; i < samplesToMix; i++) {
					mixedBuffer[i] += (frameData[i] ?? 0) * volume;
				}
			} catch (error) {
				// Track might have ended
				console.debug(`[StreamingAudioDecoderService] Track decode error:`, error);
			}
		}

		// Clamp mixed values to [-1, 1]
		for (let i = 0; i < mixedBuffer.length; i++) {
			const val = mixedBuffer[i];
			if (val !== undefined) {
				mixedBuffer[i] = Math.max(-1, Math.min(1, val));
			}
		}

		// Update timestamp
		const timestamp = this._currentTime;
		this._currentTime += bufferSize / this._config.sampleRate;

		// Call callback
		if (this._dataCallback && hasData) {
			this._dataCallback(mixedBuffer, timestamp);
		}

		// Check if all tracks are done
		if (!hasData) {
			this._state = 'completed';
			this._stopDecodingLoop();
		}
	}
}

// =============================================================================
// Singleton
// =============================================================================

let _instance: StreamingAudioDecoderService | null = null;

export function getStreamingAudioDecoderService(config: AudioDecoderConfig): StreamingAudioDecoderService {
	if (!_instance) {
		_instance = new StreamingAudioDecoderService(config);
	}
	return _instance;
}

export function disposeStreamingAudioDecoderService(): void {
	if (_instance) {
		_instance.dispose();
		_instance = null;
	}
}
