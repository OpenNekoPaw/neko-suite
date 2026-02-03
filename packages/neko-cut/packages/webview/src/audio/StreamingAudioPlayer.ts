/**
 * StreamingAudioPlayer - 流式音频播放器
 *
 * 基于 Extension FFmpeg 解码（通过 MediaRequestProxy IPC）
 * 支持 AAC 等 VSCode Webview 不支持的格式
 *
 * 方案 2（对齐视频播放机制）：
 * - 时间轴（timelineTime）作为唯一真值：外部通过 play/seek/sync 驱动
 * - WebAudio（AudioBufferSourceNode）进行“分段调度”，避免 <audio> 切 src 造成的 10s 截断/间隙
 * - 预加载窗口：保持 playhead 之后 bufferAhead 秒“至少可调度”
 * - 即将开始的片段：在 preloadThreshold 秒内提前调度首段（参考视频 clearAndPreloadFirstWindow）
 * - 解码请求可取消（AbortController）：seek/pause 时取消 Webview 侧等待，释放队列压力
 * - LRU 缓存：缓存 AudioBuffer，避免重复解码
 */

import { getMediaProxy } from '../services/mediaProxyFactory';

// =============================================================================
// Types
// =============================================================================

export interface StreamingAudioPlayerConfig {
	/** Audio buffer ahead of playhead (seconds) */
	bufferAhead?: number;
	/** Audio buffer behind playhead (seconds) */
	bufferBehind?: number;
	/** Sample rate for AudioContext */
	sampleRate?: number;
	/** Output channels (default: 2) */
	channels?: number;
	/** Segment duration for decoding (seconds) */
	segmentDuration?: number;
	/** Preload threshold: preload when clip starts within this window (seconds) */
	preloadThreshold?: number;
	/** Max cache size in bytes (default 50MB) */
	maxCacheSize?: number;
	/** Scheduler tick interval (ms, default 200) */
	schedulerIntervalMs?: number;
}

export interface AudioSourceInfo {
	/** Unique element ID */
	id: string;
	/** Source URL or path */
	src: string;
	/** Resolved webview URI (unused in new implementation) */
	uri: string;
	/** Start time on timeline */
	startTime: number;
	/** End time on timeline */
	endTime: number;
	/** Trim start (offset into source) */
	trimStart: number;
	/** Duration on timeline */
	duration: number;
	/** Volume (0-1) */
	volume: number;
	/** Pan (-1 to 1) */
	pan: number;
	/** Muted */
	muted: boolean;
	/** Fade in duration */
	fadeIn: number;
	/** Fade out duration */
	fadeOut: number;
}

interface ScheduledSegment {
	segmentStart: number;
	startContextTime: number;
	endContextTime: number;
	sourceNode: AudioBufferSourceNode;
	segmentGainNode: GainNode;
}

interface ActiveSource {
	info: AudioSourceInfo;
	/** Overall volume/mute (per element) */
	gainNode: GainNode;
	/** Pan (per element) */
	panNode: StereoPannerNode;
	/** Scheduled segments keyed by segmentStart (source time) */
	scheduledSegments: Map<number, ScheduledSegment>;
}

// =============================================================================
// StreamingAudioPlayer
// =============================================================================

export class StreamingAudioPlayer {
	private _context: AudioContext | null = null;
	private _masterGainNode: GainNode | null = null;  // 全局主音量控制
	private _config: Required<StreamingAudioPlayerConfig> & {
		segmentDuration: number;
		preloadThreshold: number;
		maxCacheSize: number;
		schedulerIntervalMs: number;
	};
	private _sources: Map<string, ActiveSource> = new Map();
	private _disposed = false;

	// Playback state
	private _isPlaying = false;
	private _playbackSessionId = 0;
	private _anchorTimelineTime = 0;
	private _anchorContextTime = 0;
	private _lastTimelineTime = 0;

	// Decode cancellation (per playback session)
	private _playbackAbortController: AbortController | null = null;

	// Scheduler timer (independent from React render loop)
	private _schedulerTimer: ReturnType<typeof setInterval> | null = null;
	private _lastEnsureAtMs = 0;

	// Webview-side cache: key = `${src}_${segmentStart}_${sampleRate}_${channels}`
	private _segmentCache = new Map<
		string,
		{ buffer: AudioBuffer; size: number; lastAccess: number }
	>();
	private _segmentLoading = new Map<string, Promise<AudioBuffer>>();

