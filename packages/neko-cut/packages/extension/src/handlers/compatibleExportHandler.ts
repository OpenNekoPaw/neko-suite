/**
 * Compatible Mode Export Handler
 *
 * Handles export messages for compatible mode (native GPU compositor + FFmpeg encoding).
 * This mode uses the Rust WebSocket Server for all processing:
 * - FFmpeg decoding
 * - wgpu GPU compositing
 * - FFmpeg encoding
 *
 * Architecture (符合 docs/principle.md):
 * ```
 * Webview ──► Extension Host ──► WebSocket Server (Rust)
 *                                      │
 *                                      ├── TimelineDecoder (FFmpeg)
 *                                      ├── GpuCompositor (wgpu)
 *                                      └── AsyncExportPipeline (FFmpeg)
 * ```
 *
 * Message Types:
 * - startCompatibleExport   : Start native export via WebSocket
 * - cancelCompatibleExport  : Cancel export
 * - requestPreviewFrame     : Request a preview frame at specific time
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as http from 'http';
import type {
	MessageFromWebview,
	MessageToWebview,
	CompatibleExportConfig,
	CompatibleExportProgress,
	CompatibleExportResult,
	ProjectData,
} from '@neko/shared';
import { JviProjectLoader } from '../project/JviProjectLoader';
import WebSocket from 'ws';

// =============================================================================
// Types
// =============================================================================

type PostMessageFn = (message: MessageToWebview) => void;

interface ExportJobConfig {
	jobId: string;
	outputPath: string;
	settings: {
		width: number;
		height: number;
		fps: number;
		videoCodec: string;
		videoBitrate?: number;
		audioCodec: string;
		audioBitrate?: number;
		hwEncoder: string;
		preset: string;
	};
	timeline: {
		duration: number;
		tracks: Array<{
			id: string;
			type: string;
			elements: Array<{
				type: string;
				id: string;
				src?: string;
				startTime: number;
				duration: number;
				trimStart?: number;
				trimEnd?: number;
				transform?: {
					x?: number;
					y?: number;
					scaleX?: number;
					scaleY?: number;
					rotation?: number;
				};
				opacity?: number;
				blendMode?: string;
				muted?: boolean;
				volume?: number;
				text?: string;
				fontSize?: number;
				fontFamily?: string;
				color?: string;
			}>;
			muted: boolean;
		}>;
	};
}

interface ExportProgressResponse {
	jobId: string;
	state: string;
	progress: number;
	currentFrame: number;
	totalFrames: number;
	elapsedMs: number;
	estimatedRemainingMs: number;
	error?: string;
	metadata?: {
		width: number;
		height: number;
		fps: number;
		videoBitrate: number;
		audioBitrate: number;
		videoCodec: string;
		audioCodec: string;
		renderMode: string;
		hwEncoder?: string;
	};
	stats?: {
		decodeTimeMs: number;
		compositeTimeMs: number;
		encodeTimeMs: number;
		muxTimeMs: number;
		avgFps: number;
		peakMemoryBytes: number;
		cpuUsagePercent: number;
		gpuUsagePercent?: number;
		vramUsageBytes?: number;
	};
}

interface ActiveExport {
	exportId: string;
	jobId: string;
	progressWs: WebSocket | null;
	cancelled: boolean;
}

// =============================================================================
// Compatible Export Handler
// =============================================================================

/**
 * Handler for compatible mode export via WebSocket Server
 */
export class CompatibleExportHandler {
	private _activeExport: ActiveExport | null = null;
	private _postMessage: PostMessageFn;
	private _projectDir: string;
	private _projectFilePath: string;
	private _serverPort: number;
	private _serverBaseUrl: string;

	constructor(postMessage: PostMessageFn, projectDir: string, serverPort: number = 8765, projectFilePath?: string) {
		this._postMessage = postMessage;
		this._projectDir = projectDir;
		this._projectFilePath = projectFilePath || path.join(projectDir, 'project.jvi');
		this._serverPort = serverPort;
		this._serverBaseUrl = `http://127.0.0.1:${serverPort}`;
	}

	/**
	 * Set the WebSocket server port
	 */
	setServerPort(port: number): void {
		this._serverPort = port;
		this._serverBaseUrl = `http://127.0.0.1:${port}`;
	}

	/**
	 * Handle compatible mode messages
	 * @returns true if message was handled
	 */
	async handleMessage(message: MessageFromWebview): Promise<boolean> {
		switch (message.type) {
			case 'startCompatibleExport':
				await this.handleStartExport(message.exportId, message.config);
				return true;

			case 'cancelCompatibleExport':
				await this.handleCancelExport(message.exportId);
				return true;

			case 'requestPreviewFrame':
				await this.handlePreviewFrame(message.requestId, message.time, message.width, message.height);
				return true;

			default:
				return false;
		}
	}

