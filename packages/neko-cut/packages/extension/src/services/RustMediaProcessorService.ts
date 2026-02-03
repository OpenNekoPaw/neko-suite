/**
 * RustMediaProcessorService - Rust Native Addon 媒体处理服务
 *
 * 职责：
 * - 封装 @neko-engine/native-napi native addon
 * - 提供 GPU 加速的帧解码和特效处理
 * - 提供媒体探测、帧提取、字幕提取功能（替代 FFmpegService）
 * - 与 FFmpegService 接口兼容，支持降级
 *
 * 设计原则：
 * - 单一职责：仅负责 Rust addon 调用
 * - 接口兼容：与 FFmpegService 方法签名一致
 * - 优雅降级：初始化失败时返回 null，由上层处理
 */

import * as vscode from 'vscode';
import { MediaInfo, SubtitleStream, ExtractedSubtitleTrack, SubtitleCueData } from '@neko/shared';

// Types from the native addon
interface GpuInfo {
	name: string;
	vendor: string;
	backend: string;
	deviceType: string;
}

interface HwAccelInfo {
	decoders: string[];
	encoders: string[];
	recommendedDecoder: string;
	recommendedEncoder: string;
}

interface DecoderConfig {
	path: string;
	hwAccel?: string;
	outputFormat?: string;
}

interface EffectParams {
	brightness?: number;
	contrast?: number;
	saturation?: number;
}

interface FrameData {
	width: number;
	height: number;
	format: string;
	data: Buffer;
	timestamp: number;
	isKeyframe: boolean;
}

// CompositorSession types
interface CompositeLayer {
	data: Buffer;
	width: number;
	height: number;
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

interface CompositeResult {
	data: Buffer;
	width: number;
	height: number;
	timeMs: number;
	layerCount: number;
}

interface CompositorSessionInstance {
	composite(
		layers: CompositeLayer[],
		outputWidth: number,
		outputHeight: number,
		backgroundColor?: number[]
	): CompositeResult;
}

// Media service types from Rust N-API
interface JsProbeMediaInfo {
	duration: number;
	width: number;
	height: number;
	fps: number;
	codec: string;
	format: string;
	bitrate?: number;
	hasAudio: boolean;
	audioCodec?: string;
	audioSampleRate?: number;
	audioChannels?: number;
	audioBitrate?: number;
	hasSubtitles: boolean;
	subtitleStreams: JsProbeSubtitleStream[];
}

interface JsProbeSubtitleStream {
	index: number;
	codec: string;
	language?: string;
	title?: string;
	isDefault: boolean;
	isForced: boolean;
}

interface JsSubtitleCue {
	id: string;
	startTime: number;
	endTime: number;
	text: string;
}

interface JsExtractedSubtitleTrack {
	streamIndex: number;
	language?: string;
	title?: string;
	isDefault: boolean;
	cues: JsSubtitleCue[];
}

// Native addon interface
interface MediaProcessorAddon {
	MediaProcessor: {
		create(): Promise<MediaProcessorInstance>;
	};
	CompositorSession: {
		create(): Promise<CompositorSessionInstance>;
	};
	// Media service functions
	probeMedia(path: string): JsProbeMediaInfo;
	// NOTE: extractFrame and extractFrames have been removed.
	// Use MediaProcessor.decodeFrame() + encodeJpeg() instead.
	extractAllSubtitles(path: string): JsExtractedSubtitleTrack[];
	// JPEG encoding (replaces sharp)
	encodeJpeg(rgbaData: Buffer, width: number, height: number, quality?: number): Buffer;
}

interface MediaProcessorInstance {
	getGpuInfo(): GpuInfo;
	detectHwAccel(): HwAccelInfo;
	decodeFrame(config: DecoderConfig, timeSeconds: number): FrameData;
	decodeFrameRange(
		config: DecoderConfig,
		startTime: number,
		endTime: number,
		fps: number
	): FrameData[];
	applyEffects(frame: FrameData, params: EffectParams): FrameData;
	processFrame(
		config: DecoderConfig,
		timeSeconds: number,
		params?: EffectParams
	): FrameData;
	// GPU format conversion
	rgbaToNv12(frame: FrameData, colorSpace?: number): FrameData;
	// Video encoder
	createVideoEncoder(config: VideoEncoderConfig): VideoEncoderSession;
	dispose(): void;
}

// Video encoder types
interface VideoEncoderConfig {
	width: number;
	height: number;
	fps: number;
	bitrate?: number;
	codec: string; // 'h264', 'h265', 'vp9', 'prores'
	preset?: string; // 'ultrafast', 'fast', 'medium', 'slow', 'veryslow'
	profile?: string; // 'high', 'main', 'baseline'
	pixelFormat?: string; // 'rgba', 'rgb', 'yuv420p', 'nv12'
	hwEncoder?: string; // 'auto', 'videotoolbox', 'nvenc', 'vaapi', 'qsv', 'none'
}

interface EncodedPacket {
	data: Buffer;
	pts: number;
	dts: number;
	isKeyframe: boolean;
	size: number;
}

interface VideoEncoderSession {
	isHwActive(): boolean;
	encodeFrame(frame: FrameData, pts: number): EncodedPacket[];
	flush(): EncodedPacket[];
	close(): void;
}

/**
 * Rust 媒体处理服务
 */
export class RustMediaProcessorService implements vscode.Disposable {
	private processor: MediaProcessorInstance | null = null;
	private compositorSession: CompositorSessionInstance | null = null;
	private addon: MediaProcessorAddon | null = null;
	private gpuInfo: GpuInfo | null = null;
	private hwAccelInfo: HwAccelInfo | null = null;
	private initPromise: Promise<boolean> | null = null;
	private disposed = false;

