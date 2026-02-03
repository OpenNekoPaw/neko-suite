/**
 * AudioVideoSyncController - 音视频同步控制器
 *
 * 职责：
 * - 基于时间戳对齐音视频
 * - 管理音频缓冲队列
 * - 视频帧等待/丢弃策略
 * - 支持 Scrubbing 模式切换
 *
 * 架构（符合 docs/principle.md）：
 * ```
 * Video WebSocket ──► SyncController ──► Canvas 渲染
 * Audio WebSocket ──►      │         ──► Web Audio API
 *                          │
 *                    时间戳对齐
 * ```
 */

// =============================================================================
// Types
// =============================================================================

/**
 * 同步状态
 */
export type SyncState = 'idle' | 'buffering' | 'playing' | 'scrubbing' | 'seeking';

/**
 * 视频帧数据
 */
export interface VideoFrame {
	/** JPEG 数据 */
	data: ArrayBuffer;
	/** 时间戳（秒） */
	timestamp: number;
	/** 宽度 */
	width: number;
	/** 高度 */
	height: number;
	/** 接收时间 */
	receivedAt: number;
}

/**
 * 音频块数据
 */
export interface AudioChunk {
	/** PCM 数据（Float32Array） */
	data: Float32Array;
	/** 时间戳（秒） */
	timestamp: number;
	/** 接收时间 */
	receivedAt: number;
}

/**
 * 同步配置
 */
export interface SyncConfig {
	/** 音频缓冲时长（秒，默认 0.2） */
	audioBufferDuration?: number;
	/** 最大音视频偏差（秒，默认 0.04） */
	maxSyncDrift?: number;
	/** 视频帧丢弃阈值（秒，默认 0.1） */
	frameDropThreshold?: number;
	/** 采样率（默认 48000） */
	sampleRate?: number;
	/** 声道数（默认 2） */
	channels?: number;
}

/**
 * 同步统计
 */
export interface SyncStats {
	/** 视频帧接收数 */
	videoFramesReceived: number;
	/** 视频帧渲染数 */
	videoFramesRendered: number;
	/** 视频帧丢弃数 */
	videoFramesDropped: number;
	/** 音频块接收数 */
	audioChunksReceived: number;
	/** 音频块播放数 */
	audioChunksPlayed: number;
	/** 当前音视频偏差（秒） */
	currentDrift: number;
	/** 音频缓冲队列长度 */
	audioBufferLength: number;
	/** 当前播放时间 */
	currentTime: number;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_AUDIO_BUFFER_DURATION = 0.2; // 200ms
const DEFAULT_MAX_SYNC_DRIFT = 0.04; // 40ms (人类感知阈值)
const DEFAULT_FRAME_DROP_THRESHOLD = 0.1; // 100ms
const DEFAULT_SAMPLE_RATE = 48000;
const DEFAULT_CHANNELS = 2;

// =============================================================================
// Audio Playback using Web Audio API
// =============================================================================

/**
 * 音频播放器（使用 Web Audio API）
 */
class AudioPlayer {
	private _audioContext: AudioContext | null = null;
	private _gainNode: GainNode | null = null;
	private _nextPlayTime = 0;
	private _isPlaying = false;
	private _sampleRate: number;
	private _channels: number;

	constructor(sampleRate: number, channels: number) {
		this._sampleRate = sampleRate;
		this._channels = channels;
	}

	/**
	 * 初始化音频上下文
	 */
	async initialize(): Promise<boolean> {
		try {
			this._audioContext = new AudioContext({ sampleRate: this._sampleRate });
			this._gainNode = this._audioContext.createGain();
			this._gainNode.connect(this._audioContext.destination);
			return true;
		} catch (error) {
			console.error('[AudioPlayer] Failed to initialize:', error);
			return false;
		}
	}

	/**
	 * 播放音频块
	 */
	playChunk(pcmData: Float32Array): void {
		if (!this._audioContext || !this._gainNode || !this._isPlaying) {
			return;
		}

		const samplesPerChannel = pcmData.length / this._channels;
		const buffer = this._audioContext.createBuffer(
			this._channels,
			samplesPerChannel,
			this._sampleRate
		);

		// Deinterleave PCM data into separate channels
		for (let channel = 0; channel < this._channels; channel++) {
			const channelData = buffer.getChannelData(channel);
			for (let i = 0; i < samplesPerChannel; i++) {
				channelData[i] = pcmData[i * this._channels + channel] ?? 0;
			}
		}

		// Create and schedule buffer source
		const source = this._audioContext.createBufferSource();
		source.buffer = buffer;
		source.connect(this._gainNode);

		// Schedule playback
		const currentTime = this._audioContext.currentTime;
		const playTime = Math.max(this._nextPlayTime, currentTime);
		source.start(playTime);

		// Update next play time
		this._nextPlayTime = playTime + buffer.duration;
	}

