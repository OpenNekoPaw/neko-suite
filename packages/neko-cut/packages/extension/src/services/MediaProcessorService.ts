/**
 * MediaProcessorService - 媒体处理消息路由服务
 *
 * 职责：
 * - 处理来自 Webview 的媒体处理请求（IPC 消息）
 * - 请求队列管理和并发控制
 * - LRU 缓存已处理的结果
 * - 将请求分发到 RustMediaProcessorService 或 FFmpegService（降级）
 * - 将结果序列化后发送回 Webview
 *
 * 设计原则：
 * - 单一职责：仅负责消息路由和缓存，不直接操作媒体处理
 * - 依赖倒置：依赖抽象接口，支持多种后端
 * - 优雅降级：Rust addon 失败时自动回退到 FFmpeg
 * - 资源管理：Disposable 模式，清理缓存和队列
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { FFmpegService } from './FFmpegService';
import { RustMediaProcessorService } from './RustMediaProcessorService';
import { StreamingAudioDecoderService, getStreamingAudioDecoderService } from './StreamingAudioDecoderService';
import {
	MAX_CONCURRENT_REQUESTS,
	type MediaRequest,
	type MediaResponse,
	type GetVideoFrameRequest,
	type GetVideoFrameRangeRequest,
	type DecodeAudioSegmentRequest,
	type ProbeMediaInfoRequest,
	type ExtractSubtitlesRequest,
	type RenderCompositeFrameRequest,
	type RenderCompositeFrameResponse,
	type CompatibleGetVideoFrameRequest,
	type CompatibleGetVideoFrameResponse,
	type CompatibleModeRequest,
	type CompatibleModeResponse,
	type AudioStreamStartRequest,
	type AudioStreamStopRequest,
	type AudioStreamSeekRequest,
	type AudioStreamWebviewMessage,
	type ProjectData,
} from '@uniedit/shared';

// =============================================================================
// LRU Cache Implementation
// =============================================================================

interface CacheEntry<T> {
	value: T;
	timestamp: number;
	accessCount: number;
	lastAccessTime: number;
}

interface CacheStats {
	size: number;
	maxSize: number;
	hitCount: number;
	missCount: number;
	evictionCount: number;
	hitRate: number;
}

class LRUCache<K, V> {
	private cache = new Map<K, CacheEntry<V>>();
	private readonly maxSize: number;
	private readonly ttl: number; // Time to live in milliseconds

	// Statistics
	private hitCount = 0;
	private missCount = 0;
	private evictionCount = 0;

	constructor(maxSize: number, ttl: number) {
		this.maxSize = maxSize;
		this.ttl = ttl;
	}

	get(key: K): V | undefined {
		const entry = this.cache.get(key);
		if (!entry) {
			this.missCount++;
			return undefined;
		}

		// Check TTL
		if (Date.now() - entry.timestamp > this.ttl) {
			this.cache.delete(key);
			this.evictionCount++;
			this.missCount++;
			return undefined;
		}

		// Update access statistics
		entry.accessCount++;
		entry.lastAccessTime = Date.now();
		this.hitCount++;

		// Move to end (most recently used)
		this.cache.delete(key);
		this.cache.set(key, entry);

		return entry.value;
	}

	set(key: K, value: V): void {
		// Remove oldest entry if cache is full
		if (this.cache.size >= this.maxSize) {
			const firstKey = this.cache.keys().next().value;
			if (firstKey !== undefined) {
				this.cache.delete(firstKey);
				this.evictionCount++;
			}
		}

		this.cache.set(key, {
			value,
			timestamp: Date.now(),
			accessCount: 0,
			lastAccessTime: Date.now(),
		});
	}

	clear(): void {
		this.cache.clear();
		this.hitCount = 0;
		this.missCount = 0;
		this.evictionCount = 0;
	}

	get size(): number {
		return this.cache.size;
	}

	/**
	 * Get cache statistics
	 */
	getStats(): CacheStats {
		const totalRequests = this.hitCount + this.missCount;
		return {
			size: this.cache.size,
			maxSize: this.maxSize,
			hitCount: this.hitCount,
			missCount: this.missCount,
			evictionCount: this.evictionCount,
			hitRate: totalRequests > 0 ? this.hitCount / totalRequests : 0,
		};
	}

	/**
	 * Reset statistics
	 */
	resetStats(): void {
		this.hitCount = 0;
		this.missCount = 0;
		this.evictionCount = 0;
	}
}

// =============================================================================
// MediaProcessorService
// =============================================================================

/**
 * 媒体处理请求项（内部使用）
 */
interface RequestQueueItem {
	request: MediaRequest;
	resolve: (response: MediaResponse) => void;
	reject: (error: Error) => void;
}

/**
 * 媒体处理服务
 *
 * Supports two modes:
 * 1. Request-Response Mode: Traditional request/response for single frames (export, thumbnails)
 * 2. H264 Stream Mode: WebSocket-based H.264 streaming for real-time preview
 */
export class MediaProcessorService {
	private ffmpegService: FFmpegService;
	private rustService: RustMediaProcessorService | null = null;
	private rustServiceInitPromise: Promise<void> | null = null;
	private cache: LRUCache<string, unknown>;
	private requestQueue: RequestQueueItem[] = [];
	private activeRequests = 0;
	private readonly maxConcurrency: number;
	private statsLogInterval: NodeJS.Timeout | null = null;
	private readonly documentDir: string | undefined;
	private disposed = false;

	// Frame server service for WebSocket-based frame delivery
	private frameServerService: {
		pushFrame: (data: Buffer, timestamp: number, width: number, height: number) => void;
		pushH264Packet?: (data: Buffer, pts: number, dts: number, isKeyframe: boolean) => void;
	} | null = null;

	// H264 encoder session for playback preview
	private h264EncoderSession: {
		encodeFrame: (frame: { data: Buffer; width: number; height: number; format: string; timestamp: number; isKeyframe: boolean }, pts: number) => Array<{ data: Buffer; pts: number; dts: number; isKeyframe: boolean }>;
		flush: () => Array<{ data: Buffer; pts: number; dts: number; isKeyframe: boolean }>;
		close: () => void;
		isHwActive: () => boolean;
	} | null = null;
	private h264EncoderConfig: { width: number; height: number; fps: number } | null = null;

	// Playback push mode state
	private playbackPushState: {
		videoPath: string;
		currentTime: number;
		fps: number;
		speed: number;
		intervalId: NodeJS.Timeout | null;
		isRunning: boolean;
	} | null = null;

	// Audio streaming for compat mode (real-time audio playback)
	private streamingAudioDecoder: StreamingAudioDecoderService | null = null;
	private audioStreamSessions: Map<string, {
		projectData: ProjectData | null;
		startTime: number;
		duration: number;
		isActive: boolean;
	}> = new Map();

	constructor(
		private readonly webviewPanel: vscode.WebviewPanel,
		documentUri?: vscode.Uri,
		maxConcurrency = MAX_CONCURRENT_REQUESTS
	) {
		this.ffmpegService = new FFmpegService();
		// Minimal cache: only 10 items, 10 seconds TTL
		// Video frames should NOT be cached heavily - they are large and change frequently
		// The Webview side has its own frame caching
		this.cache = new LRUCache(10, 10 * 1000);
		this.maxConcurrency = maxConcurrency;

		// Get the directory containing the document (.jvi file) for resolving relative paths
		this.documentDir = documentUri ? path.dirname(documentUri.fsPath) : undefined;

		// Initialize Rust service asynchronously (non-blocking)
		this.rustServiceInitPromise = this.initRustService();
	}

	/**
	 * Initialize Rust native addon service
	 * Non-blocking - falls back to FFmpeg if unavailable
	 */
	private async initRustService(): Promise<void> {
		try {
			this.rustService = await RustMediaProcessorService.tryCreate();
			if (!this.rustService) {
				console.log('[MediaProcessor] Rust backend unavailable, using FFmpeg fallback');
			}
		} catch (error) {
			console.warn(
				'[MediaProcessor] Failed to initialize Rust backend:',
				error instanceof Error ? error.message : error
			);
			this.rustService = null;
		}
	}

	/**
	 * Check if Rust backend is available
	 */
	isRustBackendAvailable(): boolean {
		return this.rustService?.isAvailable() ?? false;
	}