	/**
	 * 尝试创建 RustMediaProcessorService 实例
	 * 如果 native addon 不可用，返回 null
	 */
	static async tryCreate(): Promise<RustMediaProcessorService | null> {
		const service = new RustMediaProcessorService();
		const initialized = await service.initialize();

		if (initialized) {
			return service;
		}

		await service.dispose();
		return null;
	}

	private constructor() {
		// Private constructor - use tryCreate()
	}

	/**
	 * 初始化 Rust native addon
	 */
	private async initialize(): Promise<boolean> {
		if (this.initPromise) {
			return this.initPromise;
		}

		this.initPromise = this.doInitialize();
		return this.initPromise;
	}

	private async doInitialize(): Promise<boolean> {
		try {
			// Try to load the native addon
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const addon = require('@neko-engine/native-napi') as MediaProcessorAddon;
			this.addon = addon;

			// Create processor instance via static method
			this.processor = await addon.MediaProcessor.create();

			// Get GPU info
			this.gpuInfo = this.processor.getGpuInfo();
			this.hwAccelInfo = this.processor.detectHwAccel();

			// Log hardware acceleration status
			console.log(
				`[RustMediaProcessor] Initialized with GPU: ${this.gpuInfo?.name ?? 'unknown'} (${this.gpuInfo?.backend ?? 'unknown'})`
			);
			console.log(
				`[RustMediaProcessor] Hardware acceleration: ` +
				`decoders=[${this.hwAccelInfo?.decoders.join(', ') ?? 'none'}], ` +
				`recommended=${this.hwAccelInfo?.recommendedDecoder ?? 'none'}`
			);

			// Initialize CompositorSession for GPU compositing
			try {
				this.compositorSession = await addon.CompositorSession.create();
				console.log('[RustMediaProcessor] CompositorSession initialized');
			} catch (compositorError) {
				console.warn(
					'[RustMediaProcessor] CompositorSession init failed (compositing will be unavailable):',
					compositorError instanceof Error ? compositorError.message : compositorError
				);
				// Continue without compositor - it's optional
			}

			return true;
		} catch (error) {
			console.warn(
				'[RustMediaProcessor] Failed to initialize native addon:',
				error instanceof Error ? error.message : error
			);
			return false;
		}
	}

	/**
	 * 检查服务是否可用
	 */
	isAvailable(): boolean {
		return this.processor !== null && !this.disposed;
	}

	/**
	 * 获取 GPU 信息
	 */
	getGpuInfo(): GpuInfo | null {
		return this.gpuInfo;
	}

	/**
	 * 获取硬件加速信息
	 */
	getHwAccelInfo(): HwAccelInfo | null {
		return this.hwAccelInfo;
	}

