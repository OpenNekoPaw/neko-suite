/**
 * MediaRequestProxy - Webview 端媒体请求代理
 *
 * 职责：
 * - 封装与 Extension Host 的 IPC 通信
 * - 提供类型安全的媒体处理 API
 * - 请求超时处理
 * - 数据类型转换（Buffer → ImageBitmap/AudioBuffer）
 *
 * 设计原则：
 * - 接口隔离：仅暴露必要的媒体处理方法
 * - 错误处理：统一的超时和错误处理
 * - 资源管理：Disposable 模式清理监听器
 */

import type {
	MediaRequest,
	MediaResponse,
	MediaInfo,
	GetVideoFrameResponse,
	GetVideoFrameRangeResponse,
	DecodeAudioSegmentResponse,
	ProbeMediaInfoResponse,
	ExtractSubtitlesResponse,
	ExtractedSubtitleTrack,
	GetWaveformResponse,
	RenderCompositeFrameRequest,
	RenderCompositeFrameResponse,
	CompatibleGetVideoFrameRequest,
	CompatibleGetVideoFrameResponse,
	CompositeLayerConfig,
} from '@neko/shared';
import { MAX_CONCURRENT_REQUESTS, MEDIA_REQUEST_TIMEOUT } from '@neko/shared';
import { getVSCodeAPI } from '../utils/vscodeApi';

// =============================================================================
// MediaRequestProxy Interface
// =============================================================================

/**
 * 媒体请求代理接口
 */
export interface IMediaRequestProxy {
	/**
	 * Extract a single video frame at specified time
	 * @returns ImageBitmap ready for canvas rendering
	 */
	getVideoFrame(
		videoPath: string,
		timeInSeconds: number,
		options?: MediaRequestOptions
	): Promise<ImageBitmap>;

	/**
	 * Extract multiple video frames in a time range (streaming, efficient)
	 * @returns Array of frames with time and ImageBitmap
	 */
	getVideoFrameRange(
		videoPath: string,
		startTime: number,
		duration: number,
		fps: number,
		options?: MediaRequestOptions
	): Promise<Array<{ time: number; bitmap: ImageBitmap }>>;

	/**
	 * Decode audio segment
	 * @returns AudioBuffer ready for Web Audio API
	 */
	decodeAudioSegment(
		videoPath: string,
		startTime: number,
		duration: number,
		sampleRate?: number,
		channels?: number,
		options?: MediaRequestOptions
	): Promise<AudioBuffer>;

	/**
	 * Probe media file metadata
	 */
	probeMediaInfo(videoPath: string, options?: MediaRequestOptions): Promise<MediaInfo>;

	/**
	 * Extract all subtitle streams from a video file
	 * @returns Array of extracted subtitle tracks with cues
	 */
	extractSubtitles(
		videoPath: string,
		options?: MediaRequestOptions
	): Promise<ExtractedSubtitleTrack[]>;

	/**
	 * Generate waveform data via neko-engine (Rust/FFmpeg)
	 * Bypasses CSP restrictions - file reading happens on native side
	 * @returns Waveform peak data with multi-channel support
	 */
	getWaveform(
		filePath: string,
		options?: MediaRequestOptions
	): Promise<{
		sampleRate: number;
		channels: number;
		peaksPerSecond: number;
		duration: number;
		peaks: number[][];
	}>;

	/**
	 * Get all keyframe times in the video
	 * Useful for thumbnail generation - thumbnails should be at keyframe positions
	 * @returns Array of keyframe times in seconds, sorted ascending
	 */
	getKeyframeTimes(videoPath: string): Promise<number[]>;

	// =========================================================================
	// Compatible Mode Methods (Extension-side decoding for preview)
	// =========================================================================

	/**
	 * Get a single video frame via Extension (compatible mode)
	 * @returns ImageBitmap ready for canvas rendering
	 */
	compatibleGetVideoFrame(
		videoPath: string,
		timeInSeconds: number,
		width?: number,
		height?: number,
		options?: MediaRequestOptions
	): Promise<ImageBitmap>;

	/**
	 * Render composite frame via Extension (compatible mode)
	 * @returns ImageBitmap of the composited frame
	 */
	renderCompositeFrame(
		layers: CompositeLayerConfig[],
		time: number,
		width: number,
		height: number,
		backgroundColor?: [number, number, number, number],
		options?: MediaRequestOptions
	): Promise<ImageBitmap>;

