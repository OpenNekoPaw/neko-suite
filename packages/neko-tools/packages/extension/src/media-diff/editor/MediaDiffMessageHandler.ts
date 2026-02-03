/**
 * MediaDiffMessageHandler - Webview Message Handler
 *
 * Handles messages between the media diff webview and extension host.
 *
 * Responsibilities:
 * - Process diff requests from webview
 * - Run diff analysis
 * - Send results back to webview
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
				}
			);

			if (this.isDisposed) return;

			// Send result
			this.sendMessage({
				type: 'mediaDiff:result',
				payload: result,
			});

			// Send visualization data based on media type
			await this.sendVisualizationData(result);
		} catch (error) {
			this.sendMessage({
				type: 'mediaDiff:error',
				error: error instanceof Error ? error.message : String(error),
			});
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
				}
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
			this.sendMessage({
				type: 'mediaDiff:error',
				error: error instanceof Error ? error.message : String(error),
			});
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

				case 'mediaDiff:cancel':
					this.diffService.cancel();
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
	private async sendVisualizationData(result: DiffResult): Promise<void> {
		if (this.isDisposed) return;

		switch (result.mediaType) {
			case 'image':
				await this.sendImageData();
				break;

			case 'audio':
				if (result.visualization) {
					this.sendMessage({
						type: 'mediaDiff:waveformData',
						payload: {
							currentWaveform:
								result.visualization.currentWaveform ?? [],
							previousWaveform:
								result.visualization.previousWaveform ?? [],
						},
					});
				}
				break;

			case 'video':
				// For video, send initial keyframe data
				if (result.visualization?.currentKeyframes?.length) {
					this.sendMessage({
						type: 'mediaDiff:frameData',
						payload: {
							time: 0,
							version: 'current',
							imageBuffer: result.visualization.currentKeyframes[0]!,
						},
					});
				}
				if (result.visualization?.previousKeyframes?.length) {
					this.sendMessage({
						type: 'mediaDiff:frameData',
						payload: {
							time: 0,
							version: 'previous',
							imageBuffer: result.visualization.previousKeyframes[0]!,
						},
					});
				}
				break;
		}
	}

	/**
	 * Send image data to webview
	 */
	private async sendImageData(): Promise<void> {
		try {
			const versions = await this.diffService.getFileVersions(this.fileUri);

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
				if (result.visualization) {
					this.sendMessage({
						type: 'mediaDiff:waveformData',
						payload: {
							currentWaveform:
								result.visualization.currentWaveform ?? [],
							previousWaveform:
								result.visualization.previousWaveform ?? [],
						},
					});
				}
				break;

			case 'video':
				// For video, send initial keyframe data
				if (result.visualization?.currentKeyframes?.length) {
					this.sendMessage({
						type: 'mediaDiff:frameData',
						payload: {
							time: 0,
							version: 'current',
							imageBuffer: result.visualization.currentKeyframes[0]!,
						},
					});
				}
				if (result.visualization?.previousKeyframes?.length) {
					this.sendMessage({
						type: 'mediaDiff:frameData',
						payload: {
							time: 0,
							version: 'previous',
							imageBuffer: result.visualization.previousKeyframes[0]!,
						},
					});
				}
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
	 * Handle seek request for video
	 */
	private async handleSeek(time: number, requestId?: string): Promise<void> {
		// TODO: Implement video frame seeking
		console.log(`[MediaDiffMessageHandler] Seek to ${time}s`);
	}

	/**
	 * Handle get frame request for video
	 */
	private async handleGetFrame(
		time: number,
		version: 'current' | 'previous',
		requestId?: string
	): Promise<void> {
		// TODO: Implement video frame extraction
		console.log(`[MediaDiffMessageHandler] Get frame at ${time}s (${version})`);
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
		this.diffService.cancel();
	}
}
