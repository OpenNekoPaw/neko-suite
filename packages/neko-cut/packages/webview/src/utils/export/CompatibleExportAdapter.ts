/**
 * CompatibleExportAdapter - Pure Extension Export Engine
 *
 * Implements IExportEngine for compatible mode export.
 * All processing happens in Extension Host via FFmpeg:
 * - Video decoding via FFmpeg
 * - Frame rendering via wgpu compositor
 * - Video encoding via FFmpeg
 *
 * This adapter sends messages to Extension's CompatibleExportHandler.
 */

import type { ProjectData } from '../../types';
import type {
	IExportEngine,
	ExportConfig,
	ExportResult,
	ExportProgress,
	ExportProgressCallback,
	ExportFormat,
	ExportStage,
} from './IExportEngine';
import { getDefaultBitrate } from './IExportEngine';
import { getVSCodeAPI } from '../vscodeApi';
import type {
	CompatibleExportConfig,
	CompatibleExportProgress,
	CompatibleExportResult,
} from '@neko/shared';

// =============================================================================
// Types
// =============================================================================

interface MessageHandler {
	(event: MessageEvent): void;
}

// Extended config type with projectData
interface ExtendedCompatibleExportConfig extends CompatibleExportConfig {
	projectData?: ProjectData;
}

// =============================================================================
// CompatibleExportAdapter Implementation
// =============================================================================

export class CompatibleExportAdapter implements IExportEngine {
	readonly name = 'CompatibleExport';
	readonly supportedFormats: ExportFormat[] = ['mp4', 'webm'];

	private _isExporting = false;
	private _startTime = 0;
	private _exportId: string | null = null;
	private _messageHandler: MessageHandler | null = null;
	private _progressCallback: ExportProgressCallback | null = null;
	private _resolveExport: ((result: ExportResult) => void) | null = null;

	// =========================================================================
	// Properties
	// =========================================================================

	get isExporting(): boolean {
		return this._isExporting;
	}

	// =========================================================================
	// IExportEngine Implementation
	// =========================================================================

	supportsFormat(format: ExportFormat): boolean {
		return this.supportedFormats.includes(format);
	}

	async export(
		project: ProjectData,
		config: ExportConfig,
		onProgress?: ExportProgressCallback
	): Promise<ExportResult> {
		const vscode = getVSCodeAPI();
		if (!vscode) {
			return {
				success: false,
				error: 'VSCode API not available. Compatible mode requires Extension Host.',
			};
		}

		if (this._isExporting) {
			return {
				success: false,
				error: 'Export already in progress',
			};
		}

		if (!this.supportsFormat(config.format)) {
			return {
				success: false,
				error: `Unsupported format: ${config.format}`,
			};
		}

		this._isExporting = true;
		this._startTime = performance.now();
		this._exportId = `compatible-export-${Date.now()}`;
		this._progressCallback = onProgress ?? null;

		// Calculate bitrate
		const videoBitrate = config.videoBitrate ??
			getDefaultBitrate(config.width, config.height, config.quality);

		// Build compatible export config
		const exportConfig: ExtendedCompatibleExportConfig = {
			outputPath: `export_${Date.now()}.${config.format}`,
			width: config.width,
			height: config.height,
			fps: config.fps,
			videoCodec: config.format === 'webm' ? 'vp9' : 'h264',
			videoBitrate,
			preset: 'medium',
			container: config.format === 'webm' ? 'webm' : 'mp4',
			includeAudio: config.includeAudio !== false,
			audioCodec: config.format === 'webm' ? 'opus' : 'aac',
			audioBitrate: config.audioBitrate ?? 128000,
			backgroundColor: [0, 0, 0, 1], // Black background
			// Pass project data for Extension to process
			projectData: project,
		};

		return new Promise<ExportResult>((resolve) => {
			this._resolveExport = resolve;

			// Setup message listener
			this._messageHandler = this._createMessageHandler();
			window.addEventListener('message', this._messageHandler);

			// Report initializing
			this._reportProgress({
				stage: 'initializing',
				currentFrame: 0,
				totalFrames: 0,
				percent: 0,
				elapsedTime: 0,
				estimatedTimeRemaining: 0,
				currentFps: 0,
				message: 'Initializing compatible mode export...',
			});

			// Send start message to Extension
			vscode.postMessage({
				type: 'startCompatibleExport',
				exportId: this._exportId,
				config: exportConfig,
			});
		});
	}

	cancel(): void {
		if (!this._isExporting || !this._exportId) return;

		const vscode = getVSCodeAPI();
		if (vscode) {
			vscode.postMessage({
				type: 'cancelCompatibleExport',
				exportId: this._exportId,
			});
		}
	}

