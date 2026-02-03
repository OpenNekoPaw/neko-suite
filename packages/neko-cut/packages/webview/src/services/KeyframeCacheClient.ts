/**
 * KeyframeCacheClient - 关键帧缓存客户端
 *
 * 职责：
 * - 调用 Rust frame server 的 /keyframes/* API
 * - 在模式切换或时间线打开时触发缓存预热
 *
 * 使用场景：
 * - Basic 模式：不使用此客户端（Extension 端处理）
 * - Compat 模式：使用此客户端调用 Rust HTTP API
 */

import type { MediaEngineMode } from '@uniedit/shared';

// =============================================================================
// Types
// =============================================================================

export interface VideoSource {
	videoPath: string;
	startTime: number;
	trimStart: number;
	duration: number;
}

export interface TimelineData {
	id: string;
	duration: number;
	fps: number;
	width: number;
	height: number;
	tracks: Array<{
		id: string;
		trackType: string;
		elements: Array<{
			type: string;
			id: string;
			src?: string;
			startTime: number;
			duration: number;
			trimStart?: number;
			trimEnd?: number;
		}>;
	}>;
}

export interface WarmupRequest {
	timeline: TimelineData;
	playhead: number;
	maxFrames?: number;
}

export interface WarmupResponse {
	framesCached: number;
	framesHit: number;
	status: {
		cachedCount: number;
		capacity: number;
		memoryBytes: number;
		sources: Array<{
			sourcePath: string;
			cachedFrames: number;
			totalKeyframes: number;
		}>;
	};
}

export interface CacheStatus {
	cachedCount: number;
	capacity: number;
	memoryBytes: number;
	sources: Array<{
		sourcePath: string;
		cachedFrames: number;
		totalKeyframes: number;
	}>;
}

export interface IdrFrameInfo {
	frameIndex: number;
	timestamp: number;
	pts: number;
	nalType: number;
}

// =============================================================================
// Client Implementation
// =============================================================================

/**
 * 关键帧缓存客户端
 */
export class KeyframeCacheClient {
	private _serverPort: number | null = null;
	private _isDisposed = false;

	/**
	 * 设置 frame server 端口
	 */
	setServerPort(port: number | null): void {
		this._serverPort = port;
	}

	/**
	 * 获取 frame server 端口
	 */
	getServerPort(): number | null {
		return this._serverPort;
	}

	/**
	 * 检查服务是否可用
	 */
	isAvailable(): boolean {
		return !this._isDisposed && this._serverPort !== null;
	}

