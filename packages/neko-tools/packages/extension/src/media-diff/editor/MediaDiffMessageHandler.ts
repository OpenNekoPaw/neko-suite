/**
 * MediaDiffMessageHandler - Webview Message Handler
 *
 * Handles messages between the media diff webview and extension host.
 *
 * Responsibilities:
 * - Process diff requests from webview
 * - Run diff analysis
 * - Send results back to webview
 *
 * Concurrency Design:
 * - Each handler manages its own AbortController for cancellation scoping
 * - dispose() only cancels this handler's analysis, not the shared service
 * - Multiple editors can run analyses concurrently without interference
 */

import * as vscode from 'vscode';
import type {
	MediaDiffRequest,
	MediaDiffResponse,
	DiffResult,
} from '@neko/shared';
import { MediaDiffService } from '../services/MediaDiffService';

// =============================================================================
// Message Handler
// =============================================================================

/**
 * Handles messages for media diff webview
 */
export class MediaDiffMessageHandler implements vscode.Disposable {
	private isDisposed = false;
	/** Per-handler AbortController — only cancels this handler's analysis */
	private currentAbortController: AbortController | null = null;

	constructor(
		private readonly webview: vscode.Webview,
		private readonly fileUri: vscode.Uri,
		private readonly diffService: MediaDiffService,
		private readonly previousUri?: vscode.Uri
	) {}

	/**
	 * Initialize diff analysis
	 */
	async initializeDiff(ref: string = 'HEAD'): Promise<void> {
		// If previousUri is set, this is a local file comparison
		if (this.previousUri) {
			return this.initializeLocalDiff();
		}

		if (this.isDisposed) return;

		// Cancel any previous analysis for this handler
		this.cancelCurrentAnalysis();
		const abortController = new AbortController();
		this.currentAbortController = abortController;

		try {
			// Run diff analysis with progress
			const result = await this.diffService.analyze(
				this.fileUri,
				ref,
				{ generateHeatmap: true },
				(progress, stage) => {
					this.sendMessage({
						type: 'mediaDiff:progress',
						payload: { progress, stage },
					});
				},
				abortController.signal
			);

			if (this.isDisposed) return;

			// Send result
			this.sendMessage({
				type: 'mediaDiff:result',
				payload: result,
			});

			// Send visualization data based on media type
			await this.sendVisualizationData(result, ref);
		} catch (error) {
			if (abortController.signal.aborted) return; // Silently ignore cancelled
			this.sendMessage({
				type: 'mediaDiff:error',
				error: error instanceof Error ? error.message : String(error),
			});
		} finally {
			if (this.currentAbortController === abortController) {
				this.currentAbortController = null;
			}
		}
	}

	/**
	 * Initialize local file diff analysis (two local files comparison)
	 */
	async initializeLocalDiff(): Promise<void> {
		if (this.isDisposed) return;
		if (!this.previousUri) {
			this.sendMessage({
				type: 'mediaDiff:error',
				error: 'No previous file specified for local comparison',
			});
			return;
		}

		// Cancel any previous analysis for this handler
		this.cancelCurrentAnalysis();
		const abortController = new AbortController();
		this.currentAbortController = abortController;

		try {
			// Run diff analysis with progress
			const result = await this.diffService.analyzeLocalFiles(
				this.fileUri,
				this.previousUri,
				{ generateHeatmap: true },
				(progress, stage) => {
					this.sendMessage({
						type: 'mediaDiff:progress',
						payload: { progress, stage },
					});
				},
				abortController.signal
			);

			if (this.isDisposed) return;

			// Send result
			this.sendMessage({
				type: 'mediaDiff:result',
				payload: result,
			});

			// Send visualization data based on media type
			await this.sendVisualizationDataForLocal(result);
		} catch (error) {
			if (abortController.signal.aborted) return;
			this.sendMessage({
				type: 'mediaDiff:error',
				error: error instanceof Error ? error.message : String(error),
			});
		} finally {
			if (this.currentAbortController === abortController) {
				this.currentAbortController = null;
			}
		}
	}