	// =========================================================================
	// Performance Stats Methods (Compat Mode Monitoring)
	// =========================================================================

	/**
	 * Get performance stats from Extension (compat mode)
	 * @returns Performance statistics including CPU, memory, cache stats
	 */
	getPerformanceStats(): Promise<{
		cpuUsage: number;
		memoryUsedMB: number;
		memoryTotalMB: number;
		cachedFrames: number;
		cacheHitCount: number;
		cacheMissCount: number;
		cacheHitRate: number;
		droppedFrames: number;
		decodeErrors: number;
		avgDecodeTimeMs: number;
		avgRenderTimeMs: number;
	}>;

	/**
	 * Get media bitrate info from Extension
	 * @param mediaPath Media file path
	 * @returns Bitrate information
	 */
	getMediaBitrate(mediaPath: string): Promise<{
		videoBitrate: number;
		audioBitrate: number;
		totalBitrate: number;
		videoBitrateStr: string;
		totalBitrateStr: string;
	}>;

	/**
	 * Cancel all pending requests
	 */
	cancelAllPendingRequests(): void;

	/**
	 * Get number of pending requests
	 */
	readonly pendingRequestCount: number;

	/**
	 * Dispose resources
	 */
	dispose(): void;
}

/**
 * 媒体请求可选参数
 * - signal：用于中止等待（不会取消 Extension 侧 FFmpeg 进程，只是在 Webview 侧提前拒绝并忽略返回）
 */
export interface MediaRequestOptions {
	signal?: AbortSignal;
	/**
	 * 请求优先级（数值越大越优先）
	 * 用于在预览/播放等交互场景下，优先调度关键帧请求，避免被缩略图/预加载等后台任务拖垮。
	 */
	priority?: number;
	/**
	 * 单次请求超时（毫秒），默认使用 MEDIA_REQUEST_TIMEOUT
	 * 注意：超时从"实际发送给 Extension Host"开始计时（而不是进入队列时）
	 */
	timeoutMs?: number;
	/**
	 * Phase 2: JPEG quality (2-31, lower is better, default: 3)
	 */
	quality?: number;
	/**
	 * Phase 2: Scale factor (0-1, default: 1.0 = no scaling)
	 */
	scale?: number;
	/**
	 * Maximum frames to extract (for memory control in Webview)
	 */
	maxFrames?: number;
	/**
	 * Use thumbnail mode for non-sequential access (e.g., thumbnail generation)
	 * Uses keyframe preview decoder which is faster for random access
	 */
	useThumbnailMode?: boolean;
}

// =============================================================================
// MediaRequestProxy Implementation
// =============================================================================

class MediaRequestProxy implements IMediaRequestProxy {
	private requestIdCounter = 0;

	/**
	 * 已发送到 Extension Host、等待响应的请求
	 */
	private pendingRequests = new Map<
		string,
		{
			resolve: (value: unknown) => void;
			reject: (error: Error) => void;
			timeoutId: number;
			requestType: MediaRequest['type'];
			startedAt: number;
			timeoutMs: number;
			signal?: AbortSignal;
			abortListener?: () => void;
		}
	>();

	/**
	 * 待发送队列（带优先级），用于控制并发/背压
	 */
	private queuedRequests: Array<{
		request: MediaRequest;
		resolve: (value: unknown) => void;
		reject: (error: Error) => void;
		signal?: AbortSignal;
		abortListener?: () => void;
		priority: number;
		timeoutMs: number;
		enqueuedAt: number;
	}> = [];

	private activeCount = 0;
	private readonly maxConcurrent: number;
	private audioBufferContext: AudioContext | null = null;

	constructor(
		private readonly timeout = MEDIA_REQUEST_TIMEOUT,
		maxConcurrent = MAX_CONCURRENT_REQUESTS
	) {
		this.maxConcurrent = Math.max(1, maxConcurrent);
		// Listen to Extension responses
		window.addEventListener('message', this.handleMessage);
	}

	// ===========================================================================
	// Public API
	// ===========================================================================