	/**
	 * Start compatible mode export via WebSocket Server
	 */
	private async handleStartExport(exportId: string, config: CompatibleExportConfig): Promise<void> {
		// Check for existing export
		if (this._activeExport) {
			this._postMessage({
				type: 'compatibleExportResult',
				exportId,
				result: {
					success: false,
					error: '已有导出任务正在进行中',
				},
			});
			return;
		}

		try {
			// Notify export started
			this._postMessage({
				type: 'compatibleExportStarted',
				exportId,
			});

			// Load project and build timeline data
			const projectPath = this._projectFilePath;
			let projectData: ProjectData | null = null;
			let duration = 5.0;

			try {
				const loader = new JviProjectLoader(projectPath);
				await loader.load();
				projectData = loader.project;
				duration = loader.getProjectDuration();
				console.log(`[CompatibleExportHandler] Loaded project from ${projectPath}, duration: ${duration}s`);
			} catch (e) {
				console.log(`[CompatibleExportHandler] Failed to load project from ${projectPath}: ${e}`);
			}

			// Build export job config for Rust server
			const absoluteOutputPath = path.isAbsolute(config.outputPath)
				? config.outputPath
				: path.resolve(this._projectDir, config.outputPath);

			const jobId = `export-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

			const jobConfig: ExportJobConfig = {
				jobId,
				outputPath: absoluteOutputPath,
				settings: {
					width: config.width,
					height: config.height,
					fps: config.fps,
					videoCodec: config.videoCodec || 'h264',
					videoBitrate: config.videoBitrate,
					audioCodec: config.audioCodec || 'aac',
					audioBitrate: config.audioBitrate,
					hwEncoder: 'auto',
					preset: config.preset || 'medium',
				},
				timeline: this._buildTimelineData(projectData, duration),
			};

			this._activeExport = {
				exportId,
				jobId,
				progressWs: null,
				cancelled: false,
			};

			// Connect to progress WebSocket
			await this._connectProgressWebSocket(exportId, jobId);

			// Start export via HTTP POST
			const response = await this._startExportRequest(jobConfig);

			if (!response.success) {
				throw new Error(response.error || 'Failed to start export');
			}

			console.log(`[CompatibleExportHandler] Export started: ${response.totalFrames} frames`);

		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			console.error('[CompatibleExportHandler] Export failed:', errorMessage);

			this._postMessage({
				type: 'compatibleExportResult',
				exportId,
				result: {
					success: false,
					error: errorMessage,
				},
			});

			this._cleanup();
		}
	}

	/**
	 * Build timeline data from project
	 */
	private _buildTimelineData(
		projectData: ProjectData | null,
		duration: number
	): ExportJobConfig['timeline'] {
		if (!projectData) {
			return { duration, tracks: [] };
		}

		const tracks = projectData.tracks.map(track => ({
			id: track.id,
			type: track.type,
			elements: track.elements.map(element => {
				const baseElement = {
					type: element.type,
					id: element.id,
					startTime: element.startTime,
					duration: element.duration,
					trimStart: element.trimStart,
					trimEnd: element.trimEnd,
				};

				if (element.type === 'media') {
					const mediaElement = element as {
						src?: string;
						transform?: { x?: number; y?: number; scaleX?: number; scaleY?: number; rotation?: number };
						opacity?: number;
						blendMode?: string;
						muted?: boolean;
						audio?: { volume?: number };
					};
					return {
						...baseElement,
						src: mediaElement.src ? this._resolveMediaPath(mediaElement.src) : undefined,
						transform: mediaElement.transform,
						opacity: mediaElement.opacity,
						blendMode: mediaElement.blendMode,
						muted: mediaElement.muted,
						volume: mediaElement.audio?.volume,
					};
				}

				if (element.type === 'audio') {
					const audioElement = element as {
						src?: string;
						audio?: { volume?: number };
					};
					return {
						...baseElement,
						src: audioElement.src ? this._resolveMediaPath(audioElement.src) : undefined,
						volume: audioElement.audio?.volume,
					};
				}

				if (element.type === 'text') {
					const textElement = element as {
						content?: string;
						fontSize?: number;
						fontFamily?: string;
						color?: string;
					};
					return {
						...baseElement,
						text: textElement.content,
						fontSize: textElement.fontSize,
						fontFamily: textElement.fontFamily,
						color: textElement.color,
					};
				}

				return baseElement;
			}),
			muted: track.muted ?? false,
		}));

		return { duration, tracks };
	}

	/**
	 * Resolve relative media path to absolute path
	 */
	private _resolveMediaPath(relativePath: string): string {
		if (path.isAbsolute(relativePath)) {
			return relativePath;
		}
		return path.resolve(this._projectDir, '..', relativePath);
	}

	/**
	 * Connect to progress WebSocket
	 */
	private async _connectProgressWebSocket(exportId: string, jobId: string): Promise<void> {
		return new Promise((resolve, reject) => {
			const wsUrl = `ws://127.0.0.1:${this._serverPort}/export/progress`;
			const ws = new WebSocket(wsUrl);

			ws.on('open', () => {
				console.log('[CompatibleExportHandler] Progress WebSocket connected');
				if (this._activeExport) {
					this._activeExport.progressWs = ws;
				}
				resolve();
			});

			ws.on('message', (data: Buffer) => {
				try {
					const progress = JSON.parse(data.toString()) as ExportProgressResponse;

					// Only process messages for our job
					if (progress.jobId !== jobId) {
						return;
					}

					// Convert to CompatibleExportProgress
					// Map Rust stats fields to TypeScript CompatibleExportProgress.performanceStats
					const exportProgress: CompatibleExportProgress = {
						currentFrame: progress.currentFrame,
						totalFrames: progress.totalFrames,
						percentage: progress.progress,
						elapsedMs: progress.elapsedMs,
						estimatedRemainingMs: progress.estimatedRemainingMs,
						phase: this._mapState(progress.state),
						performanceStats: progress.stats ? {
							// Map decode + composite time to avgRenderTime (they happen together in GPU pipeline)
							avgRenderTime: (progress.stats.decodeTimeMs + progress.stats.compositeTimeMs) / Math.max(1, progress.currentFrame),
							avgEncodeTime: progress.stats.encodeTimeMs / Math.max(1, progress.currentFrame),
							avgDecodeTime: progress.stats.decodeTimeMs / Math.max(1, progress.currentFrame),
							currentFps: progress.stats.avgFps,
							memoryUsedMB: progress.stats.peakMemoryBytes ? Math.round(progress.stats.peakMemoryBytes / (1024 * 1024)) : undefined,
							vramUsedMB: progress.stats.vramUsageBytes ? Math.round(progress.stats.vramUsageBytes / (1024 * 1024)) : undefined,
							cpuUsage: progress.stats.cpuUsagePercent,
							gpuUsage: progress.stats.gpuUsagePercent,
						} : undefined,
					};

					// Send progress to webview
					this._postMessage({
						type: 'compatibleExportProgress',
						exportId,
						progress: exportProgress,
					});

					// Handle completion states
					if (progress.state === 'completed') {
						this._handleExportComplete(exportId, progress);
					} else if (progress.state === 'error') {
						this._handleExportError(exportId, progress.error || 'Unknown error');
					} else if (progress.state === 'cancelled') {
						this._handleExportCancelled(exportId);
					}
				} catch (error) {
					console.error('[CompatibleExportHandler] Failed to parse progress:', error);
				}
			});

			ws.on('error', (error) => {
				console.error('[CompatibleExportHandler] Progress WebSocket error:', error);
				reject(error);
			});

			ws.on('close', () => {
				console.log('[CompatibleExportHandler] Progress WebSocket closed');
			});

			// Timeout after 5 seconds
			setTimeout(() => {
				if (ws.readyState !== WebSocket.OPEN) {
					reject(new Error('WebSocket connection timeout'));
				}
			}, 5000);
		});
	}

	/**
	 * Map Rust export state to phase string
	 */
	private _mapState(state: string): string {
		const stateMap: Record<string, string> = {
			pending: 'initializing',
			initializing: 'initializing',
			decoding: 'decoding',
			compositing: 'compositing',
			encoding: 'encoding',
			muxing: 'muxing',
			finalizing: 'finalizing',
			completed: 'completed',
			cancelled: 'cancelled',
			error: 'error',
		};
		return stateMap[state] || state;
	}

	/**
	 * Start export via HTTP POST request
	 */
	private async _startExportRequest(config: ExportJobConfig): Promise<{ success: boolean; totalFrames?: number; error?: string }> {
		return new Promise((resolve) => {
			const postData = JSON.stringify(config);

			const options = {
				hostname: '127.0.0.1',
				port: this._serverPort,
				path: '/export/start',
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Content-Length': Buffer.byteLength(postData),
				},
			};

			const req = http.request(options, (res) => {
				let data = '';
				res.on('data', (chunk) => { data += chunk; });
				res.on('end', () => {
					try {
						const response = JSON.parse(data);
						if (res.statusCode === 200) {
							resolve({ success: true, totalFrames: response.totalFrames });
						} else {
							resolve({ success: false, error: response.error || 'Request failed' });
						}
					} catch {
						resolve({ success: false, error: 'Invalid response' });
					}
				});
			});

			req.on('error', (error) => {
				resolve({ success: false, error: error.message });
			});

			req.write(postData);
			req.end();
		});
	}

	/**
	 * Handle export completion
	 */
	private async _handleExportComplete(exportId: string, progress: ExportProgressResponse): Promise<void> {
		const result: CompatibleExportResult = {
			success: true,
			outputPath: undefined, // Server doesn't return this in progress
			totalTimeMs: progress.elapsedMs,
			framesRendered: progress.totalFrames,
			avgFrameTimeMs: progress.stats?.avgFps ? 1000 / progress.stats.avgFps : undefined,
		};

		this._postMessage({
			type: 'compatibleExportResult',
			exportId,
			result,
		});

		// Show notification
		const action = await vscode.window.showInformationMessage(
			'导出完成',
			'打开文件位置'
		);
		if (action === '打开文件位置') {
			// TODO: Get output path from server
		}

		this._cleanup();
	}

	/**
	 * Handle export error
	 */
	private _handleExportError(exportId: string, error: string): void {
		this._postMessage({
			type: 'compatibleExportResult',
			exportId,
			result: {
				success: false,
				error,
			},
		});

		this._cleanup();
	}

	/**
	 * Handle export cancelled
	 */
	private _handleExportCancelled(exportId: string): void {
		this._postMessage({
			type: 'compatibleExportCancelled',
			exportId,
		});

		this._cleanup();
	}

	/**
	 * Cancel active export
	 */
	private async handleCancelExport(exportId: string): Promise<void> {
		if (!this._activeExport || this._activeExport.exportId !== exportId) {
			return;
		}

		console.log('[CompatibleExportHandler] Cancelling export...');
		this._activeExport.cancelled = true;

		// Send cancel request to server
		try {
			await this._cancelExportRequest(this._activeExport.jobId);
		} catch (error) {
			console.error('[CompatibleExportHandler] Failed to cancel export:', error);
		}
	}

	/**
	 * Cancel export via HTTP POST request
	 */
	private async _cancelExportRequest(jobId: string): Promise<void> {
		return new Promise((resolve, reject) => {
			const options = {
				hostname: '127.0.0.1',
				port: this._serverPort,
				path: `/export/cancel/${jobId}`,
				method: 'POST',
			};

			const req = http.request(options, (res) => {
				res.on('data', () => {});
				res.on('end', () => {
					resolve();
				});
			});

			req.on('error', reject);
			req.end();
		});
	}

	/**
	 * Handle preview frame request
	 */
	private async handlePreviewFrame(
		requestId: string,
		time: number,
		_width?: number,
		_height?: number
	): Promise<void> {
		try {
			// Get frame from server via HTTP
			const frameUrl = `${this._serverBaseUrl}/frame?time=${time}`;
			const response = await fetch(frameUrl);

			if (!response.ok) {
				throw new Error(`Failed to get frame: ${response.statusText}`);
			}

			const buffer = await response.arrayBuffer();
			const base64Data = Buffer.from(buffer).toString('base64');

			this._postMessage({
				type: 'previewFrameReady',
				requestId,
				frameData: base64Data,
				width: _width || 1920,
				height: _height || 1080,
				timestamp: time,
			});
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			this._postMessage({
				type: 'previewFrameError',
				requestId,
				error: errorMessage,
			});
		}
	}

	/**
	 * Cleanup resources
	 */
	private _cleanup(): void {
		if (this._activeExport?.progressWs) {
			this._activeExport.progressWs.close();
		}
		this._activeExport = null;
	}

	/**
	 * Dispose resources
	 */
	dispose(): void {
		if (this._activeExport) {
			this._activeExport.cancelled = true;
			this._cleanup();
		}
	}
}

/**
 * Check if a message is a compatible mode message
 */
export function isCompatibleModeMessage(message: unknown): boolean {
	if (!message || typeof message !== 'object') {
		return false;
	}
	const type = (message as { type?: string }).type;
	return type === 'startCompatibleExport' ||
		type === 'cancelCompatibleExport' ||
		type === 'requestPreviewFrame';
}