	/**
	 * 检查硬件解码是否可用
	 */
	isHwDecoderAvailable(): boolean {
		const decoder = this.hwAccelInfo?.recommendedDecoder;
		return decoder !== undefined && decoder !== 'none' && decoder !== '';
	}

	/**
	 * 获取推荐的硬件解码器名称
	 */
	getRecommendedHwDecoder(): string | null {
		const decoder = this.hwAccelInfo?.recommendedDecoder;
		if (decoder && decoder !== 'none' && decoder !== '') {
			return decoder;
		}
		return null;
	}

	/**
	 * 解码单帧到 NV12 格式（零拷贝管线）
	 *
	 * 使用硬件解码直接输出 NV12，避免 CPU 颜色转换
	 *
	 * @param videoPath 视频文件路径
	 * @param timeInSeconds 时间点（秒）
	 * @returns FrameData (NV12 格式) 或 null
	 */
	decodeFrameToNV12(
		videoPath: string,
		timeInSeconds: number
	): FrameData | null {
		if (!this.processor || this.disposed) {
			return null;
		}

		try {
			// Use hardware decoder with NV12 output for zero-copy
			const hwAccel = this.hwAccelInfo?.recommendedDecoder;

			const config: DecoderConfig = {
				path: videoPath,
				outputFormat: 'nv12',
				hwAccel: hwAccel && hwAccel !== 'none' ? hwAccel : undefined,
			};

			const frame = this.processor.decodeFrame(config, timeInSeconds);

			if (frame) {
				console.log(
					`[RustMediaProcessor] Decoded NV12 frame: ${frame.width}x${frame.height}, ` +
					`hw=${hwAccel ?? 'none'}, format=${frame.format}`
				);
			}

			return frame;
		} catch (error) {
			console.warn(
				`[RustMediaProcessor] decodeFrameToNV12 failed:`,
				error instanceof Error ? error.message : error
			);
			return null;
		}
	}

	/**
	 * 解码单帧（返回 RGBA 原始数据）
	 *
	 * @param videoPath 视频文件路径
	 * @param timeInSeconds 时间点（秒）
	 * @param outputFormat 输出格式 ('rgba' | 'rgb' | 'yuv420p' | 'nv12')
	 * @param useHwAccel 是否使用硬件加速（默认 true）
	 * @returns FrameData 或 null（如果失败）
	 */
	decodeFrame(
		videoPath: string,
		timeInSeconds: number,
		outputFormat: string = 'rgba',
		useHwAccel: boolean = true
	): FrameData | null {
		if (!this.processor || this.disposed) {
			return null;
		}

		try {
			// Use recommended hardware decoder if available
			const hwAccel = useHwAccel ? this.hwAccelInfo?.recommendedDecoder : undefined;

			const config: DecoderConfig = {
				path: videoPath,
				outputFormat,
				hwAccel: hwAccel && hwAccel !== 'none' ? hwAccel : undefined,
			};

			return this.processor.decodeFrame(config, timeInSeconds);
		} catch (error) {
			console.warn(
				`[RustMediaProcessor] decodeFrame failed:`,
				error instanceof Error ? error.message : error
			);
			return null;
		}
	}

	/**
	 * 解码帧范围
	 *
	 * @param videoPath 视频文件路径
	 * @param startTime 开始时间（秒）
	 * @param endTime 结束时间（秒）
	 * @param fps 帧率
	 * @param outputFormat 输出格式
	 * @returns FrameData 数组或 null
	 */
	decodeFrameRange(
		videoPath: string,
		startTime: number,
		endTime: number,
		fps: number,
		outputFormat: string = 'rgba'
	): FrameData[] | null {
		if (!this.processor || this.disposed) {
			return null;
		}

		try {
			const config: DecoderConfig = {
				path: videoPath,
				outputFormat,
			};

			return this.processor.decodeFrameRange(config, startTime, endTime, fps);
		} catch (error) {
			console.warn(
				`[RustMediaProcessor] decodeFrameRange failed:`,
				error instanceof Error ? error.message : error
			);
			return null;
		}
	}

