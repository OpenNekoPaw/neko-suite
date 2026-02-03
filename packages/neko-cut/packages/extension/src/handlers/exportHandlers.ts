/**
 * Export Message Handler
 *
 * Handles export-related messages from Webview.
 * Routes messages to StreamingExportService for processing.
 *
 * Phase 5: Supports streaming export (Webview GPU render → Extension FFmpeg encode)
 *
 * Message Types:
 * - export:start           : Legacy export (deprecated, returns error)
 * - export:cancel          : Cancel active export
 * - export:streaming:init  : Initialize streaming export
 * - export:streaming:pushFrame : Push rendered frame
 * - export:streaming:finalize  : Finalize export
 */

import * as vscode from 'vscode';
import * as path from 'path';
import {
	getStreamingExportService,
	type StreamingExportService,
} from '../services/StreamingExportService';
import type {
	ExportRequest,
	ExportResponse,
	ExportStartRequest,
	ExportCancelRequest,
	StreamingExportInitRequest,
	StreamingExportPushFrameRequest,
	StreamingExportFinalizeRequest,
	StreamingExportInitResponse,
	StreamingExportFrameAckResponse,
	ExportProgressResponse,
	ExportCompleteResponse,
	ExportErrorResponse,
	StreamingExportJobStatus,
} from '@uniedit/shared';

// =============================================================================
// Types
// =============================================================================

/**
 * Export message union type
 */
type ExportMessage =
	| ExportRequest
	| StreamingExportInitRequest
	| StreamingExportPushFrameRequest
	| StreamingExportFinalizeRequest;

/**
 * Post message function type
 */
type PostMessageFn = (response: ExportResponse | StreamingExportInitResponse | StreamingExportFrameAckResponse) => void;

/**
 * Resolve a media path to absolute path
 * Paths in .jvi files are relative to the .jvi file location
 */
function resolveMediaPath(filePath: string, projectDir: string): string {
	if (path.isAbsolute(filePath)) {
		return filePath;
	}
	return path.resolve(projectDir, filePath);
}

// =============================================================================
// Message Handler
// =============================================================================

/**
 * Handle export messages from Webview
 * @param message - Export message from webview
 * @param postMessage - Function to send response back to webview
 * @param projectDir - Directory containing the .jvi project file (for resolving relative paths)
 */
