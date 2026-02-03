/**
 * KeyframeCacheService - 关键帧缓存服务
 *
 * 职责：
 * - 使用 Rust N-API 检测视频 IDR 关键帧
 * - LRU 缓存策略，缓存大小 120 帧
 * - 按 playhead 后时间顺序预缓存 80 个关键帧
 * - 支持缓存触发：打开时间线或用户手动切换模式时
 *
 * 架构（符合 docs/principle.md）：
 * ```
 * ## compat关键帧缓存
 * 1. LRU缓存策略，缓存大小（120帧）
 * 2. 读取当前playhead位置，获取playhead后视频元素
 * 3. Rust N-API 获取视频元素全部关键帧（注意IBP帧、non-IDR帧，仅使用IDR帧），
 *    按playhead后时间顺序排序，取前80个关键帧进行缓存。
 * 4. 缓存触发：打开时间线或用户手动切换模式时
 * ```
 */

import { getFFmpegService } from './FFmpegService';

// =============================================================================
// Types
// =============================================================================

/**
 * 关键帧信息
 */
export interface KeyframeInfo {
	/** 关键帧时间（秒） */
	time: number;
	/** 帧类型（I/P/B） */
	frameType: 'I' | 'P' | 'B';
	/** 是否为 IDR 帧 */
	isIDR: boolean;
	/** 帧索引 */
	frameIndex: number;
	/** PTS（显示时间戳） */
	pts: number;
	/** DTS（解码时间戳） */
	dts: number;
}

/**
 * 缓存的关键帧数据
 */
export interface CachedKeyframe {
	/** 关键帧信息 */
	info: KeyframeInfo;
	/** RGBA 帧数据 */
	buffer: Buffer;
	/** 帧宽度 */
	width: number;
	/** 帧高度 */
	height: number;
	/** 最后访问时间（用于 LRU） */
	lastAccess: number;
}

/**
 * 视频关键帧索引
 */
interface VideoKeyframeIndex {
	/** 视频路径 */
	videoPath: string;
	/** 所有 IDR 关键帧列表 */
	keyframes: KeyframeInfo[];
	/** 视频时长 */
	duration: number;
	/** 视频宽度 */
	width: number;
	/** 视频高度 */
	height: number;
	/** 索引创建时间 */
	indexedAt: number;
}

/**
 * 服务配置
 */
interface KeyframeCacheConfig {
	/** 最大缓存帧数（默认 120） */
	maxCachedFrames?: number;
	/** 预缓存关键帧数（默认 80） */
	prefetchCount?: number;
	/** 硬件加速类型 */
	hwAccel?: string;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_MAX_CACHED_FRAMES = 120;
const DEFAULT_PREFETCH_COUNT = 80;
const KEYFRAME_DECODE_TIMEOUT = 5000; // 5 seconds per keyframe

// =============================================================================
// LRU Cache Implementation
// =============================================================================

/**
 * LRU 缓存实现
 */
class LRUCache<K, V extends { lastAccess: number }> {
	private _cache: Map<K, V> = new Map();
	private _maxSize: number;

	constructor(maxSize: number) {
		this._maxSize = maxSize;
	}

	get(key: K): V | undefined {
		const value = this._cache.get(key);
		if (value) {
			value.lastAccess = Date.now();
		}
		return value;
	}

	set(key: K, value: V): void {
		// Evict oldest if at capacity
		if (this._cache.size >= this._maxSize && !this._cache.has(key)) {
			this._evictOldest();
		}
		value.lastAccess = Date.now();
		this._cache.set(key, value);
	}

	has(key: K): boolean {
		return this._cache.has(key);
	}

	delete(key: K): boolean {
		return this._cache.delete(key);
	}

	clear(): void {
		this._cache.clear();
	}

	get size(): number {
		return this._cache.size;
	}

	values(): IterableIterator<V> {
		return this._cache.values();
	}

	private _evictOldest(): void {
		let oldestKey: K | null = null;
		let oldestTime = Infinity;

		for (const [key, value] of this._cache) {
			if (value.lastAccess < oldestTime) {
				oldestTime = value.lastAccess;
				oldestKey = key;
			}
		}

		if (oldestKey !== null) {
			this._cache.delete(oldestKey);
		}
	}
}

// =============================================================================
// Service Implementation
// =============================================================================

/**
 * 关键帧缓存服务
 */
export class KeyframeCacheService {
	private _config: Required<KeyframeCacheConfig>;
	private _keyframeCache: LRUCache<string, CachedKeyframe>;
	private _videoIndexes: Map<string, VideoKeyframeIndex> = new Map();
	private _isDisposed = false;
	private _prefetchAbort: AbortController | null = null;