	dispose(): void {
		this.cancel();
		this._cleanup();
	}

	// =========================================================================
	// Private Methods
	// =========================================================================

	private _createMessageHandler(): MessageHandler {
		return (event: MessageEvent) => {
			const message = event.data;
			if (!message || typeof message !== 'object') return;

			switch (message.type) {
				case 'compatibleExportStarted':
					if (message.exportId === this._exportId) {
						console.log('[CompatibleExportAdapter] Export started');
					}
					break;

				case 'compatibleExportProgress':
					if (message.exportId === this._exportId) {
						this._handleProgress(message.progress as CompatibleExportProgress);
					}
					break;

				case 'compatibleExportResult':
					if (message.exportId === this._exportId) {
						this._handleResult(message.result as CompatibleExportResult);
					}
					break;

				case 'compatibleExportCancelled':
					if (message.exportId === this._exportId) {
						this._handleCancelled();
					}
					break;
			}
		};
	}

	private _handleProgress(progress: CompatibleExportProgress): void {
		const elapsed = performance.now() - this._startTime;
		const fps = progress.performanceStats?.currentFps
			?? (progress.currentFrame > 0 ? progress.currentFrame / (elapsed / 1000) : 0);

		// Map phase to stage
		let stage: ExportStage = 'rendering';
		switch (progress.phase) {
			case 'initializing':
				stage = 'initializing';
				break;
			case 'rendering':
				stage = 'rendering';
				break;
			case 'encoding':
				stage = 'encoding';
				break;
			case 'finalizing':
				stage = 'finalizing';
				break;
		}

		this._reportProgress({
			stage,
			currentFrame: progress.currentFrame,
			totalFrames: progress.totalFrames,
			percent: progress.percentage,
			elapsedTime: elapsed,
			estimatedTimeRemaining: progress.estimatedRemainingMs ?? 0,
			currentFps: fps,
			message: `Exporting frame ${progress.currentFrame}/${progress.totalFrames}`,
			// Pass performance stats from Extension
			performanceStats: progress.performanceStats ? {
				avgRenderTime: progress.performanceStats.avgRenderTime,
				avgEncodeTime: progress.performanceStats.avgEncodeTime,
				avgDecodeTime: progress.performanceStats.avgDecodeTime,
				avgWaitTime: 0,
				queueLength: 0,
				memoryUsedMB: progress.performanceStats.memoryUsedMB ?? 0,
				vramUsedMB: progress.performanceStats.vramUsedMB,
				cpuUsage: progress.performanceStats.cpuUsage,
				gpuUsage: progress.performanceStats.gpuUsage,
				pipelineMode: false,
			} : undefined,
		});
	}

	private _handleResult(result: CompatibleExportResult): void {
		const totalTime = performance.now() - this._startTime;

		if (result.success) {
			this._reportProgress({
				stage: 'completed',
				currentFrame: result.framesRendered ?? 0,
				totalFrames: result.framesRendered ?? 0,
				percent: 100,
				elapsedTime: totalTime,
				estimatedTimeRemaining: 0,
				currentFps: (result.framesRendered ?? 0) / (totalTime / 1000),
				message: 'Export completed',
			});
		}

		this._resolveExport?.({
			success: result.success,
			error: result.error,
			totalTime,
			averageFps: result.avgFrameTimeMs
				? 1000 / result.avgFrameTimeMs
				: undefined,
		});

		this._cleanup();
	}

	private _handleCancelled(): void {
		this._resolveExport?.({
			success: false,
			error: 'Export cancelled',
		});

		this._cleanup();
	}

	private _reportProgress(progress: ExportProgress): void {
		if (this._progressCallback) {
			this._progressCallback(progress);
		}
	}

	private _cleanup(): void {
		if (this._messageHandler) {
			window.removeEventListener('message', this._messageHandler);
			this._messageHandler = null;
		}

		this._isExporting = false;
		this._exportId = null;
		this._progressCallback = null;
		this._resolveExport = null;
	}
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a new CompatibleExportAdapter instance
 */
export function createCompatibleExportAdapter(): CompatibleExportAdapter {
	return new CompatibleExportAdapter();
}

/**
 * Check if compatible mode export is available
 */
export function isCompatibleExportAvailable(): boolean {
	// Compatible mode requires VSCode API
	return typeof window !== 'undefined' &&
		typeof (window as { acquireVsCodeApi?: unknown }).acquireVsCodeApi === 'function';
}