	async getVideoFrame(
		videoPath: string,
		timeInSeconds: number,
		options?: MediaRequestOptions
	): Promise<ImageBitmap> {
		const requestId = this.generateRequestId();

		const request: MediaRequest = {
			type: 'media:getVideoFrame',
			requestId,
			timestamp: Date.now(),
			payload: {
				videoPath,
				timeInSeconds,
				quality: options?.quality, // Phase 2: Pass quality parameter
				scale: options?.scale, // Phase 2: Pass scale parameter
			},
		};

		const response = await this.sendRequest<GetVideoFrameResponse>(request, options);

		if (response.error) {
			throw new Error(response.error);
		}

		if (!response.payload) {
			throw new Error('No payload in response');
		}

		// Handle both formats for backward compatibility
		if (response.payload.imageDataUrl) {
			// Old format: base64 data URL
			return this.dataUrlToImageBitmap(response.payload.imageDataUrl);
		} else if (response.payload.imageBuffer) {
			// New format: raw ArrayBuffer (more efficient)
			return this.arrayBufferToImageBitmap(
				response.payload.imageBuffer,
				response.payload.mimeType || 'image/jpeg'
			);
		}

		throw new Error('Invalid response payload format');
	}

	async getVideoFrameRange(
		videoPath: string,
		startTime: number,
		duration: number,
		fps: number,
		options?: MediaRequestOptions
	): Promise<Array<{ time: number; bitmap: ImageBitmap }>> {
		const requestId = this.generateRequestId();

		const request: MediaRequest = {
			type: 'media:getVideoFrameRange',
			requestId,
			timestamp: Date.now(),
			payload: {
				videoPath,
				startTime,
				duration,
				fps,
				quality: options?.quality, // Phase 2: Pass quality parameter
				scale: options?.scale, // Phase 2: Pass scale parameter
				maxFrames: options?.maxFrames, // Pass maxFrames limit to Extension
			},
		};

		const response = await this.sendRequest<GetVideoFrameRangeResponse>(request, options);

		if (response.error) {
			throw new Error(response.error);
		}

		if (!response.payload || !response.payload.frames) {
			throw new Error('No payload in response');
		}

		// Convert frames to ImageBitmaps
		// Skip corrupted frames instead of failing entire batch
		const results: Array<{ time: number; bitmap: ImageBitmap }> = [];
		let skippedCount = 0;

		for (const frame of response.payload.frames) {
			try {
				let bitmap: ImageBitmap;
				if (frame.imageDataUrl) {
					// New format: base64 data URL
					bitmap = await this.dataUrlToImageBitmap(frame.imageDataUrl);
				} else if (frame.imageBuffer) {
					// Old format: ArrayBuffer (may not work reliably)
					const mimeType = response.payload.mimeType || 'image/jpeg';
					bitmap = await this.arrayBufferToImageBitmap(frame.imageBuffer, mimeType);
				} else {
					throw new Error('Frame has no image data');
				}
				results.push({ time: frame.time, bitmap });
			} catch (error) {
				// Skip corrupted frame, continue with others
				skippedCount++;
				if (skippedCount <= 3) {
					console.warn(`[MediaRequestProxy] Skipped corrupted frame at ${frame.time.toFixed(2)}s:`, error);
				}
			}
		}

		if (skippedCount > 0) {
			console.warn(`[MediaRequestProxy] Skipped ${skippedCount}/${response.payload.frames.length} corrupted frames`);
		}

		return results;
	}

	async decodeAudioSegment(
		videoPath: string,
		startTime: number,
		duration: number,
		sampleRate = 48000,
		channels = 2,
		options?: MediaRequestOptions
	): Promise<AudioBuffer> {
		const requestId = this.generateRequestId();

		const request: MediaRequest = {
			type: 'media:decodeAudioSegment',
			requestId,
			timestamp: Date.now(),
			payload: { videoPath, startTime, duration, sampleRate, channels },
		};

		const response = await this.sendRequest<DecodeAudioSegmentResponse>(request, options);

		if (response.error) {
			throw new Error(response.error);
		}

		if (!response.payload) {
			throw new Error('No payload in response');
		}

		// Convert ArrayBuffer to AudioBuffer
		return this.arrayBufferToAudioBuffer(
			response.payload.buffer,
			response.payload.sampleRate,
			response.payload.channels
		);
	}

	async probeMediaInfo(videoPath: string, options?: MediaRequestOptions): Promise<MediaInfo> {
		const requestId = this.generateRequestId();

		const request: MediaRequest = {
			type: 'media:probeMediaInfo',
			requestId,
			timestamp: Date.now(),
			payload: { videoPath },
		};

		const response = await this.sendRequest<ProbeMediaInfoResponse>(request, options);

		if (response.error) {
			throw new Error(response.error);
		}

		if (!response.payload) {
			throw new Error('No payload in response');
		}

		return response.payload;
	}

