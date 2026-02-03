/**
 * FrameServerIntegration - 帧服务器集成服务
 *
 * 职责：
 * - 连接 SharedRenderPipeline 和 FrameServerService
 * - 管理帧推送流程
 * - 提供 Pull 模式支持（Webview 通过 WebSocket 拉取帧）
 * - 使用共享渲染管线进行多轨道视频渲染合成
 *
 * 注意：音频播放由 neko-engine 处理，不在此服务中
 *
 * 架构：
 * ```
 * SharedRenderPipeline (渲染) → PreviewOutputAdapter (JPEG + WebSocket) → Webview
 *
 * Webview (WebSocket) ──► FrameServer ◄── FrameServerIntegration
 *                              │                    │
 *                              │                    ├── SharedRenderPipeline
 *                              │                    └── PreviewOutputAdapter
 *                              └── 推送到所有连接的客户端
 * ```
 */

import * as vscode from 'vscode';
import { FrameServerService } from './FrameServerService';
import type { RustMediaProcessorService } from './RustMediaProcessorService';
import { KeyframeCacheService } from './KeyframeCacheService';
import { getFFmpegService, type FFmpegService } from './FFmpegService';
import type { ProjectData } from '@neko/shared';
import {
	SharedRenderPipeline,
	createSharedRenderPipeline,
	PreviewOutputAdapter,
	createPreviewOutputAdapter,
	type CompositeLayerConfig,
} from './renderPipeline';

// Sharp type for RGBA to JPEG conversion
type SharpInstance = {
	jpeg(options?: { quality?: number }): SharpInstance;
	toBuffer(): Promise<Buffer>;
};

// Types
interface FrameServerConfig {
	port?: number;
	maxBufferSize?: number;
	jpegQuality?: number;
}

interface PullSession {
	sessionId: string;
	videoPath: string;
	isActive: boolean;
	lastRequestedTime: number;
	frameServer: FrameServerService;
}

// Re-export CompositeLayerConfig from renderPipeline
export type { CompositeLayerConfig } from './renderPipeline';

interface IntegrationConfig {
	/** 帧服务器配置 */
	frameServerConfig?: FrameServerConfig;
	/** 解码器配置 */
	decoderConfig?: {
		maxCachedFrames?: number;
		quality?: number;
		width?: number;
		height?: number;
	};
	/** Rust 媒体处理服务（用于 wgpu 合成） */
	rustService?: RustMediaProcessorService;
	/** 输出宽度 */
	outputWidth?: number;
	/** 输出高度 */
	outputHeight?: number;
}

/**
 * 帧服务器集成服务
 */
export class FrameServerIntegration implements vscode.Disposable {
	private _config: IntegrationConfig;
	private _ffmpegService: FFmpegService | null = null;
	private _frameServer: FrameServerService | null = null;
	private _pullSessions: Map<string, PullSession> = new Map();
	private _isDisposed = false;
	private _pushLoopActive = false;
	private _pushLoopAbort: AbortController | null = null;
	private _jpegQuality: number = 85;
	private _rustService: RustMediaProcessorService | null = null;
	private _outputWidth: number = 1920;
	private _outputHeight: number = 1080;
	private _compositeLayers: CompositeLayerConfig[] = [];
	private _keyframeCacheService: KeyframeCacheService | null = null;
	private _projectData: ProjectData | null = null;
	private _projectRoot: string = '';
	private _isScrubbingMode = false;
	private _lastScrubbingTime = 0;
	private _videoSources: Array<{
		videoPath: string;
		startTime: number;
		trimStart: number;
		duration: number;
		fps?: number;
		elementId?: string;
	}> = [];

	// Shared render pipeline and output adapter
	private _renderPipeline: SharedRenderPipeline | null = null;
	private _previewAdapter: PreviewOutputAdapter | null = null;

