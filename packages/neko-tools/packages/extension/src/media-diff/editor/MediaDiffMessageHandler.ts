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
	StreamConfig,
	AudioStreamConfig,
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
	/** Cached previous file path for frame extraction (Git mode writes to temp file) */
	private previousFilePath: string | null = null;
	/** Debounce timer for seek requests to avoid VideoToolbox session exhaustion */
	private seekDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	/** Pending frame extraction promises for concurrency control */
	private activeFrameExtractions = 0;
	private static readonly MAX_CONCURRENT_FRAMES = 4;

	// ── Streaming state ──────────────────────────────────────────────────
	/** Frame server port (null = not started) */
	private frameServerPort: number | null = null;
	/** Current version video stream ID */
	private currentStreamId: string | null = null;
	/** Previous version video stream ID */
	private previousStreamId: string | null = null;
	/** Current version audio stream ID (video mode, may be null if no audio track) */
	private currentAudioStreamId: string | null = null;
	/** Previous version audio stream ID (video mode) */
	private previousAudioStreamId: string | null = null;
	/** Current version audio-only stream ID (audio diff mode) */
	private currentAudioOnlyStreamId: string | null = null;
	/** Previous version audio-only stream ID (audio diff mode) */
	private previousAudioOnlyStreamId: string | null = null;
	/** Session ID for grouping streams from this handler */
	private readonly sessionId = `diff-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

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
			// Fast path: detect video/audio from extension and show UI immediately.
			// Send preliminary result BEFORE any I/O (ensurePreviousFilePath downloads
			// the full previous version from Git which can take seconds for large videos).
			const mediaType = this.detectMediaTypeFromExtension();
			if (mediaType === 'video' || mediaType === 'audio') {
				// Send preliminary result immediately (zero I/O) so webview shows Play button
				this.sendMessage({
					type: 'mediaDiff:result',
					payload: {
						mediaType,
						similarity: -1,
						details: { analysisInProgress: true },
					},
				});
			}

			// For video/audio: write previous version temp file (needed for streaming).
			// This runs AFTER the preliminary result so the webview already has the Play UI.
			if (mediaType === 'video' || mediaType === 'audio') {
				await this.ensurePreviousFilePath(ref);

				// MD5 check: skip expensive diff if files are identical
				const previousPath = this.previousUri?.fsPath ?? this.previousFilePath;
				if (previousPath && await this.areFilesIdentical(this.fileUri.fsPath, previousPath)) {
					this.sendMessage({
						type: 'mediaDiff:result',
						payload: {
							mediaType,
							similarity: 1.0,
							details: { identical: true },
						},
					});
					return;
				}

				// Extract t=0 frames for preview (non-blocking for the user)
				await this.sendVisualizationData({ mediaType, similarity: -1 } as DiffResult, ref);
			}

			// Run full diff analysis (may take 5-30s for video SSIM/PSNR)
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

			// For video/audio in Git mode, ensure temp file exists (may already be done above)
			if ((result.mediaType === 'video' || result.mediaType === 'audio') && !this.previousFilePath && !this.previousUri) {
				await this.ensurePreviousFilePath(ref);
			}

			// Send full result (updates preliminary result with SSIM scores)
			this.sendMessage({
				type: 'mediaDiff:result',
				payload: result,
			});

			// Send visualization data
			// For video/audio: preliminary sendVisualizationData (line 124) only sent
			// UI scaffolding (t=0 frames / empty waveform). Now send the REAL data
			// from the completed analysis result.
			if (mediaType === 'video' || mediaType === 'audio') {
				this.sendWaveformFromResult(result);
			} else {
				await this.sendVisualizationData(result, ref);
			}
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
			// Fast path: detect video/audio from extension and show UI immediately
			const mediaType = this.detectMediaTypeFromExtension();
			if (mediaType === 'video' || mediaType === 'audio') {
				this.sendMessage({
					type: 'mediaDiff:result',
					payload: {
						mediaType,
						similarity: -1,
						details: { analysisInProgress: true },
					},
				});

				// MD5 check: skip expensive diff if files are identical
				if (await this.areFilesIdentical(this.fileUri.fsPath, this.previousUri.fsPath)) {
					this.sendMessage({
						type: 'mediaDiff:result',
						payload: {
							mediaType,
							similarity: 1.0,
							details: { identical: true },
						},
					});
					return;
				}

				await this.sendVisualizationDataForLocal({ mediaType, similarity: -1 } as DiffResult);
			} else {
				// Non-video/audio: also check MD5 before expensive analysis
				if (await this.areFilesIdentical(this.fileUri.fsPath, this.previousUri.fsPath)) {
					const detectedType = mediaType ?? 'image';
					this.sendMessage({
						type: 'mediaDiff:result',
						payload: {
							mediaType: detectedType,
							similarity: 1.0,
							details: { identical: true },
						},
					});
					return;
				}
			}

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

			// Send full result
			this.sendMessage({
				type: 'mediaDiff:result',
				payload: result,
			});

			// Send visualization data
			// For video/audio: preliminary sendVisualizationDataForLocal (line 218) only
			// sent UI scaffolding. Now send the REAL data from the completed analysis.
			if (mediaType === 'video' || mediaType === 'audio') {
				this.sendWaveformFromResult(result);
			} else {
				await this.sendVisualizationDataForLocal(result);
			}
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

				// ── Streaming lifecycle ──────────────────────────────
				case 'mediaDiff:startStreaming':
					await this.handleStartStreaming(requestId);
					break;

				case 'mediaDiff:stopStreaming':
					await this.handleStopStreaming(requestId);
					break;

				case 'mediaDiff:streamControl':
					await this.handleStreamControl(
						message.payload.action,
						message.payload,
						requestId
					);
					break;

				// ── Audio-only streaming lifecycle ────────────────
				case 'mediaDiff:startAudioStreaming':
					await this.handleStartAudioStreaming(requestId);
					break;

				case 'mediaDiff:stopAudioStreaming':
					await this.handleStopAudioStreaming(requestId);
					break;

				case 'mediaDiff:audioStreamControl':
					await this.handleAudioStreamControl(
						message.payload.action,
						message.payload,
						requestId
					);
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
	 * Send waveform data extracted from a completed analysis result.
	 * Works for both audio (direct waveform) and video (embedded audio diff).
	 */
	private sendWaveformFromResult(result: DiffResult): void {
		if (this.isDisposed) return;
		const currentWaveform = result.visualization?.currentWaveform ?? [];
		const previousWaveform = result.visualization?.previousWaveform ?? [];
		if (currentWaveform.length === 0 && previousWaveform.length === 0) return;
		this.sendMessage({
			type: 'mediaDiff:waveformData',
			payload: { currentWaveform, previousWaveform },
		});
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
				// Skip frame extraction for preliminary calls (engine may not be active yet).
				// Frames are extracted on-demand when user interacts (seek/play).
				if (result.visualization) {
					await this.handleSeek(0);
				}
				break;

			case 'timeline':
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
				// Skip frame extraction for preliminary calls (engine may not be active yet)
				if (result.visualization) {
					await this.handleSeek(0);
				}
				break;

			case 'timeline':
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
	 * Handle seek request for video — debounced to avoid VideoToolbox exhaustion.
	 * Rapid slider dragging can fire dozens of seek events; only the last one matters.
	 */
	private async handleSeek(time: number, requestId?: string): Promise<void> {
		// Cancel any pending debounced seek
		if (this.seekDebounceTimer) {
			clearTimeout(this.seekDebounceTimer);
			this.seekDebounceTimer = null;
		}

		return new Promise<void>((resolve) => {
			this.seekDebounceTimer = setTimeout(async () => {
				this.seekDebounceTimer = null;
				await Promise.all([
					this.handleGetFrame(time, 'current', requestId),
					this.handleGetFrame(time, 'previous', requestId),
				]);
				resolve();
			}, 50);
		});
	}

	/**
	 * Handle get frame request for video — extracts a single frame via neko-engine.
	 * Includes concurrency control to prevent VideoToolbox session exhaustion.
	 */
	private async handleGetFrame(
		time: number,
		version: 'current' | 'previous',
		requestId?: string
	): Promise<void> {
		const filePath = version === 'current'
			? this.fileUri.fsPath
			: (this.previousUri?.fsPath ?? this.previousFilePath);

		if (!filePath) return;

		// Wait if too many concurrent extractions
		while (this.activeFrameExtractions >= MediaDiffMessageHandler.MAX_CONCURRENT_FRAMES) {
			await new Promise(resolve => setTimeout(resolve, 50));
		}
		this.activeFrameExtractions++;

		try {
			const result = await vscode.commands.executeCommand<{ data: Buffer } | null>(
				'neko.engine.extractFrame',
				filePath,
				time
			);

			if (result?.data) {
				// Convert Node.js Buffer → ArrayBuffer for proper postMessage transfer
				// (Buffer sent via postMessage may serialize as {type:'Buffer',data:[...]}
				// instead of transferable ArrayBuffer)
				const buf = result.data;
				const imageBuffer = buf.buffer.slice(
					buf.byteOffset,
					buf.byteOffset + buf.byteLength
				);
				this.sendMessage({
					requestId,
					type: 'mediaDiff:frameData',
					payload: {
						time,
						version,
						imageBuffer,
					},
				});
			}
		} catch (error) {
			console.error(`[MediaDiffMessageHandler] Failed to extract frame at ${time}s (${version}):`, error);
		} finally {
			this.activeFrameExtractions--;
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
				const buf = result.data;
				const imageBuffer = buf.buffer.slice(
					buf.byteOffset,
					buf.byteOffset + buf.byteLength
				);
				this.sendMessage({
					requestId,
					type: 'mediaDiff:elementThumbnail',
					payload: {
						src,
						imageBuffer,
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

	// =========================================================================
	// Streaming Lifecycle
	// =========================================================================

	/**
	 * Start dual H264 streams (current + previous) via neko-engine.
	 *
	 * Flow:
	 *   1. Ensure frame server is running → get port
	 *   2. Probe both files → get resolution, fps, duration
	 *   3. Dispatch `videos:stream` for each file → get streamIds
	 *   4. Send `mediaDiff:streamConfig` to webview immediately
	 *      (no engine-level pause — neko-preview pattern: streams
	 *       created lazily on first play, WebSocket clients connect
	 *       immediately after config arrives)
	 */
	private async handleStartStreaming(requestId?: string): Promise<void> {
		try {
			// 1. Ensure frame server is running
			const serverResult = await vscode.commands.executeCommand<{ port: number } | null>(
				'neko.engine.ensureFrameServer'
			);
			if (!serverResult) {
				throw new Error('Failed to start frame server');
			}
			this.frameServerPort = serverResult.port;

			// 2. Resolve file paths for both versions
			const currentPath = this.fileUri.fsPath;
			const previousPath = this.previousUri?.fsPath ?? this.previousFilePath;
			if (!previousPath) {
				throw new Error('No previous file available for streaming');
			}

			// 3. Probe both files in parallel to get resolution, fps, duration, hasAudio
			const [currentInfo, previousInfo] = await Promise.all([
				vscode.commands.executeCommand<{ width: number; height: number; fps: number; duration: number; hasAudio?: boolean } | null>(
					'neko.engine.probeInternal', currentPath
				),
				vscode.commands.executeCommand<{ width: number; height: number; fps: number; duration: number; hasAudio?: boolean } | null>(
					'neko.engine.probeInternal', previousPath
				),
			]);

			if (!currentInfo || !previousInfo) {
				throw new Error('Failed to probe media files');
			}

			console.log('[MediaDiffMessageHandler] Probe results:', JSON.stringify({ currentInfo, previousInfo }));

			// Use the larger dimensions (to avoid clipping) and current file's fps
			const width = Math.max(currentInfo.width, previousInfo.width);
			const height = Math.max(currentInfo.height, previousInfo.height);
			const fps = currentInfo.fps || 30;
			const duration = Math.max(currentInfo.duration, previousInfo.duration);

			// 4. Start streams for both files via videos:stream
			const [currentResult, previousResult] = await Promise.all([
				vscode.commands.executeCommand<string | null>(
					'neko.engine.dispatch',
					'videos', 'stream',
					{ source: currentPath, sessionId: this.sessionId }
				),
				vscode.commands.executeCommand<string | null>(
					'neko.engine.dispatch',
					'videos', 'stream',
					{ source: previousPath, sessionId: this.sessionId }
				),
			]);

			if (!currentResult || !previousResult) {
				throw new Error('Failed to create video streams');
			}

			const currentStream = JSON.parse(currentResult);
			const previousStream = JSON.parse(previousResult);

			this.currentStreamId = currentStream.streamId ?? currentStream.data?.streamId;
			this.previousStreamId = previousStream.streamId ?? previousStream.data?.streamId;

			if (!this.currentStreamId || !this.previousStreamId) {
				throw new Error('Stream creation returned no streamId');
			}

			// 5. Always try to create audio streams — don't rely on hasAudio probe
			// (probeInternal may return hasAudio as undefined for some formats).
			// If the file has no audio track, the engine returns an error which we catch.
			console.log('[MediaDiffMessageHandler] Audio probe:', {
				currentHasAudio: currentInfo.hasAudio,
				previousHasAudio: previousInfo.hasAudio,
			});
			try {
				const [curAudioResult, prevAudioResult] = await Promise.allSettled([
					Promise.resolve(vscode.commands.executeCommand<string | null>(
						'neko.engine.dispatch',
						'audios', 'stream',
						{ source: currentPath, sessionId: this.sessionId }
					)),
					Promise.resolve(vscode.commands.executeCommand<string | null>(
						'neko.engine.dispatch',
						'audios', 'stream',
						{ source: previousPath, sessionId: this.sessionId }
					)),
				]);

				if (curAudioResult.status === 'fulfilled' && curAudioResult.value) {
					const curAudio = JSON.parse(curAudioResult.value);
					this.currentAudioStreamId = curAudio.streamId ?? curAudio.data?.streamId ?? null;
					console.log('[MediaDiffMessageHandler] Current audio stream created:', this.currentAudioStreamId);
				} else {
					console.log('[MediaDiffMessageHandler] Current file has no audio track (or stream creation failed)');
				}

				if (prevAudioResult.status === 'fulfilled' && prevAudioResult.value) {
					const prevAudio = JSON.parse(prevAudioResult.value);
					this.previousAudioStreamId = prevAudio.streamId ?? prevAudio.data?.streamId ?? null;
					console.log('[MediaDiffMessageHandler] Previous audio stream created:', this.previousAudioStreamId);
				} else {
					console.log('[MediaDiffMessageHandler] Previous file has no audio track (or stream creation failed)');
				}
			} catch (audioErr) {
				console.warn('[MediaDiffMessageHandler] Audio stream creation failed (non-fatal):', audioErr);
			}

			// 6. Send config to webview immediately (no engine-level pause).
			// Streams auto-play — WebSocket clients connect as soon as
			// config arrives, well within the subscriber timeout.
			const config: StreamConfig = {
				port: this.frameServerPort,
				currentStreamId: this.currentStreamId,
				previousStreamId: this.previousStreamId,
				currentAudioStreamId: this.currentAudioStreamId ?? undefined,
				previousAudioStreamId: this.previousAudioStreamId ?? undefined,
				width,
				height,
				fps,
				duration,
			};

			this.sendMessage({
				requestId,
				type: 'mediaDiff:streamConfig',
				payload: config,
			});
		} catch (error) {
			console.error('[MediaDiffMessageHandler] Failed to start streaming:', error);
			this.sendMessage({
				requestId,
				type: 'mediaDiff:streamError',
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	/**
	 * Stop all streams (video + audio) and clean up state.
	 */
	private async handleStopStreaming(_requestId?: string): Promise<void> {
		try {
			const stopPromises: Promise<unknown>[] = [];

			for (const [sid, group] of [
				[this.currentStreamId, 'streams'],
				[this.previousStreamId, 'streams'],
				[this.currentAudioStreamId, 'streams'],
				[this.previousAudioStreamId, 'streams'],
			] as const) {
				if (sid) {
					stopPromises.push(
						Promise.resolve(vscode.commands.executeCommand(
							'neko.engine.dispatch', group, 'stop', { streamId: sid }
						))
					);
				}
			}

			await Promise.allSettled(stopPromises);
		} catch (error) {
			console.error('[MediaDiffMessageHandler] Failed to stop streaming:', error);
		} finally {
			this.currentStreamId = null;
			this.previousStreamId = null;
			this.currentAudioStreamId = null;
			this.previousAudioStreamId = null;
		}
	}

	/**
	 * Forward playback control (play/pause/seek) to all active streams.
	 *
	 * On first 'play', lazily creates streams (neko-preview pattern):
	 * streams are only created when the user clicks Play, ensuring
	 * WebSocket clients connect immediately after creation and well
	 * within the engine's subscriber timeout.
	 *
	 * Controls both video and audio streams simultaneously.
	 */
	private async handleStreamControl(
		action: 'play' | 'pause' | 'seek',
		payload: { time?: number; speed?: number },
		requestId?: string
	): Promise<void> {
		// Lazy stream creation on first play (neko-preview pattern)
		if (action === 'play' && !this.currentStreamId) {
			await this.handleStartStreaming(requestId);
			// Streams auto-play after creation — no resume needed
			return;
		}

		// Collect all active streams with their dispatch group
		const allStreams = [
			{ id: this.currentStreamId, group: 'videos' },
			{ id: this.previousStreamId, group: 'videos' },
			{ id: this.currentAudioStreamId, group: 'audios' },
			{ id: this.previousAudioStreamId, group: 'audios' },
		].filter((s): s is { id: string; group: string } => s.id != null);

		if (allStreams.length === 0) return;

		try {
			let streamAction: string;
			let options: Record<string, unknown>;

			switch (action) {
				case 'play':
					streamAction = 'resume';
					options = { speed: payload.speed ?? 1.0 };
					break;
				case 'pause':
					streamAction = 'pause';
					options = {};
					break;
				case 'seek':
					streamAction = 'seek';
					options = { time: payload.time ?? 0 };
					break;
			}

			await Promise.all(
				allStreams.map((s) =>
					Promise.resolve(vscode.commands.executeCommand(
						'neko.engine.dispatch',
						s.group, streamAction,
						{ ...options, streamId: s.id }
					))
				)
			);
		} catch (error) {
			console.error(`[MediaDiffMessageHandler] Stream control '${action}' failed:`, error);
			this.sendMessage({
				requestId,
				type: 'mediaDiff:streamError',
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	// =========================================================================
	// Audio-Only Streaming (for Audio Diff)
	// =========================================================================

	/**
	 * Start dual audio-only streams (current + previous) for audio diff.
	 *
	 * Flow:
	 *   1. Ensure frame server is running → get port
	 *   2. Resolve file paths
	 *   3. Dispatch `audios:stream` for each file → get streamIds
	 *   4. Send `mediaDiff:audioStreamConfig` to webview immediately
	 *      (no engine-level pause — AudioStreamClient pauses locally
	 *       to avoid subscriber timeout)
	 */
	private async handleStartAudioStreaming(requestId?: string): Promise<void> {
		try {
			// 1. Ensure frame server
			const serverResult = await vscode.commands.executeCommand<{ port: number } | null>(
				'neko.engine.ensureFrameServer'
			);
			if (!serverResult) {
				throw new Error('Failed to start frame server');
			}
			this.frameServerPort = serverResult.port;

			// 2. Resolve file paths
			const currentPath = this.fileUri.fsPath;
			const previousPath = this.previousUri?.fsPath ?? this.previousFilePath;
			if (!previousPath) {
				throw new Error('No previous file available for audio streaming');
			}

			// 3. Probe duration
			const [currentInfo, previousInfo] = await Promise.all([
				vscode.commands.executeCommand<{ duration: number } | null>(
					'neko.engine.probeInternal', currentPath
				),
				vscode.commands.executeCommand<{ duration: number } | null>(
					'neko.engine.probeInternal', previousPath
				),
			]);

			const duration = Math.max(
				currentInfo?.duration ?? 0,
				previousInfo?.duration ?? 0
			);

			// 4. Create audio streams
			const [curResult, prevResult] = await Promise.all([
				vscode.commands.executeCommand<string | null>(
					'neko.engine.dispatch',
					'audios', 'stream',
					{ source: currentPath, sessionId: this.sessionId }
				),
				vscode.commands.executeCommand<string | null>(
					'neko.engine.dispatch',
					'audios', 'stream',
					{ source: previousPath, sessionId: this.sessionId }
				),
			]);

			if (!curResult || !prevResult) {
				throw new Error('Failed to create audio streams');
			}

			const curAudio = JSON.parse(curResult);
			const prevAudio = JSON.parse(prevResult);
			this.currentAudioOnlyStreamId = curAudio.streamId ?? curAudio.data?.streamId;
			this.previousAudioOnlyStreamId = prevAudio.streamId ?? prevAudio.data?.streamId;

			if (!this.currentAudioOnlyStreamId || !this.previousAudioOnlyStreamId) {
				throw new Error('Audio stream creation returned no streamId');
			}

			// 5. Send config to webview immediately so WebSocket clients
			//    connect before the engine subscriber timeout fires.
			//    AudioStreamClients pause locally to suppress auto-playback.
			const config: AudioStreamConfig = {
				port: this.frameServerPort,
				currentAudioStreamId: this.currentAudioOnlyStreamId,
				previousAudioStreamId: this.previousAudioOnlyStreamId,
				duration,
			};

			this.sendMessage({
				requestId,
				type: 'mediaDiff:audioStreamConfig',
				payload: config,
			});
		} catch (error) {
			console.error('[MediaDiffMessageHandler] Failed to start audio streaming:', error);
			this.sendMessage({
				requestId,
				type: 'mediaDiff:streamError',
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	/**
	 * Stop audio-only streams and clean up state.
	 */
	private async handleStopAudioStreaming(_requestId?: string): Promise<void> {
		try {
			const stopPromises: Promise<unknown>[] = [];

			for (const sid of [this.currentAudioOnlyStreamId, this.previousAudioOnlyStreamId]) {
				if (sid) {
					stopPromises.push(
						Promise.resolve(vscode.commands.executeCommand(
							'neko.engine.dispatch', 'streams', 'stop', { streamId: sid }
						))
					);
				}
			}

			await Promise.allSettled(stopPromises);
		} catch (error) {
			console.error('[MediaDiffMessageHandler] Failed to stop audio streaming:', error);
		} finally {
			this.currentAudioOnlyStreamId = null;
			this.previousAudioOnlyStreamId = null;
		}
	}

	/**
	 * Forward playback control to audio-only streams.
	 *
	 * On first 'play', lazily creates streams (neko-preview pattern):
	 * streams are only created when the user clicks Play, ensuring
	 * WebSocket clients connect immediately after creation and well
	 * within the engine's subscriber timeout.
	 */
	private async handleAudioStreamControl(
		action: 'play' | 'pause' | 'seek',
		payload: { time?: number },
		requestId?: string
	): Promise<void> {
		// Lazy stream creation on first play (neko-preview pattern)
		if (action === 'play' && !this.currentAudioOnlyStreamId) {
			await this.handleStartAudioStreaming(requestId);
			// Streams auto-play after creation — no resume needed
			return;
		}

		const allStreams = [
			this.currentAudioOnlyStreamId,
			this.previousAudioOnlyStreamId,
		].filter((id): id is string => id != null);

		if (allStreams.length === 0) return;

		try {
			let streamAction: string;
			let options: Record<string, unknown>;

			switch (action) {
				case 'play':
					streamAction = 'resume';
					options = {};
					break;
				case 'pause':
					streamAction = 'pause';
					options = {};
					break;
				case 'seek':
					streamAction = 'seek';
					options = { time: payload.time ?? 0 };
					break;
			}

			await Promise.all(
				allStreams.map((sid) =>
					Promise.resolve(vscode.commands.executeCommand(
						'neko.engine.dispatch',
						'audios', streamAction,
						{ ...options, streamId: sid }
					))
				)
			);
		} catch (error) {
			console.error(`[MediaDiffMessageHandler] Audio stream control '${action}' failed:`, error);
			this.sendMessage({
				requestId,
				type: 'mediaDiff:streamError',
				error: error instanceof Error ? error.message : String(error),
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
	 * Ensure previous file path is available for frame extraction.
	 * In Git mode, writes the previous version to a temp file.
	 */
	private async ensurePreviousFilePath(ref: string): Promise<void> {
		// Already have a path (local comparison or previously cached)
		if (this.previousUri || this.previousFilePath) return;

		try {
			const versions = await this.diffService.getFileVersions(this.fileUri, ref);
			if (versions.isNewFile || !versions.previous) return;

			const fs = await import('fs/promises');
			const os = await import('os');
			const path = await import('path');

			const ext = path.extname(this.fileUri.fsPath) || '.mp4';
			const tmpPath = path.join(
				os.tmpdir(),
				`media-diff-prev-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`
			);
			await fs.writeFile(tmpPath, Buffer.from(versions.previous));
			this.previousFilePath = tmpPath;
		} catch (error) {
			console.error('[MediaDiffMessageHandler] Failed to write previous version temp file:', error);
		}
	}

	/**
	 * Clean up temp files created for Git mode frame extraction
	 */
	private async cleanupTempFiles(): Promise<void> {
		if (this.previousFilePath) {
			try {
				const fs = await import('fs/promises');
				await fs.unlink(this.previousFilePath);
			} catch { /* ignore */ }
			this.previousFilePath = null;
		}
	}

	/**
	 * Quick media type detection from file extension (no I/O).
	 * Used for fast-path: show video/audio UI before full analysis completes.
	 * Returns null for non-video/audio types (they don't benefit from lazy loading).
	 */
	private detectMediaTypeFromExtension(): 'video' | 'audio' | null {
		const ext = this.fileUri.fsPath.toLowerCase().match(/\.[^.]+$/)?.[0];
		if (!ext) return null;
		const videoExts = new Set(['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v', '.flv', '.wmv', '.mpg', '.mpeg', '.ts', '.mts']);
		const audioExts = new Set(['.mp3', '.wav', '.flac', '.aac', '.ogg', '.wma', '.m4a', '.opus', '.aiff', '.aif']);
		if (videoExts.has(ext)) return 'video';
		if (audioExts.has(ext)) return 'audio';
		return null;
	}

	/**
	 * Compute MD5 hash of a file (streaming, memory-efficient for large files).
	 */
	private async computeFileHash(filePath: string): Promise<string> {
		const crypto = await import('crypto');
		const fs = await import('fs');
		return new Promise((resolve, reject) => {
			const hash = crypto.createHash('md5');
			const stream = fs.createReadStream(filePath);
			stream.on('data', (data: Buffer) => hash.update(data));
			stream.on('end', () => resolve(hash.digest('hex')));
			stream.on('error', reject);
		});
	}

	/**
	 * Check if two files are identical by MD5 hash.
	 * Returns true if files have the same content.
	 */
	private async areFilesIdentical(pathA: string, pathB: string): Promise<boolean> {
		try {
			const [hashA, hashB] = await Promise.all([
				this.computeFileHash(pathA),
				this.computeFileHash(pathB),
			]);
			const identical = hashA === hashB;
			if (identical) {
				console.log(`[MediaDiffMessageHandler] Files are identical (MD5: ${hashA})`);
			}
			return identical;
		} catch (error) {
			console.warn('[MediaDiffMessageHandler] MD5 check failed, proceeding with diff:', error);
			return false;
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
		// Cancel pending seek debounce
		if (this.seekDebounceTimer) {
			clearTimeout(this.seekDebounceTimer);
			this.seekDebounceTimer = null;
		}
		// Only cancel this handler's analysis, NOT the shared service
		this.cancelCurrentAnalysis();
		// Stop active streams (fire-and-forget)
		void this.handleStopStreaming();
		void this.handleStopAudioStreaming();
		// Clean up temp files created for Git mode frame extraction
		void this.cleanupTempFiles();
	}
}