	async extractSubtitles(
		videoPath: string,
		options?: MediaRequestOptions
	): Promise<ExtractedSubtitleTrack[]> {
		const requestId = this.generateRequestId();

		const request: MediaRequest = {
			type: 'media:extractSubtitles',
			requestId,
			timestamp: Date.now(),
			payload: { videoPath },
		};

		const response = await this.sendRequest<ExtractSubtitlesResponse>(request, options);

		if (response.error) {
			throw new Error(response.error);
		}

		return response.payload?.tracks ?? [];
	}

	async getWaveform(
		filePath: string,
		options?: MediaRequestOptions
	): Promise<{
		sampleRate: number;
		channels: number;
		peaksPerSecond: number;
		duration: number;
		peaks: number[][];
	}> {
		const requestId = this.generateRequestId();

		const request: MediaRequest = {
			type: 'media:getWaveform',
			requestId,
			timestamp: Date.now(),
			payload: { filePath },
		};

		const response = await this.sendRequest<GetWaveformResponse>(request, options);

		if (response.error) {
			throw new Error(response.error);
		}

		if (!response.payload) {
			throw new Error('No payload in waveform response');
		}

		return response.payload;
	}

	/**
	 * Get all keyframe times in the video
	 * Note: Not implemented for compatible mode (FFmpeg-based)
	 * Returns empty array - use LocalMediaProcessor for keyframe info
	 */
	async getKeyframeTimes(_videoPath: string): Promise<number[]> {
		// Compatible mode doesn't support keyframe time extraction
		// This would require FFmpeg to parse the video container
		return [];
	}

	// =========================================================================
	// Compatible Mode Methods
	// =========================================================================

	async compatibleGetVideoFrame(
		videoPath: string,
		timeInSeconds: number,
		width?: number,
		height?: number,
		options?: MediaRequestOptions
	): Promise<ImageBitmap> {
		const requestId = this.generateRequestId();

		const request: CompatibleGetVideoFrameRequest = {
			type: 'media:compatibleGetVideoFrame',
			requestId,
			timestamp: Date.now(),
			payload: {
				videoPath,
				timeInSeconds,
				width,
				height,
			},
		};

		const response = await this.sendCompatibleRequest<CompatibleGetVideoFrameResponse>(request, options);

		if (response.error) {
			throw new Error(response.error);
		}

		if (!response.payload?.imageData && !response.payload?.imageDataUrl) {
			throw new Error('No image data in response');
		}

		// Prefer binary data (more efficient), fallback to base64
		if (response.payload.imageData) {
			return this.arrayBufferToImageBitmap(response.payload.imageData.buffer as ArrayBuffer, 'image/jpeg');
		}
		return this.dataUrlToImageBitmap(response.payload.imageDataUrl!);
	}

	async renderCompositeFrame(
		layers: CompositeLayerConfig[],
		time: number,
		width: number,
		height: number,
		backgroundColor?: [number, number, number, number],
		options?: MediaRequestOptions
	): Promise<ImageBitmap> {
		const requestId = this.generateRequestId();

		const request: RenderCompositeFrameRequest = {
			type: 'media:renderCompositeFrame',
			requestId,
			timestamp: Date.now(),
			payload: {
				layers,
				time,
				width,
				height,
				backgroundColor,
			},
		};

		const response = await this.sendCompatibleRequest<RenderCompositeFrameResponse>(request, options);

		if (response.error) {
			throw new Error(response.error);
		}

		if (!response.payload?.imageData && !response.payload?.imageDataUrl) {
			throw new Error('No image data in response');
		}

		// Prefer binary data (more efficient), fallback to base64
		if (response.payload.imageData) {
			return this.arrayBufferToImageBitmap(
				response.payload.imageData.buffer as ArrayBuffer,
				'image/jpeg'
			);
		}
		return this.dataUrlToImageBitmap(response.payload.imageDataUrl!);
	}