	constructor(config: IntegrationConfig) {
		this._config = config;
		this._jpegQuality = config.frameServerConfig?.jpegQuality ?? 85;
		this._rustService = config.rustService ?? null;
		this._outputWidth = config.outputWidth ?? 1920;
		this._outputHeight = config.outputHeight ?? 1080;
	}

	/**
	 * 设置 Rust 媒体处理服务（用于 wgpu 合成）
	 */
	setRustService(service: RustMediaProcessorService | null): void {
		this._rustService = service;
		// Update render pipeline if already initialized
		if (this._renderPipeline) {
			this._renderPipeline.dispose();
			this._renderPipeline = createSharedRenderPipeline(service);
			this._syncRenderPipelineConfig();
		}
	}

	/**
	 * 设置输出分辨率
	 */
	setOutputSize(width: number, height: number): void {
		this._outputWidth = width;
		this._outputHeight = height;
		// Update render pipeline config
		if (this._renderPipeline) {
			this._renderPipeline.setConfig({
				outputWidth: width,
				outputHeight: height,
				fps: 30,
			});
		}
	}

	/**
	 * 设置合成层配置（多轨道视频）
	 */
	setCompositeLayers(layers: CompositeLayerConfig[]): void {
		this._compositeLayers = layers;
		// Update render pipeline
		if (this._renderPipeline) {
			this._renderPipeline.setCompositeLayers(layers);
		}
	}

	/**
	 * 检查 wgpu 合成是否可用
	 */
	isCompositorAvailable(): boolean {
		return this._renderPipeline?.isCompositorAvailable() ?? this._rustService?.isCompositorAvailable() ?? false;
	}

	/**
	 * 获取共享渲染管线（供导出服务使用）
	 */
	getRenderPipeline(): SharedRenderPipeline | null {
		return this._renderPipeline;
	}

	/**
	 * 初始化服务
	 */
	async initialize(): Promise<boolean> {
		if (this._isDisposed) {
			return false;
		}

		try {
			// 初始化 FFmpeg 服务（使用 Rust N-API）
			this._ffmpegService = getFFmpegService();

			// 初始化关键帧缓存服务
			this._keyframeCacheService = new KeyframeCacheService({
				maxCachedFrames: 120, // 按设计原则：120帧
				prefetchCount: 80,    // 按设计原则：80个关键帧
			});

			// 初始化帧服务器
			this._frameServer = await FrameServerService.tryCreate(
				this._config.frameServerConfig
			);

			if (!this._frameServer) {
				console.warn('[FrameServerIntegration] Frame server not available, falling back to postMessage');
				return false;
			}

			// 初始化共享渲染管线
			this._renderPipeline = createSharedRenderPipeline(this._rustService);
			this._syncRenderPipelineConfig();

			// 初始化预览输出适配器（音频参数传 null，由 neko-engine 处理）
			this._previewAdapter = createPreviewOutputAdapter(
				this._frameServer,
				null,
				this._rustService
			);

			console.log(
				`[FrameServerIntegration] Initialized with frame server on port ${this._frameServer.getPort()}`
			);

			return true;
		} catch (error) {
			console.error('[FrameServerIntegration] Initialization failed:', error);
			return false;
		}
	}

	/**
	 * 检查服务是否可用
	 */
	isAvailable(): boolean {
		return (
			!this._isDisposed &&
			this._ffmpegService !== null &&
			this._frameServer !== null &&
			this._frameServer.isAvailable()
		);
	}

	/**
	 * 获取帧服务器端口
	 */
	getServerPort(): number | null {
		return this._frameServer?.getPort() ?? null;
	}

	/**
	 * 获取 WebSocket URL
	 */
	getWebSocketUrl(): string | null {
		return this._frameServer?.getWebsocketUrl() ?? null;
	}

	/**
	 * 获取 MJPEG URL
	 */
	getMjpegUrl(): string | null {
		return this._frameServer?.getMjpegUrl() ?? null;
	}

