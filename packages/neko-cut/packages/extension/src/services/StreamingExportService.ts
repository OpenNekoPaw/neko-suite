/**
 * StreamingExportService - 流式视频导出服务
 *
 * 重构后架构：使用 SharedRenderPipeline + ExportOutputAdapter
 *
 * 职责：
 * - 使用共享渲染管线在 Extension 端渲染帧
 * - 使用 ExportOutputAdapter 进行编码和输出
 * - 背压控制防止内存溢出
 * - 发送导出进度通知到 Webview
 *
 * 架构（符合 docs/video-editor-principles.md）：
 * ```
 * SharedRenderPipeline (渲染) → ExportOutputAdapter (编码) → 文件
 * ```
 *
 * 设计原则（SOLID）：
 * - 单一职责 (S)：仅负责导出流程编排
 * - 开闭原则 (O)：通过配置支持多种编码器
 * - 依赖倒置 (D)：依赖 IRenderPipeline 和 IOutputAdapter 接口
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import {
	ExportBackpressureController,
	createBackpressureController,
} from './ExportBackpressureController';
import { getAudioCompositionService } from './AudioCompositionService';
import type {
	StreamingExportSettings,
	StreamingExportJobStatus,
	StreamingAudioTrack,
	BackpressureStatus,
	ExportJobState,
	VideoCodec,
	AudioCodec,
	VideoSourceInfo,
	StreamingExportJobState,
} from '@neko/shared';
import { DEFAULT_STREAMING_EXPORT_SETTINGS } from '@neko/shared';
import {
	SharedRenderPipeline,
	ExportOutputAdapter,
	createExportOutputAdapter,
	type CompositeLayerConfig,
} from './renderPipeline';

// =============================================================================
// Types
// =============================================================================

// Rust N-API types
type ExportPipelineSession = import('@neko/native-napi').ExportPipelineSession;
type MuxerSession = import('@neko/native-napi').MuxerSession;
type AudioDecoderSession = import('@neko/native-napi').AudioDecoderSession;
type AudioEncoderSession = import('@neko/native-napi').AudioEncoderSession;
type JsPipelineConfig = import('@neko/native-napi').JsPipelineConfig;
type JsPipelineFrame = import('@neko/native-napi').JsPipelineFrame;
type JsPipelineProgress = import('@neko/native-napi').JsPipelineProgress;
type JsEncoderConfig = import('@neko/native-napi').JsEncoderConfig;
type JsCompositeLayer = import('@neko/native-napi').JsCompositeLayer;

/**
 * 流式导出初始化参数
 */
export interface StreamingExportInitParams {
	/** 输出文件路径 */
	outputPath: string;
	/** 导出设置 */
	settings: StreamingExportSettings;
	/** 总帧数 */
	totalFrames: number;
	/** 音频轨道 */
	audioTracks?: StreamingAudioTrack[];
	/** 视频源信息（用于流式解码） */
	videoSources?: VideoSourceInfo[];
	/** 进度回调 */
	onProgress?: (status: StreamingExportJobStatus) => void;
	/** 共享渲染管线（用于 Compat 模式，在 Extension 端渲染） */
	renderPipeline?: SharedRenderPipeline;
	/** 合成层配置（用于 Compat 模式） */
	compositeLayers?: CompositeLayerConfig[];
	/** 是否使用 Compat 模式（Extension 端渲染） */
	useCompatMode?: boolean;
}

/**
 * 活动流式导出任务
 */
interface ActiveStreamingExport {
	jobId: string;
	params: StreamingExportInitParams;
	pipeline: ExportPipelineSession | null;
	state: StreamingExportJobState;
	backpressure: ExportBackpressureController;

	// Render pipeline and output adapter (for Compat mode)
	renderPipeline: SharedRenderPipeline | null;
	exportAdapter: ExportOutputAdapter | null;

	// Frame tracking
	receivedFrames: number;
	encodedFrames: number;
	totalFrames: number;

	// Timing
	startTime: number;
	lastProgressUpdate: number;

	// Temp files for audio muxing
	tempVideoPath: string;
	tempDir: string;

	// Control flags
	cancelled: boolean;
	finalized: boolean;

	// Export mode
	useCompatMode: boolean;

	// Performance stats
	perfStats: {
		totalWriteTime: number;
		totalBackpressureWaitTime: number;
		totalDrainWaitTime: number;
		frameSizes: number[];
		writeStartTimes: Map<number, number>;
	};
}