export async function handleExportMessage(
	message: ExportMessage,
	postMessage: PostMessageFn,
	projectDir?: string
): Promise<boolean> {
	const streamingExportService = getStreamingExportService();

	try {
		switch (message.type) {
			// =================================================================
			// Legacy Export (Deprecated)
			// =================================================================

			case 'export:start': {
				// Phase 5: Legacy extension-side export is deprecated
				// Return error directing user to use streaming export
				const request = message as ExportStartRequest;
				const errorResponse: ExportErrorResponse = {
					type: 'export:error',
					jobId: 'none',
					requestId: request.requestId,
					error: 'Legacy extension-side export is deprecated. Please use streaming export (Webview GPU render → Extension encode).',
				};
				postMessage(errorResponse);
				return true;
			}

			case 'export:cancel': {
				const request = message as ExportCancelRequest;
				const cancelled = streamingExportService.cancelExport(request.payload.jobId);
				if (cancelled) {
					const response: ExportResponse = {
						type: 'export:cancelled',
						jobId: request.payload.jobId,
						requestId: request.requestId,
					};
					postMessage(response);
				}
				return true;
			}

			case 'export:status': {
				const request = message as ExportCancelRequest;
				const status = streamingExportService.getExportStatus(request.payload.jobId);
				const response: ExportResponse = {
					type: 'export:status',
					status,
					requestId: request.requestId,
				};
				postMessage(response);
				return true;
			}

			// =================================================================
			// Streaming Export
			// =================================================================

			case 'export:streaming:init': {
				const request = message as StreamingExportInitRequest;
				const { outputPath, settings, totalFrames, audioTracks, videoSources } = request.payload;

				// CRITICAL: Check if there's already an active export
				if (streamingExportService.hasActiveExport()) {
					const activeInfo = streamingExportService.getActiveExportInfo();
					const response: StreamingExportInitResponse = {
						type: 'export:streaming:initialized',
						jobId: activeInfo?.jobId ?? 'unknown',
						requestId: request.requestId,
						success: false,
						error: '已有导出任务正在进行中，请等待当前导出完成或取消后再试。',
					};
					postMessage(response);
					return true;
				}

				// Show save dialog if outputPath is not absolute
				let finalOutputPath = outputPath;
				if (!outputPath.startsWith('/') && !outputPath.match(/^[A-Z]:\\/i)) {
					const defaultUri = vscode.workspace.workspaceFolders?.[0]?.uri;
					const result = await vscode.window.showSaveDialog({
						defaultUri: defaultUri ? vscode.Uri.joinPath(defaultUri, outputPath) : undefined,
						filters: {
							'Video Files': [settings.format === 'webm' ? 'webm' : 'mp4'],
						},
						title: 'Export Video',
					});

					if (!result) {
						const response: StreamingExportInitResponse = {
							type: 'export:streaming:initialized',
							jobId: '',
							requestId: request.requestId,
							success: false,
							error: 'Export cancelled by user',
						};
						postMessage(response);
						return true;
					}
					finalOutputPath = result.fsPath;
				}

				try {
					// Resolve video source paths relative to project directory
					let resolvedVideoSources = videoSources;
					if (projectDir && videoSources) {
						resolvedVideoSources = videoSources.map(source => ({
							...source,
							videoPath: resolveMediaPath(source.videoPath, projectDir),
						}));
						console.log('[ExportHandler] Resolved video sources:', resolvedVideoSources.map(s => s.videoPath));
					}

					// Resolve audio track paths relative to project directory
					let resolvedAudioTracks = audioTracks;
					if (projectDir && audioTracks) {
						resolvedAudioTracks = audioTracks.map(track => ({
							...track,
							filePath: resolveMediaPath(track.filePath, projectDir),
						}));
						console.log('[ExportHandler] Resolved audio tracks:', resolvedAudioTracks.map(t => t.filePath));
					}

					// Create progress callback that sends updates to Webview
					const onProgress = (status: StreamingExportJobStatus) => {
						const progressResponse: ExportProgressResponse = {
							type: 'export:progress',
							jobId: status.jobId,
							progress: status.progress,
							currentFrame: status.currentFrame ?? 0,
							totalFrames: status.totalFrames ?? 0,
							elapsedTime: status.elapsedTime ?? 0,
							estimatedRemaining: status.estimatedRemaining ?? 0,
							stage: status.state,
						};
						postMessage(progressResponse);
					};

					const jobId = await streamingExportService.initExport({
						outputPath: finalOutputPath,
						settings,
						totalFrames,
						audioTracks: resolvedAudioTracks,
						videoSources: resolvedVideoSources,
						onProgress,
					});

					const encoderInfo = streamingExportService.getEncoderInfo();

					const response: StreamingExportInitResponse = {
						type: 'export:streaming:initialized',
						jobId,
						requestId: request.requestId,
						success: true,
						encoderInfo: {
							videoCodec: settings.videoCodec ?? 'h264',
							audioCodec: settings.audioCodec ?? 'aac',
							hwAccel: encoderInfo.hwAccel,
						},
					};
					postMessage(response);
				} catch (error) {
					const response: StreamingExportInitResponse = {
						type: 'export:streaming:initialized',
						jobId: '',
						requestId: request.requestId,
						success: false,
						error: error instanceof Error ? error.message : String(error),
					};
					postMessage(response);
				}
				return true;
			}

			case 'export:streaming:pushFrame': {
				const request = message as StreamingExportPushFrameRequest;
				const { jobId, frameIndex, frameData } = request.payload;

				try {
					// Handle both binary data and base64 string
					let buffer: Buffer;
					if (typeof frameData === 'string') {
						// Base64 encoded string (legacy)
						buffer = Buffer.from(frameData, 'base64');
					} else if (frameData instanceof Uint8Array) {
						// Direct Uint8Array
						buffer = Buffer.from(frameData);
					} else if (ArrayBuffer.isView(frameData)) {
						// ArrayBufferView
						buffer = Buffer.from(frameData.buffer, frameData.byteOffset, frameData.byteLength);
					} else if (typeof frameData === 'object' && frameData !== null) {
						// Structured clone result (object with numeric keys or data array)
						const data = (frameData as { data?: number[] }).data ?? Object.values(frameData as Record<string, number>);
						buffer = Buffer.from(data);
					} else {
						throw new Error('Invalid frame data format');
					}

					// Push frame to encoder
					const backpressure = await streamingExportService.pushFrame(
						jobId,
						buffer,
						frameIndex
					);

					// Send ack with backpressure info
					const response: StreamingExportFrameAckResponse = {
						type: 'export:streaming:frameAck',
						jobId,
						frameIndex,
						pendingFrames: backpressure.pendingFrames,
						shouldPause: backpressure.shouldPause,
					};
					postMessage(response);
				} catch (error) {
					// Send error response
					const errorResponse: ExportErrorResponse = {
						type: 'export:error',
						jobId,
						error: error instanceof Error ? error.message : String(error),
					};
					postMessage(errorResponse);
				}
				return true;
			}

			case 'export:streaming:finalize': {
				const request = message as StreamingExportFinalizeRequest;
				const { jobId } = request.payload;

				try {
					const result = await streamingExportService.finalizeExport(jobId);

					const response: ExportCompleteResponse = {
						type: 'export:complete',
						jobId,
						requestId: request.requestId,
						outputPath: result.outputPath,
						fileSize: result.fileSize,
						totalTime: Date.now(), // TODO: Track actual time
					};
					postMessage(response);
				} catch (error) {
					const errorResponse: ExportErrorResponse = {
						type: 'export:error',
						jobId,
						error: error instanceof Error ? error.message : String(error),
					};
					postMessage(errorResponse);
				}
				return true;
			}

			default:
				return false;
		}
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		console.error('[ExportMessageHandler] Error:', errorMessage);

		const errorResponse: ExportErrorResponse = {
			type: 'export:error',
			jobId: 'unknown',
			error: errorMessage,
		};
		postMessage(errorResponse);
		return true;
	}
}

/**
 * Check if a message is an export message
 */
export function isExportMessage(message: unknown): message is ExportMessage {
	if (!message || typeof message !== 'object') {
		return false;
	}
	const type = (message as { type?: string }).type;
	return typeof type === 'string' && type.startsWith('export:');
}