	constructor(config: StreamingAudioPlayerConfig = {}) {
		this._config = {
			bufferAhead: config.bufferAhead ?? 2,
			bufferBehind: config.bufferBehind ?? 0.5,
			sampleRate: config.sampleRate ?? 48000,
			channels: config.channels ?? 2,
			segmentDuration: config.segmentDuration ?? 10,
			preloadThreshold: config.preloadThreshold ?? 2,
			maxCacheSize: config.maxCacheSize ?? 50 * 1024 * 1024,
			schedulerIntervalMs: config.schedulerIntervalMs ?? 200,
		};
	}

	// ---------------------------------------------------------------------------
	// Public API
	// ---------------------------------------------------------------------------

	/**
	 * Initialize audio context
	 */
	async initialize(): Promise<void> {
		if (this._context) return;
		this._context = new AudioContext({ sampleRate: this._config.sampleRate });

		// 创建全局主音量节点
		this._masterGainNode = this._context.createGain();
		this._masterGainNode.gain.value = 1.0;  // 默认音量 100%
		this._masterGainNode.connect(this._context.destination);
	}

	/**
	 * Add audio source
	 */
	async addSource(sourceInfo: AudioSourceInfo): Promise<void> {
		if (!this._context) {
			throw new Error('AudioContext not initialized');
		}
		if (!this._masterGainNode) {
			throw new Error('Master gain node not initialized');
		}
		if (this._sources.has(sourceInfo.id)) return;

		// 节点链：segmentGain -> gainNode(音量/静音) -> panNode(声像) -> masterGainNode -> destination
		const gainNode = this._context.createGain();
		const panNode = this._context.createStereoPanner();
		gainNode.connect(panNode).connect(this._masterGainNode);

		gainNode.gain.value = sourceInfo.muted ? 0 : sourceInfo.volume;
		panNode.pan.value = sourceInfo.pan;

		this._sources.set(sourceInfo.id, {
			info: sourceInfo,
			gainNode,
			panNode,
			scheduledSegments: new Map(),
		});
	}

	/**
	 * Remove audio source
	 */
	removeSource(id: string): void {
		const source = this._sources.get(id);
		if (!source) return;

		this._stopScheduledSegmentsForSource(source);
		source.gainNode.disconnect();
		source.panNode.disconnect();
		this._sources.delete(id);
	}

	/**
	 * Update source properties
	 */
	updateSource(id: string, updates: Partial<AudioSourceInfo>): void {
		const source = this._sources.get(id);
		if (!source) return;

		Object.assign(source.info, updates);

		if (updates.volume !== undefined || updates.muted !== undefined) {
			source.gainNode.gain.value = source.info.muted ? 0 : source.info.volume;
		}
		if (updates.pan !== undefined) {
			source.panNode.pan.value = source.info.pan;
		}
	}

	/**
	 * Set master volume (全局主音量控制)
	 * @param volume 音量 (0-1)
	 */
	setMasterVolume(volume: number): void {
		if (!this._masterGainNode) {
			console.warn('Master gain node not initialized');
			return;
		}
		const clampedVolume = Math.max(0, Math.min(1, volume));
		this._masterGainNode.gain.value = clampedVolume;
	}

	/**
	 * Play audio from specified timeline time
	 */
	async play(time: number): Promise<void> {
		if (!this._context) {
			throw new Error('AudioContext not initialized');
		}

		if (this._context.state === 'suspended') {
			await this._context.resume();
		}

		this._isPlaying = true;
		this._playbackSessionId++;

		// 以 play() 被调用时刻作为锚点：timelineTime -> contextTime 的线性映射
		this._lastTimelineTime = time;
		this._anchorTimelineTime = time;
		this._anchorContextTime = this._context.currentTime;

		// 新会话：停止既有调度，并取消旧的解码等待
		this._abortInFlightDecodes();
		this._stopAllScheduledSegments();
		this._playbackAbortController = new AbortController();

		// 立即调度一次，避免等待定时器
		this._ensureScheduledBuffer(true);

		// 启动调度器（独立于 React render loop）
		this._startSchedulerTimer();
	}

	/**
	 * Pause audio
	 */
	pause(): void {
		this._isPlaying = false;
		this._playbackSessionId++;

		this._stopSchedulerTimer();
		this._abortInFlightDecodes();
		this._stopAllScheduledSegments();
	}

	/**
	 * Seek to specified timeline time
	 */
	async seek(time: number): Promise<void> {
		const wasPlaying = this._isPlaying;
		if (wasPlaying) this.pause();
		this._lastTimelineTime = time;
		if (wasPlaying) await this.play(time);
	}