	/**
	 * 应用 GPU 特效
	 *
	 * @param frame 输入帧（必须是 RGBA 格式）
	 * @param params 特效参数
	 * @returns 处理后的帧或 null
	 */
	applyEffects(frame: FrameData, params: EffectParams): FrameData | null {
		if (!this.processor || this.disposed) {
			return null;
		}

		try {
			return this.processor.applyEffects(frame, params);
		} catch (error) {
			console.warn(
				`[RustMediaProcessor] applyEffects failed:`,
				error instanceof Error ? error.message : error
			);
			return null;
		}
	}

	/**
	 * 解码并处理帧（一步完成）
	 *
	 * @param videoPath 视频文件路径
	 * @param timeInSeconds 时间点（秒）
	 * @param params 特效参数（可选）
	 * @returns 处理后的帧或 null
	 */
	processFrame(
		videoPath: string,
		timeInSeconds: number,
		params?: EffectParams
	): FrameData | null {
		if (!this.processor || this.disposed) {
			return null;
		}

		try {
			// Use recommended hardware decoder if available
			const hwAccel = this.hwAccelInfo?.recommendedDecoder;

			const config: DecoderConfig = {
				path: videoPath,
				outputFormat: 'rgba',
				hwAccel: hwAccel && hwAccel !== 'none' ? hwAccel : undefined,
			};

			return this.processor.processFrame(config, timeInSeconds, params);
		} catch (error) {
			console.warn(
				`[RustMediaProcessor] processFrame failed:`,
				error instanceof Error ? error.message : error
			);
			return null;
		}
	}

	/**
	 * 检查 GPU 合成器是否可用
	 */
	isCompositorAvailable(): boolean {
		return this.compositorSession !== null && !this.disposed;
	}

	/**
	 * GPU 多层合成
	 *
	 * @param layers 合成层数组（包含 RGBA Buffer + transform + opacity + blendMode）
	 * @param outputWidth 输出宽度
	 * @param outputHeight 输出高度
	 * @param backgroundColor 背景色 [r, g, b, a]，范围 0-1
	 * @returns 合成结果
	 */
	composite(
		layers: CompositeLayer[],
		outputWidth: number,
		outputHeight: number,
		backgroundColor?: [number, number, number, number]
	): CompositeResult {
		if (!this.compositorSession) {
			throw new Error('CompositorSession not available');
		}

		if (this.disposed) {
			throw new Error('RustMediaProcessorService is disposed');
		}

		return this.compositorSession.composite(
			layers,
			outputWidth,
			outputHeight,
			backgroundColor
		);
	}

	/**
	 * 将 RGBA 帧数据转换为 JPEG Buffer
	 * 使用 Rust N-API (ffmpeg MJPEG 编码器) 替代 sharp
	 *
	 * @param frame RGBA 帧数据
	 * @param quality JPEG 质量 (2-31, 越低越好, 默认 3)
	 */
	encodeJpeg(frame: FrameData, quality: number = 3): Buffer | null {
		if (frame.format !== 'rgba') {
			console.warn('[RustMediaProcessor] encodeJpeg requires RGBA format');
			return null;
		}

		if (!this.addon || this.disposed) {
			return null;
		}

		try {
			return this.addon.encodeJpeg(frame.data, frame.width, frame.height, quality);
		} catch (error) {
			console.warn(
				'[RustMediaProcessor] encodeJpeg failed:',
				error instanceof Error ? error.message : error
			);
			return null;
		}
	}

	/**
	 * 将 RGBA 帧数据转换为 JPEG Buffer (兼容旧接口)
	 * @deprecated 使用 encodeJpeg 替代
	 */
	async frameToJpeg(frame: FrameData, quality: number = 80): Promise<Buffer | null> {
		// Convert quality from 0-100 scale to 2-31 scale (ffmpeg qscale)
		// 100 -> 2, 0 -> 31
		const ffmpegQuality = Math.round(2 + (100 - quality) * 29 / 100);
		return this.encodeJpeg(frame, ffmpegQuality);
	}

	// =========================================================================
	// Video Encoder Methods (ffmpeg-next)
	// =========================================================================