	/**
	 * Get backend info for diagnostics
	 */
	getBackendInfo(): { backend: 'rust' | 'ffmpeg'; gpuInfo?: unknown } {
		if (this.rustService?.isAvailable()) {
			return {
				backend: 'rust',
				gpuInfo: this.rustService.getGpuInfo(),
			};
		}
		return { backend: 'ffmpeg' };
	}

	/**
	 * Handle incoming message from Webview
	 * @returns true if message was handled, false otherwise
	 */
	async handleMessage(message: unknown): Promise<boolean> {
		// Skip if service is disposed
		if (this.disposed) {
			return false;
		}

		// Type guard: check if message is a MediaRequest
		if (!this.isMediaRequest(message)) {
			// Check for compatible mode requests (handled separately)
			if (this.isCompatibleModeRequest(message)) {
				await this.handleCompatibleModeRequest(message as CompatibleModeRequest);
				return true;
			}
			// Check for frame server playback control requests
			if (this.isFrameServerPlaybackRequest(message)) {
				await this.handleFrameServerPlaybackRequest(message);
				return true;
			}
			// Check for audio stream requests (compat mode real-time audio)
			if (this.isAudioStreamRequest(message)) {
				await this.handleAudioStreamRequest(message as AudioStreamWebviewMessage);
				return true;
			}
			// Check for performance stats requests
			if (this.isPerformanceStatsRequest(message)) {
				await this.handlePerformanceStatsRequest(message);
				return true;
			}
			// Check for media bitrate requests
			if (this.isMediaBitrateRequest(message)) {
				await this.handleMediaBitrateRequest(message);
				return true;
			}
			return false;
		}

		const request = message as MediaRequest;

		// Add to queue
		const promise = new Promise<MediaResponse>((resolve, reject) => {
			this.requestQueue.push({ request, resolve, reject });
		});

		// Start processing queue
		this.processQueue();

		// Wait for result and send response
		try {
			const response = await promise;
			this.sendResponse(response);
		} catch (error) {
			const errorResponse: MediaResponse = {
				requestId: request.requestId,
				type: `media:response:${request.type.replace('media:', '')}` as never,
				error: error instanceof Error ? error.message : 'Unknown error',
			};
			this.sendResponse(errorResponse);
		}

		return true;
	}

	/**
	 * Process request queue with concurrency control
	 */
	private async processQueue(): Promise<void> {
		while (this.requestQueue.length > 0 && this.activeRequests < this.maxConcurrency) {
			const item = this.requestQueue.shift();
			if (!item) continue;

			this.activeRequests++;

			// Process request asynchronously
			this.processRequest(item)
				.then(response => item.resolve(response))
				.catch(error => item.reject(error))
				.finally(() => {
					this.activeRequests--;
					this.processQueue(); // Process next request
				});
		}
	}

	/**
	 * Process a single media request
	 */
	private async processRequest(item: RequestQueueItem): Promise<MediaResponse> {
		const { request } = item;

		// Only cache media info (small), NOT video frames or audio segments (large)
		const shouldCache = request.type === 'media:probeMediaInfo';

		if (shouldCache) {
			const cacheKey = this.getCacheKey(request);
			const cached = this.cache.get(cacheKey);

			if (cached) {
				return this.buildResponse(request, cached);
			}
		}

		// Process request based on type
		let result: unknown;

		switch (request.type) {
			case 'media:getVideoFrame':
				result = await this.processVideoFrame(request as GetVideoFrameRequest);
				break;

			case 'media:getVideoFrameRange':
				result = await this.processVideoFrameRange(request as GetVideoFrameRangeRequest);
				break;

			case 'media:decodeAudioSegment':
				result = await this.processAudioSegment(request as DecodeAudioSegmentRequest);
				break;

			case 'media:probeMediaInfo':
				result = await this.processMediaInfo(request as ProbeMediaInfoRequest);
				break;

			case 'media:extractSubtitles':
				result = await this.processExtractSubtitles(request as ExtractSubtitlesRequest);
				break;

			default:
				throw new Error(`Unknown request type: ${(request as { type: string }).type}`);
		}

		// Only cache media info
		if (shouldCache) {
			const cacheKey = this.getCacheKey(request);
			this.cache.set(cacheKey, result);
		}

		return this.buildResponse(request, result);
	}

	/**
	 * Process video frame extraction
	 * Returns base64-encoded JPEG for reliable webview transfer
	 *
	 * Uses GPU decodeFrame + encodeJpeg for hardware-accelerated extraction
	 */
	private async processVideoFrame(request: GetVideoFrameRequest): Promise<unknown> {
		const { videoPath, timeInSeconds, quality } = request.payload;
		const absolutePath = this.resolveMediaPath(videoPath);

		// Use GPU decodeFrame + encodeJpeg
		if (!this.rustService?.isAvailable()) {
			throw new Error('GPU decoder not available');
		}

		// Decode frame to RGBA using GPU
		const frame = this.rustService.decodeFrame(absolutePath, timeInSeconds, 'rgba');
		if (!frame) {
			throw new Error(`Failed to decode frame at ${timeInSeconds}s`);
		}

		// Convert quality from 0-100 scale to 2-31 scale (ffmpeg qscale)
		const ffmpegQuality = quality ? Math.round(2 + (100 - quality) * 29 / 100) : 3;

		// Encode RGBA to JPEG
		const jpegBuffer = this.rustService.encodeJpeg(frame, ffmpegQuality);
		if (!jpegBuffer) {
			throw new Error('JPEG encoding failed');
		}

		// Convert to base64 for reliable webview transfer
		const base64 = Buffer.from(jpegBuffer).toString('base64');
		return {
			imageDataUrl: `data:image/jpeg;base64,${base64}`,
		};
	}

	/**
	 * Process batch video frame extraction
	 * Uses GPU decodeFrameRange + encodeJpeg for hardware-accelerated extraction
	 */
	private async processVideoFrameRange(request: GetVideoFrameRangeRequest): Promise<unknown> {
		const { videoPath, startTime, duration, fps, quality, maxFrames } = request.payload;
		const absolutePath = this.resolveMediaPath(videoPath);

		// Use GPU decodeFrameRange + encodeJpeg
		if (!this.rustService?.isAvailable()) {
			throw new Error('GPU decoder not available');
		}

		// Convert quality from 0-100 scale to 2-31 scale (ffmpeg qscale)
		const ffmpegQuality = quality ? Math.round(2 + (100 - quality) * 29 / 100) : 3;

		// Calculate actual duration based on maxFrames
		const actualDuration = maxFrames ? Math.min(duration, maxFrames / fps) : duration;
		const endTime = startTime + actualDuration;

		// Decode frames using GPU
		const decodedFrames = this.rustService.decodeFrameRange(absolutePath, startTime, endTime, fps);
		if (!decodedFrames || decodedFrames.length === 0) {
			throw new Error('Failed to decode frames');
		}

		// Encode each frame to JPEG and convert to base64
		const frames = decodedFrames.map(frame => {
			const jpegBuffer = this.rustService!.encodeJpeg(frame, ffmpegQuality);
			if (!jpegBuffer) {
				throw new Error(`JPEG encoding failed for frame at ${frame.timestamp}s`);
			}
			return {
				time: frame.timestamp,
				imageDataUrl: `data:image/jpeg;base64,${jpegBuffer.toString('base64')}`,
			};
		});

		return {
			frames,
		};
	}

	/**
	 * Process audio segment decoding
	 * NOTE: Audio decoding is not yet implemented in GPU path
	 */
	private async processAudioSegment(_request: DecodeAudioSegmentRequest): Promise<unknown> {
		// TODO: Implement audio decoding in Rust N-API
		throw new Error('Audio decoding not yet implemented');
	}

	/**
	 * Process media info probing
	 */
	private async processMediaInfo(request: ProbeMediaInfoRequest): Promise<unknown> {
		const { videoPath } = request.payload;
		const absolutePath = this.resolveMediaPath(videoPath);
		return this.ffmpegService.probeMediaInfo(absolutePath);
	}