	/**
	 * Synchronize playback to specified timeline time
	 */
	sync(time: number): void {
		this._lastTimelineTime = time;
		if (!this._isPlaying) return;
		this._ensureScheduledBuffer(false);
	}

	/**
	 * Dispose resources
	 */
	dispose(): void {
		if (this._disposed) return;
		this._disposed = true;

		this.pause();

		for (const id of Array.from(this._sources.keys())) {
			this.removeSource(id);
		}

		this._segmentCache.clear();
		this._segmentLoading.clear();
		this._abortInFlightDecodes();

		if (this._context) {
			this._context.close();
			this._context = null;
		}
	}

	// ---------------------------------------------------------------------------
	// Private Methods
	// ---------------------------------------------------------------------------

	private _timelineToContextTime(timelineTime: number): number {
		return this._anchorContextTime + (timelineTime - this._anchorTimelineTime);
	}

	private _startSchedulerTimer(): void {
		if (this._schedulerTimer) return;
		this._schedulerTimer = setInterval(() => {
			this._ensureScheduledBuffer(false);
		}, this._config.schedulerIntervalMs);
	}

	private _stopSchedulerTimer(): void {
		if (!this._schedulerTimer) return;
		clearInterval(this._schedulerTimer);
		this._schedulerTimer = null;
	}

	/**
	 * 确保音频缓冲/调度覆盖 playhead 之后的窗口
	 * - sync() 可能以 30fps 调用，因此这里做节流
	 * - 同时也会被 schedulerIntervalMs 定时触发，防止 UI 卡顿导致预取缺失
	 */
	private _ensureScheduledBuffer(force: boolean): void {
		if (!this._context || !this._isPlaying || this._disposed) return;

		const nowMs = performance.now();
		if (!force) {
			const minInterval = Math.min(100, this._config.schedulerIntervalMs);
			if (nowMs - this._lastEnsureAtMs < minInterval) return;
		}
		this._lastEnsureAtMs = nowMs;

		const sessionId = this._playbackSessionId;
		const timelineTime = this._lastTimelineTime;

		for (const [id, source] of this._sources.entries()) {
			this._ensureScheduledForSource(id, source, timelineTime, sessionId);
		}
	}

	/**
	 * 为单个音源按时间轴调度片段：
	 * - 正在播放的片段：从 playhead 开始调度
	 * - 即将开始的片段：在 preloadThreshold 秒内提前调度首段
	 */
	private _ensureScheduledForSource(
		id: string,
		source: ActiveSource,
		timelineTime: number,
		sessionId: number
	): void {
		if (!this._context) return;
		if (this._disposed) return;
		if (this._playbackSessionId !== sessionId) return;

		const info = source.info;

		let scheduleStartTimeline: number | null = null;
		if (timelineTime < info.startTime) {
			const timeUntilStart = info.startTime - timelineTime;
			if (timeUntilStart <= this._config.preloadThreshold) {
				scheduleStartTimeline = info.startTime;
			}
		} else if (timelineTime >= info.endTime) {
			this._stopScheduledSegmentsForSource(source);
			return;
		} else {
			scheduleStartTimeline = timelineTime;
		}

		if (scheduleStartTimeline === null) {
			this._stopScheduledSegmentsForSource(source);
			return;
		}

		const clipStartSource = info.trimStart;
		const clipEndSource = info.trimStart + info.duration;
		const scheduleStartSource = clipStartSource + (scheduleStartTimeline - info.startTime);

		if (scheduleStartSource >= clipEndSource) {
			this._stopScheduledSegmentsForSource(source);
			return;
		}

		const segDur = this._config.segmentDuration;
		const firstSegmentStart = Math.floor(scheduleStartSource / segDur) * segDur;

		// 目标：playhead 之后至少 N 秒“可调度”
		// - bufferAhead：目标缓冲
		// - preloadThreshold：更偏“提前触发”语义（避免段边界来不及解码）
		const scheduleAhead = Math.max(this._config.bufferAhead, this._config.preloadThreshold);
		const targetEndSource = Math.min(clipEndSource, scheduleStartSource + scheduleAhead);
		const lastSegmentStart = Math.floor((targetEndSource - 1e-6) / segDur) * segDur;

		for (let segmentStart = firstSegmentStart; segmentStart <= lastSegmentStart; segmentStart += segDur) {
			if (source.scheduledSegments.has(segmentStart)) continue;

			// 仅“当前播放位置所在的首段”给更高优先级；其他作为预取
			const isImmediate = scheduleStartTimeline === timelineTime && segmentStart === firstSegmentStart;
			const priority = isImmediate ? 80 : 20;

			void this._getOrLoadSegmentBuffer(info.src, segmentStart, segDur, priority, sessionId)
				.then((audioBuffer) => {
					const current = this._sources.get(id);
					if (!current) return;
					if (!this._context || this._disposed) return;
					if (!this._isPlaying) return;
					if (this._playbackSessionId !== sessionId) return;
					if (current.scheduledSegments.has(segmentStart)) return;

					const segmentEnd = segmentStart + segDur;
					let intersectionStartSource = Math.max(segmentStart, clipStartSource);
					if (segmentStart === firstSegmentStart) {
						intersectionStartSource = Math.max(intersectionStartSource, scheduleStartSource);
					}
					const intersectionEndSource = Math.min(segmentEnd, clipEndSource);
					if (intersectionEndSource <= intersectionStartSource) return;

					this._scheduleSegment(
						current,
						segmentStart,
						audioBuffer,
						intersectionStartSource,
						intersectionEndSource,
						sessionId
					);
				})
				.catch((error) => {
					// 解码失败：记录错误但不打断播放
					console.error(`[StreamingAudioPlayer] Audio decode failed for ${info.src} at ${segmentStart}s:`, error);
				});
		}
	}