	dispose(): void {
		window.removeEventListener('message', this.handleMessage);

		// Reject all queued requests
		for (const queued of this.queuedRequests) {
			if (queued.signal && queued.abortListener) {
				queued.signal.removeEventListener('abort', queued.abortListener);
			}
			queued.reject(new Error('MediaRequestProxy disposed'));
		}
		this.queuedRequests = [];

		// Reject all in-flight requests
		for (const [_requestId, pending] of this.pendingRequests) {
			clearTimeout(pending.timeoutId);
			if (pending.signal && pending.abortListener) {
				pending.signal.removeEventListener('abort', pending.abortListener);
			}
			pending.reject(new Error('MediaRequestProxy disposed'));
		}

		this.pendingRequests.clear();
		this.activeCount = 0;
		if (this.audioBufferContext) {
			this.audioBufferContext.close().catch(() => {});
			this.audioBufferContext = null;
		}
	}

	/**
	 * Cancel all pending requests
	 * Useful when playback stops to prevent timeout errors from queued requests
	 */
	cancelAllPendingRequests(): void {
		const queuedCount = this.queuedRequests.length;
		const inFlightCount = this.pendingRequests.size;
		const total = queuedCount + inFlightCount;
		if (total === 0) return;

		// 取消未发送的队列请求
		for (const queued of this.queuedRequests) {
			if (queued.signal && queued.abortListener) {
				queued.signal.removeEventListener('abort', queued.abortListener);
			}
			queued.reject(new Error('Request cancelled'));
		}
		this.queuedRequests = [];

		// 取消已发送、等待响应的请求
		for (const [requestId, pending] of this.pendingRequests) {
			clearTimeout(pending.timeoutId);
			if (pending.signal && pending.abortListener) {
				pending.signal.removeEventListener('abort', pending.abortListener);
			}
			pending.reject(new Error('Request cancelled'));
			this.pendingRequests.delete(requestId);
		}

		this.activeCount = 0;
	}

	/**
	 * Get number of pending requests
	 */
	get pendingRequestCount(): number {
		return this.pendingRequests.size + this.queuedRequests.length;
	}

	// ===========================================================================
	// Private Methods
	// ===========================================================================

	/**
	 * Send compatible mode request to Extension Host and wait for response
	 * These requests use different types than standard MediaRequest/MediaResponse
	 */
	private sendCompatibleRequest<T extends RenderCompositeFrameResponse | CompatibleGetVideoFrameResponse>(
		request: RenderCompositeFrameRequest | CompatibleGetVideoFrameRequest,
		options?: MediaRequestOptions
	): Promise<T> {
		// Reuse the same queue mechanism but with a type assertion
		// The request structure is compatible with MediaRequest
		return this.sendRequest(request as unknown as MediaRequest, options) as unknown as Promise<T>;
	}

	/**
	 * Send request to Extension Host and wait for response
	 */
	private sendRequest<T extends MediaResponse>(
		request: MediaRequest,
		options?: MediaRequestOptions
	): Promise<T> {
		return new Promise((resolve, reject) => {
			const vscode = getVSCodeAPI();
			if (!vscode) {
				reject(new Error('VSCode API not available'));
				return;
			}

			const signal = options?.signal;
			const priority = options?.priority ?? 0;
			const timeoutMs = options?.timeoutMs ?? this.timeout;
			if (signal?.aborted) {
				reject(this.createAbortError());
				return;
			}

			// 将请求加入队列，真正发送时再开始计时（避免排队时间被算进超时）
			const queued = {
				request,
				resolve: resolve as (value: unknown) => void,
				reject,
				signal,
				abortListener: undefined as (() => void) | undefined,
				priority,
				timeoutMs,
				enqueuedAt: Date.now(),
			};

			if (signal) {
				const requestId = request.requestId;
				const abortListener = () => {
					// 1) 若仍在队列中：直接移除并拒绝
					const removed = this.removeQueuedRequest(requestId);
					if (removed) {
						if (removed.signal && removed.abortListener) {
							removed.signal.removeEventListener('abort', removed.abortListener);
						}
						removed.reject(this.createAbortError());
						return;
					}

					// 2) 若已发送：中止等待（不会取消 Extension 侧任务，仅释放 Webview 侧资源）
					this.abortInFlightRequest(requestId);
				};
				queued.abortListener = abortListener;
				signal.addEventListener('abort', abortListener, { once: true });
			}

			this.enqueueRequest(queued);
			this.processQueue();
		});
	}