	/**
	 * Process subtitle extraction
	 */
	private async processExtractSubtitles(request: ExtractSubtitlesRequest): Promise<unknown> {
		const { videoPath } = request.payload;
		const absolutePath = this.resolveMediaPath(videoPath);
		const tracks = await this.ffmpegService.extractAllSubtitles(absolutePath);
		return { tracks };
	}

	/**
	 * Process compatible mode single frame request
	 * Used for preview in compatible mode (Extension-side decoding)
	 * Uses GPU decodeFrame + encodeJpeg for hardware-accelerated extraction
	 */
	private async processCompatibleGetVideoFrame(
		request: CompatibleGetVideoFrameRequest
	): Promise<CompatibleGetVideoFrameResponse> {
		const { videoPath, timeInSeconds, width, height } = request.payload;
		const absolutePath = this.resolveMediaPath(videoPath);
		const perfStart = performance.now();

		try {
			// Use GPU decodeFrame + encodeJpeg
			if (!this.rustService?.isAvailable()) {
				throw new Error('GPU decoder not available');
			}

			// Decode frame to RGBA using GPU
			const frame = this.rustService.decodeFrame(absolutePath, timeInSeconds, 'rgba');
			if (!frame) {
				throw new Error(`Failed to decode frame at ${timeInSeconds}s`);
			}

			// Encode RGBA to JPEG (quality 3 = high quality)
			const jpegBuffer = this.rustService.encodeJpeg(frame, 3);
			if (!jpegBuffer) {
				throw new Error('JPEG encoding failed');
			}

			const totalTime = performance.now() - perfStart;
			console.log(
				`[Perf:Compatible] getFrame @ ${timeInSeconds.toFixed(3)}s: ${totalTime.toFixed(1)}ms (GPU)`
			);

			return {
				requestId: request.requestId,
				type: 'media:response:compatibleGetVideoFrame',
				payload: {
					imageData: new Uint8Array(jpegBuffer),
					width: width || frame.width,
					height: height || frame.height,
				},
			};
		} catch (error) {
			console.error('[MediaProcessor] processCompatibleGetVideoFrame error:', error);
			return {
				requestId: request.requestId,
				type: 'media:response:compatibleGetVideoFrame',
				error: error instanceof Error ? error.message : 'Unknown error',
			};
		}
	}

	/**
	 * Process render composite frame request (Compatible mode)
	 * Uses GPU compositing via RustMediaProcessorService
	 * No fallback - GPU compositor is required for compatible mode
	 */
	private async processRenderCompositeFrame(
		request: RenderCompositeFrameRequest
	): Promise<RenderCompositeFrameResponse> {
		const { layers, width, height, backgroundColor } = request.payload;

		try {
			// Empty layers: return empty frame
			if (layers.length === 0) {
				return {
					requestId: request.requestId,
					type: 'media:response:renderCompositeFrame',
					payload: {
						imageDataUrl: await this.createEmptyFrame(width, height, backgroundColor),
						width,
						height,
					},
				};
			}

			// GPU compositing is required for compatible mode
			if (!this.rustService?.isCompositorAvailable()) {
				return {
					requestId: request.requestId,
					type: 'media:response:renderCompositeFrame',
					error: 'GPU compositor not available. Compatible mode requires wgpu support.',
				};
			}

			return await this.processRenderCompositeFrameGPU(request);
		} catch (error) {
			return {
				requestId: request.requestId,
				type: 'media:response:renderCompositeFrame',
				error: error instanceof Error ? error.message : 'Unknown error',
			};
		}
	}

	/**
	 * GPU-accelerated composite frame rendering
	 * Decodes all layers and composites them using wgpu
	 *
	 * Uses RustMediaProcessorService for GPU decoding and compositing
	 */
	private async processRenderCompositeFrameGPU(
		request: RenderCompositeFrameRequest
	): Promise<RenderCompositeFrameResponse> {
		const { layers, width, height, backgroundColor } = request.payload;
		const perfStart = performance.now();

		if (!this.rustService?.isCompositorAvailable()) {
			throw new Error('GPU compositor not available');
		}

		// 1. Decode frames for all layers in parallel using GPU
		const decodeStart = performance.now();
		const compositeLayers = await Promise.all(
			layers.map(async (layer, index) => {
				const absolutePath = this.resolveMediaPath(layer.source);
				const layerStart = performance.now();

				// Decode frame to RGBA using GPU
				const frame = this.rustService!.decodeFrame(absolutePath, layer.sourceTime, 'rgba');
				if (!frame) {
					throw new Error(`Failed to decode frame at ${layer.sourceTime}s`);
				}

				const layerTime = performance.now() - layerStart;
				console.log(
					`[Perf:Composite] Layer${index} @ ${layer.sourceTime.toFixed(3)}s: ` +
					`total=${layerTime.toFixed(0)}ms (GPU)`
				);

				return {
					data: frame.data as Buffer,
					width: frame.width,
					height: frame.height,
					transform: layer.transform
						? {
								x: layer.transform.x ?? 0,
								y: layer.transform.y ?? 0,
								scaleX: layer.transform.scaleX ?? 1,
								scaleY: layer.transform.scaleY ?? 1,
								rotation: layer.transform.rotation ?? 0,
								anchorX: layer.transform.anchorX ?? 0.5,
								anchorY: layer.transform.anchorY ?? 0.5,
							}
						: undefined,
					opacity: layer.opacity ?? 1,
					blendMode: 'normal',
					zIndex: layer.zIndex ?? 0,
				};
			})
		);
		const decodeTime = performance.now() - decodeStart;

		// 2. GPU composite all layers
		const compositeStart = performance.now();
		const bgColor: [number, number, number, number] = backgroundColor
			? [
					backgroundColor[0] / 255,
					backgroundColor[1] / 255,
					backgroundColor[2] / 255,
					backgroundColor[3] / 255,
				]
			: [0, 0, 0, 1];

		const result = this.rustService.composite(compositeLayers, width, height, bgColor);
		const compositeTime = performance.now() - compositeStart;

		console.log(
			`[Perf:Composite] GPU composite: ${result.layerCount} layers in ${result.timeMs.toFixed(2)}ms`
		);

		// 3. RGBA → JPEG encoding (reduces transfer size)
		const encodeStart = performance.now();
		const jpegBuffer = await this.rustService.frameToJpeg(
			{
				data: result.data,
				width: result.width,
				height: result.height,
				format: 'rgba',
				timestamp: 0,
				isKeyframe: true,
			},
			85
		);
		const encodeTime = performance.now() - encodeStart;

		if (!jpegBuffer) {
			throw new Error('JPEG encoding failed');
		}

		const totalTime = performance.now() - perfStart;
		console.log(
			`[Perf:Composite] TOTAL: ${totalTime.toFixed(0)}ms ` +
			`(decode=${decodeTime.toFixed(0)}ms, composite=${compositeTime.toFixed(0)}ms, ` +
			`encode=${encodeTime.toFixed(0)}ms, layers=${layers.length}, output=${result.width}x${result.height})`
		);

		// 4. Return binary data (more efficient than base64)
		return {
			requestId: request.requestId,
			type: 'media:response:renderCompositeFrame',
			payload: {
				imageData: new Uint8Array(jpegBuffer),
				width: result.width,
				height: result.height,
			},
		};
	}

	/**
	 * Create an empty frame with background color
	 * Note: width/height are reserved for future use when proper image generation is implemented
	 */
	private async createEmptyFrame(
		_width: number,
		_height: number,
		backgroundColor?: [number, number, number, number]
	): Promise<string> {
		// Create a simple 1x1 pixel JPEG for empty frames
		// In a real implementation, we'd create a proper sized frame using sharp or canvas
		const [r, g, b] = backgroundColor ?? [0, 0, 0, 255];

		// Minimal JPEG header for a solid color (simplified)
		// For production, use sharp or canvas to create proper image
		const emptyJpeg = Buffer.from([
			0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
			0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
			0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
			0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
			0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20,
			0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29,
			0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32,
			0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
			0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00,
			0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
			0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
			0x09, 0x0a, 0x0b, 0xff, 0xc4, 0x00, 0xb5, 0x10, 0x00, 0x02, 0x01, 0x03,
			0x03, 0x02, 0x04, 0x03, 0x05, 0x05, 0x04, 0x04, 0x00, 0x00, 0x01, 0x7d,
			0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06,
			0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08,
			0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72,
			0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28,
			0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45,
			0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
			0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75,
			0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
			0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3,
			0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6,
			0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9,
			0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2,
			0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4,
			0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01,
			0x00, 0x00, 0x3f, 0x00, (r + g + b) / 3, 0xff, 0xd9,
		]);

		return `data:image/jpeg;base64,${emptyJpeg.toString('base64')}`;
	}