	/**
	 * 开始播放
	 */
	start(): void {
		if (this._audioContext) {
			this._audioContext.resume();
			this._nextPlayTime = this._audioContext.currentTime;
			this._isPlaying = true;
		}
	}

	/**
	 * 暂停播放
	 */
	pause(): void {
		this._isPlaying = false;
		if (this._audioContext) {
			this._audioContext.suspend();
		}
	}

	/**
	 * 停止播放
	 */
	stop(): void {
		this._isPlaying = false;
		this._nextPlayTime = 0;
		if (this._audioContext) {
			this._audioContext.suspend();
		}
	}

	/**
	 * 设置音量
	 */
	setVolume(volume: number): void {
		if (this._gainNode) {
			this._gainNode.gain.value = Math.max(0, Math.min(1, volume));
		}
	}

	/**
	 * 获取当前播放时间
	 */
	getCurrentTime(): number {
		return this._audioContext?.currentTime ?? 0;
	}

	/**
	 * 释放资源
	 */
	dispose(): void {
		this._isPlaying = false;
		if (this._audioContext) {
			this._audioContext.close();
			this._audioContext = null;
		}
		this._gainNode = null;
	}
}

// =============================================================================
// Sync Controller Implementation
// =============================================================================

/**
 * 音视频同步控制器
 */
export class AudioVideoSyncController {
	private _config: Required<SyncConfig>;
	private _state: SyncState = 'idle';
	private _audioPlayer: AudioPlayer;
	private _audioBuffer: AudioChunk[] = [];
	private _currentTime = 0;
	private _isDisposed = false;

	// Callbacks
	private _onVideoFrame: ((frame: VideoFrame) => void) | null = null;
	private _onStateChange: ((state: SyncState) => void) | null = null;

	// Statistics
	private _stats: SyncStats = {
		videoFramesReceived: 0,
		videoFramesRendered: 0,
		videoFramesDropped: 0,
		audioChunksReceived: 0,
		audioChunksPlayed: 0,
		currentDrift: 0,
		audioBufferLength: 0,
		currentTime: 0,
	};

	constructor(config?: SyncConfig) {
		this._config = {
			audioBufferDuration: config?.audioBufferDuration ?? DEFAULT_AUDIO_BUFFER_DURATION,
			maxSyncDrift: config?.maxSyncDrift ?? DEFAULT_MAX_SYNC_DRIFT,
			frameDropThreshold: config?.frameDropThreshold ?? DEFAULT_FRAME_DROP_THRESHOLD,
			sampleRate: config?.sampleRate ?? DEFAULT_SAMPLE_RATE,
			channels: config?.channels ?? DEFAULT_CHANNELS,
		};

		this._audioPlayer = new AudioPlayer(this._config.sampleRate, this._config.channels);
	}

	// ---------------------------------------------------------------------------
	// Public API
	// ---------------------------------------------------------------------------

	/**
	 * 初始化控制器
	 */
	async initialize(): Promise<boolean> {
		return this._audioPlayer.initialize();
	}

	/**
	 * 获取当前状态
	 */
	get state(): SyncState {
		return this._state;
	}

	/**
	 * 获取当前播放时间
	 */
	get currentTime(): number {
		return this._currentTime;
	}

	/**
	 * 设置视频帧回调
	 */
	setVideoFrameCallback(callback: ((frame: VideoFrame) => void) | null): void {
		this._onVideoFrame = callback;
	}

	/**
	 * 设置状态变化回调
	 */
	setStateChangeCallback(callback: ((state: SyncState) => void) | null): void {
		this._onStateChange = callback;
	}

	/**
	 * 接收视频帧
	 */
	receiveVideoFrame(frame: VideoFrame): void {
		if (this._isDisposed) return;

		this._stats.videoFramesReceived++;

		// Scrubbing 模式：直接渲染，不等待音频
		if (this._state === 'scrubbing') {
			this._renderVideoFrame(frame);
			return;
		}

		// 播放模式：检查同步
		if (this._state === 'playing') {
			const drift = frame.timestamp - this._currentTime;
			this._stats.currentDrift = drift;

			// 帧太旧，丢弃
			if (drift < -this._config.frameDropThreshold) {
				this._stats.videoFramesDropped++;
				console.log(`[SyncController] Dropped old frame: drift=${drift.toFixed(3)}s`);
				return;
			}

			// 帧太新，等待（或直接渲染，取决于策略）
			if (drift > this._config.maxSyncDrift) {
				// 可以选择等待或直接渲染
				// 这里选择直接渲染，避免卡顿
			}

			this._renderVideoFrame(frame);
			this._currentTime = frame.timestamp;
		}
	}

