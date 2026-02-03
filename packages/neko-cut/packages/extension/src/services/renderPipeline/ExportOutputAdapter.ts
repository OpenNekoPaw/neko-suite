/**
 * ExportOutputAdapter - 导出输出适配器
 *
 * 职责：
 * - 实现 IExportOutputAdapter 接口
 * - 将 RGBA 帧提交到 Rust N-API ExportPipelineSession 进行编码
 * - 支持背压控制
 *
 * 架构：
 * ```
 * RenderedFrame (RGBA) → ExportPipelineSession (wgpu 合成 + 编码) → 文件
 * ```
 *
 * 设计原则（SOLID）：
 * - 单一职责 (S)：仅负责导出输出
 * - 依赖倒置 (D)：依赖 ExportPipelineSession 接口
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type {
	IExportOutputAdapter,
	RenderedFrame,
	AudioBuffer,
	ExportAdapterConfig,
	BackpressureStatus,
} from './IRenderPipeline';
import {
	ExportBackpressureController,
	createBackpressureController,
} from '../ExportBackpressureController';

// Rust N-API types
type ExportPipelineSession = import('@neko/media-processor-rs').ExportPipelineSession;
type JsPipelineConfig = import('@neko/media-processor-rs').JsPipelineConfig;
type JsPipelineFrame = import('@neko/media-processor-rs').JsPipelineFrame;
type JsEncoderConfig = import('@neko/media-processor-rs').JsEncoderConfig;

// =============================================================================
// Codec Mapping
// =============================================================================

/**
 * 映射视频编码器到 Rust N-API 格式
 */
function mapVideoCodecToRust(codec: string): string {
	if (codec === 'h264') return 'h264';
	if (codec === 'h265') return 'h265';
	if (codec === 'vp9') return 'vp9';
	return 'h264';
}

/**
 * 映射编码预设到 Rust N-API 格式
 */
function mapPresetToRust(preset: string | undefined): string {
	switch (preset) {
		case 'ultrafast':
		case 'fast':
			return 'fast';
		case 'medium':
			return 'medium';
		case 'slow':
		case 'veryslow':
			return 'slow';
		default:
			return 'medium';
	}
}

/**
 * 检测硬件加速支持
 */
function detectHwAccel(): string {
	const platform = os.platform();
	if (platform === 'darwin') {
		return 'videotoolbox';
	}
	return 'none';
}

// =============================================================================
// ExportOutputAdapter Implementation
// =============================================================================

/**
 * 导出输出适配器
 *
 * 将渲染后的帧编码并写入文件
 */
export class ExportOutputAdapter implements IExportOutputAdapter {
	readonly name = 'ExportOutput';

	private _pipeline: ExportPipelineSession | null = null;
	private _backpressure: ExportBackpressureController | null = null;
	private _config: ExportAdapterConfig | null = null;
	private _outputPath: string = '';
	private _tempVideoPath: string = '';
	private _tempDir: string = '';
	private _disposed = false;
	private _initialized = false;
	private _framesSubmitted = 0;

	// =========================================================================
	// IExportOutputAdapter Implementation
	// =========================================================================