	/**
	 * Resolve media path to absolute path
	 * Handles relative paths by prepending document directory (.jvi file location)
	 */
	private resolveMediaPath(mediaPath: string): string {
		// If already absolute, return as-is
		if (path.isAbsolute(mediaPath)) {
			return mediaPath;
		}

		// If document directory is available, resolve relative path
		if (this.documentDir) {
			return path.resolve(this.documentDir, mediaPath);
		}

		// Fallback: try workspace root
		const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		if (workspaceRoot) {
			return path.join(workspaceRoot, mediaPath);
		}

		// Last resort: return original path (will likely fail)
		return mediaPath;
	}

	/**
	 * Build response object from request and result
	 */
	private buildResponse(request: MediaRequest, result: unknown): MediaResponse {
		const responseType = `media:response:${request.type.replace('media:', '')}`;

		return {
			requestId: request.requestId,
			type: responseType as never,
			payload: result as never,
		};
	}

	/**
	 * Generate cache key from request
	 */
	private getCacheKey(request: MediaRequest): string {
		return `${request.type}:${JSON.stringify(request.payload)}`;
	}

	/**
	 * Send response to Webview
	 * Safely handles disposed webview to prevent errors when editor is closed
	 */
	private sendResponse(response: MediaResponse): void {
		// Check if service is disposed
		if (this.disposed) {
			return;
		}

		// Check if webview is still valid
		try {
			// Accessing webview.postMessage will throw if webview is disposed
			this.webviewPanel.webview.postMessage(response);
		} catch {
			// Webview was disposed, silently ignore
		}
	}

	/**
	 * Type guard for MediaRequest
	 */
	private isMediaRequest(message: unknown): message is MediaRequest {
		if (typeof message !== 'object' || message === null) {
			return false;
		}

		const msg = message as Record<string, unknown>;

		// Check for standard media requests (not compatible mode or special requests)
		const isStandardMedia =
			typeof msg.type === 'string' &&
			msg.type.startsWith('media:') &&
			!msg.type.includes('compatible') &&
			!msg.type.includes('renderComposite') &&
			!msg.type.includes('pullMode') &&
			!msg.type.includes('frameServer') &&
			!msg.type.includes('audioStream') &&
			msg.type !== 'media:getPerformanceStats' &&
			msg.type !== 'media:getMediaBitrate' &&
			typeof msg.requestId === 'string' &&
			typeof msg.timestamp === 'number' &&
			typeof msg.payload === 'object';

		return isStandardMedia;
	}

	/**
	 * Type guard for CompatibleModeRequest
	 */
	private isCompatibleModeRequest(message: unknown): message is CompatibleModeRequest {
		if (typeof message !== 'object' || message === null) {
			return false;
		}

		const msg = message as Record<string, unknown>;

		return (
			typeof msg.type === 'string' &&
			(msg.type === 'media:compatibleGetVideoFrame' || msg.type === 'media:renderCompositeFrame') &&
			typeof msg.requestId === 'string' &&
			typeof msg.timestamp === 'number' &&
			typeof msg.payload === 'object'
		);
	}

	/**
	 * Handle compatible mode requests separately
	 * These have different response types from standard MediaResponse
	 */
	private async handleCompatibleModeRequest(request: CompatibleModeRequest): Promise<void> {
		let response: CompatibleModeResponse;

		try {
			switch (request.type) {
				case 'media:compatibleGetVideoFrame':
					response = await this.processCompatibleGetVideoFrame(request);
					break;
				case 'media:renderCompositeFrame':
					response = await this.processRenderCompositeFrame(request);
					break;
				default:
					throw new Error(`Unknown compatible mode request type: ${(request as { type: string }).type}`);
			}
		} catch (error) {
			// Build error response based on request type
			if (request.type === 'media:compatibleGetVideoFrame') {
				response = {
					requestId: request.requestId,
					type: 'media:response:compatibleGetVideoFrame',
					error: error instanceof Error ? error.message : 'Unknown error',
				};
			} else {
				response = {
					requestId: request.requestId,
					type: 'media:response:renderCompositeFrame',
					error: error instanceof Error ? error.message : 'Unknown error',
				};
			}
		}

		this.sendCompatibleModeResponse(response);
	}

	/**
	 * Send compatible mode response to Webview
	 */
	private sendCompatibleModeResponse(response: CompatibleModeResponse): void {
		if (this.disposed) {
			return;
		}

		try {
			this.webviewPanel.webview.postMessage(response);
		} catch {
			// Webview was disposed, silently ignore
		}
	}

	// =========================================================================
	// Frame Decoding for Playback
	// =========================================================================

	/**
	 * Decode a frame using GPU decoding (RustMediaProcessorService)
	 * Uses hardware-accelerated decoding and JPEG encoding via decodeFrame + encodeJpeg
	 */
	private async decodeFrameForPlayback(
		videoPath: string,
		timeInSeconds: number,
		width?: number,
		height?: number
	): Promise<{ imageData: Uint8Array; width: number; height: number }> {
		// Use GPU decodeFrame + encodeJpeg
		if (!this.rustService?.isAvailable()) {
			throw new Error('GPU decoder not available');
		}

		// Decode frame to RGBA using GPU
		const frame = this.rustService.decodeFrame(videoPath, timeInSeconds, 'rgba');
		if (!frame) {
			throw new Error(`Failed to decode frame at ${timeInSeconds}s`);
		}

		// Encode RGBA to JPEG (quality 3 = high quality)
		const jpegBuffer = this.rustService.encodeJpeg(frame, 3);
		if (!jpegBuffer) {
			throw new Error('JPEG encoding failed');
		}

		return {
			imageData: new Uint8Array(jpegBuffer),
			width: width || frame.width,
			height: height || frame.height,
		};
	}

	// =========================================================================
	// Frame Server Playback Support
	// =========================================================================

	/**
	 * Type guard for FrameServerPlaybackRequest
	 */
	private isFrameServerPlaybackRequest(message: unknown): boolean {
		if (typeof message !== 'object' || message === null) {
			return false;
		}

		const msg = message as Record<string, unknown>;

		return (
			typeof msg.type === 'string' &&
			(msg.type === 'media:frameServer:playback:start' ||
			 msg.type === 'media:frameServer:playback:stop' ||
			 msg.type === 'media:frameServer:projectPlayback:start' ||
			 msg.type === 'media:frameServer:projectPlayback:stop' ||
			 msg.type === 'media:frameServer:projectPlayback:seek')
		);
	}

	/**
	 * Handle frame server playback control request
	 */
	private async handleFrameServerPlaybackRequest(message: unknown): Promise<void> {
		const msg = message as { type: string; payload: unknown };

		if (msg.type === 'media:frameServer:playback:start') {
			const payload = msg.payload as { videoPath: string; startTime?: number; fps?: number; speed?: number };
			const { videoPath, startTime = 0, fps = 30, speed = 1.0 } = payload;
			await this.startPlaybackPush(videoPath, startTime, fps, speed);
		} else if (msg.type === 'media:frameServer:playback:stop') {
			this.stopPlaybackPush();
		} else if (msg.type === 'media:frameServer:projectPlayback:start') {
			// Project playback with multi-track compositing
			const payload = msg.payload as {
				projectData: {
					tracks: Array<{
						elements: Array<{
							id: string;
							type: string;
							src?: string;
							startTime: number;
							duration: number;
							trimStart: number;
							transform?: {
								x: number;
								y: number;
								scaleX: number;
								scaleY: number;
								rotation: number;
							};
							opacity?: number;
						}>;
					}>;
					resolution: { width: number; height: number };
					fps: number;
					duration: number;
				};
				startTime: number;
				speed?: number;
			};
			await this.startProjectPlaybackPush(payload.projectData, payload.startTime, payload.speed ?? 1.0);
		} else if (msg.type === 'media:frameServer:projectPlayback:stop') {
			this.stopPlaybackPush();
		} else if (msg.type === 'media:frameServer:projectPlayback:seek') {
			// Seek to specific time and push a single H264 frame
			const payload = msg.payload as {
				projectData: {
					tracks: Array<{
						elements: Array<{
							id: string;
							type: string;
							src?: string;
							startTime: number;
							duration: number;
							trimStart: number;
							transform?: {
								x: number;
								y: number;
								scaleX: number;
								scaleY: number;
								rotation: number;
							};
							opacity?: number;
						}>;
					}>;
					resolution: { width: number; height: number };
					fps: number;
					duration: number;
				};
				seekTime: number;
			};
			await this.seekAndPushH264Frame(payload.projectData, payload.seekTime);
		}
	}