// =============================================================================
// Codec Mapping (Rust N-API compatible)
// =============================================================================

/**
 * 检测硬件加速支持
 */
async function detectHwAccel(): Promise<string | null> {
	const platform = os.platform();

	// macOS: VideoToolbox
	if (platform === 'darwin') {
		return 'videotoolbox';
	}

	// TODO(P2): Detect NVENC, VAAPI, QSV on other platforms

	return null;
}

/**
 * 映射视频编码器到 Rust N-API 格式
 */
function mapVideoCodecToRust(
	codec: VideoCodec | undefined,
	format: string,
	hwAccel: string | null
): string {
	// Rust N-API codec names: "h264", "h265", "vp9", "prores"
	if (codec === 'h264' || !codec) return 'h264';
	if (codec === 'h265') return 'h265';
	if (codec === 'vp9') return 'vp9';
	if (codec === 'av1') return 'h264'; // Fallback to h264 for av1

	// Default based on format
	if (format === 'webm') return 'vp9';
	return 'h264';
}

/**
 * 映射硬件编码器到 Rust N-API 格式
 */
function mapHwEncoderToRust(hwAccel: string | null): string {
	if (!hwAccel) return 'none';
	if (hwAccel === 'videotoolbox') return 'videotoolbox';
	if (hwAccel === 'nvenc') return 'nvenc';
	if (hwAccel === 'vaapi') return 'vaapi';
	if (hwAccel === 'qsv') return 'qsv';
	return 'auto';
}

/**
 * 映射编码预设到 Rust N-API 格式
 */
function mapPresetToRust(quality: string): string {
	// Rust N-API presets: "ultrafast", "fast", "medium", "slow", "veryslow"
	switch (quality) {
		case 'low':
			return 'fast';
		case 'medium':
			return 'medium';
		case 'high':
			return 'slow';
		default:
			return 'medium';
	}
}

/**
 * 映射音频编码器
 */
function mapAudioCodec(codec: AudioCodec | undefined, format: string): string {
	if (codec === 'aac') return 'aac';
	if (codec === 'opus') return 'opus';
	if (codec === 'mp3') return 'mp3';

	if (format === 'webm') return 'opus';
	return 'aac';
}

/**
 * 计算目标比特率
 */
function calculateBitrate(width: number, height: number, fps: number, quality: string): number {
	const pixels = width * height;

	// Base bitrate calculation (bits per pixel)
	// High quality: 0.15 bpp, Medium: 0.10 bpp, Low: 0.07 bpp
	const bitsPerPixel = quality === 'high' ? 0.15 : quality === 'medium' ? 0.10 : 0.07;

	// Calculate bitrate: pixels * fps * bpp (to get bps)
	const bitrate = pixels * fps * bitsPerPixel;

	// Ensure minimum bitrate for encoder stability
	const minBitrate = 500000; // 500 kbps minimum
	const maxBitrate = 50000000; // 50 Mbps maximum

	return Math.round(Math.max(minBitrate, Math.min(maxBitrate, bitrate)));
}

// =============================================================================
// StreamingExportService
// =============================================================================

/**
 * 流式导出服务（使用 Rust N-API）
 */
export class StreamingExportService {
	private hwAccel: string | null = null;
	private audioCompositionService = getAudioCompositionService();
	private activeExports = new Map<string, ActiveStreamingExport>();

	constructor() {
		this.initHwAccel();
	}

	private async initHwAccel(): Promise<void> {
		this.hwAccel = await detectHwAccel();
	}

	// ===========================================================================
	// Public API - Export Lifecycle
	// ===========================================================================