	/**
	 * Handle message from webview
	 */
	async handleMessage(message: MediaDiffRequest): Promise<void> {
		if (this.isDisposed) return;

		const { type, requestId } = message;

		try {
			switch (type) {
				case 'mediaDiff:init':
					await this.initializeDiff(message.payload.ref);
					break;

				case 'mediaDiff:initLocal':
					await this.initializeLocalDiff();
					break;

				case 'mediaDiff:setViewMode':
					// View mode is handled in webview, just acknowledge
					break;

				case 'mediaDiff:seek':
					// For video: get frame at specific time
					await this.handleSeek(message.payload.time, requestId);
					break;

				case 'mediaDiff:getFrame':
					// For video: get specific frame
					await this.handleGetFrame(
						message.payload.time,
						message.payload.version,
						requestId
					);
					break;

				case 'mediaDiff:inspectElement':
					// Lazy content diff: extract thumbnail for a media element
					await this.handleInspectElement(
						message.payload.src,
						requestId
					);
					break;

				case 'mediaDiff:cancel':
					// Only cancel this handler's analysis, not the global service
					this.cancelCurrentAnalysis();
					break;

				case 'mediaDiff:getFileHistory':
					await this.handleGetFileHistory(
						message.payload?.maxCount,
						requestId
					);
					break;

				case 'mediaDiff:changeRef':
					await this.initializeDiff(message.payload.ref);
					break;
			}
		} catch (error) {
			this.sendMessage({
				requestId,
				type: 'mediaDiff:error',
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	/**
	 * Send visualization data based on media type
	 */
	private async sendVisualizationData(result: DiffResult, ref: string = 'HEAD'): Promise<void> {
		if (this.isDisposed) return;

		switch (result.mediaType) {
			case 'image':
				await this.sendImageData(ref);
				break;

			case 'audio':
				// Always send waveform data so webview renders audio diff view
				this.sendMessage({
					type: 'mediaDiff:waveformData',
					payload: {
						currentWaveform:
							result.visualization?.currentWaveform ?? [],
						previousWaveform:
							result.visualization?.previousWaveform ?? [],
					},
				});
				break;

			case 'video':
				// Proactively extract initial frames at t=0 for both versions
				await this.handleSeek(0);
				break;

			case 'timeline':
				// Timeline diff data is fully contained in the result, no extra visualization needed
				break;
		}
	}

	/**
	 * Send image data to webview
	 */
	private async sendImageData(ref: string = 'HEAD'): Promise<void> {
		try {
			const versions = await this.diffService.getFileVersions(this.fileUri, ref);

			// Handle new file case
			if (versions.isNewFile) {
				this.sendMessage({
					type: 'mediaDiff:imageData',
					payload: {
						currentImage: versions.current,
						previousImage: null, // No previous version for new files
						mimeType: this.getMimeType(this.fileUri.fsPath),
						isNewFile: true,
					},
				});
				return;
			}

			this.sendMessage({
				type: 'mediaDiff:imageData',
				payload: {
					currentImage: versions.current,
					previousImage: versions.previous,
					mimeType: this.getMimeType(this.fileUri.fsPath),
				},
			});
		} catch (error) {
			console.error('[MediaDiffMessageHandler] Failed to send image data:', error);
		}
	}

	/**
	 * Send visualization data for local file comparison
	 */
	private async sendVisualizationDataForLocal(result: DiffResult): Promise<void> {
		if (this.isDisposed) return;

		switch (result.mediaType) {
			case 'image':
				await this.sendImageDataForLocal();
				break;

			case 'audio':
				// Always send waveform data so webview renders audio diff view
				this.sendMessage({
					type: 'mediaDiff:waveformData',
					payload: {
						currentWaveform:
							result.visualization?.currentWaveform ?? [],
						previousWaveform:
							result.visualization?.previousWaveform ?? [],
					},
				});
				break;

			case 'video':
				// Proactively extract initial frames at t=0 for both versions
				await this.handleSeek(0);
				break;

			case 'timeline':
				// Timeline diff data is fully contained in the result, no extra visualization needed
				break;
		}
	}

	/**
	 * Send image data for local file comparison
	 */
	private async sendImageDataForLocal(): Promise<void> {
		if (!this.previousUri) return;

		try {
			const versions = await this.diffService.getLocalFileVersions(
				this.fileUri,
				this.previousUri
			);

			this.sendMessage({
				type: 'mediaDiff:imageData',
				payload: {
					currentImage: versions.current,
					previousImage: versions.previous,
					mimeType: this.getMimeType(this.fileUri.fsPath),
				},
			});
		} catch (error) {
			console.error('[MediaDiffMessageHandler] Failed to send local image data:', error);
		}
	}

	/**
	 * Handle seek request for video — extracts frames for both versions at the given time
	 */
	private async handleSeek(time: number, requestId?: string): Promise<void> {
		await Promise.all([
			this.handleGetFrame(time, 'current', requestId),
			this.handleGetFrame(time, 'previous', requestId),
		]);
	}

	/**
	 * Handle get frame request for video — extracts a single frame via neko-engine
	 */
	private async handleGetFrame(
		time: number,
		version: 'current' | 'previous',
		requestId?: string
	): Promise<void> {
		const filePath = version === 'current'
			? this.fileUri.fsPath
			: this.previousUri?.fsPath;

		if (!filePath) return;

		try {
			const result = await vscode.commands.executeCommand<{ data: Buffer } | null>(
				'neko.engine.extractFrame',
				filePath,
				time
			);

			if (result?.data) {
				this.sendMessage({
					requestId,
					type: 'mediaDiff:frameData',
					payload: {
						time,
						version,
						imageBuffer: result.data,
					},
				});
			}
		} catch (error) {
			console.error(`[MediaDiffMessageHandler] Failed to extract frame at ${time}s (${version}):`, error);
		}
	}

	/**
	 * Handle inspect element request — lazy content diff for timeline media elements.
	 * Extracts a low-resolution thumbnail frame from the media source.
	 */
	private async handleInspectElement(
		src: string,
		requestId?: string
	): Promise<void> {
		if (!src) return;

		// Resolve src relative to the project file directory
		const path = await import('path');
		const projectDir = path.dirname(this.fileUri.fsPath);
		const absoluteSrc = path.isAbsolute(src) ? src : path.join(projectDir, src);

		try {
			// Extract a thumbnail frame at t=0 with low resolution
			const result = await vscode.commands.executeCommand<{ data: Buffer } | null>(
				'neko.engine.extractFrame',
				absoluteSrc,
				0
			);

			if (result?.data) {
				this.sendMessage({
					requestId,
					type: 'mediaDiff:elementThumbnail',
					payload: {
						src,
						imageBuffer: result.data,
					},
				});
			}
		} catch (error) {
			console.error(`[MediaDiffMessageHandler] Failed to inspect element ${src}:`, error);
		}
	}

	/**
	 * Handle get file history request
	 */
	private async handleGetFileHistory(
		maxCount?: number,
		requestId?: string
	): Promise<void> {
		try {
			const commits = await this.diffService.getFileHistory(
				this.fileUri,
				maxCount
			);
			this.sendMessage({
				requestId,
				type: 'mediaDiff:fileHistory',
				payload: { commits },
			});
		} catch (error) {
			console.error('[MediaDiffMessageHandler] Failed to get file history:', error);
			this.sendMessage({
				requestId,
				type: 'mediaDiff:fileHistory',
				payload: { commits: [] },
			});
		}
	}

	/**
	 * Cancel the current analysis for this handler only.
	 * Does NOT affect analyses from other handlers sharing the same diffService.
	 */
	private cancelCurrentAnalysis(): void {
		if (this.currentAbortController) {
			this.currentAbortController.abort();
			this.currentAbortController = null;
		}
	}

	/**
	 * Get MIME type from file path
	 */
	private getMimeType(filePath: string): string {
		const ext = filePath.toLowerCase().match(/\.[^.]+$/)?.[0];
		const mimeTypes: Record<string, string> = {
			'.png': 'image/png',
			'.jpg': 'image/jpeg',
			'.jpeg': 'image/jpeg',
			'.gif': 'image/gif',
			'.webp': 'image/webp',
			'.bmp': 'image/bmp',
			'.svg': 'image/svg+xml',
		};
		return mimeTypes[ext ?? ''] ?? 'application/octet-stream';
	}

	/**
	 * Send message to webview
	 */
	private sendMessage(message: Partial<MediaDiffResponse>): void {
		if (!this.isDisposed) {
			this.webview.postMessage(message);
		}
	}

	dispose(): void {
		this.isDisposed = true;
		// Only cancel this handler's analysis, NOT the shared service
		this.cancelCurrentAnalysis();
	}
}