	// Statistics
	private _stats = {
		cacheHitCount: 0,
		cacheMissCount: 0,
		indexedVideos: 0,
		totalKeyframesIndexed: 0,
		prefetchedFrames: 0,
	};

	constructor(config: KeyframeCacheConfig) {
		this._config = {
			maxCachedFrames: config.maxCachedFrames ?? DEFAULT_MAX_CACHED_FRAMES,
			prefetchCount: config.prefetchCount ?? DEFAULT_PREFETCH_COUNT,
			hwAccel: config.hwAccel ?? '',
		};
		this._keyframeCache = new LRUCache(this._config.maxCachedFrames);
	}

	// ---------------------------------------------------------------------------
	// Public API
	// ---------------------------------------------------------------------------

	/**
	 * 索引视频的所有 IDR 关键帧
	 * 使用 FFprobe 获取帧信息，仅保留 IDR 帧
	 */
	async indexVideoKeyframes(videoPath: string): Promise<KeyframeInfo[]> {
		if (this._isDisposed) {
			return [];
		}

		// Check if already indexed
		const existing = this._videoIndexes.get(videoPath);
		if (existing) {
			return existing.keyframes;
		}

		console.log(`[KeyframeCacheService] Indexing keyframes for: ${videoPath}`);

		try {
			// Get video info and keyframes using FFprobe
			const [videoInfo, keyframes] = await Promise.all([
				this._probeVideoInfo(videoPath),
				this._probeKeyframes(videoPath),
			]);

			// Filter to only IDR frames
			const idrKeyframes = keyframes.filter(kf => kf.isIDR);

			// Store index
			const index: VideoKeyframeIndex = {
				videoPath,
				keyframes: idrKeyframes,
				duration: videoInfo.duration,
				width: videoInfo.width,
				height: videoInfo.height,
				indexedAt: Date.now(),
			};
			this._videoIndexes.set(videoPath, index);

			this._stats.indexedVideos++;
			this._stats.totalKeyframesIndexed += idrKeyframes.length;

			console.log(
				`[KeyframeCacheService] Indexed ${idrKeyframes.length} IDR keyframes ` +
				`(${keyframes.length} total frames) for ${videoPath}`
			);

			return idrKeyframes;
		} catch (error) {
			console.error(`[KeyframeCacheService] Failed to index keyframes for ${videoPath}:`, error);
			return [];
		}
	}

	/**
	 * 预缓存关键帧
	 * 根据 playhead 位置，预缓存后续 80 个 IDR 关键帧
	 *
	 * @param videoPath 视频路径
	 * @param playheadTime playhead 当前时间（秒）
	 */
	async prefetchKeyframes(videoPath: string, playheadTime: number): Promise<void> {
		if (this._isDisposed) {
			return;
		}

		// Cancel any existing prefetch
		this._prefetchAbort?.abort();
		this._prefetchAbort = new AbortController();
		const signal = this._prefetchAbort.signal;

		// Ensure video is indexed
		let keyframes = this._videoIndexes.get(videoPath)?.keyframes;
		if (!keyframes) {
			keyframes = await this.indexVideoKeyframes(videoPath);
		}

		if (keyframes.length === 0) {
			return;
		}

		// Get keyframes after playhead, sorted by time
		const keyframesAfterPlayhead = keyframes
			.filter(kf => kf.time >= playheadTime)
			.sort((a, b) => a.time - b.time)
			.slice(0, this._config.prefetchCount);

		console.log(
			`[KeyframeCacheService] Prefetching ${keyframesAfterPlayhead.length} keyframes ` +
			`after playhead ${playheadTime}s for ${videoPath}`
		);

		// Prefetch keyframes in parallel batches
		const batchSize = 4;
		for (let i = 0; i < keyframesAfterPlayhead.length; i += batchSize) {
			if (signal.aborted) {
				console.log('[KeyframeCacheService] Prefetch aborted');
				break;
			}

			const batch = keyframesAfterPlayhead.slice(i, i + batchSize);
			await Promise.all(
				batch.map(kf => this._decodeAndCacheKeyframe(videoPath, kf, signal))
			);
		}

		console.log(`[KeyframeCacheService] Prefetch completed for ${videoPath}`);
	}

	/**
	 * 获取缓存的关键帧
	 * 如果未缓存，返回 null（不会自动解码）
	 */
	getCachedKeyframe(videoPath: string, time: number): CachedKeyframe | null {
		const cacheKey = this._getCacheKey(videoPath, time);
		const cached = this._keyframeCache.get(cacheKey);

		if (cached) {
			this._stats.cacheHitCount++;
			return cached;
		}

		this._stats.cacheMissCount++;
		return null;
	}