	/**
	 * Set frame server service for WebSocket-based frame delivery
	 */
	setFrameServerService(service: {
		pushFrame: (data: Buffer, timestamp: number, width: number, height: number) => void;
		pushH264Packet?: (data: Buffer, pts: number, dts: number, isKeyframe: boolean) => void;
	} | null): void {
		this.frameServerService = service;
	}

	// ===========================================================================
	// Playback Push Mode (Continuous Frame Pushing)
	// ===========================================================================

	/**
	 * Start continuous frame pushing for playback using H264 encoding
	 * Pushes H264 packets at the specified FPS without waiting for requests
	 */
	async startPlaybackPush(videoPath: string, startTime: number, fps: number, speed = 1.0): Promise<void> {
		// Stop any existing playback
		this.stopPlaybackPush();

		if (!this.frameServerService) {
			console.warn('[MediaProcessor] Frame server not available for playback push');
			return;
		}

		if (!this.rustService?.isAvailable()) {
			console.warn('[MediaProcessor] Rust service not available for playback push');
			return;
		}

		const resolvedPath = this.resolveMediaPath(videoPath);
		const frameInterval = 1000 / fps / speed; // ms between frames

		// Get video info to determine encoder resolution
		const mediaInfo = this.rustService.probeMediaInfo(resolvedPath);
		const width = mediaInfo?.width ?? 1920;
		const height = mediaInfo?.height ?? 1080;

		// Initialize H264 encoder if needed or if resolution changed
		if (!this.h264EncoderSession ||
			this.h264EncoderConfig?.width !== width ||
			this.h264EncoderConfig?.height !== height ||
			this.h264EncoderConfig?.fps !== fps) {
			this.initH264Encoder(width, height, fps);
		}

		this.playbackPushState = {
			videoPath: resolvedPath,
			currentTime: startTime,
			fps,
			speed,
			intervalId: null,
			isRunning: true,
		};

		console.log(`[MediaProcessor] Starting H264 playback push: ${videoPath} @ ${fps}fps, speed=${speed}, hw=${this.h264EncoderSession?.isHwActive()}`);

		// Use setInterval for consistent frame rate
		const pushNextFrame = async () => {
			if (!this.playbackPushState?.isRunning || !this.frameServerService || !this.rustService) {
				return;
			}

			try {
				// Decode frame to RGBA then convert to NV12 for H264 encoding
				// Note: decodeFrameToNV12 returns RGBA despite its name, so we use decodeFrame + rgbaToNv12
				const rgbaFrame = this.rustService.decodeFrame(
					this.playbackPushState.videoPath,
					this.playbackPushState.currentTime,
					'rgba'
				);

				if (!rgbaFrame) {
					console.warn(`[MediaProcessor] Failed to decode frame at ${this.playbackPushState.currentTime}s`);
					this.playbackPushState.currentTime += (1 / fps) * speed;
					return;
				}

				// Convert RGBA to NV12 for H264 encoding
				const nv12Frame = this.rustService.rgbaToNv12(rgbaFrame);
				if (!nv12Frame) {
					console.warn(`[MediaProcessor] Failed to convert RGBA to NV12 at ${this.playbackPushState.currentTime}s`);
					this.playbackPushState.currentTime += (1 / fps) * speed;
					return;
				}

				// Encode NV12 to H264 and push via WebSocket
				if (this.h264EncoderSession && this.frameServerService.pushH264Packet) {
					const pts = Math.round(this.playbackPushState.currentTime * 1_000_000);
					const packets = this.h264EncoderSession.encodeFrame(
						{
							data: nv12Frame.data as Buffer,
							width: nv12Frame.width,
							height: nv12Frame.height,
							format: 'nv12',
							timestamp: this.playbackPushState.currentTime,
							isKeyframe: false,
						},
						pts
					);

					for (const packet of packets) {
						this.frameServerService.pushH264Packet(
							packet.data,
							packet.pts,
							packet.dts,
							packet.isKeyframe
						);
					}
				}

				// Advance time
				this.playbackPushState.currentTime += (1 / fps) * speed;
			} catch (error) {
				console.error('[MediaProcessor] Playback push frame error:', error);
			}
		};

		// Start pushing frames
		this.playbackPushState.intervalId = setInterval(pushNextFrame, frameInterval);

		// Push first frame immediately
		await pushNextFrame();
	}

	/**
	 * Initialize H264 encoder for playback preview
	 */
	private initH264Encoder(width: number, height: number, fps: number): void {
		// Close existing encoder
		if (this.h264EncoderSession) {
			try {
				this.h264EncoderSession.close();
			} catch {
				// Ignore close errors
			}
			this.h264EncoderSession = null;
		}

		if (!this.rustService) {
			return;
		}

		// Create H264 encoder using Rust service
		this.h264EncoderSession = this.rustService.createPreviewEncoder(
			width,
			height,
			fps,
			2_000_000 // 2 Mbps for preview
		);

		this.h264EncoderConfig = { width, height, fps };

		if (this.h264EncoderSession) {
			console.log(
				`[MediaProcessor] H264 encoder initialized: ${width}x${height}@${fps}fps, hw=${this.h264EncoderSession.isHwActive()}`
			);
		} else {
			console.warn('[MediaProcessor] Failed to create H264 encoder');
		}
	}

	/**
	 * Stop continuous frame pushing
	 */
	stopPlaybackPush(): void {
		if (this.playbackPushState) {
			if (this.playbackPushState.intervalId) {
				clearInterval(this.playbackPushState.intervalId);
			}

			// Flush encoder
			if (this.h264EncoderSession && this.frameServerService?.pushH264Packet) {
				try {
					const packets = this.h264EncoderSession.flush();
					for (const packet of packets) {
						this.frameServerService.pushH264Packet(
							packet.data,
							packet.pts,
							packet.dts,
							packet.isKeyframe
						);
					}
				} catch (error) {
					console.warn('[MediaProcessor] Encoder flush failed:', error);
				}
			}

			console.log(`[MediaProcessor] Stopped playback push at ${this.playbackPushState.currentTime.toFixed(3)}s`);
			this.playbackPushState = null;
		}
	}

	/**
	 * Check if playback push is active
	 */
	isPlaybackPushActive(): boolean {
		return this.playbackPushState?.isRunning ?? false;
	}