	private enqueueRequest(request: {
		request: MediaRequest;
		resolve: (value: unknown) => void;
		reject: (error: Error) => void;
		signal?: AbortSignal;
		abortListener?: () => void;
		priority: number;
		timeoutMs: number;
		enqueuedAt: number;
	}): void {
		// 按优先级插入（高优先级在前，同优先级保持相对顺序）
		const insertIndex = this.queuedRequests.findIndex(r => r.priority < request.priority);
		if (insertIndex === -1) {
			this.queuedRequests.push(request);
		} else {
			this.queuedRequests.splice(insertIndex, 0, request);
		}
	}

	private processQueue(): void {
		const vscode = getVSCodeAPI();
		if (!vscode) return;

		while (this.activeCount < this.maxConcurrent && this.queuedRequests.length > 0) {
			const queued = this.queuedRequests.shift();
			if (!queued) break;

			// 队列中等待期间可能已被取消
			if (queued.signal?.aborted) {
				if (queued.signal && queued.abortListener) {
					queued.signal.removeEventListener('abort', queued.abortListener);
				}
				queued.reject(this.createAbortError());
				continue;
			}

			this.activeCount++;
			const startedAt = Date.now();

			// Setup timeout（从“实际发送”开始计时）
			const timeoutId = window.setTimeout(() => {
				this.finalizeInFlightRequest(
					queued.request.requestId,
					new Error(`Request timeout after ${queued.timeoutMs}ms`)
				);
			}, queued.timeoutMs);

			// Store pending request (in-flight)
			this.pendingRequests.set(queued.request.requestId, {
				resolve: queued.resolve,
				reject: queued.reject,
				timeoutId,
				requestType: queued.request.type,
				startedAt,
				timeoutMs: queued.timeoutMs,
				signal: queued.signal,
				abortListener: queued.abortListener,
			});

			// Send to Extension Host
			vscode.postMessage(queued.request);
		}
	}

	private removeQueuedRequest(requestId: string): {
		request: MediaRequest;
		resolve: (value: unknown) => void;
		reject: (error: Error) => void;
		signal?: AbortSignal;
		abortListener?: () => void;
		priority: number;
		timeoutMs: number;
		enqueuedAt: number;
	} | null {
		const index = this.queuedRequests.findIndex(r => r.request.requestId === requestId);
		if (index === -1) return null;
		const [removed] = this.queuedRequests.splice(index, 1);
		return removed || null;
	}

	private abortInFlightRequest(requestId: string): void {
		const pending = this.pendingRequests.get(requestId);
		if (!pending) return;
		this.finalizeInFlightRequest(requestId, this.createAbortError());
	}

	private finalizeInFlightRequest(requestId: string, error?: Error, response?: MediaResponse): void {
		const pending = this.pendingRequests.get(requestId);
		if (!pending) return;

		clearTimeout(pending.timeoutId);
		if (pending.signal && pending.abortListener) {
			pending.signal.removeEventListener('abort', pending.abortListener);
		}
		this.pendingRequests.delete(requestId);
		this.activeCount = Math.max(0, this.activeCount - 1);

		if (error) {
			// 超时属于需要追踪的异常：输出队列状态，便于定位瓶颈
			if (error.message.startsWith('Request timeout after')) {
				console.warn('[MediaRequestProxy] Request timeout:', {
					requestId,
					type: pending.requestType,
					timeoutMs: pending.timeoutMs,
					elapsedMs: Date.now() - pending.startedAt,
					active: this.activeCount,
					queued: this.queuedRequests.length,
				});
			}
			pending.reject(error);
		} else if (response) {
			pending.resolve(response);
		}

		// 释放并发槽位后继续调度
		this.processQueue();
	}

	private createAbortError(): Error {
		// VSCode Webview/浏览器环境优先使用 DOMException 以兼容标准 AbortError 判断
		if (typeof DOMException !== 'undefined') {
			return new DOMException('Request aborted', 'AbortError') as unknown as Error;
		}
		const error = new Error('Request aborted');
		(error as unknown as { name: string }).name = 'AbortError';
		return error;
	}