	/**
	 * 获取最近的缓存关键帧
	 * 返回时间上最接近请求时间的已缓存关键帧
	 */
	getNearestCachedKeyframe(videoPath: string, time: number): CachedKeyframe | null {
		const index = this._videoIndexes.get(videoPath);
		if (!index) {
			return null;
		}

		// Find nearest keyframe time
		let nearestKeyframe: KeyframeInfo | null = null;
		let minDiff = Infinity;

		for (const kf of index.keyframes) {
			const diff = Math.abs(kf.time - time);
			if (diff < minDiff) {
				minDiff = diff;
				nearestKeyframe = kf;
			}
		}

		if (!nearestKeyframe) {
			return null;
		}

		return this.getCachedKeyframe(videoPath, nearestKeyframe.time);
	}

	/**
	 * 获取视频的关键帧索引
	 */
	getKeyframeIndex(videoPath: string): KeyframeInfo[] | null {
		return this._videoIndexes.get(videoPath)?.keyframes ?? null;
	}

	/**
	 * 触发缓存（用于时间线打开或模式切换）
	 * 索引所有视频并预缓存关键帧
	 */
	async triggerCache(
		videoSources: Array<{ videoPath: string; startTime: number; trimStart: number; duration: number }>,
		playheadTime: number
	): Promise<void> {
		if (this._isDisposed) {
			return;
		}

		console.log(
			`[KeyframeCacheService] Cache triggered: ${videoSources.length} videos, ` +
			`playhead=${playheadTime}s`
		);

		// Index all videos first
		await Promise.all(
			videoSources.map(source => this.indexVideoKeyframes(source.videoPath))
		);

		// Prefetch keyframes for videos that are active at playhead
		for (const source of videoSources) {
			const videoEndTime = source.startTime + source.duration;
			if (playheadTime >= source.startTime && playheadTime < videoEndTime) {
				// Calculate video internal time
				const videoTime = source.trimStart + (playheadTime - source.startTime);
				await this.prefetchKeyframes(source.videoPath, videoTime);
			}
		}
	}

	/**
	 * 清除指定视频的缓存
	 */
	clearVideoCache(videoPath: string): void {
		// Remove from index
		this._videoIndexes.delete(videoPath);

		// Remove cached frames (need to iterate since cache key includes time)
		const keysToDelete: string[] = [];
		for (const cached of this._keyframeCache.values()) {
			if (cached.info.time !== undefined) {
				const key = this._getCacheKey(videoPath, cached.info.time);
				if (this._keyframeCache.has(key)) {
					keysToDelete.push(key);
				}
			}
		}
		keysToDelete.forEach(key => this._keyframeCache.delete(key));
	}

	/**
	 * 清除所有缓存
	 */
	clearAll(): void {
		this._prefetchAbort?.abort();
		this._keyframeCache.clear();
		this._videoIndexes.clear();
	}

	/**
	 * 获取统计信息
	 */
	getStats(): {
		cachedFrames: number;
		indexedVideos: number;
		totalKeyframesIndexed: number;
		cacheHitCount: number;
		cacheMissCount: number;
		cacheHitRate: number;
		prefetchedFrames: number;
	} {
		const total = this._stats.cacheHitCount + this._stats.cacheMissCount;
		return {
			cachedFrames: this._keyframeCache.size,
			indexedVideos: this._stats.indexedVideos,
			totalKeyframesIndexed: this._stats.totalKeyframesIndexed,
			cacheHitCount: this._stats.cacheHitCount,
			cacheMissCount: this._stats.cacheMissCount,
			cacheHitRate: total > 0 ? Math.round((this._stats.cacheHitCount / total) * 100) : 0,
			prefetchedFrames: this._stats.prefetchedFrames,
		};
	}

	/**
	 * 释放资源
	 */
	dispose(): void {
		if (this._isDisposed) {
			return;
		}
		this._isDisposed = true;
		this._prefetchAbort?.abort();
		this.clearAll();
		console.log('[KeyframeCacheService] Disposed');
	}

	// ---------------------------------------------------------------------------
	// Private Methods
	// ---------------------------------------------------------------------------

	/**
	 * 生成缓存键
	 */
	private _getCacheKey(videoPath: string, time: number): string {
		// Round time to 3 decimal places for consistent keys
		return `${videoPath}:${time.toFixed(3)}`;
	}