	private _scheduleSegment(
		source: ActiveSource,
		segmentStart: number,
		audioBuffer: AudioBuffer,
		intersectionStartSource: number,
		intersectionEndSource: number,
		sessionId: number
	): void {
		if (!this._context) return;
		if (this._disposed) return;
		if (this._playbackSessionId !== sessionId) return;

		const clipStartSource = source.info.trimStart;
		const timelineStart = source.info.startTime + (intersectionStartSource - clipStartSource);

		let startContextTime = this._timelineToContextTime(timelineStart);
		let offset = intersectionStartSource - segmentStart;
		let duration = intersectionEndSource - intersectionStartSource;

		// 避免调度到过去：若晚到了，跳过已经过去的部分以保持音画同步
		const now = this._context.currentTime;
		const minLead = 0.01;
		if (startContextTime < now + minLead) {
			const delta = now + minLead - startContextTime;
			startContextTime = now + minLead;
			offset += delta;
			duration -= delta;
		}
		if (duration <= 0) return;

		const sourceNode = this._context.createBufferSource();
		sourceNode.buffer = audioBuffer;

		const segmentGainNode = this._context.createGain();
		segmentGainNode.gain.value = 1;

		sourceNode.connect(segmentGainNode).connect(source.gainNode);

		const scheduled: ScheduledSegment = {
			segmentStart,
			startContextTime,
			endContextTime: startContextTime + duration,
			sourceNode,
			segmentGainNode,
		};
		source.scheduledSegments.set(segmentStart, scheduled);

		sourceNode.onended = () => {
			if (this._playbackSessionId !== sessionId) return;
			this._cleanupScheduledSegment(source, segmentStart);
		};

		this._applyFadeAutomation(
			segmentGainNode.gain,
			source.info,
			intersectionStartSource,
			intersectionEndSource,
			startContextTime
		);

		try {
			sourceNode.start(startContextTime, offset, duration);
		} catch {
			this._cleanupScheduledSegment(source, segmentStart, true);
		}
	}

	private _abortInFlightDecodes(): void {
		if (this._playbackAbortController) {
			this._playbackAbortController.abort();
			this._playbackAbortController = null;
		}
	}

	private _makeCacheKey(src: string, segmentStart: number): string {
		return `${src}_${segmentStart}_${this._config.sampleRate}_${this._config.channels}`;
	}

	private async _getOrLoadSegmentBuffer(
		src: string,
		segmentStart: number,
		duration: number,
		priority: number,
		sessionId: number
	): Promise<AudioBuffer> {
		const cacheKey = this._makeCacheKey(src, segmentStart);
		const cached = this._segmentCache.get(cacheKey);
		if (cached) {
			cached.lastAccess = Date.now();
			return cached.buffer;
		}

		const existing = this._segmentLoading.get(cacheKey);
		if (existing) return existing;

		const signal = this._playbackAbortController?.signal;
		const promise = getMediaProxy()
			.decodeAudioSegment(
				src,
				segmentStart,
				duration,
				this._config.sampleRate,
				this._config.channels,
				{ signal, priority, timeoutMs: 60_000 }
			)
			.then((audioBuffer) => {
				// 若在等待期间发生 seek/pause，则不写入缓存（避免污染下一次会话）
				if (this._playbackSessionId !== sessionId) return audioBuffer;

				const size = audioBuffer.length * audioBuffer.numberOfChannels * 4;
				this._segmentCache.set(cacheKey, {
					buffer: audioBuffer,
					size,
					lastAccess: Date.now(),
				});
				this._evictCacheIfNeeded();
				return audioBuffer;
			})
			.finally(() => {
				this._segmentLoading.delete(cacheKey);
			});

		this._segmentLoading.set(cacheKey, promise);
		return promise;
	}