	/**
	 * 设置项目数据
	 */
	setProjectData(project: ProjectData, projectRoot: string): void {
		this._projectData = project;
		this._projectRoot = projectRoot;
	}

	/**
	 * 初始化视频源
	 */
	async initializeVideoSources(
		sources: Array<{
			videoPath: string;
			startTime: number;
			trimStart: number;
			duration: number;
			fps?: number;
			elementId?: string;
		}>,
		fps: number
	): Promise<void> {
		if (!this._ffmpegService) {
			throw new Error('FFmpeg service not initialized');
		}

		// Store video sources for later use
		this._videoSources = sources.map((s, index) => ({
			...s,
			fps: s.fps ?? fps,
			elementId: s.elementId ?? `video-${index}`,
		}));

		console.log(`[FrameServerIntegration] Initialized ${this._videoSources.length} video sources`);
	}

	/**
	 * 触发关键帧缓存（用于时间线打开或模式切换）
	 * 按设计原则：索引所有视频的 IDR 关键帧，预缓存 playhead 后 80 个关键帧
	 * 使用 Rust HTTP API 缓存
	 *
	 * @param videoSources 视频源列表
	 * @param playheadTime 当前 playhead 时间
	 */
	async triggerKeyframeCache(
		videoSources: Array<{
			videoPath: string;
			startTime: number;
			trimStart: number;
			duration: number;
		}>,
		playheadTime: number
	): Promise<void> {
		await this._triggerRustKeyframeCache(videoSources, playheadTime);
	}