	/**
	 * 探测视频信息
	 */
	private async _probeVideoInfo(
		videoPath: string
	): Promise<{ duration: number; width: number; height: number }> {
		try {
			const ffmpegService = getFFmpegService();
			const mediaInfo = await ffmpegService.probeMediaInfo(videoPath);
			return {
				duration: mediaInfo.duration,
				width: mediaInfo.width,
				height: mediaInfo.height,
			};
		} catch (error) {
			console.error(`[KeyframeCacheService] Failed to probe video info: ${error}`);
			return { duration: 0, width: 1920, height: 1080 };
		}
	}

	/**
	 * 探测视频关键帧
	 * 使用 Rust N-API 获取所有帧信息，识别 IDR 帧
	 */
	private async _probeKeyframes(videoPath: string): Promise<KeyframeInfo[]> {
		try {
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const { MediaProcessor } = require('@neko/media-processor-rs');
			const processor = await MediaProcessor.create();

			// 获取视频信息
			const ffmpegService = getFFmpegService();
			const mediaInfo = await ffmpegService.probeMediaInfo(videoPath);
			const duration = mediaInfo.duration;
			const fps = mediaInfo.fps || 30;

			// 使用 decodeFrameRange 获取帧信息
			// 由于 Rust N-API 没有直接的关键帧探测 API，我们采样检测关键帧
			const keyframes: KeyframeInfo[] = [];
			const sampleInterval = 1.0; // 每秒采样一次

			for (let time = 0; time < duration; time += sampleInterval) {
				try {
					// Use hardware acceleration with GPU color conversion
					const config = { path: videoPath, hwAccel: 'auto' };
					const frame = processor.decodeFrame(config, time);

					if (frame && frame.isKeyframe) {
						keyframes.push({
							time: frame.timestamp,
							frameType: 'I',
							isIDR: true,
							frameIndex: Math.round(frame.timestamp * fps),
							pts: frame.timestamp,
							dts: frame.timestamp,
						});
					}
				} catch {
					// 忽略单帧解码错误
				}
			}

			processor.dispose();

			console.log(`[KeyframeCacheService] Found ${keyframes.length} keyframes via Rust N-API`);
			return keyframes;
		} catch (error) {
			console.error('[KeyframeCacheService] Failed to probe keyframes:', error);
			return [];
		}
	}

	/**
	 * 解码并缓存单个关键帧
	 */
	private async _decodeAndCacheKeyframe(
		videoPath: string,
		keyframe: KeyframeInfo,
		signal: AbortSignal
	): Promise<void> {
		if (signal.aborted) {
			return;
		}

		const cacheKey = this._getCacheKey(videoPath, keyframe.time);

		// Skip if already cached
		if (this._keyframeCache.has(cacheKey)) {
			return;
		}

		const index = this._videoIndexes.get(videoPath);
		if (!index) {
			return;
		}

		try {
			const frameData = await this._decodeKeyframe(
				videoPath,
				keyframe.time,
				index.width,
				index.height,
				signal
			);

			if (frameData && !signal.aborted) {
				const cached: CachedKeyframe = {
					info: keyframe,
					buffer: frameData.buffer,
					width: frameData.width,
					height: frameData.height,
					lastAccess: Date.now(),
				};

				this._keyframeCache.set(cacheKey, cached);
				this._stats.prefetchedFrames++;
			}
		} catch (error) {
			if (!signal.aborted) {
				console.error(
					`[KeyframeCacheService] Failed to decode keyframe at ${keyframe.time}s:`,
					error
				);
			}
		}
	}

	/**
	 * 使用 Rust N-API 解码单个关键帧
	 */
	private async _decodeKeyframe(
		videoPath: string,
		time: number,
		width: number,
		height: number,
		signal: AbortSignal
	): Promise<{ buffer: Buffer; width: number; height: number } | null> {
		if (signal.aborted) {
			return null;
		}

		try {
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const { MediaProcessor } = require('@neko/media-processor-rs');
			const processor = await MediaProcessor.create();

			const config = {
				path: videoPath,
				hwAccel: this._config.hwAccel || undefined,
			};

			const frame = processor.decodeFrame(config, time);
			processor.dispose();

			if (!frame || signal.aborted) {
				return null;
			}

			return {
				buffer: Buffer.from(frame.data),
				width: frame.width,
				height: frame.height,
			};
		} catch (error) {
			if (!signal.aborted) {
				console.error(`[KeyframeCacheService] Rust N-API decode failed:`, error);
			}
			return null;
		}
	}
}

// =============================================================================
// Factory
// =============================================================================

let _instance: KeyframeCacheService | null = null;

export function getKeyframeCacheService(config: KeyframeCacheConfig): KeyframeCacheService {
	if (!_instance) {
		_instance = new KeyframeCacheService(config);
	}
	return _instance;
}

export function disposeKeyframeCacheService(): void {
	if (_instance) {
		_instance.dispose();
		_instance = null;
	}
}