	/**
	 * 接收音频块
	 */
	receiveAudioChunk(chunk: AudioChunk): void {
		if (this._isDisposed) return;

		this._stats.audioChunksReceived++;

		// Scrubbing 模式：不处理音频
		if (this._state === 'scrubbing') {
			return;
		}

		// 添加到缓冲队列
		this._audioBuffer.push(chunk);
		this._stats.audioBufferLength = this._audioBuffer.length;

		// 检查是否可以开始播放
		if (this._state === 'buffering') {
			const bufferDuration = this._calculateBufferDuration();
			if (bufferDuration >= this._config.audioBufferDuration) {
				this._startPlayback();
			}
		}

		// 播放模式：播放音频
		if (this._state === 'playing') {
			this._playBufferedAudio();
		}
	}

	/**
	 * 开始播放
	 */
	play(): void {
		if (this._state === 'playing') return;

		// 如果有足够的音频缓冲，直接开始播放
		const bufferDuration = this._calculateBufferDuration();
		if (bufferDuration >= this._config.audioBufferDuration) {
			this._startPlayback();
		} else {
			// 否则进入缓冲状态
			this._setState('buffering');
		}
	}

	/**
	 * 暂停播放
	 */
	pause(): void {
		if (this._state !== 'playing') return;

		this._audioPlayer.pause();
		this._setState('idle');
	}

	/**
	 * 停止播放
	 */
	stop(): void {
		this._audioPlayer.stop();
		this._audioBuffer = [];
		this._currentTime = 0;
		this._setState('idle');
	}

	/**
	 * 进入 Scrubbing 模式
	 */
	enterScrubbingMode(): void {
		if (this._state === 'scrubbing') return;

		// 暂停音频
		this._audioPlayer.pause();
		this._setState('scrubbing');
	}

	/**
	 * 退出 Scrubbing 模式
	 */
	exitScrubbingMode(resumePlayback = true): void {
		if (this._state !== 'scrubbing') return;

		if (resumePlayback) {
			this.play();
		} else {
			this._setState('idle');
		}
	}

	/**
	 * Seek 到指定时间
	 */
	seek(time: number): void {
		this._currentTime = time;
		this._audioBuffer = []; // 清空音频缓冲
		this._setState('seeking');
	}

	/**
	 * 设置音量
	 */
	setVolume(volume: number): void {
		this._audioPlayer.setVolume(volume);
	}

	/**
	 * 获取统计信息
	 */
	getStats(): SyncStats {
		return {
			...this._stats,
			currentTime: this._currentTime,
			audioBufferLength: this._audioBuffer.length,
		};
	}

	/**
	 * 释放资源
	 */
	dispose(): void {
		if (this._isDisposed) return;

		this._isDisposed = true;
		this._audioPlayer.dispose();
		this._audioBuffer = [];
		this._onVideoFrame = null;
		this._onStateChange = null;
	}

	// ---------------------------------------------------------------------------
	// Private Methods
	// ---------------------------------------------------------------------------

	/**
	 * 设置状态
	 */
	private _setState(state: SyncState): void {
		if (this._state === state) return;

		this._state = state;
		this._onStateChange?.(state);
	}

	/**
	 * 渲染视频帧
	 */
	private _renderVideoFrame(frame: VideoFrame): void {
		this._stats.videoFramesRendered++;
		this._stats.currentTime = frame.timestamp;
		this._onVideoFrame?.(frame);
	}

	/**
	 * 计算音频缓冲时长
	 */
	private _calculateBufferDuration(): number {
		if (this._audioBuffer.length === 0) return 0;

		const firstChunk = this._audioBuffer[0];
		const lastChunk = this._audioBuffer[this._audioBuffer.length - 1];

		if (!firstChunk || !lastChunk) return 0;

		return lastChunk.timestamp - firstChunk.timestamp;
	}

	/**
	 * 开始播放
	 */
	private _startPlayback(): void {
		this._audioPlayer.start();
		this._setState('playing');
		this._playBufferedAudio();
	}

	/**
	 * 播放缓冲的音频
	 */
	private _playBufferedAudio(): void {
		while (this._audioBuffer.length > 0) {
			const chunk = this._audioBuffer.shift();
			if (chunk) {
				this._audioPlayer.playChunk(chunk.data);
				this._stats.audioChunksPlayed++;
			}
		}
		this._stats.audioBufferLength = 0;
	}
}

// =============================================================================
// Factory
// =============================================================================

let _instance: AudioVideoSyncController | null = null;

export async function getAudioVideoSyncController(config?: SyncConfig): Promise<AudioVideoSyncController> {
	if (!_instance) {
		_instance = new AudioVideoSyncController(config);
		await _instance.initialize();
	}
	return _instance;
}

export function disposeAudioVideoSyncController(): void {
	if (_instance) {
		_instance.dispose();
		_instance = null;
	}
}