	/**
	 * 初始化导出
	 */
	async initialize(outputPath: string, config: ExportAdapterConfig): Promise<void> {
		if (this._disposed) {
			throw new Error('ExportOutputAdapter is disposed');
		}

		if (this._initialized) {
			throw new Error('ExportOutputAdapter already initialized');
		}

		this._config = config;
		this._outputPath = outputPath;

		// Create temp directory
		const jobId = `export-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		this._tempDir = path.join(os.tmpdir(), `uniedit-export-${jobId}`);
		fs.mkdirSync(this._tempDir, { recursive: true });
		this._tempVideoPath = path.join(this._tempDir, 'video_only.mp4');

		// Create backpressure controller
		this._backpressure = createBackpressureController({
			maxPendingFrames: 8,
		});

		// Build encoder config
		const hwAccel = config.hardwareAccel ? detectHwAccel() : 'none';
		const encoderConfig: JsEncoderConfig = {
			width: config.width,
			height: config.height,
			fps: config.fps,
			bitrate: config.videoBitrate,
			codec: mapVideoCodecToRust(config.videoCodec),
			preset: mapPresetToRust(config.preset),
			profile: 'main',
			pixelFormat: 'rgba',
			hwEncoder: hwAccel,
		};

		// Build pipeline config
		const pipelineConfig: JsPipelineConfig = {
			outputPath: this._tempVideoPath,
			container: config.format === 'webm' ? 'webm' : 'mp4',
			encoderConfig,
			composeBufferSize: 3,
			encodeBufferSize: 4,
			muxBufferSize: 8,
			totalFrames: config.totalFrames,
		};

		console.log('[ExportOutputAdapter] Pipeline config:', JSON.stringify(pipelineConfig, null, 2));

		// Create pipeline using Rust N-API
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const { ExportPipelineSession } = require('@neko/media-processor-rs');
		this._pipeline = await ExportPipelineSession.create(pipelineConfig);

		this._initialized = true;
		console.log('[ExportOutputAdapter] Export pipeline initialized');
	}

	/**
	 * 输出视频帧
	 */
	async outputVideo(frame: RenderedFrame): Promise<void> {
		if (this._disposed || !this._pipeline || !this._config || !this._backpressure) {
			throw new Error('ExportOutputAdapter not initialized or disposed');
		}

		// Wait for backpressure capacity
		const hasCapacity = await this._backpressure.waitForCapacity();
		if (!hasCapacity) {
			throw new Error('Backpressure timeout');
		}

		// Create pipeline frame
		const pipelineFrame: JsPipelineFrame = {
			index: frame.frameIndex,
			pts: frame.frameIndex * (1000000 / this._config.fps), // PTS in microseconds
			layers: [{
				data: frame.data,
				width: frame.width,
				height: frame.height,
				pixelFormat: 'rgba',
				opacity: 1.0,
				zIndex: 0,
			}],
			outputWidth: this._config.width,
			outputHeight: this._config.height,
			backgroundColor: [0, 0, 0, 1],
		};

		// Submit frame to pipeline
		this._pipeline.submitFrame(pipelineFrame);
		this._framesSubmitted++;
		this._backpressure.onFrameSent();

		// Mark frame as processed
		this._backpressure.onFrameEncoded();

		// Log progress periodically
		if (this._framesSubmitted % 30 === 0) {
			const progress = this._pipeline.getProgress();
			console.log(
				`[ExportOutputAdapter] Frame ${this._framesSubmitted}/${this._config.totalFrames} | ` +
				`Encoded: ${progress.framesEncoded}`
			);
		}
	}

	/**
	 * 输出音频数据
	 */
	async outputAudio(buffer: AudioBuffer): Promise<void> {
		// TODO(P1): Implement audio output
		// Audio will be muxed in finalize()
	}

	/**
	 * 完成输出
	 */
	async finalize(): Promise<void> {
		if (this._disposed || !this._pipeline) {
			throw new Error('ExportOutputAdapter not initialized or disposed');
		}

		console.log('[ExportOutputAdapter] Finalizing export...');

		// Finalize the pipeline
		await this._pipeline.finalize();

		// Move temp video to final output
		// TODO(P1): Add audio muxing here
		if (fs.existsSync(this._tempVideoPath)) {
			fs.renameSync(this._tempVideoPath, this._outputPath);
		}

		console.log(`[ExportOutputAdapter] Export complete: ${this._outputPath}`);
	}

	/**
	 * 获取背压状态
	 */
	getBackpressureStatus(): BackpressureStatus {
		if (!this._backpressure) {
			return {
				pendingFrames: 0,
				shouldPause: false,
				maxPendingFrames: 8,
			};
		}

		const status = this._backpressure.getStatus();
		return {
			pendingFrames: status.pendingFrames,
			shouldPause: status.shouldPause,
			maxPendingFrames: status.maxPendingFrames,
		};
	}

	/**
	 * 等待背压容量
	 */
	async waitForCapacity(): Promise<boolean> {
		if (!this._backpressure) {
			return true;
		}
		return this._backpressure.waitForCapacity();
	}

	/**
	 * 释放资源
	 */
	dispose(): void {
		if (this._disposed) {
			return;
		}

		this._disposed = true;

		// Cancel pipeline if still running
		if (this._pipeline) {
			try {
				this._pipeline.cancel();
			} catch {
				// Ignore cancel errors
			}
			this._pipeline = null;
		}

		// Dispose backpressure controller
		if (this._backpressure) {
			this._backpressure.dispose();
			this._backpressure = null;
		}

		// Remove temp directory
		if (this._tempDir && fs.existsSync(this._tempDir)) {
			fs.rmSync(this._tempDir, { recursive: true, force: true });
		}

		this._config = null;
	}

	// =========================================================================
	// Public Methods
	// =========================================================================

	/**
	 * 获取输出路径
	 */
	getOutputPath(): string {
		return this._outputPath;
	}

	/**
	 * 获取已提交帧数
	 */
	getFramesSubmitted(): number {
		return this._framesSubmitted;
	}

	/**
	 * 检查是否已初始化
	 */
	isInitialized(): boolean {
		return this._initialized;
	}
}

// =============================================================================
// Factory
// =============================================================================

/**
 * 创建导出输出适配器
 */
export function createExportOutputAdapter(): ExportOutputAdapter {
	return new ExportOutputAdapter();
}