	private _evictCacheIfNeeded(): void {
		let totalSize = 0;
		for (const entry of this._segmentCache.values()) totalSize += entry.size;
		if (totalSize <= this._config.maxCacheSize) return;

		const entries = Array.from(this._segmentCache.entries()).sort(
			([, a], [, b]) => a.lastAccess - b.lastAccess
		);

		const targetSize = this._config.maxCacheSize * 0.8;
		let currentSize = totalSize;
		for (const [key, entry] of entries) {
			if (currentSize <= targetSize) break;
			this._segmentCache.delete(key);
			currentSize -= entry.size;
		}
	}

	private _stopAllScheduledSegments(): void {
		for (const source of this._sources.values()) {
			this._stopScheduledSegmentsForSource(source);
		}
	}

	private _stopScheduledSegmentsForSource(source: ActiveSource): void {
		for (const [segmentStart] of source.scheduledSegments) {
			this._cleanupScheduledSegment(source, segmentStart, true);
		}
		source.scheduledSegments.clear();
	}

	private _cleanupScheduledSegment(
		source: ActiveSource,
		segmentStart: number,
		forceStop = false
	): void {
		const scheduled = source.scheduledSegments.get(segmentStart);
		if (!scheduled) return;

		source.scheduledSegments.delete(segmentStart);

		try {
			if (forceStop) {
				scheduled.sourceNode.onended = null;
				scheduled.sourceNode.stop();
			}
		} catch {
			// ignore
		}

		try {
			scheduled.sourceNode.disconnect();
		} catch {
			// ignore
		}
		try {
			scheduled.segmentGainNode.disconnect();
		} catch {
			// ignore
		}
	}

	/**
	 * 淡入淡出：对 segmentGainNode 做自动化，按 clip 边界计算
	 */
	private _applyFadeAutomation(
		param: AudioParam,
		info: AudioSourceInfo,
		intersectionStartSource: number,
		intersectionEndSource: number,
		startContextTime: number
	): void {
		const clipStart = info.trimStart;
		const clipEnd = info.trimStart + info.duration;
		const fadeIn = Math.max(0, info.fadeIn || 0);
		const fadeOut = Math.max(0, info.fadeOut || 0);

		if (fadeIn <= 0 && fadeOut <= 0) {
			param.setValueAtTime(1, startContextTime);
			return;
		}

		const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
		const fadeInEnd = clipStart + fadeIn;
		const fadeOutStart = clipEnd - fadeOut;

		const gainAt = (sourceTime: number): number => {
			const t = clamp(sourceTime, clipStart, clipEnd);

			// 重叠时：取两者较小值，避免 >1
			let g = 1;
			if (fadeIn > 0) g = Math.min(g, (t - clipStart) / fadeIn);
			if (fadeOut > 0) g = Math.min(g, (clipEnd - t) / fadeOut);
			return clamp(g, 0, 1);
		};

		const points = [
			intersectionStartSource,
			intersectionEndSource,
			fadeIn > 0 ? clamp(fadeInEnd, intersectionStartSource, intersectionEndSource) : null,
			fadeOut > 0 ? clamp(fadeOutStart, intersectionStartSource, intersectionEndSource) : null,
		].filter((v): v is number => typeof v === 'number');

		const uniqueSorted = Array.from(new Set(points)).sort((a, b) => a - b);
		if (uniqueSorted.length === 0) {
			param.setValueAtTime(1, startContextTime);
			return;
		}

		// 以段起点为 0 做相对时间映射（源时间与时间轴秒数一致）
		param.setValueAtTime(gainAt(uniqueSorted[0]!), startContextTime);
		for (let i = 1; i < uniqueSorted.length; i++) {
			const t = uniqueSorted[i]!;
			const when = startContextTime + (t - uniqueSorted[0]!);
			param.linearRampToValueAtTime(gainAt(t), when);
		}
	}
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a streaming audio player instance
 */
export function createStreamingAudioPlayer(
	config?: StreamingAudioPlayerConfig
): StreamingAudioPlayer {
	return new StreamingAudioPlayer(config);
}