	/**
	 * 创建视频编码器会话
	 *
	 * 使用 ffmpeg-next 进行视频编码，支持硬件加速
	 *
	 * @param config 编码器配置
	 * @returns VideoEncoderSession 或 null
	 */
	createVideoEncoder(config: {
		width: number;
		height: number;
		fps: number;
		bitrate?: number;
		codec?: string;
		preset?: string;
		profile?: string;
		pixelFormat?: string;
		hwEncoder?: string;
	}): VideoEncoderSession | null {
		if (!this.processor || this.disposed) {
			return null;
		}

		try {
			const encoderConfig: VideoEncoderConfig = {
				width: config.width,
				height: config.height,
				fps: config.fps,
				bitrate: config.bitrate,
				codec: config.codec ?? 'h264',
				preset: config.preset ?? 'fast',
				profile: config.profile ?? 'main',
				pixelFormat: config.pixelFormat ?? 'nv12',
				hwEncoder: config.hwEncoder ?? 'auto',
			};

			return this.processor.createVideoEncoder(encoderConfig);
		} catch (error) {
			console.error(
				'[RustMediaProcessor] createVideoEncoder failed:',
				error instanceof Error ? error.message : error
			);
			return null;
		}
	}

	/**
	 * 创建预览编码器（H.264 低延迟）
	 *
	 * @param width 宽度
	 * @param height 高度
	 * @param fps 帧率
	 * @param bitrate 比特率（默认 2Mbps）
	 */
	createPreviewEncoder(
		width: number,
		height: number,
		fps: number,
		bitrate: number = 2_000_000
	): VideoEncoderSession | null {
		return this.createVideoEncoder({
			width,
			height,
			fps,
			bitrate,
			codec: 'h264',
			preset: 'ultrafast', // 低延迟
			profile: 'baseline', // 兼容性好
			pixelFormat: 'nv12',
			hwEncoder: 'auto',
		});
	}

	/**
	 * 创建导出编码器
	 *
	 * @param config 导出配置
	 */
	createExportEncoder(config: {
		width: number;
		height: number;
		fps: number;
		bitrate: number;
		codec: string;
		preset?: string;
		profile?: string;
		hwEncoder?: string;
	}): VideoEncoderSession | null {
		return this.createVideoEncoder({
			...config,
			pixelFormat: 'nv12',
			hwEncoder: config.hwEncoder ?? 'auto',
		});
	}

	// =========================================================================
	// GPU Format Conversion Methods
	// =========================================================================

	/**
	 * 将 RGBA 帧转换为 NV12 格式（GPU 加速）
	 *
	 * 使用 wgpu compute shader 进行 GPU 加速的颜色空间转换，
	 * 适用于硬件编码器输入。
	 *
	 * @param frame RGBA 帧数据
	 * @param colorSpace 颜色空间：0 = BT.601, 1 = BT.709 (默认), 2 = BT.2020
	 * @returns NV12 帧数据或 null
	 */
	rgbaToNv12(frame: FrameData, colorSpace: number = 1): FrameData | null {
		if (!this.processor || this.disposed) {
			return null;
		}

		try {
			return this.processor.rgbaToNv12(frame, colorSpace);
		} catch (error) {
			console.warn(
				`[RustMediaProcessor] rgbaToNv12 failed:`,
				error instanceof Error ? error.message : error
			);
			return null;
		}
	}

	// =========================================================================
	// Media Service Methods (替代 FFmpegService)
	// =========================================================================

	/**
	 * 探测媒体文件信息
	 *
	 * @param videoPath 视频文件路径
	 * @returns MediaInfo 或 null（如果失败）
	 */
	probeMediaInfo(videoPath: string): MediaInfo | null {
		if (!this.addon || this.disposed) {
			return null;
		}

		try {
			const info = this.addon.probeMedia(videoPath);
			return {
				duration: info.duration,
				width: info.width,
				height: info.height,
				fps: info.fps,
				codec: info.codec,
				format: info.format,
				bitrate: info.bitrate ?? undefined,
				hasAudio: info.hasAudio,
				audioCodec: info.audioCodec,
				audioSampleRate: info.audioSampleRate,
				audioChannels: info.audioChannels,
				audioBitrate: info.audioBitrate ?? undefined,
				hasSubtitles: info.hasSubtitles,
				subtitleStreams: info.subtitleStreams.map((s) => ({
					index: s.index,
					codec: s.codec,
					language: s.language,
					title: s.title,
					isDefault: s.isDefault,
					isForced: s.isForced,
				})),
			};
		} catch (error) {
			console.warn(
				`[RustMediaProcessor] probeMediaInfo failed:`,
				error instanceof Error ? error.message : error
			);
			return null;
		}
	}

