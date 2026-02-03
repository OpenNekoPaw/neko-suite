/**
 * FrameServerIntegration - 帧服务器集成服务
 *
 * 职责：
 * - 管理 FrameServerService 生命周期
 * - 提供 Pull 模式支持（Webview 通过 WebSocket 拉取帧）
 * - 触发 neko-engine 关键帧缓存
 *
 * 注意：视频渲染和合成由 neko-engine 处理
 *
 * 架构：
 * ```
 * neko-engine (Rust HTTP Server) → WebSocket → Webview
 *                    │
 *                    └── FrameServerIntegration (管理)
 * ```
 */

import * as vscode from 'vscode';
import { FrameServerService } from './FrameServerService';
import { getFFmpegService, type FFmpegService } from './FFmpegService';
import type { ProjectData } from '@neko/shared';

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

/**
 * 合成层配置
 */
export interface CompositeLayerConfig {
	videoPath: string;
	startTime: number;
	trimStart: number;
	duration: number;
	transform?: {
		x?: number;
		y?: number;
		scaleX?: number;
		scaleY?: number;
		rotation?: number;
		anchorX?: number;
		anchorY?: number;
	};
	opacity?: number;
	blendMode?: string;
	zIndex?: number;
}

interface IntegrationConfig {
	/** 帧服务器配置 */
	frameServerConfig?: FrameServerConfig;
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
	private _outputWidth: number = 1920;
	private _outputHeight: number = 1080;
	private _compositeLayers: CompositeLayerConfig[] = [];
	private _projectData: ProjectData | null = null;
	private _projectRoot: string = '';
	private _isScrubbingMode = false;
	private _videoSources: Array<{
		videoPath: string;
		startTime: number;
		trimStart: number;
		duration: number;
		fps?: number;
		elementId?: string;
	}> = [];

	constructor(config: IntegrationConfig) {
		this._config = config;
		this._outputWidth = config.outputWidth ?? 1920;
		this._outputHeight = config.outputHeight ?? 1080;
	}

	/**
	 * 设置输出分辨率
	 */
	setOutputSize(width: number, height: number): void {
		this._outputWidth = width;
		this._outputHeight = height;
	}

	/**
	 * 设置合成层配置（多轨道视频）
	 */
	setCompositeLayers(layers: CompositeLayerConfig[]): void {
		this._compositeLayers = layers;
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

			// 初始化帧服务器
			this._frameServer = await FrameServerService.tryCreate(
				this._config.frameServerConfig
			);

			if (!this._frameServer) {
				console.warn('[FrameServerIntegration] Frame server not available');
				return false;
			}

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
	 * 使用 neko-engine Rust HTTP API 缓存
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
		const serverPort = this.getServerPort();
		if (!serverPort) {
			console.warn('[FrameServerIntegration] Frame server not available for keyframe cache');
			return;
		}

		console.log(`[FrameServerIntegration] Triggering keyframe cache via neko-engine`);

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
				console.error(`[FrameServerIntegration] Keyframe cache failed: ${errorText}`);
				return;
			}

			const result = await response.json();
			console.log(
				`[FrameServerIntegration] Keyframe cache completed: ` +
				`cached=${result.framesCached}, hit=${result.framesHit}, total=${result.status?.cachedCount}`
			);
		} catch (error) {
			console.error('[FrameServerIntegration] Failed to trigger keyframe cache:', error);
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

	// ---------------------------------------------------------------------------
	// Scrubbing Mode API (视频编辑器拖动预览)
	// ---------------------------------------------------------------------------

	/**
	 * 进入 Scrubbing 模式
	 */
	enterScrubbingMode(): void {
		if (this._isScrubbingMode) {
			return;
		}

		this._isScrubbingMode = true;
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
	 * NOTE: 帧渲染由 neko-engine 处理，此方法仅用于触发
	 * @param time 目标时间（秒）
	 */
	async scrubToTime(_time: number): Promise<void> {
		if (!this._isScrubbingMode) {
			this.enterScrubbingMode();
		}

		// NOTE: 帧渲染由 neko-engine 处理
		// 此方法保留用于状态管理
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
	 * 释放资源
	 */
	async dispose(): Promise<void> {
		if (this._isDisposed) {
			return;
		}

		this._isDisposed = true;

		// 停止所有 Pull 会话
		for (const [sessionId] of this._pullSessions) {
			await this.stopPullSession(sessionId);
		}

		// 释放帧服务器
		if (this._frameServer) {
			await this._frameServer.dispose();
			this._frameServer = null;
		}

		// FFmpegService 是单例，不需要在这里释放
		this._ffmpegService = null;

		console.log('[FrameServerIntegration] Disposed');
	}
}