	/**
	 * Seek to specific time and push a single H264 frame (for scrubbing)
	 * This allows scrubbing to use H264 instead of JPEG
	 */
	async seekAndPushH264Frame(
		projectData: {
			tracks: Array<{
				elements: Array<{
					id: string;
					type: string;
					src?: string;
					startTime: number;
					duration: number;
					trimStart: number;
					transform?: {
						x: number;
						y: number;
						scaleX: number;
						scaleY: number;
						rotation: number;
					};
					opacity?: number;
				}>;
			}>;
			resolution: { width: number; height: number };
			fps: number;
			duration: number;
		},
		seekTime: number
	): Promise<void> {
		if (!this.frameServerService?.pushH264Packet) {
			console.warn('[MediaProcessor] H264 push not available for seek');
			return;
		}

		if (!this.rustService?.isAvailable()) {
			console.warn('[MediaProcessor] Rust service not available for seek');
			return;
		}

		const resolution = projectData.resolution;

		// Initialize H264 encoder if not already done
		if (!this.h264EncoderSession) {
			try {
				this.h264EncoderSession = this.rustService.createVideoEncoder({
					width: resolution.width,
					height: resolution.height,
					fps: projectData.fps,
					bitrate: 8_000_000, // 8 Mbps for preview
					codec: 'h264',
					hwAccel: 'auto',
				});
				console.log(`[MediaProcessor] H264 encoder initialized for seek: ${resolution.width}x${resolution.height}`);
			} catch (error) {
				console.error('[MediaProcessor] Failed to create H264 encoder for seek:', error);
				return;
			}
		}

		try {
			// Get active video layers at seek time
			const layers = this.getActiveVideoLayers(projectData, seekTime);

			if (layers.length === 0) {
				return;
			}

			// For single layer, decode directly to NV12 for H264 encoding
			if (layers.length === 1) {
				const layer = layers[0]!;
				const resolvedPath = this.resolveMediaPath(layer.source);

				// Decode to NV12 format
				const frame = this.rustService.decodeFrame(resolvedPath, layer.sourceTime, 'nv12');
				if (!frame) {
					console.warn(`[MediaProcessor] Failed to decode frame for seek at ${seekTime}s`);
					return;
				}

				// Encode to H264 (force keyframe for seek)
				const pts = Math.round(seekTime * 1_000_000);
				const packets = this.h264EncoderSession.encodeFrame(
					{
						data: frame.data as Buffer,
						width: frame.width,
						height: frame.height,
						format: 'nv12',
						timestamp: pts,
						isKeyframe: true, // Force keyframe for seek
					},
					pts
				);

				// Push H264 packets
				for (const packet of packets) {
					this.frameServerService.pushH264Packet(
						packet.data,
						packet.pts,
						packet.dts,
						packet.isKeyframe
					);
				}

				console.log(`[MediaProcessor] Seek H264 frame pushed at ${seekTime.toFixed(3)}s`);
			} else {
				// Multi-layer: use JPEG fallback for now (compositor returns RGBA)
				// TODO: Add NV12 output support to compositor
				console.warn('[MediaProcessor] Multi-layer seek not yet supported for H264, using JPEG fallback');
			}
		} catch (error) {
			console.error('[MediaProcessor] Seek H264 frame error:', error);
		}
	}

	/**
	 * Get active video layers at a specific time
	 */
	private getActiveVideoLayers(
		projectData: {
			tracks: Array<{
				elements: Array<{
					id: string;
					type: string;
					src?: string;
					startTime: number;
					duration: number;
					trimStart: number;
					transform?: {
						x: number;
						y: number;
						scaleX: number;
						scaleY: number;
						rotation: number;
					};
					opacity?: number;
				}>;
			}>;
		},
		time: number
	): Array<{
		source: string;
		sourceTime: number;
		transform: {
			x: number;
			y: number;
			scaleX: number;
			scaleY: number;
			rotation: number;
			anchorX: number;
			anchorY: number;
		};
		opacity: number;
	}> {
		const layers: Array<{
			source: string;
			sourceTime: number;
			transform: {
				x: number;
				y: number;
				scaleX: number;
				scaleY: number;
				rotation: number;
				anchorX: number;
				anchorY: number;
			};
			opacity: number;
		}> = [];

		for (const track of projectData.tracks) {
			for (const element of track.elements) {
				if (element.type !== 'video' || !element.src) continue;

				const elementEnd = element.startTime + element.duration;
				if (time >= element.startTime && time < elementEnd) {
					const sourceTime = element.trimStart + (time - element.startTime);
					const resolvedPath = this.resolveMediaPath(element.src);

					layers.push({
						source: resolvedPath,
						sourceTime,
						transform: {
							x: element.transform?.x ?? 0,
							y: element.transform?.y ?? 0,
							scaleX: element.transform?.scaleX ?? 1,
							scaleY: element.transform?.scaleY ?? 1,
							rotation: element.transform?.rotation ?? 0,
							anchorX: 0.5,
							anchorY: 0.5,
						},
						opacity: element.opacity ?? 1,
					});
				}
			}
		}

		return layers;
	}

	/**
	 * Start project playback push with multi-track compositing
	 * Uses Rust wgpu compositor for GPU-accelerated compositing
	 */
	async startProjectPlaybackPush(
		projectData: {
			tracks: Array<{
				elements: Array<{
					id: string;
					type: string;
					src?: string;
					startTime: number;
					duration: number;
					trimStart: number;
					transform?: {
						x: number;
						y: number;
						scaleX: number;
						scaleY: number;
						rotation: number;
					};
					opacity?: number;
				}>;
			}>;
			resolution: { width: number; height: number };
			fps: number;
			duration: number;
		},
		startTime: number,
		speed = 1.0
	): Promise<void> {
		// Stop any existing playback
		this.stopPlaybackPush();

		if (!this.frameServerService) {
			console.warn('[MediaProcessor] Frame server not available for project playback');
			return;
		}

		const { resolution, fps, duration } = projectData;
		const frameInterval = 1000 / fps / speed;

		this.playbackPushState = {
			videoPath: '', // Not used for project playback
			currentTime: startTime,
			fps,
			speed,
			intervalId: null,
			isRunning: true,
		};

		// Initialize H264 encoder for project playback
		this.initH264Encoder(resolution.width, resolution.height, fps);

		console.log(`[MediaProcessor] Starting project playback: ${resolution.width}x${resolution.height} @ ${fps}fps, H264=${!!this.h264EncoderSession}`);

		const pushNextFrame = async () => {
			if (!this.playbackPushState?.isRunning || !this.frameServerService) {
				return;
			}

			const currentTime = this.playbackPushState.currentTime;

			// Stop at end of project
			if (currentTime >= duration) {
				this.stopPlaybackPush();
				return;
			}

			try {
				// Collect active layers at current time
				const layers: Array<{
					source: string;
					sourceTime: number;
					transform: {
						x: number;
						y: number;
						scaleX: number;
						scaleY: number;
						rotation: number;
						anchorX: number;
						anchorY: number;
					};
					opacity: number;
					zIndex: number;
				}> = [];

				for (let trackIndex = 0; trackIndex < projectData.tracks.length; trackIndex++) {
					const track = projectData.tracks[trackIndex];
					if (!track?.elements) continue;

					for (const element of track.elements) {
						if (element.type !== 'media' || !element.src) continue;

						// Check if element is active at current time
						const elementEnd = element.startTime + element.duration;
						if (currentTime < element.startTime || currentTime >= elementEnd) {
							continue;
						}

						// Calculate source time
						const localTime = currentTime - element.startTime;
						const sourceTime = element.trimStart + localTime;

						layers.push({
							source: this.resolveMediaPath(element.src),
							sourceTime,
							transform: {
								x: element.transform?.x ?? 0.5,
								y: element.transform?.y ?? 0.5,
								scaleX: element.transform?.scaleX ?? 1,
								scaleY: element.transform?.scaleY ?? 1,
								rotation: element.transform?.rotation ?? 0,
								anchorX: 0.5,
								anchorY: 0.5,
							},
							opacity: element.opacity ?? 1,
							zIndex: trackIndex,
						});
					}
				}

				let frameData: { imageData: Uint8Array; width: number; height: number };

				if (layers.length === 0) {
					// No active layers, push black frame (encode RGBA to JPEG)
					// eslint-disable-next-line @typescript-eslint/no-require-imports
					const sharp = require('sharp');
					const blackRgba = Buffer.alloc(resolution.width * resolution.height * 4, 0);
					// Set alpha to 255 for each pixel
					for (let i = 3; i < blackRgba.length; i += 4) {
						blackRgba[i] = 255;
					}
					const jpegBuffer = await sharp(blackRgba, {
						raw: {
							width: resolution.width,
							height: resolution.height,
							channels: 4,
						},
					})
						.jpeg({ quality: 85 })
						.toBuffer();
					frameData = { imageData: new Uint8Array(jpegBuffer), width: resolution.width, height: resolution.height };
				} else if (layers.length === 1) {
					// Single layer, use simple decode (already returns JPEG)
					const layer = layers[0]!;
					frameData = await this.decodeFrameForPlayback(layer.source, layer.sourceTime);
				} else if (this.rustService?.isCompositorAvailable()) {
					// Multiple layers, use GPU compositor (returns JPEG)
					frameData = await this.renderCompositeFrameForPlayback(
						layers,
						resolution.width,
						resolution.height
					);
				} else {
					// Fallback: just use first layer (already returns JPEG)
					const layer = layers[0]!;
					frameData = await this.decodeFrameForPlayback(layer.source, layer.sourceTime);
				}

				// Push frame to frame server using H264 encoding if available
				if (this.h264EncoderSession && this.frameServerService.pushH264Packet && this.rustService) {
					// For H264, we need NV12 format. Convert RGBA to NV12.
					let nv12Data: { data: Buffer; width: number; height: number } | null = null;

					if (layers.length === 1) {
						// Single layer: decode to RGBA then convert to NV12
						const layer = layers[0]!;
						const rgbaFrame = this.rustService.decodeFrame(layer.source, layer.sourceTime, 'rgba');
						if (rgbaFrame) {
							// Convert RGBA to NV12 using GPU
							const nv12Frame = this.rustService.rgbaToNv12(rgbaFrame);
							if (nv12Frame) {
								nv12Data = {
									data: nv12Frame.data as Buffer,
									width: nv12Frame.width,
									height: nv12Frame.height,
								};
							}
						}
					}

					if (nv12Data) {
						// Encode NV12 to H264 and push via WebSocket
						const pts = Math.round(currentTime * 1_000_000);
						const packets = this.h264EncoderSession.encodeFrame(
							{
								data: nv12Data.data,
								width: nv12Data.width,
								height: nv12Data.height,
								format: 'nv12',
								timestamp: currentTime,
								isKeyframe: false,
							},
							pts
						);

						for (const packet of packets) {
							this.frameServerService.pushH264Packet(
								packet.data,
								packet.pts,
								packet.dts,
								packet.isKeyframe
							);
						}
					} else {
						// Fallback to JPEG for multi-layer or decode failure
						this.frameServerService.pushFrame(
							Buffer.from(frameData.imageData),
							Math.round(currentTime * 1_000_000),
							frameData.width,
							frameData.height
						);
					}
				} else {
					// No H264 encoder, use JPEG
					this.frameServerService.pushFrame(
						Buffer.from(frameData.imageData),
						Math.round(currentTime * 1_000_000),
						frameData.width,
						frameData.height
					);
				}

				// Advance time
				this.playbackPushState.currentTime += (1 / fps) * speed;
			} catch (error) {
				console.error('[MediaProcessor] Project playback frame error:', error);
			}
		};

		// Start pushing frames
		this.playbackPushState.intervalId = setInterval(pushNextFrame, frameInterval);

		// Push first frame immediately
		await pushNextFrame();
	}