	/**
	 * 初始化流式导出
	 *
	 * @returns jobId
	 */
	async initExport(params: StreamingExportInitParams): Promise<string> {
		// CRITICAL: Enforce single concurrent export limit
		const MAX_CONCURRENT_EXPORTS = 1;
		if (this.activeExports.size >= MAX_CONCURRENT_EXPORTS) {
			const existingJobId = this.getActiveExportJobId();
			throw new Error(
				`已有导出任务正在进行中 (Job ID: ${existingJobId})。` +
				`请等待当前导出完成或取消后再试。`
			);
		}

		const jobId = `stream-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		const useCompatMode = params.useCompatMode ?? false;

		// Create temp directory
		const tempDir = path.join(os.tmpdir(), `neko-stream-${jobId}`);
		fs.mkdirSync(tempDir, { recursive: true });

		// Temp video path (for audio muxing later)
		const tempVideoPath = path.join(tempDir, 'video_only.mp4');

		// Create backpressure controller
		const backpressure = createBackpressureController({
			maxPendingFrames: params.settings.maxPendingFrames,
		});

		// Create active export record
		const activeExport: ActiveStreamingExport = {
			jobId,
			params,
			pipeline: null,
			state: 'initializing',
			backpressure,
			renderPipeline: params.renderPipeline ?? null,
			exportAdapter: null,
			receivedFrames: 0,
			encodedFrames: 0,
			totalFrames: params.totalFrames,
			startTime: Date.now(),
			lastProgressUpdate: Date.now(),
			tempVideoPath,
			tempDir,
			cancelled: false,
			finalized: false,
			useCompatMode,
			perfStats: {
				totalWriteTime: 0,
				totalBackpressureWaitTime: 0,
				totalDrainWaitTime: 0,
				frameSizes: [],
				writeStartTimes: new Map(),
			},
		};

		this.activeExports.set(jobId, activeExport);

		// Start export pipeline
		try {
			if (useCompatMode && activeExport.renderPipeline) {
				// Compat mode: use SharedRenderPipeline + ExportOutputAdapter
				await this.startCompatExportPipeline(activeExport);
			} else {
				// Standard mode: use Rust N-API export pipeline
				await this.startExportPipeline(activeExport);
			}
			activeExport.state = 'streaming';
			this.sendProgress(activeExport);
		} catch (error) {
			activeExport.state = 'error';
			this.sendProgress(activeExport, error instanceof Error ? error.message : 'Failed to start encoder');
			throw error;
		}

		return jobId;
	}

	/**
	 * 推送帧数据
	 *
	 * @param jobId 任务 ID
	 * @param frameData 帧数据（RGBA 或 JPEG 格式）
	 * @param frameIndex 帧索引
	 * @returns 背压状态
	 */
	async pushFrame(
		jobId: string,
		frameData: Buffer,
		frameIndex: number
	): Promise<BackpressureStatus> {
		const perfStart = Date.now(); // Track total push time
		const activeExport = this.activeExports.get(jobId);
		if (!activeExport) {
			throw new Error(`Export job ${jobId} not found`);
		}

		if (activeExport.cancelled) {
			throw new Error(`Export job ${jobId} was cancelled`);
		}

		if (!activeExport.pipeline) {
			throw new Error(`Export pipeline not ready for job ${jobId}`);
		}

		// Track frame size for stats
		activeExport.perfStats.frameSizes.push(frameData.length);

		// Wait for backpressure capacity
		const backpressureStart = Date.now();
		const hasCapacity = await activeExport.backpressure.waitForCapacity();
		const backpressureWaitTime = Date.now() - backpressureStart;
		activeExport.perfStats.totalBackpressureWaitTime += backpressureWaitTime;

		if (!hasCapacity) {
			throw new Error(`Backpressure timeout for job ${jobId}`);
		}

		// Submit frame to Rust N-API pipeline
		const writeStart = Date.now();
		const { settings } = activeExport.params;

		// Create pipeline frame
		// For JPEG input, we need to decode first (handled by pipeline internally if needed)
		// For RGBA input, we can submit directly
		const pipelineFrame: JsPipelineFrame = {
			index: frameIndex,
			pts: frameIndex * (1000000 / settings.fps), // PTS in microseconds
			layers: [{
				data: frameData,
				width: settings.width,
				height: settings.height,
				pixelFormat: settings.frameFormat === 'jpeg' ? 'rgba' : (settings.frameFormat === 'rgba' ? 'rgba' : 'rgba'),
				opacity: 1.0,
				zIndex: 0,
			}],
			outputWidth: settings.width,
			outputHeight: settings.height,
			backgroundColor: [0, 0, 0, 1], // Black background
		};

		activeExport.pipeline.submitFrame(pipelineFrame);
		const writeTime = Date.now() - writeStart;
		activeExport.perfStats.totalWriteTime += writeTime;

		// Track frame sent (increases pending count)
		activeExport.receivedFrames++;
		activeExport.backpressure.onFrameSent();

		const totalPushTime = Date.now() - perfStart;

		// Detailed per-frame performance logging (every 30 frames to avoid spam)
		if (frameIndex % 30 === 0 || frameIndex < 5) {
			const backpressureStatus = activeExport.backpressure.getStatus();
			const encodingStats = activeExport.backpressure.getEncodingStats();
			const avgFrameSize = activeExport.perfStats.frameSizes.length > 0
				? activeExport.perfStats.frameSizes.reduce((a, b) => a + b, 0) / activeExport.perfStats.frameSizes.length
				: 0;

			// Get pipeline progress
			const pipelineProgress = activeExport.pipeline.getProgress();

			console.log(
				`[ExportPerf:Ext:Detail] Frame ${frameIndex}/${activeExport.totalFrames} | ` +
				`PushTime: ${totalPushTime}ms ` +
				`(Backpressure: ${backpressureWaitTime}ms, Write: ${writeTime}ms) | ` +
				`FrameSize: ${(frameData.length / 1024).toFixed(1)}KB | ` +
				`Pending: ${backpressureStatus.pendingFrames} | ` +
				`Pipeline: ${pipelineProgress.framesEncoded}/${pipelineProgress.framesSubmitted} encoded`
			);
		}

		// Mark frame as processed for backpressure control
		activeExport.backpressure.onFrameEncoded();

		// Update encoded frames from pipeline progress
		const progress = activeExport.pipeline.getProgress();
		activeExport.encodedFrames = progress.framesEncoded;

		// Get current status after the frame is submitted
		const status = activeExport.backpressure.getStatus();

		// Log performance stats every 30 frames
		if (activeExport.receivedFrames > 0 && activeExport.receivedFrames % 30 === 0) {
			const { perfStats } = activeExport;
			const avgFrameSize = perfStats.frameSizes.reduce((a, b) => a + b, 0) / perfStats.frameSizes.length;
			const encodingStats = activeExport.backpressure.getEncodingStats();
			console.log(
				`[ExportPerf:Ext] Frame ${activeExport.receivedFrames}/${activeExport.totalFrames} | ` +
				`Encoded: ${encodingStats.totalEncoded} | ` +
				`Pending: ${activeExport.backpressure.getPendingFrames()} | ` +
				`BackpressureWait: ${perfStats.totalBackpressureWaitTime}ms | ` +
				`WriteTime: ${perfStats.totalWriteTime}ms | ` +
				`AvgFrameSize: ${(avgFrameSize / 1024).toFixed(0)}KB | ` +
				`EncodingFPS: ${encodingStats.encodingFps.toFixed(1)}`
			);
		}

		// Update progress periodically
		if (Date.now() - activeExport.lastProgressUpdate > 500) {
			this.sendProgress(activeExport);
			activeExport.lastProgressUpdate = Date.now();
		}

		return status;
	}

	/**
	 * 完成流式导出
	 *
	 * 等待 pipeline 完成，然后 mux 音频
	 */
	async finalizeExport(jobId: string): Promise<{ outputPath: string; fileSize: number }> {
		const activeExport = this.activeExports.get(jobId);
		if (!activeExport) {
			throw new Error(`Export job ${jobId} not found`);
		}

		if (activeExport.finalized) {
			throw new Error(`Export job ${jobId} already finalized`);
		}

		activeExport.finalized = true;
		activeExport.state = 'encoding';
		this.sendProgress(activeExport);

		// Log final performance stats
		const { perfStats } = activeExport;
		const avgFrameSize = perfStats.frameSizes.length > 0
			? perfStats.frameSizes.reduce((a, b) => a + b, 0) / perfStats.frameSizes.length
			: 0;
		const totalDataSize = perfStats.frameSizes.reduce((a, b) => a + b, 0);
		const totalTime = Date.now() - activeExport.startTime;

		console.log(
			`\n[ExportPerf:Ext] ===== STREAMING PHASE COMPLETE =====\n` +
			`  Total frames received: ${activeExport.receivedFrames}\n` +
			`  Total data transferred: ${(totalDataSize / 1024 / 1024).toFixed(2)}MB\n` +
			`  Avg frame size: ${(avgFrameSize / 1024).toFixed(0)}KB\n` +
			`  Total time so far: ${(totalTime / 1000).toFixed(2)}s\n` +
			`  ---\n` +
			`  Backpressure wait: ${(perfStats.totalBackpressureWaitTime / 1000).toFixed(2)}s (${((perfStats.totalBackpressureWaitTime / totalTime) * 100).toFixed(1)}%)\n` +
			`  Write time: ${(perfStats.totalWriteTime / 1000).toFixed(2)}s (${((perfStats.totalWriteTime / totalTime) * 100).toFixed(1)}%)\n`
		);

		// Finalize based on export mode
		const encodeStartTime = Date.now();
		if (activeExport.useCompatMode && activeExport.exportAdapter) {
			// Compat mode: finalize export adapter
			await activeExport.exportAdapter.finalize();
		} else if (activeExport.pipeline) {
			// Standard mode: finalize Rust N-API pipeline
			await activeExport.pipeline.finalize();
		}

		const encodeTime = Date.now() - encodeStartTime;
		console.log(`[ExportPerf:Ext] Pipeline finalized in ${(encodeTime / 1000).toFixed(2)}s`);

		// Mux with audio if needed (only for standard mode, Compat mode handles this in adapter)
		activeExport.state = 'muxing';
		this.sendProgress(activeExport);

		const { outputPath, settings, audioTracks } = activeExport.params;

		const muxStartTime = Date.now();
		if (!activeExport.useCompatMode) {
			if (audioTracks && audioTracks.length > 0) {
				await this.muxWithAudio(activeExport);
			} else {
				// Just rename temp video to final output
				if (fs.existsSync(activeExport.tempVideoPath)) {
					fs.renameSync(activeExport.tempVideoPath, outputPath);
				}
			}
		}
		const muxTime = Date.now() - muxStartTime;
		console.log(`[ExportPerf:Ext] Audio muxing completed in ${(muxTime / 1000).toFixed(2)}s`);

		// Get file size
		const stats = fs.statSync(outputPath);

		// Mark complete
		activeExport.state = 'completed';
		this.sendProgress(activeExport);

		// Final summary
		const finalTotalTime = Date.now() - activeExport.startTime;
		console.log(
			`\n[ExportPerf:Ext] ===== EXPORT COMPLETE =====\n` +
			`  Output: ${outputPath}\n` +
			`  File size: ${(stats.size / 1024 / 1024).toFixed(2)}MB\n` +
			`  Total time: ${(finalTotalTime / 1000).toFixed(2)}s\n` +
			`  ---\n` +
			`  Streaming phase: ${(totalTime / 1000).toFixed(2)}s\n` +
			`  Encoding finalize: ${(encodeTime / 1000).toFixed(2)}s\n` +
			`  Audio muxing: ${(muxTime / 1000).toFixed(2)}s\n` +
			`  ---\n` +
			`  Compression ratio: ${((totalDataSize / stats.size) || 1).toFixed(1)}x\n` +
			`  Avg FPS: ${(activeExport.receivedFrames / (finalTotalTime / 1000)).toFixed(1)}\n`
		);

		// Cleanup
		setTimeout(() => this.cleanup(activeExport), 5000);

		return {
			outputPath,
			fileSize: stats.size,
		};
	}

	/**
	 * 取消导出
	 */
	cancelExport(jobId: string): boolean {
		const activeExport = this.activeExports.get(jobId);
		if (!activeExport) {
			return false;
		}

		activeExport.cancelled = true;
		activeExport.state = 'cancelled';

		// Cancel Rust N-API pipeline
		if (activeExport.pipeline) {
			activeExport.pipeline.cancel();
		}

		// Dispose backpressure controller
		activeExport.backpressure.dispose();

		this.cleanup(activeExport);
		return true;
	}

	/**
	 * 获取导出状态
	 */
	getExportStatus(jobId: string): StreamingExportJobStatus | null {
		const activeExport = this.activeExports.get(jobId);
		if (!activeExport) {
			return null;
		}

		const elapsed = Date.now() - activeExport.startTime;
		const progress = (activeExport.receivedFrames / activeExport.totalFrames) * 100;

		const estimatedRemaining =
			activeExport.receivedFrames > 0
				? (elapsed / activeExport.receivedFrames) *
				  (activeExport.totalFrames - activeExport.receivedFrames)
				: undefined;

		const backpressureStatus = activeExport.backpressure.getStatus();
		const encodingStats = activeExport.backpressure.getEncodingStats();

		// Get pipeline progress if available
		let pipelineEncodedFrames = activeExport.encodedFrames;
		if (activeExport.pipeline) {
			const pipelineProgress = activeExport.pipeline.getProgress();
			pipelineEncodedFrames = pipelineProgress.framesEncoded;
		}

		return {
			jobId: activeExport.jobId,
			state: activeExport.state as ExportJobState,
			progress,
			currentFrame: activeExport.receivedFrames,
			totalFrames: activeExport.totalFrames,
			elapsedTime: elapsed,
			estimatedRemaining,
			streaming: {
				receivedFrames: activeExport.receivedFrames,
				encodedFrames: pipelineEncodedFrames,
				bufferedFrames: backpressureStatus.pendingFrames,
				backpressure: backpressureStatus,
				encodingFps: encodingStats.encodingFps,
				renderingFps: this.calculateRenderingFps(activeExport),
			},
		};
	}

	/**
	 * 获取编码器信息
	 */
	getEncoderInfo(): { hwAccel: string | null } {
		return { hwAccel: this.hwAccel };
	}

	// ===========================================================================
	// Private Methods
	// ===========================================================================

	/**
	 * 启动 Rust N-API 导出 pipeline
	 */
	private async startExportPipeline(activeExport: ActiveStreamingExport): Promise<void> {
		const { settings, totalFrames } = activeExport.params;

		// Build encoder config
		const encoderConfig: JsEncoderConfig = {
			width: settings.width,
			height: settings.height,
			fps: settings.fps,
			bitrate: calculateBitrate(settings.width, settings.height, settings.fps, settings.quality),
			codec: mapVideoCodecToRust(settings.videoCodec, settings.format, this.hwAccel),
			preset: mapPresetToRust(settings.quality),
			profile: 'main',
			pixelFormat: 'rgba', // Input format from Webview
			hwEncoder: settings.hardwareAccel ? mapHwEncoderToRust(this.hwAccel) : 'none',
		};

		// Build pipeline config
		const pipelineConfig: JsPipelineConfig = {
			outputPath: activeExport.tempVideoPath,
			container: settings.format === 'webm' ? 'webm' : 'mp4',
			encoderConfig,
			composeBufferSize: 3,
			encodeBufferSize: 4,
			muxBufferSize: 8,
			totalFrames,
		};

		console.log('[StreamingExportService] Pipeline config:', JSON.stringify(pipelineConfig, null, 2));

		// Create pipeline using Rust N-API
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const { ExportPipelineSession } = require('@neko/native-napi');
		activeExport.pipeline = await ExportPipelineSession.create(pipelineConfig);

		console.log('[StreamingExportService] Export pipeline started');
	}

	/**
	 * 启动 Compat 模式导出 pipeline
	 * 使用 SharedRenderPipeline + ExportOutputAdapter
	 */
	private async startCompatExportPipeline(activeExport: ActiveStreamingExport): Promise<void> {
		const { settings, totalFrames, compositeLayers, outputPath } = activeExport.params;

		if (!activeExport.renderPipeline) {
			throw new Error('Compat mode requires a render pipeline');
		}

		// Configure render pipeline
		activeExport.renderPipeline.setConfig({
			outputWidth: settings.width,
			outputHeight: settings.height,
			fps: settings.fps,
			backgroundColor: [0, 0, 0, 255],
		});

		if (compositeLayers) {
			activeExport.renderPipeline.setCompositeLayers(compositeLayers);
		}

		// Create export output adapter
		activeExport.exportAdapter = createExportOutputAdapter();

		// Initialize export adapter
		await activeExport.exportAdapter.initialize(outputPath, {
			videoCodec: mapVideoCodecToRust(settings.videoCodec, settings.format, this.hwAccel),
			audioCodec: mapAudioCodec(settings.audioCodec, settings.format),
			videoBitrate: calculateBitrate(settings.width, settings.height, settings.fps, settings.quality),
			audioBitrate: (settings.audioBitrate ?? 192) * 1000,
			fps: settings.fps,
			width: settings.width,
			height: settings.height,
			totalFrames,
			format: settings.format === 'webm' ? 'webm' : 'mp4',
			hardwareAccel: settings.hardwareAccel,
			preset: mapPresetToRust(settings.quality),
		});

		console.log('[StreamingExportService] Compat export pipeline started');

		// Start the render loop in background
		this.runCompatExportLoop(activeExport).catch(error => {
			console.error('[StreamingExportService] Compat export loop failed:', error);
			activeExport.state = 'error';
			this.sendProgress(activeExport, error instanceof Error ? error.message : 'Export failed');
		});
	}

	/**
	 * 运行 Compat 模式导出循环
	 * 在 Extension 端渲染所有帧并编码
	 */
	private async runCompatExportLoop(activeExport: ActiveStreamingExport): Promise<void> {
		const { settings, totalFrames } = activeExport.params;
		const { renderPipeline, exportAdapter } = activeExport;

		if (!renderPipeline || !exportAdapter) {
			throw new Error('Render pipeline or export adapter not initialized');
		}

		const frameInterval = 1 / settings.fps;

		for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
			if (activeExport.cancelled) {
				console.log('[StreamingExportService] Compat export cancelled');
				break;
			}

			const timestamp = frameIndex * frameInterval;

			// Render frame using shared pipeline
			const frame = await renderPipeline.processFrame(timestamp);
			if (!frame) {
				console.warn(`[StreamingExportService] Failed to render frame ${frameIndex}`);
				continue;
			}

			// Output frame using export adapter
			await exportAdapter.outputVideo(frame);

			activeExport.receivedFrames = frameIndex + 1;
			activeExport.encodedFrames = exportAdapter.getFramesSubmitted();

			// Update progress periodically
			if (Date.now() - activeExport.lastProgressUpdate > 500) {
				this.sendProgress(activeExport);
				activeExport.lastProgressUpdate = Date.now();
			}
		}

		// Mark as ready for finalization
		if (!activeExport.cancelled) {
			activeExport.state = 'encoding';
			this.sendProgress(activeExport);
		}
	}

	/**
	 * 与音频合成（使用 Rust N-API MuxerSession）
	 */
	private async muxWithAudio(activeExport: ActiveStreamingExport): Promise<void> {
		const { outputPath, settings, audioTracks } = activeExport.params;

		if (!audioTracks || audioTracks.length === 0) {
			fs.renameSync(activeExport.tempVideoPath, outputPath);
			return;
		}

		// Get workspace folder for resolving relative paths
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

		// Calculate duration
		const duration = activeExport.totalFrames / settings.fps;

		console.log('[StreamingExportService] Muxing audio with Rust N-API...');

		try {
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const { MuxerSession, MediaProcessor } = require('@neko/native-napi');

			// Create muxer
			const muxer = MuxerSession.create({
				outputPath,
				format: settings.format === 'webm' ? 'webm' : 'mp4',
			});

			// Add video stream (copy from temp file)
			const processor = await MediaProcessor.create();

			// Read video file and write to muxer
			// For now, we'll use a simpler approach: read the temp video file
			// and copy its packets to the muxer along with audio

			// Add video stream config
			const videoStreamInfo = muxer.addVideoStream({
				width: settings.width,
				height: settings.height,
				fps: settings.fps,
				codec: mapVideoCodecToRust(settings.videoCodec, settings.format, this.hwAccel),
			});

			// Add audio stream config
			const audioStreamInfo = muxer.addAudioStream({
				sampleRate: 48000,
				channels: 2,
				codec: mapAudioCodec(settings.audioCodec, settings.format),
				bitrate: (settings.audioBitrate ?? 192) * 1000,
			});

			muxer.writeHeader();

			// Read and write video packets from temp file
			// Since ExportPipelineSession already wrote the video, we need to demux and remux
			// This is a limitation - ideally we'd have a way to add audio to existing file

			// For simplicity, we'll use a different approach:
			// Read the temp video file as raw data and copy it
			// Then decode/encode audio and interleave

			// Actually, the cleanest approach is to:
			// 1. Decode audio from source files
			// 2. Encode audio
			// 3. Use MuxerSession to combine video packets (from temp file) with audio packets

			// For now, let's use a simpler fallback: just rename if no audio muxing is needed
			// TODO: Implement proper audio muxing with Rust N-API

			// Decode and encode audio
			for (const track of audioTracks) {
				let audioPath = track.filePath;
				if (!path.isAbsolute(audioPath) && workspaceFolder) {
					audioPath = path.join(workspaceFolder, audioPath);
				}

				const audioDecoder = processor.createAudioDecoder(audioPath);
				const audioInfo = audioDecoder.getInfo();

				// Create audio encoder
				const audioEncoder = processor.createAudioEncoder({
					sampleRate: 48000,
					channels: 2,
					codec: mapAudioCodec(settings.audioCodec, settings.format),
					bitrate: (settings.audioBitrate ?? 192) * 1000,
				});

				// Decode and encode audio frames
				let audioFrame = audioDecoder.decodeNext();
				while (audioFrame) {
					const encodedPackets = audioEncoder.encodeFrame(audioFrame.data, audioFrame.samples);
					for (const packet of encodedPackets) {
						muxer.writeAudioPacket({
							data: packet.data,
							pts: packet.pts,
							dts: packet.pts,
							duration: packet.duration,
							isKeyframe: true,
						});
					}
					audioFrame = audioDecoder.decodeNext();
				}

				// Flush audio encoder
				const flushPackets = audioEncoder.flush();
				for (const packet of flushPackets) {
					muxer.writeAudioPacket({
						data: packet.data,
						pts: packet.pts,
						dts: packet.pts,
						duration: packet.duration,
						isKeyframe: true,
					});
				}

				audioDecoder.close();
				audioEncoder.close();
			}

			muxer.finish();
			processor.dispose();

			// Remove temp video file
			if (fs.existsSync(activeExport.tempVideoPath)) {
				fs.unlinkSync(activeExport.tempVideoPath);
			}

			console.log('[StreamingExportService] Audio muxing complete');
		} catch (error) {
			console.error('[StreamingExportService] Rust N-API muxing failed, falling back to simple copy:', error);
			// Fallback: just copy video without audio
			fs.renameSync(activeExport.tempVideoPath, outputPath);
		}
	}

	/**
	 * 发送进度通知
	 */
	private sendProgress(activeExport: ActiveStreamingExport, error?: string): void {
		const status = this.getExportStatus(activeExport.jobId);
		if (!status) return;

		if (error) {
			(status as any).error = error;
		}

		activeExport.params.onProgress?.(status);
	}

	/**
	 * 计算渲染 FPS
	 */
	private calculateRenderingFps(activeExport: ActiveStreamingExport): number {
		const elapsed = (Date.now() - activeExport.startTime) / 1000;
		if (elapsed <= 0) return 0;
		return activeExport.receivedFrames / elapsed;
	}

	/**
	 * 获取 VS Code 工作区根目录列表
	 */
	private getWorkspaceRoots(): string[] {
		return vscode.workspace.workspaceFolders?.map(f => f.uri.fsPath) ?? [];
	}

	/**
	 * 清理资源
	 */
	private cleanup(activeExport: ActiveStreamingExport): void {
		// Cancel pipeline if still running
		if (activeExport.pipeline) {
			try {
				activeExport.pipeline.cancel();
			} catch {
				// Ignore cancel errors
			}
			activeExport.pipeline = null;
		}

		// Dispose export adapter (Compat mode)
		if (activeExport.exportAdapter) {
			activeExport.exportAdapter.dispose();
			activeExport.exportAdapter = null;
		}

		// Note: renderPipeline is managed externally (by FrameServerIntegration)
		activeExport.renderPipeline = null;

		// Dispose backpressure controller
		activeExport.backpressure.dispose();

		// Remove temp directory
		if (fs.existsSync(activeExport.tempDir)) {
			fs.rmSync(activeExport.tempDir, { recursive: true, force: true });
		}

		// Remove from active exports
		this.activeExports.delete(activeExport.jobId);
	}

	// ===========================================================================
	// Public Utility Methods
	// ===========================================================================

	/**
	 * 获取当前活动的导出任务 ID
	 */
	getActiveExportJobId(): string | null {
		for (const [jobId, _] of this.activeExports) {
			return jobId;
		}
		return null;
	}

	/**
	 * 检查是否有活动的导出任务
	 */
	hasActiveExport(): boolean {
		return this.activeExports.size > 0;
	}

	/**
	 * 获取活动导出任务的详细信息
	 */
	getActiveExportInfo(): { jobId: string; status: StreamingExportJobStatus } | null {
		const jobId = this.getActiveExportJobId();
		if (!jobId) return null;

		const status = this.getExportStatus(jobId);
		if (!status) return null;

		return { jobId, status };
	}
}

// =============================================================================
// Singleton
// =============================================================================

let instance: StreamingExportService | null = null;

/**
 * 获取 StreamingExportService 单例
 */
export function getStreamingExportService(): StreamingExportService {
	if (!instance) {
		instance = new StreamingExportService();
	}
	return instance;
}

/**
 * 释放 StreamingExportService 单例（用于测试）
 */
export function disposeStreamingExportService(): void {
	instance = null;
}
