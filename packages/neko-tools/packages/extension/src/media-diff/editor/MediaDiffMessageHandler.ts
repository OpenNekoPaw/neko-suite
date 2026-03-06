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
import type { EngineClient } from '@neko/neko-client';
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
	/**
	 * In-flight promise for ensurePreviousFilePath (Git mode only).
	 * Set before git show starts, cleared after it resolves.
	 * handleStartStreaming awaits this before using previousFilePath.
	 */
	private fetchPromise: Promise<void> | null = null;
	/** Pending frame extraction promises for concurrency control */
	private activeFrameExtractions = 0;
	private static readonly MAX_CONCURRENT_FRAMES = 4;

	// ── Streaming state ──────────────────────────────────────────────────
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
		private readonly engineClient: EngineClient | null,
		private readonly previousUri?: vscode.Uri
	) {}

	/**
	 * Assert engine client is available. Throws into caller's try/catch.
	 */
	private requireEngine(): EngineClient {
		if (!this.engineClient) {
			throw new Error('neko-engine not available');
		}
		return this.engineClient;
	}

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

		// Track whether the background pipeline took ownership of abortController cleanup
		let pipelineOwnsCleanup = false;

		try {
			// Fast path: detect video/audio from extension and show UI immediately.
			// Send preliminary result BEFORE any I/O so webview renders Play button.
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
			}

			// For video/audio: extract previous version to temp file (needed for all subsequent ops).
			if (mediaType === 'video' || mediaType === 'audio') {
				// Broadcast fetch state so the webview can disable Play until the file is ready.
				// handleStartStreaming awaits this.fetchPromise to avoid the race condition
				// where the user clicks Play before git show finishes (3-30s).
				this.sendFetchState('fetching');
				this.fetchPromise = this.ensurePreviousFilePath(ref);
				await this.fetchPromise;
				this.fetchPromise = null;
				this.sendFetchState('ready');

				// MD5 check: skip expensive diff if files are identical
				const prevPath = this.previousUri?.fsPath ?? this.previousFilePath;
				if (prevPath && await this.areFilesIdentical(this.fileUri.fsPath, prevPath)) {
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

				// ── Fire-and-forget pipeline: frame extraction + waveform + diff ──
				// IMPORTANT: Do NOT await — handleMessage must return immediately
				// so subsequent messages (streamControl, seek, etc.) are not blocked
				// by the long-running SSIM/PSNR analysis (5-30s).
				// Pipeline takes ownership of abortController cleanup.
				pipelineOwnsCleanup = true;
				const previousPath = prevPath;
				this.runAnalysisPipeline(mediaType, previousPath, ref, abortController);
				return;
			} else {
				// Non-video/audio: sequential path (image/timeline)
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

				this.sendMessage({
					type: 'mediaDiff:result',
					payload: result,
				});

				await this.sendVisualizationData(result, ref);
			}
		} catch (error) {
			if (abortController.signal.aborted) return; // Silently ignore cancelled
			this.sendMessage({
				type: 'mediaDiff:error',
				error: error instanceof Error ? error.message : String(error),
			});
		} finally {
			// Only clean up if the background pipeline didn't take ownership
			if (!pipelineOwnsCleanup && this.currentAbortController === abortController) {
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

		let pipelineOwnsCleanup = false;

		try {
			// Fast path: detect video/audio from extension and show UI immediately
			const mediaType = this.detectMediaTypeFromExtension();

			// MD5 check: skip expensive diff if files are identical
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

			if (mediaType === 'video' || mediaType === 'audio') {
				this.sendMessage({
					type: 'mediaDiff:result',
					payload: {
						mediaType,
						similarity: -1,
						details: { analysisInProgress: true },
					},
				});

				// ── Fire-and-forget pipeline ──
				// IMPORTANT: Do NOT await — handleMessage must return immediately
				// so subsequent messages (streamControl, seek, etc.) are not blocked.
				pipelineOwnsCleanup = true;
				this.runLocalAnalysisPipeline(mediaType, abortController);
				return;
			} else {
				// Non-video/audio: sequential path
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

				this.sendMessage({
					type: 'mediaDiff:result',
					payload: result,
				});

				await this.sendVisualizationDataForLocal(result);
			}
		} catch (error) {
			if (abortController.signal.aborted) return;
			this.sendMessage({
				type: 'mediaDiff:error',
				error: error instanceof Error ? error.message : String(error),
			});
		} finally {
			if (!pipelineOwnsCleanup && this.currentAbortController === abortController) {
				this.currentAbortController = null;
			}
		}
	}

	/**
	 * Run analysis pipeline for Git mode (fire-and-forget).
	 * Runs frame extraction, waveform, and SSIM/PSNR in parallel.
	 * Each task sends its own message to webview independently.
	 * Errors are caught and reported per-task — never propagates.
	 */
	private runAnalysisPipeline(
		mediaType: 'video' | 'audio',
		previousPath: string | undefined,
		ref: string,
		abortController: AbortController,
	): void {
		const run = async () => {
			try {
				const parallelTasks: Promise<void>[] = [];

				// Task A: Extract t=0 preview frames (fast, ~200ms)
				parallelTasks.push(
					this.sendVisualizationData({ mediaType, similarity: -1 } as DiffResult, ref)
						.catch(err => console.warn('[MediaDiffMessageHandler] Frame extraction failed:', err))
				);

				// Task B: Early waveform (audio) or early frame extraction (video), ~200-500ms
				if (this.engineClient && previousPath) {
					if (mediaType === 'audio') {
						this.startEarlyWaveform(this.engineClient, this.fileUri.fsPath, previousPath, abortController.signal);
					} else if (mediaType === 'video') {
						this.startEarlyFrameExtraction(this.engineClient, this.fileUri.fsPath, previousPath, abortController.signal);
					}
				}

				// Task C: Full diff analysis (SSIM/PSNR, 5-30s)
				const diffOptions: Record<string, unknown> = { generateHeatmap: true };
				if (previousPath) {
					diffOptions.currentPath = this.fileUri.fsPath;
					diffOptions.previousPath = previousPath;
				}

				parallelTasks.push(
					this.diffService.analyze(
						this.fileUri,
						ref,
						diffOptions,
						(progress, stage) => {
							this.sendMessage({
								type: 'mediaDiff:progress',
								payload: { progress, stage },
							});
						},
						abortController.signal
					).then(result => {
						if (this.isDisposed) return;
						this.sendMessage({ type: 'mediaDiff:result', payload: result });
						this.sendWaveformFromResult(result);
					})
				);

				await Promise.all(parallelTasks);
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
		};
		void run();
	}

	/**
	 * Run analysis pipeline for local file comparison (fire-and-forget).
	 * Same pattern as runAnalysisPipeline but uses analyzeLocalFiles.
	 */
	private runLocalAnalysisPipeline(
		mediaType: 'video' | 'audio',
		abortController: AbortController,
	): void {
		const previousUri = this.previousUri!;
		const run = async () => {
			try {
				const parallelTasks: Promise<void>[] = [];

				// Task A: Frame extraction / visualization
				parallelTasks.push(
					this.sendVisualizationDataForLocal({ mediaType, similarity: -1 } as DiffResult)
						.catch(err => console.warn('[MediaDiffMessageHandler] Local frame extraction failed:', err))
				);

				// Task B: Early waveform (audio) or early frame extraction (video)
				if (this.engineClient) {
					if (mediaType === 'audio') {
						this.startEarlyWaveform(this.engineClient, this.fileUri.fsPath, previousUri.fsPath, abortController.signal);
					} else if (mediaType === 'video') {
						this.startEarlyFrameExtraction(this.engineClient, this.fileUri.fsPath, previousUri.fsPath, abortController.signal);
					}
				}

				// Task C: Full diff analysis
				parallelTasks.push(
					this.diffService.analyzeLocalFiles(
						this.fileUri,
						previousUri,
						{ generateHeatmap: true },
						(progress, stage) => {
							this.sendMessage({
								type: 'mediaDiff:progress',
								payload: { progress, stage },
							});
						},
						abortController.signal
					).then(result => {
						if (this.isDisposed) return;
						this.sendMessage({ type: 'mediaDiff:result', payload: result });
						this.sendWaveformFromResult(result);
					})
				);

				await Promise.all(parallelTasks);
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
		};
		void run();
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
					// Stop any active streams before switching refs to prevent resource leaks
					await this.handleStopStreaming();
					await this.handleStopAudioStreaming();
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
	 * Start early waveform extraction in parallel with diff analysis.
	 *
	 * Dispatches `audios:waveform` for both files — resolves in ~500ms,
	 * well before the full `audios:diff` completes (5-30s). The early
	 * waveform is sent immediately; it gets replaced by the authoritative
	 * waveform from `sendWaveformFromResult()` when the full diff finishes.
	 *
	 * Fire-and-forget: errors are logged but never propagate.
	 * Supports cancellation via AbortSignal.
	 */
	private startEarlyWaveform(
		engine: EngineClient,
		currentPath: string,
		previousPath: string,
		signal: AbortSignal,
	): Promise<void> {
		return Promise.all([
			engine.waveform(currentPath),
			engine.waveform(previousPath),
		]).then(([wfA, wfB]) => {
			if (this.isDisposed || signal.aborted) return;
			this.sendMessage({
				type: 'mediaDiff:waveformData',
				payload: {
					currentWaveform: wfA.peaks,
					previousWaveform: wfB.peaks,
				},
			});
		}).catch((err) => {
			if (signal.aborted) return; // Silently ignore cancelled requests
			console.warn('[MediaDiffMessageHandler] Early waveform extraction failed (non-fatal):', err);
		});
	}

	/**
	 * Start early frame extraction in parallel with diff analysis.
	 *
	 * Dispatches `extractFrame` at t=0 for both video files — resolves in ~200ms,
	 * well before the full `videos:diff` completes (5-60s). Sends frames to
	 * webview immediately so the user sees a preview instead of a black screen.
	 *
	 * Fire-and-forget: errors are logged but never propagate.
	 * Supports cancellation via AbortSignal.
	 */
	private startEarlyFrameExtraction(
		engine: EngineClient,
		currentPath: string,
		previousPath: string,
		signal: AbortSignal,
	): void {
		const extract = async (filePath: string, version: 'current' | 'previous') => {
			try {
				const imageBuffer = await engine.extractFrame(filePath, 0);
				if (this.isDisposed || signal.aborted || !imageBuffer) return;
				this.sendMessage({
					type: 'mediaDiff:frameData',
					payload: { time: 0, version, imageBuffer },
				});
			} catch (err) {
				if (signal.aborted) return;
				console.warn(`[MediaDiffMessageHandler] Early frame extraction (${version}) failed (non-fatal):`, err);
			}
		};
		void extract(currentPath, 'current');
		void extract(previousPath, 'previous');
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
				// Skip sending empty waveform for preliminary results.
				// Task B (startEarlyWaveform) will send real waveform data in ~500ms.
				if (result.visualization) {
					this.sendMessage({
						type: 'mediaDiff:waveformData',
						payload: {
							currentWaveform:
								result.visualization?.currentWaveform ?? [],
							previousWaveform:
								result.visualization?.previousWaveform ?? [],
						},
					});
				}
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
				// Skip sending empty waveform for preliminary results.
				// Task B (startEarlyWaveform) will send real waveform data in ~500ms.
				if (result.visualization) {
					this.sendMessage({
						type: 'mediaDiff:waveformData',
						payload: {
							currentWaveform:
								result.visualization?.currentWaveform ?? [],
							previousWaveform:
								result.visualization?.previousWaveform ?? [],
						},
					});
				}
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
			const imageBuffer = await this.requireEngine().extractFrame(filePath, time);

			if (imageBuffer) {
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
			const imageBuffer = await this.requireEngine().extractFrame(absoluteSrc, 0);

			if (imageBuffer) {
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
			const engine = this.requireEngine();

			// 1. Resolve file paths for both versions.
			// If git show is still in progress, wait for it rather than failing immediately.
			// This handles the race where the user clicks Play before ensurePreviousFilePath
			// finishes (3-30s for large repos).
			const currentPath = this.fileUri.fsPath;
			let previousPath = this.previousUri?.fsPath ?? this.previousFilePath;
			if (!previousPath && this.fetchPromise) {
				await this.fetchPromise;
				previousPath = this.previousUri?.fsPath ?? this.previousFilePath;
			}
			if (!previousPath) {
				throw new Error('No previous file available for streaming');
			}

			// 2. Probe both files in parallel to get resolution, fps, duration, hasAudio
			const [currentInfo, previousInfo] = await Promise.all([
				engine.probe('videos', currentPath),
				engine.probe('videos', previousPath),
			]);

			console.log('[MediaDiffMessageHandler] Probe results:', JSON.stringify({ currentInfo, previousInfo }));

			// Use the larger dimensions (to avoid clipping) and current file's fps
			const width = Math.max(currentInfo.width, previousInfo.width);
			const height = Math.max(currentInfo.height, previousInfo.height);
			const fps = currentInfo.fps || 30;
			const duration = Math.max(currentInfo.duration, previousInfo.duration);

			// 3. Start streams for both files via videos:stream
			const [currentHandle, previousHandle] = await Promise.all([
				engine.createStream('videos', currentPath, { sessionId: this.sessionId }),
				engine.createStream('videos', previousPath, { sessionId: this.sessionId }),
			]);

			this.currentStreamId = currentHandle.streamId;
			this.previousStreamId = previousHandle.streamId;

			// 4. Always try to create audio streams — don't rely on hasAudio probe
			// If the file has no audio track, the engine returns an error which we catch.
			console.log('[MediaDiffMessageHandler] Audio probe:', {
				currentHasAudio: currentInfo.hasAudio,
				previousHasAudio: previousInfo.hasAudio,
			});
			try {
				const [curAudioResult, prevAudioResult] = await Promise.allSettled([
					engine.createStream('audios', currentPath, { sessionId: this.sessionId }),
					engine.createStream('audios', previousPath, { sessionId: this.sessionId }),
				]);

				if (curAudioResult.status === 'fulfilled') {
					this.currentAudioStreamId = curAudioResult.value.streamId;
					console.log('[MediaDiffMessageHandler] Current audio stream created:', this.currentAudioStreamId);
				} else {
					console.log('[MediaDiffMessageHandler] Current file has no audio track (or stream creation failed)');
				}

				if (prevAudioResult.status === 'fulfilled') {
					this.previousAudioStreamId = prevAudioResult.value.streamId;
					console.log('[MediaDiffMessageHandler] Previous audio stream created:', this.previousAudioStreamId);
				} else {
					console.log('[MediaDiffMessageHandler] Previous file has no audio track (or stream creation failed)');
				}
			} catch (audioErr) {
				console.warn('[MediaDiffMessageHandler] Audio stream creation failed (non-fatal):', audioErr);
			}

			// 5. Send config to webview immediately (no engine-level pause).
			// Streams auto-play — WebSocket clients connect as soon as
			// config arrives, well within the subscriber timeout.
			const config: StreamConfig = {
				port: engine.port,
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
			const engine = this.requireEngine();
			const stopPromises: Promise<void>[] = [];

			for (const sid of [
				this.currentStreamId,
				this.previousStreamId,
				this.currentAudioStreamId,
				this.previousAudioStreamId,
			]) {
				if (sid) {
					stopPromises.push(
						engine.controlStream('streams', sid, 'stop')
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
			const engine = this.requireEngine();
			let streamAction: 'resume' | 'pause' | 'seek';
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
					engine.controlStream(s.group, s.id, streamAction, options)
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
			const engine = this.requireEngine();

			// 1. Resolve file paths, awaiting git fetch if still in progress.
			const currentPath = this.fileUri.fsPath;
			let previousPath = this.previousUri?.fsPath ?? this.previousFilePath;
			if (!previousPath && this.fetchPromise) {
				await this.fetchPromise;
				previousPath = this.previousUri?.fsPath ?? this.previousFilePath;
			}
			if (!previousPath) {
				throw new Error('No previous file available for audio streaming');
			}

			// 2. Probe duration
			const [currentInfo, previousInfo] = await Promise.all([
				engine.probe('audios', currentPath),
				engine.probe('audios', previousPath),
			]);

			const duration = Math.max(
				currentInfo.duration ?? 0,
				previousInfo.duration ?? 0
			);

			// 3. Create audio streams
			const [curHandle, prevHandle] = await Promise.all([
				engine.createStream('audios', currentPath, { sessionId: this.sessionId }),
				engine.createStream('audios', previousPath, { sessionId: this.sessionId }),
			]);

			this.currentAudioOnlyStreamId = curHandle.streamId;
			this.previousAudioOnlyStreamId = prevHandle.streamId;

			// 4. Send config to webview immediately so WebSocket clients
			//    connect before the engine subscriber timeout fires.
			//    AudioStreamClients pause locally to suppress auto-playback.
			const config: AudioStreamConfig = {
				port: engine.port,
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
			const engine = this.requireEngine();
			const stopPromises: Promise<void>[] = [];

			for (const sid of [this.currentAudioOnlyStreamId, this.previousAudioOnlyStreamId]) {
				if (sid) {
					stopPromises.push(
						engine.controlStream('streams', sid, 'stop')
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
			const engine = this.requireEngine();
			let streamAction: 'resume' | 'pause' | 'seek';
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
					engine.controlStream('audios', sid, streamAction, options)
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
		// Clear stale fetch promise so handleStartStreaming doesn't await an old git fetch.
		this.fetchPromise = null;
	}

	/**
	 * Ensure previous file path is available for frame extraction.
	 * In Git mode, extracts the previous version directly to a temp file
	 * via `git show` — never loads file content into extension memory.
	 */
	private async ensurePreviousFilePath(ref: string): Promise<void> {
		// Already have a path (local comparison or previously cached)
		if (this.previousUri || this.previousFilePath) return;

		try {
			const os = await import('os');
			const path = await import('path');

			const ext = path.extname(this.fileUri.fsPath) || '.mp4';
			const tmpPath = path.join(
				os.tmpdir(),
				`media-diff-prev-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`
			);

			// Zero-copy: git show pipes directly to file, no memory buffering
			await this.diffService.extractPreviousToFile(this.fileUri, ref, tmpPath);
			this.previousFilePath = tmpPath;
		} catch (error) {
			// File may not exist in the ref (new file) — not an error
			console.warn('[MediaDiffMessageHandler] Could not extract previous version:', error);
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
	 * Broadcast git-fetch state to webview so Play button can be disabled
	 * while the previous-version file is being extracted.
	 */
	private sendFetchState(state: 'fetching' | 'ready'): void {
		this.sendMessage({ type: 'mediaDiff:fetchState', state } as Partial<MediaDiffResponse>);
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