	/**
	 * Render composite frame for playback using GPU compositor
	 * Uses GPU decoding via RustMediaProcessorService
	 */
	private async renderCompositeFrameForPlayback(
		layers: Array<{
			source: string;
			sourceTime: number;
			transform: {
				x: number;
				y: number;
				scaleX: number;
				scaleY: number;
				rotation: number;
				anchorX: number;
				anchorY: number;
			};
			opacity: number;
			zIndex: number;
		}>,
		width: number,
		height: number
	): Promise<{ imageData: Uint8Array; width: number; height: number }> {
		// Decode all layers in parallel using GPU
		const decodedLayers = await Promise.all(
			layers.map(async (layer) => {
				// Decode frame to RGBA using GPU
				const frame = this.rustService!.decodeFrame(layer.source, layer.sourceTime, 'rgba');
				if (!frame) {
					throw new Error(`Failed to decode frame at ${layer.sourceTime}s`);
				}

				return {
					...layer,
					frameData: frame.data as Buffer,
					frameWidth: frame.width,
					frameHeight: frame.height,
				};
			})
		);

		// Use Rust GPU compositor
		const result = this.rustService!.composite(
			decodedLayers.map((layer) => ({
				data: Buffer.from(layer.frameData),
				width: layer.frameWidth,
				height: layer.frameHeight,
				transform: layer.transform,
				opacity: layer.opacity,
				zIndex: layer.zIndex,
			})),
			width,
			height,
			[0, 0, 0, 1] // Black background (0-1 range)
		);

		// Encode RGBA to JPEG for Frame Server
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const sharp = require('sharp');
		const jpegBuffer = await sharp(Buffer.from(result.data), {
			raw: {
				width: result.width,
				height: result.height,
				channels: 4,
			},
		})
			.jpeg({ quality: 85 })
			.toBuffer();

		return {
			imageData: new Uint8Array(jpegBuffer),
			width: result.width,
			height: result.height,
		};
	}

	/**
	 * Get cache statistics
	 */
	getCacheStats(): CacheStats & { maxSize: number } {
		return this.cache.getStats();
	}

	/**
	 * Clear cache
	 */
	clearCache(): void {
		this.cache.clear();
	}

	/**
	 * Reset cache statistics
	 */
	resetCacheStats(): void {
		this.cache.resetStats();
	}

	// ===========================================================================
	// Audio Streaming Support (Compat Mode Real-time Audio)
	// ===========================================================================

	/**
	 * Type guard for AudioStreamWebviewMessage
	 */
	private isAudioStreamRequest(message: unknown): message is AudioStreamWebviewMessage {
		if (typeof message !== 'object' || message === null) {
			return false;
		}

		const msg = message as Record<string, unknown>;

		return (
			typeof msg.type === 'string' &&
			(msg.type === 'media:audioStream:start' ||
			 msg.type === 'media:audioStream:stop' ||
			 msg.type === 'media:audioStream:seek') &&
			typeof msg.requestId === 'string'
		);
	}

	/**
	 * Handle audio stream requests
	 */
	private async handleAudioStreamRequest(message: AudioStreamWebviewMessage): Promise<void> {
		switch (message.type) {
			case 'media:audioStream:start':
				await this.handleAudioStreamStart(message as AudioStreamStartRequest);
				break;
			case 'media:audioStream:stop':
				await this.handleAudioStreamStop(message as AudioStreamStopRequest);
				break;
			case 'media:audioStream:seek':
				await this.handleAudioStreamSeek(message as AudioStreamSeekRequest);
				break;
		}
	}

	/**
	 * Handle audio stream start request
	 */
	private async handleAudioStreamStart(request: AudioStreamStartRequest): Promise<void> {
		const { sessionId, startTime, duration, sampleRate = 48000, channels = 2 } = request.payload;

		try {
			// Initialize streaming audio decoder if needed
			if (!this.streamingAudioDecoder) {
				this.streamingAudioDecoder = getStreamingAudioDecoderService({
					sampleRate,
					channels,
				});
			}

			// Set up data callback to send audio data to Webview
			this.streamingAudioDecoder.setDataCallback((pcmData, timestamp) => {
				this.sendAudioStreamData(sessionId, pcmData, timestamp, sampleRate, channels);
			});

			// Create session
			this.audioStreamSessions.set(sessionId, {
				projectData: null, // Will be set when project playback starts
				startTime,
				duration,
				isActive: true,
			});

			console.log(`[MediaProcessor] Audio stream session started: ${sessionId}`);

			// Send started response
			this.sendAudioStreamResponse({
				type: 'media:audioStream:started',
				requestId: request.requestId,
				payload: {
					sessionId,
					websocketUrl: '', // Not using WebSocket for now, using postMessage
					sampleRate,
					channels,
				},
			});
		} catch (error) {
			console.error('[MediaProcessor] Failed to start audio stream:', error);
			this.sendAudioStreamResponse({
				type: 'media:audioStream:started',
				requestId: request.requestId,
				payload: {
					sessionId,
					websocketUrl: '',
					sampleRate,
					channels,
				},
				error: error instanceof Error ? error.message : 'Unknown error',
			});
		}
	}

	/**
	 * Handle audio stream stop request
	 */
	private async handleAudioStreamStop(request: AudioStreamStopRequest): Promise<void> {
		const { sessionId } = request.payload;

		const session = this.audioStreamSessions.get(sessionId);
		if (session) {
			session.isActive = false;
			this.audioStreamSessions.delete(sessionId);
		}

		// Stop the audio decoder
		if (this.streamingAudioDecoder) {
			this.streamingAudioDecoder.stop();
		}

		console.log(`[MediaProcessor] Audio stream session stopped: ${sessionId}`);

		this.sendAudioStreamResponse({
			type: 'media:audioStream:stopped',
			requestId: request.requestId,
			payload: { sessionId },
		});
	}