	/**
	 * 提取单帧视频（返回 JPEG Buffer）
	 *
	 * 使用 GPU decodeFrame + encodeJpeg 实现
	 *
	 * @param videoPath 视频文件路径
	 * @param timeSeconds 时间点（秒）
	 * @param quality JPEG 质量（2-31，越低越好，默认 3）
	 * @param _scale 缩放比例（已弃用，保留参数兼容性）
	 * @returns JPEG Buffer 或 null
	 */
	extractVideoFrame(
		videoPath: string,
		timeSeconds: number,
		quality: number = 3,
		_scale: number = 1.0
	): Buffer | null {
		if (!this.processor || this.disposed) {
			return null;
		}

		try {
			// Decode frame to RGBA using GPU
			const frame = this.decodeFrame(videoPath, timeSeconds, 'rgba');
			if (!frame) {
				return null;
			}

			// Encode RGBA to JPEG
			return this.encodeJpeg(frame, quality);
		} catch (error) {
			console.warn(
				`[RustMediaProcessor] extractVideoFrame failed:`,
				error instanceof Error ? error.message : error
			);
			return null;
		}
	}

	/**
	 * 提取帧范围（返回 JPEG Buffer 数组）
	 *
	 * 使用 GPU decodeFrameRange + encodeJpeg 实现
	 *
	 * @param videoPath 视频文件路径
	 * @param startTime 开始时间（秒）
	 * @param duration 持续时间（秒）
	 * @param fps 目标帧率
	 * @param quality JPEG 质量（2-31，越低越好，默认 3）
	 * @param _scale 缩放比例（已弃用，保留参数兼容性）
	 * @returns 帧数据数组或 null
	 */
	extractFrameRange(
		videoPath: string,
		startTime: number,
		duration: number,
		fps: number,
		quality: number = 3,
		_scale: number = 1.0
	): Array<{ time: number; buffer: Buffer }> | null {
		if (!this.processor || this.disposed) {
			return null;
		}

		try {
			// Decode frames using GPU
			const endTime = startTime + duration;
			const frames = this.decodeFrameRange(videoPath, startTime, endTime, fps);
			if (!frames || frames.length === 0) {
				return null;
			}

			// Encode each frame to JPEG
			const result: Array<{ time: number; buffer: Buffer }> = [];
			for (const frame of frames) {
				const jpegBuffer = this.encodeJpeg(frame, quality);
				if (jpegBuffer) {
					result.push({
						time: frame.timestamp,
						buffer: jpegBuffer,
					});
				}
			}

			return result.length > 0 ? result : null;
		} catch (error) {
			console.warn(
				`[RustMediaProcessor] extractFrameRange failed:`,
				error instanceof Error ? error.message : error
			);
			return null;
		}
	}

	/**
	 * 提取所有字幕轨道
	 *
	 * @param videoPath 视频文件路径
	 * @returns 字幕轨道数组或 null
	 */
	extractAllSubtitles(videoPath: string): ExtractedSubtitleTrack[] | null {
		if (!this.addon || this.disposed) {
			return null;
		}

		try {
			const tracks = this.addon.extractAllSubtitles(videoPath);
			return tracks.map((track) => ({
				streamIndex: track.streamIndex,
				language: track.language,
				title: track.title,
				isDefault: track.isDefault,
				cues: track.cues.map((cue) => ({
					id: cue.id,
					startTime: cue.startTime,
					endTime: cue.endTime,
					text: cue.text,
				})),
			}));
		} catch (error) {
			console.warn(
				`[RustMediaProcessor] extractAllSubtitles failed:`,
				error instanceof Error ? error.message : error
			);
			return null;
		}
	}

	/**
	 * 释放资源
	 */
	async dispose(): Promise<void> {
		if (this.disposed) {
			return;
		}

		this.disposed = true;

		if (this.processor) {
			try {
				this.processor.dispose();
			} catch {
				// Ignore dispose errors
			}
			this.processor = null;
		}

		// CompositorSession doesn't have a dispose method, just null it
		this.compositorSession = null;
		this.addon = null;

		this.gpuInfo = null;
		this.hwAccelInfo = null;
	}
}