	/**
	 * Handle incoming message from Extension Host
	 */
	private handleMessage = (event: MessageEvent): void => {
		const message = event.data;

		// Check for performance stats response
		if (this.isPerformanceStatsResponse(message)) {
			const response = message as { requestId: string; payload?: unknown; error?: string };
			const pending = this.performanceStatsRequests.get(response.requestId);
			if (pending) {
				pending.resolve(response);
			}
			return;
		}

		// Check for media bitrate response
		if (this.isMediaBitrateResponse(message)) {
			const response = message as { requestId: string; payload?: unknown; error?: string };
			const pending = this.performanceStatsRequests.get(response.requestId);
			if (pending) {
				pending.resolve(response);
			}
			return;
		}

		// Check if this is a media response (including compatible mode responses)
		if (!this.isMediaResponse(message) && !this.isCompatibleModeResponse(message)) {
			return;
		}

		const response = message as MediaResponse | RenderCompositeFrameResponse | CompatibleGetVideoFrameResponse;
		this.finalizeInFlightRequest(response.requestId, undefined, response as MediaResponse);
	};

	/**
	 * Type guard for performance stats response
	 */
	private isPerformanceStatsResponse(message: unknown): boolean {
		if (typeof message !== 'object' || message === null) {
			return false;
		}
		const msg = message as Record<string, unknown>;
		return msg.type === 'media:response:getPerformanceStats' && typeof msg.requestId === 'string';
	}

	/**
	 * Type guard for media bitrate response
	 */
	private isMediaBitrateResponse(message: unknown): boolean {
		if (typeof message !== 'object' || message === null) {
			return false;
		}
		const msg = message as Record<string, unknown>;
		return msg.type === 'media:response:getMediaBitrate' && typeof msg.requestId === 'string';
	}

	/**
	 * Type guard for MediaResponse
	 */
	private isMediaResponse(message: unknown): message is MediaResponse {
		if (typeof message !== 'object' || message === null) {
			return false;
		}

		const msg = message as Record<string, unknown>;

		return (
			typeof msg.type === 'string' &&
			msg.type.startsWith('media:response:') &&
			!msg.type.includes('compatible') &&
			!msg.type.includes('renderComposite') &&
			typeof msg.requestId === 'string'
		);
	}

	/**
	 * Type guard for Compatible Mode Response
	 */
	private isCompatibleModeResponse(message: unknown): message is RenderCompositeFrameResponse | CompatibleGetVideoFrameResponse {
		if (typeof message !== 'object' || message === null) {
			return false;
		}

		const msg = message as Record<string, unknown>;

		return (
			typeof msg.type === 'string' &&
			(msg.type === 'media:response:compatibleGetVideoFrame' ||
			 msg.type === 'media:response:renderCompositeFrame') &&
			typeof msg.requestId === 'string'
		);
	}

	/**
	 * Generate unique request ID
	 */
	private generateRequestId(): string {
		return `req_${Date.now()}_${this.requestIdCounter++}`;
	}

	/**
	 * Convert base64 data URL to ImageBitmap
	 */
	private async dataUrlToImageBitmap(dataUrl: string): Promise<ImageBitmap> {
		const response = await fetch(dataUrl);
		const blob = await response.blob();
		return await createImageBitmap(blob);
	}

	/**
	 * Convert raw ArrayBuffer to ImageBitmap (more efficient than base64)
	 */
	private async arrayBufferToImageBitmap(buffer: ArrayBuffer, mimeType: string): Promise<ImageBitmap> {
		if (buffer.byteLength === 0) {
			throw new Error('Empty image buffer received');
		}
		const blob = new Blob([buffer], { type: mimeType });
		try {
			return await createImageBitmap(blob);
		} catch (error) {
			console.error(`[MediaRequestProxy] createImageBitmap failed: bufferSize=${buffer.byteLength}, mimeType=${mimeType}`, error);
			throw error;
		}
	}

	/**
	 * Convert raw PCM ArrayBuffer to AudioBuffer
	 */
	private async arrayBufferToAudioBuffer(
		buffer: ArrayBuffer,
		sampleRate: number,
		channels: number
	): Promise<AudioBuffer> {
		const frameCount = Math.floor(buffer.byteLength / (channels * 4)); // Float32 = 4 bytes
		let audioBuffer: AudioBuffer;

		// 优先使用 AudioBuffer 构造函数：避免每次解码都创建 AudioContext（会触发浏览器 AudioContext 数量限制）
		try {
			audioBuffer = new AudioBuffer({
				length: frameCount,
				numberOfChannels: channels,
				sampleRate,
			});
		} catch {
			// 兼容兜底：复用一个 AudioContext 仅用于 createBuffer（不用于播放）
			if (!this.audioBufferContext || this.audioBufferContext.sampleRate !== sampleRate) {
				this.audioBufferContext?.close().catch(() => {});
				this.audioBufferContext = new AudioContext({ sampleRate });
			}
			audioBuffer = this.audioBufferContext.createBuffer(channels, frameCount, sampleRate);
		}

		// Copy PCM data to AudioBuffer
		const float32Data = new Float32Array(buffer);

		for (let channel = 0; channel < channels; channel++) {
			const channelData = audioBuffer.getChannelData(channel);

			for (let i = 0; i < frameCount; i++) {
				channelData[i] = float32Data[i * channels + channel] || 0;
			}
		}

		return audioBuffer;
	}