	/**
	 * Handle audio stream seek request
	 */
	private async handleAudioStreamSeek(request: AudioStreamSeekRequest): Promise<void> {
		const { sessionId, timeInSeconds } = request.payload;

		const session = this.audioStreamSessions.get(sessionId);
		if (!session || !session.isActive) {
			console.warn(`[MediaProcessor] Audio stream session not found: ${sessionId}`);
			return;
		}

		// Stop current playback and restart from new position
		if (this.streamingAudioDecoder) {
			this.streamingAudioDecoder.stop();

			// Restart from new position if we have project data
			if (session.projectData) {
				await this.streamingAudioDecoder.startPlayback(
					session.projectData,
					this.documentDir ?? '',
					timeInSeconds,
					session.duration - timeInSeconds
				);
			}
		}

		console.log(`[MediaProcessor] Audio stream seeked to ${timeInSeconds}s`);
	}

	/**
	 * Start audio playback for project (called when video playback starts)
	 */
	async startProjectAudioPlayback(
		projectData: ProjectData,
		startTime: number,
		duration: number
	): Promise<void> {
		// Initialize streaming audio decoder if needed
		if (!this.streamingAudioDecoder) {
			this.streamingAudioDecoder = getStreamingAudioDecoderService({
				sampleRate: 48000,
				channels: 2,
			});
		}

		// Find or create a session
		let sessionId = '';
		for (const [id, session] of this.audioStreamSessions) {
			if (session.isActive) {
				sessionId = id;
				session.projectData = projectData;
				break;
			}
		}

		if (!sessionId) {
			sessionId = `audio-${Date.now()}`;
			this.audioStreamSessions.set(sessionId, {
				projectData,
				startTime,
				duration,
				isActive: true,
			});
		}

		// Set up data callback
		this.streamingAudioDecoder.setDataCallback((pcmData, timestamp) => {
			this.sendAudioStreamData(sessionId, pcmData, timestamp, 48000, 2);
		});

		// Start playback
		await this.streamingAudioDecoder.startPlayback(
			projectData,
			this.documentDir ?? '',
			startTime,
			duration
		);

		console.log(`[MediaProcessor] Project audio playback started: ${sessionId}`);
	}

	/**
	 * Stop project audio playback
	 */
	stopProjectAudioPlayback(): void {
		if (this.streamingAudioDecoder) {
			this.streamingAudioDecoder.stop();
		}

		// Mark all sessions as inactive
		for (const session of this.audioStreamSessions.values()) {
			session.isActive = false;
		}
		this.audioStreamSessions.clear();

		console.log('[MediaProcessor] Project audio playback stopped');
	}

	/**
	 * Send audio stream data to Webview
	 */
	private sendAudioStreamData(
		sessionId: string,
		pcmData: Float32Array,
		timestamp: number,
		sampleRate: number,
		channels: number
	): void {
		if (this.disposed) return;

		try {
			this.webviewPanel.webview.postMessage({
				type: 'media:audioStream:data',
				payload: {
					sessionId,
					pcmData,
					timestamp,
					sampleRate,
					channels,
				},
			});
		} catch {
			// Webview was disposed, silently ignore
		}
	}

	/**
	 * Send audio stream response to Webview
	 */
	private sendAudioStreamResponse(response: {
		type: string;
		requestId: string;
		payload: unknown;
		error?: string;
	}): void {
		if (this.disposed) return;

		try {
			this.webviewPanel.webview.postMessage(response);
		} catch {
			// Webview was disposed, silently ignore
		}
	}

	// ===========================================================================
	// Performance Stats Support (Compat Mode Monitoring)
	// ===========================================================================

	/**
	 * Type guard for performance stats request
	 */
	private isPerformanceStatsRequest(message: unknown): boolean {
		if (typeof message !== 'object' || message === null) {
			return false;
		}

		const msg = message as Record<string, unknown>;
		return msg.type === 'media:getPerformanceStats';
	}

	/**
	 * Type guard for media bitrate request
	 */
	private isMediaBitrateRequest(message: unknown): boolean {
		if (typeof message !== 'object' || message === null) {
			return false;
		}

		const msg = message as Record<string, unknown>;
		return msg.type === 'media:getMediaBitrate';
	}

	/**
	 * Handle performance stats request
	 */
	private async handlePerformanceStatsRequest(message: unknown): Promise<void> {
		const request = message as { requestId: string };

		try {
			// Get system memory usage
			const memUsage = process.memoryUsage();
			const memoryUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
			const memoryTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);

			// Get CPU usage (approximate)
			const cpuUsage = process.cpuUsage();
			const cpuPercent = Math.min(100, Math.round((cpuUsage.user + cpuUsage.system) / 1000000 * 10));

			// Get Rust service render time (if available)
			const avgRenderTimeMs = 0; // TODO: Get from RustMediaProcessorService

			const response = {
				type: 'media:response:getPerformanceStats',
				requestId: request.requestId,
				payload: {
					cpuUsage: cpuPercent,
					memoryUsedMB,
					memoryTotalMB,
					cachedFrames: 0, // No longer using frame cache
					cacheHitCount: 0,
					cacheMissCount: 0,
					cacheHitRate: 0,
					droppedFrames: 0,
					decodeErrors: 0,
					avgDecodeTimeMs: 0,
					avgRenderTimeMs,
				},
			};

			this.webviewPanel.webview.postMessage(response);
		} catch (error) {
			this.webviewPanel.webview.postMessage({
				type: 'media:response:getPerformanceStats',
				requestId: request.requestId,
				error: error instanceof Error ? error.message : 'Unknown error',
			});
		}
	}

	/**
	 * Handle media bitrate request
	 */
	private async handleMediaBitrateRequest(message: unknown): Promise<void> {
		const request = message as { requestId: string; payload: { mediaPath: string } };

		try {
			const absolutePath = this.resolveMediaPath(request.payload.mediaPath);

			// Use FFprobe to get bitrate info
			const mediaInfo = await this.ffmpegService.probeMediaInfo(absolutePath);

			// MediaInfo has bitrate (video) and audioBitrate fields directly
			const videoBitrate = mediaInfo.bitrate ?? 0;
			const audioBitrate = mediaInfo.audioBitrate ?? 0;
			const totalBitrate = videoBitrate + audioBitrate;

			// Format bitrate strings
			const formatBitrate = (bps: number): string => {
				if (bps >= 1000000) {
					return `${(bps / 1000000).toFixed(1)} Mbps`;
				} else if (bps >= 1000) {
					return `${(bps / 1000).toFixed(0)} Kbps`;
				}
				return `${bps} bps`;
			};

			const response = {
				type: 'media:response:getMediaBitrate',
				requestId: request.requestId,
				payload: {
					videoBitrate,
					audioBitrate,
					totalBitrate,
					videoBitrateStr: formatBitrate(videoBitrate),
					totalBitrateStr: formatBitrate(totalBitrate),
				},
			};

			this.webviewPanel.webview.postMessage(response);
		} catch (error) {
			this.webviewPanel.webview.postMessage({
				type: 'media:response:getMediaBitrate',
				requestId: request.requestId,
				error: error instanceof Error ? error.message : 'Unknown error',
			});
		}
	}

	/**
	 * Dispose resources
	 */
	async dispose(): Promise<void> {
		// Mark as disposed to prevent further responses
		this.disposed = true;

		// Stop playback push mode
		this.stopPlaybackPush();

		// Stop audio streaming
		this.stopProjectAudioPlayback();
		if (this.streamingAudioDecoder) {
			this.streamingAudioDecoder.dispose();
			this.streamingAudioDecoder = null;
		}

		// Stop stats logging
		if (this.statsLogInterval) {
			clearInterval(this.statsLogInterval);
			this.statsLogInterval = null;
		}

		// Clear pending requests
		this.requestQueue = [];

		// Clear cache
		this.cache.clear();

		// Dispose Rust service
		if (this.rustService) {
			await this.rustService.dispose();
			this.rustService = null;
		}

		// Dispose FFmpeg service (clears frame cache)
		await this.ffmpegService.dispose();
	}
}