	/**
	 * 触发关键帧缓存预热
	 *
	 * @param videoSources 视频源列表
	 * @param playheadTime 当前 playhead 时间
	 * @param mode 当前模式
	 * @param outputWidth 输出宽度
	 * @param outputHeight 输出高度
	 */
	async triggerWarmup(
		videoSources: VideoSource[],
		playheadTime: number,
		mode: MediaEngineMode,
		outputWidth: number = 1920,
		outputHeight: number = 1080
	): Promise<WarmupResponse | null> {
		// Only use Rust API for compat mode
		if (mode !== 'compatible') {
			console.log('[KeyframeCacheClient] Skipping warmup for non-compat mode');
			return null;
		}

		if (!this.isAvailable()) {
			console.warn('[KeyframeCacheClient] Server not available');
			return null;
		}

		console.log(
			`[KeyframeCacheClient] Triggering warmup: ${videoSources.length} sources, playhead=${playheadTime}`
		);

		try {
			const timelineData = this._buildTimelineData(videoSources, outputWidth, outputHeight);

			const response = await fetch(`http://127.0.0.1:${this._serverPort}/keyframes/warmup`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					timeline: timelineData,
					playhead: playheadTime,
					maxFrames: 80,
				} as WarmupRequest),
			});

			if (!response.ok) {
				const errorText = await response.text();
				console.error(`[KeyframeCacheClient] Warmup failed: ${errorText}`);
				return null;
			}

			const result = (await response.json()) as WarmupResponse;
			console.log(
				`[KeyframeCacheClient] Warmup completed: cached=${result.framesCached}, hit=${result.framesHit}`
			);
			return result;
		} catch (error) {
			console.error('[KeyframeCacheClient] Warmup error:', error);
			return null;
		}
	}

	/**
	 * 获取缓存状态
	 */
	async getStatus(): Promise<CacheStatus | null> {
		if (!this.isAvailable()) {
			return null;
		}

		try {
			const response = await fetch(`http://127.0.0.1:${this._serverPort}/keyframes/status`);
			if (!response.ok) {
				return null;
			}
			return (await response.json()) as CacheStatus;
		} catch (error) {
			console.error('[KeyframeCacheClient] Failed to get status:', error);
			return null;
		}
	}

	/**
	 * 获取缓存的关键帧 JPEG
	 */
	async getCachedFrame(sourcePath: string, frameIndex: number): Promise<Blob | null> {
		if (!this.isAvailable()) {
			return null;
		}

		try {
			const params = new URLSearchParams({
				source: sourcePath,
				frameIndex: frameIndex.toString(),
			});

			const response = await fetch(
				`http://127.0.0.1:${this._serverPort}/keyframes/frame?${params}`
			);

			if (!response.ok) {
				return null;
			}

			return await response.blob();
		} catch (error) {
			console.error('[KeyframeCacheClient] Failed to get cached frame:', error);
			return null;
		}
	}

	/**
	 * 获取视频的 IDR 帧列表
	 */
	async getIdrFrames(sourcePath: string): Promise<IdrFrameInfo[] | null> {
		if (!this.isAvailable()) {
			return null;
		}

		try {
			const params = new URLSearchParams({ source: sourcePath });
			const response = await fetch(
				`http://127.0.0.1:${this._serverPort}/keyframes/idr?${params}`
			);

			if (!response.ok) {
				return null;
			}

			return (await response.json()) as IdrFrameInfo[];
		} catch (error) {
			console.error('[KeyframeCacheClient] Failed to get IDR frames:', error);
			return null;
		}
	}

	/**
	 * 清除所有缓存
	 */
	async clearAll(): Promise<boolean> {
		if (!this.isAvailable()) {
			return false;
		}

		try {
			const response = await fetch(`http://127.0.0.1:${this._serverPort}/keyframes/clear`, {
				method: 'POST',
			});
			return response.ok;
		} catch (error) {
			console.error('[KeyframeCacheClient] Failed to clear cache:', error);
			return false;
		}
	}

	/**
	 * 清除指定源的缓存
	 */
	async clearSource(sourcePath: string): Promise<boolean> {
		if (!this.isAvailable()) {
			return false;
		}

		try {
			const encodedPath = encodeURIComponent(sourcePath);
			const response = await fetch(
				`http://127.0.0.1:${this._serverPort}/keyframes/clear/${encodedPath}`,
				{ method: 'POST' }
			);
			return response.ok;
		} catch (error) {
			console.error('[KeyframeCacheClient] Failed to clear source cache:', error);
			return false;
		}
	}

	/**
	 * 释放资源
	 */
	dispose(): void {
		this._isDisposed = true;
		this._serverPort = null;
	}

	/**
	 * 构建 timeline 数据
	 */
	private _buildTimelineData(
		videoSources: VideoSource[],
		outputWidth: number,
		outputHeight: number
	): TimelineData {
		return {
			id: 'cache-timeline',
			duration: Math.max(...videoSources.map((s) => s.startTime + s.duration), 0),
			fps: 30,
			width: outputWidth,
			height: outputHeight,
			tracks: [
				{
					id: 'video-track',
					trackType: 'video',
					elements: videoSources.map((source, index) => ({
						type: 'media',
						id: `video-${index}`,
						src: source.videoPath,
						startTime: source.startTime,
						duration: source.duration,
						trimStart: source.trimStart,
						trimEnd: source.trimStart + source.duration,
					})),
				},
			],
		};
	}
}

// =============================================================================
// Singleton Instance
// =============================================================================

let _instance: KeyframeCacheClient | null = null;

export function getKeyframeCacheClient(): KeyframeCacheClient {
	if (!_instance) {
		_instance = new KeyframeCacheClient();
	}
	return _instance;
}

export function disposeKeyframeCacheClient(): void {
	if (_instance) {
		_instance.dispose();
		_instance = null;
	}
}