	/**
	 * 使用 Rust HTTP API 缓存
	 */
	private async _triggerRustKeyframeCache(
		videoSources: Array<{
			videoPath: string;
			startTime: number;
			trimStart: number;
			duration: number;
		}>,
		playheadTime: number
	): Promise<void> {
		const serverPort = this.getServerPort();
		if (!serverPort) {
			console.warn('[FrameServerIntegration] Frame server not available for Rust keyframe cache');
			return;
		}

		console.log(`[FrameServerIntegration] Triggering Rust keyframe cache`);

		try {
			// Build timeline data for Rust API
			const timelineData = this._buildTimelineDataForCache(videoSources);

			const response = await fetch(`http://127.0.0.1:${serverPort}/keyframes/warmup`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					timeline: timelineData,
					playhead: playheadTime,
					maxFrames: 80,
				}),
			});

			if (!response.ok) {
				const errorText = await response.text();
				console.error(`[FrameServerIntegration] Rust keyframe cache failed: ${errorText}`);
				return;
			}

			const result = await response.json();
			console.log(
				`[FrameServerIntegration] Rust keyframe cache completed: ` +
				`cached=${result.framesCached}, hit=${result.framesHit}, total=${result.status?.cachedCount}`
			);
		} catch (error) {
			console.error('[FrameServerIntegration] Failed to trigger Rust keyframe cache:', error);
		}
	}

	/**
	 * 构建用于 Rust API 的 timeline 数据
	 */
	private _buildTimelineDataForCache(
		videoSources: Array<{
			videoPath: string;
			startTime: number;
			trimStart: number;
			duration: number;
		}>
	): object {
		// Build minimal timeline structure for Rust keyframe cache API
		return {
			id: 'cache-timeline',
			duration: Math.max(...videoSources.map(s => s.startTime + s.duration), 0),
			fps: 30,
			width: this._outputWidth,
			height: this._outputHeight,
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

	/**
	 * 获取关键帧缓存统计信息
	 */
	getKeyframeCacheStats(): {
		cachedFrames: number;
		indexedVideos: number;
		totalKeyframesIndexed: number;
		cacheHitCount: number;
		cacheMissCount: number;
		cacheHitRate: number;
		prefetchedFrames: number;
	} | null {
		return this._keyframeCacheService?.getStats() ?? null;
	}

	/**
	 * 获取视频的关键帧索引
	 */
	getKeyframeIndex(videoPath: string): Array<{
		time: number;
		frameType: 'I' | 'P' | 'B';
		isIDR: boolean;
		frameIndex: number;
		pts: number;
		dts: number;
	}> | null {
		return this._keyframeCacheService?.getKeyframeIndex(videoPath) ?? null;
	}

	/**
	 * 获取缓存的关键帧（用于快速 seek）
	 * 返回最接近请求时间的已缓存关键帧
	 */
	getCachedKeyframe(videoPath: string, time: number): {
		buffer: Buffer;
		width: number;
		height: number;
		time: number;
		isIDR: boolean;
	} | null {
		if (!this._keyframeCacheService) {
			return null;
		}

		const cached = this._keyframeCacheService.getNearestCachedKeyframe(videoPath, time);
		if (!cached) {
			return null;
		}

		return {
			buffer: cached.buffer,
			width: cached.width,
			height: cached.height,
			time: cached.info.time,
			isIDR: cached.info.isIDR,
		};
	}

	// ---------------------------------------------------------------------------
	// Scrubbing Mode API (视频编辑器拖动预览)
	// ---------------------------------------------------------------------------

	/**
	 * 进入 Scrubbing 模式
	 * Scrubbing 时只推送视频帧
	 */
	enterScrubbingMode(): void {
		if (this._isScrubbingMode) {
			return;
		}

		this._isScrubbingMode = true;
		this._lastScrubbingTime = Date.now();

		console.log('[FrameServerIntegration] Entered scrubbing mode');
	}

	/**
	 * 退出 Scrubbing 模式
	 */
	exitScrubbingMode(): void {
		if (!this._isScrubbingMode) {
			return;
		}

		this._isScrubbingMode = false;

		console.log('[FrameServerIntegration] Exited scrubbing mode');
	}

	/**
	 * 检查是否在 Scrubbing 模式
	 */
	isScrubbingMode(): boolean {
		return this._isScrubbingMode;
	}

	/**
	 * Scrubbing 时请求单帧
	 * @param time 目标时间（秒）
	 */
	async scrubToTime(time: number): Promise<void> {
		if (!this._isScrubbingMode) {
			this.enterScrubbingMode();
		}

		this._lastScrubbingTime = Date.now();

		// 只推送视频帧
		if (this._frameServer && this._ffmpegService) {
			// 获取主视频路径（第一个合成层或默认）
			const videoPath = this._compositeLayers[0]?.videoPath;
			if (videoPath) {
				const frame = await this._getProcessedFrame(videoPath, time);
				if (frame) {
					this._frameServer.pushFrame(
						frame.jpegBuffer,
						Math.round(time * 1_000_000), // 转换为微秒
						frame.width,
						frame.height
					);
				}
			}
		}
	}

	/**
	 * 启动 Pull 模式会话
	 */
	async startPullSession(sessionId: string, videoPath: string): Promise<number | null> {
		if (!this.isAvailable()) {
			return null;
		}

		// 检查是否已存在会话
		if (this._pullSessions.has(sessionId)) {
			const existing = this._pullSessions.get(sessionId)!;
			return existing.frameServer.getPort();
		}

		// 创建新的帧服务器（每个会话独立）
		const frameServer = await FrameServerService.tryCreate({
			port: 0,
			maxBufferSize: 3,
			jpegQuality: 85,
		});

		if (!frameServer) {
			return null;
		}

		const session: PullSession = {
			sessionId,
			videoPath,
			isActive: true,
			lastRequestedTime: 0,
			frameServer,
		};

		this._pullSessions.set(sessionId, session);

		console.log(
			`[FrameServerIntegration] Started pull session ${sessionId} on port ${frameServer.getPort()}`
		);

		return frameServer.getPort();
	}

	/**
	 * 停止 Pull 模式会话
	 */
	async stopPullSession(sessionId: string): Promise<void> {
		const session = this._pullSessions.get(sessionId);
		if (!session) {
			return;
		}

		session.isActive = false;
		await session.frameServer.dispose();
		this._pullSessions.delete(sessionId);

		console.log(`[FrameServerIntegration] Stopped pull session ${sessionId}`);
	}

	/**
	 * 处理 Pull 模式帧请求
	 * 当 Webview 发送 READY 信号时调用
	 */
	async handlePullRequest(
		sessionId: string,
		videoPath: string,
		timeInSeconds: number
	): Promise<void> {
		const session = this._pullSessions.get(sessionId);
		if (!session || !session.isActive) {
			return;
		}

		if (!this._ffmpegService) {
			return;
		}

		try {
			// 获取处理后的帧（支持 wgpu 多轨道合成）
			const result = await this._getProcessedFrame(videoPath, timeInSeconds);
			if (!result) {
				return;
			}

			// 推送 JPEG 到帧服务器
			session.frameServer.pushFrame(
				result.jpegBuffer,
				Math.round(timeInSeconds * 1_000_000), // 转换为微秒
				result.width,
				result.height
			);

			session.lastRequestedTime = timeInSeconds;
		} catch (error) {
			console.error(
				`[FrameServerIntegration] Failed to handle pull request for session ${sessionId}:`,
				error
			);
		}
	}

	/**
	 * 启动连续推送模式（用于播放预览）
	 */
	async startContinuousPush(
		videoPath: string,
		startTime: number,
		fps: number = 30
	): Promise<void> {
		if (!this.isAvailable() || !this._frameServer || !this._ffmpegService) {
			return;
		}

		// 停止之前的推送循环
		this.stopContinuousPush();

		this._pushLoopActive = true;
		this._pushLoopAbort = new AbortController();

		const frameInterval = 1000 / fps;
		let currentTime = startTime;

		const pushLoop = async () => {
			while (this._pushLoopActive && !this._pushLoopAbort?.signal.aborted) {
				const loopStart = performance.now();

				try {
					// 获取处理后的帧（支持 wgpu 多轨道合成）
					const result = await this._getProcessedFrame(videoPath, currentTime);
					if (result && this._frameServer) {
						// 推送 JPEG 到帧服务器
						this._frameServer.pushFrame(
							result.jpegBuffer,
							Math.round(currentTime * 1_000_000),
							result.width,
							result.height
						);
					}
				} catch (error) {
					console.error('[FrameServerIntegration] Push loop error:', error);
				}

				currentTime += 1 / fps;

				// 等待下一帧时间
				const elapsed = performance.now() - loopStart;
				const waitTime = Math.max(0, frameInterval - elapsed);
				await new Promise((resolve) => setTimeout(resolve, waitTime));
			}
		};

		// 启动推送循环（不阻塞）
		pushLoop().catch((error) => {
			console.error('[FrameServerIntegration] Push loop failed:', error);
		});
	}

	/**
	 * 停止连续推送模式
	 */
	stopContinuousPush(): void {
		this._pushLoopActive = false;
		this._pushLoopAbort?.abort();
		this._pushLoopAbort = null;
	}

	/**
	 * 获取服务统计信息
	 */
	getStats(): {
		serverPort: number | null;
		activeSessions: number;
		framesSent: number;
		isRunning: boolean;
	} {
		const serverStats = this._frameServer?.getStats();
		return {
			serverPort: this._frameServer?.getPort() ?? null,
			activeSessions: this._pullSessions.size,
			framesSent: serverStats?.framesSent ?? 0,
			isRunning: serverStats?.isRunning ?? false,
		};
	}

	/**
	 * 将 RGBA Buffer 转换为 JPEG Buffer
	 * @param rgbaBuffer RGBA 原始数据
	 * @param width 图像宽度
	 * @param height 图像高度
	 * @returns JPEG Buffer
	 */
	private async _rgbaToJpeg(
		rgbaBuffer: Buffer,
		width: number,
		height: number
	): Promise<Buffer> {
		try {
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const sharp = require('sharp') as (
				input: Buffer,
				options?: { raw: { width: number; height: number; channels: number } }
			) => SharpInstance;

			const jpegBuffer = await sharp(rgbaBuffer, {
				raw: {
					width,
					height,
					channels: 4, // RGBA
				},
			})
				.jpeg({ quality: this._jpegQuality })
				.toBuffer();

			return jpegBuffer;
		} catch (error) {
			console.error('[FrameServerIntegration] RGBA to JPEG conversion failed:', error);
			throw error;
		}
	}

	/**
	 * 获取并处理帧（支持单轨道和多轨道合成）
	 * 使用 SharedRenderPipeline + PreviewOutputAdapter
	 * @param videoPath 视频路径（单轨道模式）
	 * @param timeInSeconds 当前时间
	 * @returns JPEG Buffer 和尺寸
	 */
	private async _getProcessedFrame(
		videoPath: string,
		timeInSeconds: number
	): Promise<{ jpegBuffer: Buffer; width: number; height: number } | null> {
		// 优先使用共享渲染管线
		if (this._renderPipeline?.isAvailable()) {
			const frame = await this._renderPipeline.processFrame(timeInSeconds);
			if (frame) {
				const jpegBuffer = await this._rgbaToJpeg(frame.data, frame.width, frame.height);
				return {
					jpegBuffer,
					width: frame.width,
					height: frame.height,
				};
			}
		}

		// 回退到直接使用 FFmpegService（单轨道模式）
		if (!this._ffmpegService) {
			return null;
		}

		try {
			// 使用 FFmpegService 提取帧（返回 JPEG）
			const jpegBuffer = await this._ffmpegService.extractVideoFrame(
				videoPath,
				timeInSeconds,
				3, // quality
				1.0 // scale
			);

			// 获取媒体信息
			const mediaInfo = await this._ffmpegService.probeMediaInfo(videoPath);

			return {
				jpegBuffer,
				width: mediaInfo.width,
				height: mediaInfo.height,
			};
		} catch (error) {
			console.error('[FrameServerIntegration] Failed to get frame:', error);
			return null;
		}
	}

	/**
	 * 同步渲染管线配置
	 */
	private _syncRenderPipelineConfig(): void {
		if (!this._renderPipeline) {
			return;
		}

		this._renderPipeline.setConfig({
			outputWidth: this._outputWidth,
			outputHeight: this._outputHeight,
			fps: 30,
			backgroundColor: [0, 0, 0, 255],
		});

		this._renderPipeline.setCompositeLayers(this._compositeLayers);

		if (this._projectData) {
			this._renderPipeline.setProject(this._projectData, this._projectRoot);
		}
	}

	/**
	 * 释放资源
	 */
	async dispose(): Promise<void> {
		if (this._isDisposed) {
			return;
		}

		this._isDisposed = true;

		// 停止推送循环
		this.stopContinuousPush();

		// 停止所有 Pull 会话
		for (const [sessionId] of this._pullSessions) {
			await this.stopPullSession(sessionId);
		}

		// 释放预览输出适配器
		if (this._previewAdapter) {
			this._previewAdapter.dispose();
			this._previewAdapter = null;
		}

		// 释放共享渲染管线
		if (this._renderPipeline) {
			this._renderPipeline.dispose();
			this._renderPipeline = null;
		}

		// 释放帧服务器
		if (this._frameServer) {
			await this._frameServer.dispose();
			this._frameServer = null;
		}

		// FFmpegService 是单例，不需要在这里释放
		this._ffmpegService = null;

		// 释放关键帧缓存服务
		if (this._keyframeCacheService) {
			this._keyframeCacheService.dispose();
			this._keyframeCacheService = null;
		}

		console.log('[FrameServerIntegration] Disposed');
	}
}