	// ===========================================================================
	// Performance Stats Methods (Compat Mode Monitoring)
	// ===========================================================================

	// Separate map for performance stats requests (different structure from media requests)
	private performanceStatsRequests = new Map<string, {
		resolve: (value: unknown) => void;
		reject: (error: Error) => void;
		timeoutId: ReturnType<typeof setTimeout>;
	}>();

	/**
	 * Get performance stats from Extension (compat mode)
	 */
	async getPerformanceStats(): Promise<{
		cpuUsage: number;
		memoryUsedMB: number;
		memoryTotalMB: number;
		cachedFrames: number;
		cacheHitCount: number;
		cacheMissCount: number;
		cacheHitRate: number;
		droppedFrames: number;
		decodeErrors: number;
		avgDecodeTimeMs: number;
		avgRenderTimeMs: number;
	}> {
		const requestId = this.generateRequestId();
		const vscode = getVSCodeAPI();

		return new Promise((resolve, reject) => {
			const timeoutId = setTimeout(() => {
				this.performanceStatsRequests.delete(requestId);
				reject(new Error('Performance stats request timeout'));
			}, 5000);

			this.performanceStatsRequests.set(requestId, {
				resolve: (response: unknown) => {
					clearTimeout(timeoutId);
					this.performanceStatsRequests.delete(requestId);
					const resp = response as { payload?: unknown; error?: string };
					if (resp.error) {
						reject(new Error(resp.error));
					} else {
						resolve(resp.payload as {
							cpuUsage: number;
							memoryUsedMB: number;
							memoryTotalMB: number;
							cachedFrames: number;
							cacheHitCount: number;
							cacheMissCount: number;
							cacheHitRate: number;
							droppedFrames: number;
							decodeErrors: number;
							avgDecodeTimeMs: number;
							avgRenderTimeMs: number;
						});
					}
				},
				reject: (error: Error) => {
					clearTimeout(timeoutId);
					this.performanceStatsRequests.delete(requestId);
					reject(error);
				},
				timeoutId,
			});

			vscode?.postMessage({
				type: 'media:getPerformanceStats',
				requestId,
				timestamp: Date.now(),
			});
		});
	}

	/**
	 * Get media bitrate info from Extension
	 */
	async getMediaBitrate(mediaPath: string): Promise<{
		videoBitrate: number;
		audioBitrate: number;
		totalBitrate: number;
		videoBitrateStr: string;
		totalBitrateStr: string;
	}> {
		const requestId = this.generateRequestId();
		const vscode = getVSCodeAPI();

		return new Promise((resolve, reject) => {
			const timeoutId = setTimeout(() => {
				this.performanceStatsRequests.delete(requestId);
				reject(new Error('Media bitrate request timeout'));
			}, 10000);

			this.performanceStatsRequests.set(requestId, {
				resolve: (response: unknown) => {
					clearTimeout(timeoutId);
					this.performanceStatsRequests.delete(requestId);
					const resp = response as { payload?: unknown; error?: string };
					if (resp.error) {
						reject(new Error(resp.error));
					} else {
						resolve(resp.payload as {
							videoBitrate: number;
							audioBitrate: number;
							totalBitrate: number;
							videoBitrateStr: string;
							totalBitrateStr: string;
						});
					}
				},
				reject: (error: Error) => {
					clearTimeout(timeoutId);
					this.performanceStatsRequests.delete(requestId);
					reject(error);
				},
				timeoutId,
			});

			vscode?.postMessage({
				type: 'media:getMediaBitrate',
				requestId,
				timestamp: Date.now(),
				payload: { mediaPath },
			});
		});
	}
}

// =============================================================================
// Export
// =============================================================================

/**
 * Export the class for use in mediaProxyFactory
 */
export { MediaRequestProxy };
