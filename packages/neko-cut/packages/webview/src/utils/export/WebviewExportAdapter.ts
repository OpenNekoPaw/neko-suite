/**
 * WebviewExportAdapter - Pure Webview Export Engine
 *
 * Implements IExportEngine for pure Webview export without Extension Host dependency.
 * Uses WebCodecs for video encoding, libav.js for audio encoding, and mp4-muxer for muxing.
 *
 * Architecture (Optimized Pipeline):
 * ```
 * ExportPipeline (双缓冲渲染引擎)
 *   ├─ Engine A: [Render Frame N] → [Create VideoFrame] → Queue
 *   └─ Engine B: [Render Frame N+1] → ...
 *                                                    ↓
 *                                     WebCodecsEncoder (并行消费)
 *                                                    ↓
 *                                              MP4Muxer → Blob
 *
 * 优化点：
 * - 双缓冲交替渲染，渲染与编码真正并行
 * - 零拷贝 VideoFrame (Canvas → VideoFrame)
 * - 生产者-消费者模式，背压控制
 * ```
 */

import type { ProjectData, TimelineElement, MediaElement } from '../../types';
import type {
	IExportEngine,
	ExportConfig,
	ExportResult,
	ExportProgress,
	ExportProgressCallback,
	ExportFormat,
	UrlResolver,
	ExportPerformanceStats,
} from './IExportEngine';
import type { IAudioEncoder } from '@neko/shared';
import { getDefaultBitrate } from './IExportEngine';
import { createGPURenderEngine, type GPURenderEngine } from '../../rendering/gpu';
import {
	createWebCodecsEncoder,
	type WebCodecsEncoder,
} from '../../mediaEngine/encoders';
import {
	createLibavAudioEncoder,
} from '../../mediaEngine/libav';
import {
	createWebviewAudioDecoder,
} from '../../mediaEngine/decoders/WebviewAudioDecoder';
import {
	createMP4Muxer,
	createWebMMuxer,
	type IMuxer,
} from '../../mediaEngine/muxers';
import type { MuxerVideoChunk, MuxerAudioChunk } from '../../mediaEngine/muxers';
import { createExportPipeline, type ExportPipeline } from './ExportPipeline';
import {
	createExportWorkerClient,
	isWorkerExportAvailable,
	type ExportWorkerClient,
	type FrameTransform,
	createFullPipelineExportWorkerClient,
	isFullPipelineExportAvailable,
	type FullPipelineExportWorkerClient,
} from '../../workers/export';
import type {
	SerializedProjectData,
	SerializedTrack,
	SerializedElement,
	SerializedTransform,
	SerializedColorCorrection,
} from '../../workers/export/types';
import { createWebviewMediaFrameProvider } from '../../rendering/unified/mediaFrameProvider';

// =============================================================================
// Types
// =============================================================================

/**
 * Render engine factory type
 */
export type RenderEngineFactory = (
	canvas: HTMLCanvasElement | OffscreenCanvas
) => Promise<GPURenderEngine>;

/**
 * Audio track info extracted from project
 */
interface AudioTrackInfo {
	filePath: string;
	/** Timeline position where this audio starts (for mixing) */
	timelineStart: number;
	/** Source file start time (trimStart) */
	sourceStart: number;
	/** Actual duration after trimming */
	duration: number;
	/** Volume multiplier (0-1) */
	volume: number;
}

// =============================================================================
// Constants
// =============================================================================

const MICROSECONDS_PER_SECOND = 1_000_000;

// =============================================================================
// WebviewExportAdapter Implementation
// =============================================================================

export class WebviewExportAdapter implements IExportEngine {
	readonly name = 'WebviewExport';
	readonly supportedFormats: ExportFormat[] = ['mp4', 'webm'];

	private _isExporting = false;
	private _cancelled = false;
	private _startTime = 0;

	// Components
	private _renderEngine: GPURenderEngine | null = null;
	private _exportPipeline: ExportPipeline | null = null;
	private _videoEncoder: WebCodecsEncoder | null = null;
	private _audioEncoder: IAudioEncoder | null = null;
	private _muxer: IMuxer | null = null;
	private _canvas: OffscreenCanvas | null = null;

	// Configuration
	private _renderEngineFactory: RenderEngineFactory | null = null;
	private _urlResolver: UrlResolver | null = null;

	// Pipeline mode control
	private _usePipelineMode = true; // 默认启用流水线模式

	// Worker mode control
	private _useWorkerMode = true; // 默认启用 Worker 模式
	private _workerClient: ExportWorkerClient | null = null;
	private _fullPipelineWorkerClient: FullPipelineExportWorkerClient | null = null;

	// =========================================================================
	// Properties
	// =========================================================================

	get isExporting(): boolean {
		return this._isExporting;
	}

	// =========================================================================
	// Configuration
	// =========================================================================

	/**
	 * Set custom render engine factory
	 */
	setRenderEngineFactory(factory: RenderEngineFactory): void {
		this._renderEngineFactory = factory;
	}

	/**
	 * Set URL resolver for media file paths
	 */
	setUrlResolver(resolver: UrlResolver): void {
		this._urlResolver = resolver;
	}

	/**
	 * Enable or disable pipeline mode (dual-engine parallel rendering)
	 * Default: true (enabled)
	 */
	setPipelineMode(enabled: boolean): void {
		this._usePipelineMode = enabled;
	}

	/**
	 * Enable or disable Worker mode (export in Web Worker)
	 * Default: true (enabled)
	 * When enabled, export runs in a separate Worker thread to avoid UI blocking
	 */
	setWorkerMode(enabled: boolean): void {
		this._useWorkerMode = enabled;
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
		this._cancelled = false;
		this._startTime = performance.now();

		// Use URL resolver from config if provided
		if (config.urlResolver) {
			this._urlResolver = config.urlResolver;
		}

		try {
			// Calculate total frames
			const duration = this._calculateProjectDuration(project);
			const totalFrames = Math.ceil(duration * config.fps);

			// Report initializing
			this._reportProgress(onProgress, {
				stage: 'initializing',
				currentFrame: 0,
				totalFrames,
				percent: 0,
				elapsedTime: 0,
				estimatedTimeRemaining: 0,
				currentFps: 0,
				message: 'Initializing export...',
			});

			// Try Worker export if enabled and available
			if (this._useWorkerMode && isWorkerExportAvailable()) {
				console.log('[WebviewExportAdapter] Using Worker export mode');
				return await this._exportWithWorker(project, config, totalFrames, onProgress);
			}

			// Fallback to main thread export
			console.log('[WebviewExportAdapter] Using main thread export mode');

			// Initialize components
			await this._initializeComponents(project, config, totalFrames);

			if (this._cancelled) {
				return this._createCancelledResult();
			}

			// P3 optimization: Run video rendering and audio processing in parallel
			// Audio processing is independent of video frames
			const hasAudio = config.includeAudio !== false && this._hasAudioTracks(project);

			if (hasAudio) {
				// Parallel execution: video + audio
				const [videoResult, audioResult] = await Promise.allSettled([
					this._renderAndEncodeFrames(project, config, totalFrames, onProgress),
					this._processAudioParallel(project, config),
				]);

				// Check for errors
				if (videoResult.status === 'rejected') {
					throw videoResult.reason;
				}
				if (audioResult.status === 'rejected') {
					console.warn('[WebviewExportAdapter] Audio processing failed:', audioResult.reason);
					// Continue without audio - video is more important
				}
			} else {
				// Video only
				await this._renderAndEncodeFrames(project, config, totalFrames, onProgress);
			}

			if (this._cancelled) {
				return this._createCancelledResult();
			}

			// Finalize and get result
			const result = await this._finalize(onProgress, totalFrames);

			return result;
		} catch (error) {
			console.error('[WebviewExportAdapter] Export error:', error);
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		} finally {
			await this._cleanup();
			this._isExporting = false;
		}
	}

	cancel(): void {
		this._cancelled = true;
		// Cancel Worker clients if active
		if (this._fullPipelineWorkerClient) {
			this._fullPipelineWorkerClient.cancel();
		}
		if (this._workerClient) {
			this._workerClient.cancel();
		}
	}

	dispose(): void {
		this.cancel();
		this._cleanup();
	}

	// =========================================================================
	// Private Methods - Initialization
	// =========================================================================

	private async _initializeComponents(
		project: ProjectData,
		config: ExportConfig,
		totalFrames: number
	): Promise<void> {
		// Initialize render engine (pipeline mode or legacy mode)
		if (this._usePipelineMode) {
			// Pipeline mode: dual-engine parallel rendering
			this._exportPipeline = createExportPipeline({
				width: config.width,
				height: config.height,
				fps: config.fps,
				totalFrames,
				maxInflightFrames: 4,
				urlResolver: this._urlResolver ?? undefined,
			});
			await this._exportPipeline.initialize();
			console.log('[WebviewExportAdapter] Using pipeline mode (dual-engine)');
		} else {
			// Legacy mode: single engine
			this._canvas = new OffscreenCanvas(config.width, config.height);

			if (this._renderEngineFactory) {
				this._renderEngine = await this._renderEngineFactory(this._canvas);
			} else {
				this._renderEngine = createGPURenderEngine();
			}

			await this._renderEngine.initialize(this._canvas);
			console.log('[WebviewExportAdapter] Using legacy mode (single engine)');
		}

		// Create video encoder
		this._videoEncoder = createWebCodecsEncoder();
		await this._videoEncoder.initialize({
			outputPath: '', // Not used for Webview export
			container: config.format === 'webm' ? 'webm' : 'mp4',
			video: {
				codec: config.format === 'webm' ? 'vp9' : 'h264',
				width: config.width,
				height: config.height,
				fps: config.fps,
				bitrate: config.videoBitrate ?? getDefaultBitrate(config.width, config.height, config.quality),
				gopSize: config.fps, // 1 second GOP
			},
			totalFrames,
		});

		// Create muxer based on format
		if (config.format === 'webm') {
			this._muxer = createWebMMuxer();
		} else {
			this._muxer = createMP4Muxer();
		}
		await this._muxer.initialize({
			format: config.format === 'webm' ? 'webm' : 'mp4',
			video: {
				codec: config.format === 'webm' ? 'vp9' : 'h264',
				width: config.width,
				height: config.height,
				fps: config.fps,
			},
			audio:
				config.includeAudio !== false
					? {
							codec: config.format === 'webm' ? 'opus' : 'aac',
							sampleRate: 48000,
							channels: 2,
						}
					: undefined,
			fastStart: config.format === 'webm' ? undefined : 'in-memory',
		});

		// Create audio encoder if needed (using libav.js)
		if (config.includeAudio !== false && this._hasAudioTracks(project)) {
			const audioCodec = config.format === 'webm' ? 'opus' : 'aac';
			const audioConfig = {
				codec: audioCodec as 'opus' | 'aac',
				sampleRate: 48000,
				channels: 2,
				bitrate: config.audioBitrate ?? 128000,
			};

			this._audioEncoder = createLibavAudioEncoder();
			await this._audioEncoder.initialize(audioConfig);
			console.log('[WebviewExportAdapter] Using LibavAudioEncoder');
		}
	}

	// =========================================================================
	// Private Methods - Rendering and Encoding (Parallel Pipeline)
	// =========================================================================

	/**
	 * Parallel render and encode pipeline
	 * Uses dual-engine double-buffering to truly overlap rendering and encoding
	 *
	 * Pipeline architecture:
	 * - Producer (render loop): Renders frames using alternating engines
	 * - Consumer (encode loop): Encodes frames from queue in parallel
	 * - Both loops run concurrently via Promise.all
	 */
	private async _renderAndEncodeFrames(
		project: ProjectData,
		config: ExportConfig,
		totalFrames: number,
		onProgress?: ExportProgressCallback
	): Promise<void> {
		if (this._usePipelineMode && this._exportPipeline) {
			// New pipeline mode: true parallel execution
			await this._renderAndEncodeFramesPipeline(project, config, totalFrames, onProgress);
		} else {
			// Legacy mode: sequential with small buffer
			await this._renderAndEncodeFramesLegacy(project, config, totalFrames, onProgress);
		}
	}

	/**
	 * Pipeline mode: dual-engine parallel rendering and encoding
	 */
	private async _renderAndEncodeFramesPipeline(
		project: ProjectData,
		config: ExportConfig,
		totalFrames: number,
		onProgress?: ExportProgressCallback
	): Promise<void> {
		const pipeline = this._exportPipeline!;

		// Performance tracking
		let encodedCount = 0;
		let totalEncodeTime = 0;

		// Run render loop and encode loop in parallel
		const renderTask = this._runRenderLoop(pipeline, project, totalFrames);
		const encodeTask = this._runEncodeLoop(
			pipeline,
			config,
			totalFrames,
			onProgress,
			(count, time) => {
				encodedCount = count;
				totalEncodeTime = time;
			}
		);

		await Promise.all([renderTask, encodeTask]);

		// Log performance stats
		const stats = pipeline.getStats();
		console.log(
			`[WebviewExport] Pipeline stats: ` +
			`avgRender=${stats.avgRenderTime.toFixed(1)}ms/frame, ` +
			`avgEncode=${(totalEncodeTime / Math.max(1, encodedCount)).toFixed(1)}ms/frame, ` +
			`avgWait=${stats.avgWaitTime.toFixed(1)}ms`
		);

		// Finalize video encoder
		await this._videoEncoder!.finalize();

		// Add remaining chunks to muxer
		const remainingChunks = this._videoEncoder!.getEncodedChunks();
		for (const chunk of remainingChunks) {
			const muxerChunk: MuxerVideoChunk = {
				data: chunk.data,
				timestamp: chunk.timestamp,
				type: chunk.type,
				duration: chunk.duration,
			};
			this._muxer!.addVideoChunk(muxerChunk);
		}
	}

	/**
	 * Render loop - Producer
	 * Continuously renders frames and pushes to pipeline queue
	 */
	private async _runRenderLoop(
		pipeline: ExportPipeline,
		project: ProjectData,
		totalFrames: number
	): Promise<void> {
		for (let i = 0; i < totalFrames && !this._cancelled; i++) {
			// Wait for queue capacity (backpressure)
			await pipeline.waitForCapacity();

			if (this._cancelled) break;

			// Render frame (uses alternating engines internally)
			await pipeline.renderNextFrame(project, i);
		}

		// Signal render completion
		pipeline.markRenderComplete();
	}

	/**
	 * Encode loop - Consumer
	 * Continuously consumes frames from queue and encodes them
	 */
	private async _runEncodeLoop(
		pipeline: ExportPipeline,
		_config: ExportConfig,
		totalFrames: number,
		onProgress?: ExportProgressCallback,
		onStats?: (count: number, totalTime: number) => void
	): Promise<void> {
		let encodedCount = 0;
		let totalEncodeTime = 0;

		while (encodedCount < totalFrames && !this._cancelled) {
			// Get next frame from queue (waits if empty)
			const frameData = await pipeline.getNextFrame();
			if (!frameData) break;

			const encodeStart = performance.now();

			// Encode frame
			await this._videoEncoder!.encodeVideoFrame(frameData.videoFrame, frameData.timestamp);
			frameData.videoFrame.close();

			totalEncodeTime += performance.now() - encodeStart;
			encodedCount++;

			// Get encoded chunks and add to muxer
			const chunks = this._videoEncoder!.getEncodedChunks();
			for (const chunk of chunks) {
				const muxerChunk: MuxerVideoChunk = {
					data: chunk.data,
					timestamp: chunk.timestamp,
					type: chunk.type,
					duration: chunk.duration,
				};
				this._muxer!.addVideoChunk(muxerChunk);
			}

			// Report progress with performance stats
			const elapsed = performance.now() - this._startTime;
			const fps = encodedCount / (elapsed / 1000);
			const remaining = ((totalFrames - encodedCount) / fps) * 1000;

			// Get pipeline stats for performance reporting
			const pipelineStats = pipeline.getStats();
			const performanceStats: ExportPerformanceStats = {
				avgRenderTime: pipelineStats.avgCompositeTime, // GPU 合成时间
				avgEncodeTime: encodedCount > 0 ? totalEncodeTime / encodedCount : 0,
				avgDecodeTime: pipelineStats.avgDecodeTime > 0 ? pipelineStats.avgDecodeTime : undefined,
				avgWaitTime: pipelineStats.avgWaitTime,
				queueLength: pipelineStats.queueLength,
				memoryUsedMB: this._getMemoryUsage(),
				pipelineMode: true,
			};

			this._reportProgress(onProgress, {
				stage: 'rendering',
				currentFrame: encodedCount,
				totalFrames,
				percent: (encodedCount / totalFrames) * 80,
				elapsedTime: elapsed,
				estimatedTimeRemaining: remaining,
				currentFps: fps,
				message: `Exporting frame ${encodedCount}/${totalFrames} (pipeline)`,
				performanceStats,
			});

			// Report stats
			if (onStats) {
				onStats(encodedCount, totalEncodeTime);
			}
		}
	}

	/**
	 * Get current memory usage in MB
	 */
	private _getMemoryUsage(): number {
		const perfMemory = (performance as unknown as { memory?: { usedJSHeapSize?: number } }).memory;
		if (perfMemory?.usedJSHeapSize) {
			return Math.round(perfMemory.usedJSHeapSize / (1024 * 1024));
		}
		return 0;
	}

	/**
	 * Legacy mode: sequential rendering with small buffer (fallback)
	 */
	private async _renderAndEncodeFramesLegacy(
		project: ProjectData,
		config: ExportConfig,
		totalFrames: number,
		onProgress?: ExportProgressCallback
	): Promise<void> {
		const frameDuration = MICROSECONDS_PER_SECOND / config.fps;

		// Pipeline configuration
		const MAX_PENDING_FRAMES = 4; // Max frames in flight
		const pendingFrames: Array<{ frame: VideoFrame; timestamp: number; index: number }> = [];
		let renderIndex = 0;
		let renderComplete = false;

		// Performance tracking
		let totalRenderTime = 0;
		let totalEncodeTime = 0;

		// Render task - fills the frame buffer
		const renderNextFrame = async (): Promise<boolean> => {
			if (this._cancelled || renderIndex >= totalFrames) {
				renderComplete = true;
				return false;
			}

			const frameIndex = renderIndex++;
			const time = frameIndex / config.fps;
			const timestamp = frameIndex * frameDuration;

			const renderStart = performance.now();

			// Render frame
			await this._renderEngine!.renderProjectFrame(project, time);

			// Get frame as VideoFrame
			const videoFrame = this._renderEngine!.toVideoFrame(timestamp);

			totalRenderTime += performance.now() - renderStart;

			if (videoFrame) {
				pendingFrames.push({ frame: videoFrame, timestamp, index: frameIndex });
			}

			return true;
		};

		// Encode task - processes frames from buffer
		const encodeNextFrame = async (): Promise<boolean> => {
			if (pendingFrames.length === 0) {
				return !renderComplete;
			}

			const { frame, timestamp, index } = pendingFrames.shift()!;

			const encodeStart = performance.now();

			// Encode frame
			await this._videoEncoder!.encodeVideoFrame(frame, timestamp);
			frame.close();

			totalEncodeTime += performance.now() - encodeStart;

			// Get encoded chunks and add to muxer
			const chunks = this._videoEncoder!.getEncodedChunks();
			for (const chunk of chunks) {
				const muxerChunk: MuxerVideoChunk = {
					data: chunk.data,
					timestamp: chunk.timestamp,
					type: chunk.type,
					duration: chunk.duration,
				};
				this._muxer!.addVideoChunk(muxerChunk);
			}

			// Report progress with performance stats
			const elapsed = performance.now() - this._startTime;
			const fps = (index + 1) / (elapsed / 1000);
			const remaining = ((totalFrames - index - 1) / fps) * 1000;

			const performanceStats: ExportPerformanceStats = {
				avgRenderTime: (index + 1) > 0 ? totalRenderTime / (index + 1) : 0,
				avgEncodeTime: (index + 1) > 0 ? totalEncodeTime / (index + 1) : 0,
				avgWaitTime: 0,
				queueLength: pendingFrames.length,
				memoryUsedMB: this._getMemoryUsage(),
				pipelineMode: false,
			};

			this._reportProgress(onProgress, {
				stage: 'rendering',
				currentFrame: index + 1,
				totalFrames,
				percent: ((index + 1) / totalFrames) * 80,
				elapsedTime: elapsed,
				estimatedTimeRemaining: remaining,
				currentFps: fps,
				message: `Exporting frame ${index + 1}/${totalFrames} (legacy)`,
				performanceStats,
			});

			return true;
		};

		// Main pipeline loop
		while (!this._cancelled) {
			// Fill buffer up to MAX_PENDING_FRAMES
			while (pendingFrames.length < MAX_PENDING_FRAMES && !renderComplete) {
				await renderNextFrame();
			}

			// Process one frame from buffer
			const hasMore = await encodeNextFrame();
			if (!hasMore && pendingFrames.length === 0) {
				break;
			}
		}

		// Log performance stats
		const avgRenderTime = totalRenderTime / totalFrames;
		const avgEncodeTime = totalEncodeTime / totalFrames;
		console.log(
			`[WebviewExport] Legacy stats: render=${avgRenderTime.toFixed(1)}ms/frame, encode=${avgEncodeTime.toFixed(1)}ms/frame`
		);

		// Finalize video encoder
		await this._videoEncoder!.finalize();

		// Add remaining chunks to muxer
		const remainingChunks = this._videoEncoder!.getEncodedChunks();
		for (const chunk of remainingChunks) {
			const muxerChunk: MuxerVideoChunk = {
				data: chunk.data,
				timestamp: chunk.timestamp,
				type: chunk.type,
				duration: chunk.duration,
			};
			this._muxer!.addVideoChunk(muxerChunk);
		}
	}

	// =========================================================================
	// Private Methods - Audio Processing
	// =========================================================================

	/**
	 * Process audio with proper mixing
	 *
	 * Correct flow:
	 * 1. Create timeline-length mixing buffer
	 * 2. For each audio track:
	 *    - Decode audio from source (at sourceStart position)
	 *    - Mix into buffer at timelineStart position
	 * 3. Encode the mixed audio buffer
	 * 4. Add to muxer
	 */
	private async _processAudioParallel(
		project: ProjectData,
		config: ExportConfig
	): Promise<void> {
		if (!this._audioEncoder || !this._muxer) return;

		const audioTracks = this._extractAudioTracks(project);
		if (audioTracks.length === 0) return;

		const startTime = performance.now();
		console.log(`[WebviewExportAdapter] Starting audio mixing: ${audioTracks.length} tracks`);

		const sampleRate = 48000;
		const channels = 2;

		// Calculate total timeline duration
		const totalDuration = this._calculateTotalDuration(project, config);
		const totalSamples = Math.ceil(totalDuration * sampleRate);

		console.log(`[WebviewExportAdapter] Timeline duration: ${totalDuration.toFixed(2)}s, samples: ${totalSamples}`);

		// Create mixing buffer (interleaved stereo)
		const mixBuffer = new Float32Array(totalSamples * channels);

		// Decode and mix each track
		for (const track of audioTracks) {
			if (this._cancelled) break;

			try {
				console.log(`[WebviewExportAdapter] Processing track: ${track.filePath}, timeline=${track.timelineStart.toFixed(2)}s, source=${track.sourceStart.toFixed(2)}s, duration=${track.duration.toFixed(2)}s`);

				// Resolve URL if needed
				const audioUrl = this._urlResolver
					? await this._urlResolver(track.filePath)
					: track.filePath;

				// Use WebviewAudioDecoder (MP4Demuxer + libav.js decode)
				const audioDecoder = createWebviewAudioDecoder({
					source: audioUrl,
					sampleRate,
					channels,
				});

				// Open and decode segment from source position
				await audioDecoder.open();
				const audioBuffer = await audioDecoder.decodeSegment(track.sourceStart, track.duration);

				// Mix into buffer at timeline position
				const timelineOffset = Math.floor(track.timelineStart * sampleRate);
				const decodedChannels = audioBuffer.numberOfChannels;
				const decodedLength = audioBuffer.length;

				for (let i = 0; i < decodedLength; i++) {
					const bufferIndex = (timelineOffset + i) * channels;
					if (bufferIndex >= mixBuffer.length) break;

					for (let ch = 0; ch < channels; ch++) {
						// Get sample from decoded buffer (handle mono/stereo)
						const sourceChannel = Math.min(ch, decodedChannels - 1);
						const channelData = audioBuffer.getChannelData(sourceChannel);
						let sample = (channelData[i] ?? 0) * track.volume;

						// Sanitize and clamp
						if (!Number.isFinite(sample)) {
							sample = 0;
						}

						// Mix (add) to buffer
						const existingValue = mixBuffer[bufferIndex + ch] ?? 0;
						mixBuffer[bufferIndex + ch] = existingValue + sample;
					}
				}

				// Close decoder
				await audioDecoder.close();
				console.log(`[WebviewExportAdapter] Track mixed: ${decodedLength} samples at offset ${timelineOffset}`);
			} catch (error) {
				console.warn('[WebviewExportAdapter] Audio track processing error:', error);
				// Continue with other tracks
			}
		}

		// Clamp mixed buffer to [-1, 1] range
		for (let i = 0; i < mixBuffer.length; i++) {
			const value = mixBuffer[i] ?? 0;
			mixBuffer[i] = Math.max(-1, Math.min(1, value));
		}

		// Encode the mixed audio buffer
		console.log(`[WebviewExportAdapter] Encoding mixed audio: ${mixBuffer.length} samples`);
		await this._audioEncoder.encode(mixBuffer, 0); // Start from timestamp 0

		// Finalize audio encoder
		const encodedAudioChunks = await this._audioEncoder.finalize();

		// Add audio chunks to muxer
		for (const chunk of encodedAudioChunks) {
			const muxerChunk: MuxerAudioChunk = {
				data: chunk.data,
				timestamp: chunk.timestamp,
				duration: chunk.duration,
				isKeyframe: chunk.isKeyframe,
			};
			this._muxer.addAudioChunk(muxerChunk);
		}

		const elapsedMs = performance.now() - startTime;
		console.log(
			`[WebviewExportAdapter] Audio mixing completed: ` +
			`${audioTracks.length} tracks mixed in ${elapsedMs.toFixed(0)}ms`
		);
	}

	/**
	 * Calculate total timeline duration from project
	 */
	private _calculateTotalDuration(project: ProjectData, _config: ExportConfig): number {
		// Calculate from project tracks
		let maxEndTime = 0;
		for (const track of project.tracks) {
			for (const element of track.elements) {
				const trimStart = element.trimStart ?? 0;
				const trimEnd = element.trimEnd ?? 0;
				const actualDuration = element.duration - trimStart - trimEnd;
				const endTime = element.startTime + actualDuration;
				if (endTime > maxEndTime) {
					maxEndTime = endTime;
				}
			}
		}

		return maxEndTime || 10; // Default to 10 seconds if empty
	}

	// =========================================================================
	// Private Methods - Finalization
	// =========================================================================

	private async _finalize(
		onProgress?: ExportProgressCallback,
		totalFrames?: number
	): Promise<ExportResult> {
		this._reportProgress(onProgress, {
			stage: 'muxing',
			currentFrame: totalFrames ?? 0,
			totalFrames: totalFrames ?? 0,
			percent: 95,
			elapsedTime: performance.now() - this._startTime,
			estimatedTimeRemaining: 0,
			currentFps: 0,
			message: 'Finalizing video...',
		});

		// Finalize muxer
		const muxerResult = await this._muxer!.finalize();

		if (!muxerResult.success || !muxerResult.blob) {
			return {
				success: false,
				error: muxerResult.error ?? 'Muxing failed',
			};
		}

		const totalTime = performance.now() - this._startTime;

		this._reportProgress(onProgress, {
			stage: 'completed',
			currentFrame: totalFrames ?? 0,
			totalFrames: totalFrames ?? 0,
			percent: 100,
			elapsedTime: totalTime,
			estimatedTimeRemaining: 0,
			currentFps: (totalFrames ?? 0) / (totalTime / 1000),
			message: 'Export completed',
		});

		return {
			success: true,
			blob: muxerResult.blob,
			fileSize: muxerResult.fileSize,
			totalTime,
			averageFps: (totalFrames ?? 0) / (totalTime / 1000),
		};
	}

	// =========================================================================
	// Private Methods - Utilities
	// =========================================================================

	private _calculateProjectDuration(project: ProjectData): number {
		let maxDuration = 0;

		for (const track of project.tracks) {
			for (const element of track.elements) {
				const elementEnd = element.startTime + element.duration;
				maxDuration = Math.max(maxDuration, elementEnd);
			}
		}

		return maxDuration;
	}

	private _hasAudioTracks(project: ProjectData): boolean {
		for (const track of project.tracks) {
			if (track.type === 'audio') return true;
			for (const element of track.elements) {
				// Check for audio elements or media elements (which may contain audio)
				if (element.type === 'audio' || element.type === 'media') {
					return true;
				}
			}
		}
		return false;
	}

	private _extractAudioTracks(project: ProjectData): AudioTrackInfo[] {
		const audioTracks: AudioTrackInfo[] = [];

		for (const track of project.tracks) {
			if (track.muted) continue;

			for (const element of track.elements) {
				// Check for audio elements or media elements (which may contain audio)
				if (element.type === 'audio' || element.type === 'media') {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const mediaElement = element as any;
					const filePath = mediaElement.src || mediaElement.filePath || mediaElement.source;
					if (filePath) {
						// Calculate actual duration after trimming
						const trimStart = element.trimStart ?? 0;
						const trimEnd = element.trimEnd ?? 0;
						const actualDuration = element.duration - trimStart - trimEnd;

						if (actualDuration > 0) {
							audioTracks.push({
								filePath,
								timelineStart: element.startTime,  // Position on timeline (for mixing)
								sourceStart: trimStart,            // Position in source file (for decoding)
								duration: actualDuration,          // Actual duration after trimming
								volume: mediaElement.volume ?? mediaElement.audio?.volume ?? 1,
							});
						}
					}
				}
			}
		}

		return audioTracks;
	}

	private _reportProgress(
		callback: ExportProgressCallback | undefined,
		progress: ExportProgress
	): void {
		if (callback) {
			callback(progress);
		}
	}

	private _createCancelledResult(): ExportResult {
		return {
			success: false,
			error: 'Export cancelled',
		};
	}

	private async _cleanup(): Promise<void> {
		// Cleanup Worker client
		if (this._workerClient) {
			this._workerClient.terminate();
			this._workerClient = null;
		}

		// Cleanup Full Pipeline Worker client
		if (this._fullPipelineWorkerClient) {
			this._fullPipelineWorkerClient.terminate();
			this._fullPipelineWorkerClient = null;
		}

		if (this._exportPipeline) {
			this._exportPipeline.dispose();
			this._exportPipeline = null;
		}

		if (this._renderEngine) {
			this._renderEngine.dispose();
			this._renderEngine = null;
		}

		if (this._videoEncoder) {
			await this._videoEncoder.cancel();
			this._videoEncoder = null;
		}

		if (this._audioEncoder) {
			await this._audioEncoder.cancel();
			this._audioEncoder = null;
		}

		if (this._muxer) {
			this._muxer.dispose();
			this._muxer = null;
		}

		this._canvas = null;
	}

	// =========================================================================
	// Private Methods - Worker Export
	// =========================================================================

	/**
	 * Export using Web Worker to avoid blocking UI
	 * This is the preferred export path when Worker is available
	 *
	 * Full Pipeline Mode (preferred):
	 * - All processing happens in Worker: demux, decode, render, encode, mux
	 * - Uses WebGPU for zero-copy compositing
	 * - No VideoFrame transfer overhead
	 *
	 * Legacy Mode (fallback):
	 * - Main thread decodes video frames
	 * - Worker handles render, encode, mux
	 */
	private async _exportWithWorker(
		project: ProjectData,
		config: ExportConfig,
		totalFrames: number,
		onProgress?: ExportProgressCallback
	): Promise<ExportResult> {
		// Try Full Pipeline Worker first (all processing in Worker)
		if (isFullPipelineExportAvailable()) {
			console.log('[WebviewExportAdapter] Using Full Pipeline Worker export mode');
			return await this._exportWithFullPipelineWorker(project, config, totalFrames, onProgress);
		}

		// Fallback to legacy Worker mode
		console.log('[WebviewExportAdapter] Using Legacy Worker export mode');
		return await this._exportWithLegacyWorker(project, config, totalFrames, onProgress);
	}

	/**
	 * Full Pipeline Worker export - all processing in Worker
	 * Demux → Decode → Render (WebGPU) → Encode → Mux
	 * Audio is processed in main thread (libav.js) and sent to Worker
	 */
	private async _exportWithFullPipelineWorker(
		project: ProjectData,
		config: ExportConfig,
		totalFrames: number,
		onProgress?: ExportProgressCallback
	): Promise<ExportResult> {
		try {
			// Create Full Pipeline Worker client
			this._fullPipelineWorkerClient = createFullPipelineExportWorkerClient();

			// Set up progress callback
			this._fullPipelineWorkerClient.onProgress = (progress) => {
				this._reportProgress(onProgress, progress);
			};

			// Set up error callback
			this._fullPipelineWorkerClient.onError = (error) => {
				console.error('[WebviewExportAdapter] Full Pipeline Worker error:', error);
			};

			// Create OffscreenCanvas for Worker
			const canvas = new OffscreenCanvas(config.width, config.height);

			// Serialize project data for Worker
			const serializedProject = await this._serializeProjectData(project, config);

			// Initialize Worker with canvas transfer
			await this._fullPipelineWorkerClient.init(canvas, {
				width: config.width,
				height: config.height,
				fps: config.fps,
				totalFrames,
				format: config.format,
				quality: config.quality,
				videoBitrate: config.videoBitrate ?? getDefaultBitrate(config.width, config.height, config.quality),
				audioBitrate: config.audioBitrate,
				includeAudio: config.includeAudio,
				maxInflightFrames: 4,
			}, serializedProject);

			if (this._cancelled) {
				this._fullPipelineWorkerClient.cancel();
				return this._createCancelledResult();
			}

			// Process audio in main thread (libav.js works here) and send to Worker
			const hasAudio = config.includeAudio !== false && this._hasAudioTracks(project);
			if (hasAudio) {
				this._reportProgress(onProgress, {
					stage: 'rendering',
					currentFrame: 0,
					totalFrames,
					percent: 2,
					elapsedTime: performance.now() - this._startTime,
					estimatedTimeRemaining: 0,
					currentFps: 0,
					message: 'Processing audio in main thread...',
				});

				try {
					const audioData = await this._processAudioForFullPipelineWorker(project, config);
					if (audioData && this._fullPipelineWorkerClient) {
						await this._fullPipelineWorkerClient.submitAudio(
							audioData.buffer,
							audioData.sampleRate,
							audioData.channels
						);
						console.log('[WebviewExportAdapter] Audio sent to Worker');
					}
				} catch (audioError) {
					console.warn('[WebviewExportAdapter] Audio processing failed, continuing without audio:', audioError);
				}
			}

			if (this._cancelled) {
				this._fullPipelineWorkerClient.cancel();
				return this._createCancelledResult();
			}

			// Start export - Worker handles video processing
			this._reportProgress(onProgress, {
				stage: 'rendering',
				currentFrame: 0,
				totalFrames,
				percent: 5,
				elapsedTime: performance.now() - this._startTime,
				estimatedTimeRemaining: 0,
				currentFps: 0,
				message: 'Starting full pipeline export...',
			});

			const result = await this._fullPipelineWorkerClient.startExport();

			const totalTime = performance.now() - this._startTime;

			this._reportProgress(onProgress, {
				stage: 'completed',
				currentFrame: totalFrames,
				totalFrames,
				percent: 100,
				elapsedTime: totalTime,
				estimatedTimeRemaining: 0,
				currentFps: result.averageFps,
				message: 'Export completed',
			});

			// Create Blob from ArrayBuffer
			const mimeType = config.format === 'webm' ? 'video/webm' : 'video/mp4';
			const blob = new Blob([result.outputBuffer], { type: mimeType });

			return {
				success: true,
				blob,
				fileSize: result.fileSize,
				totalTime,
				averageFps: result.averageFps,
			};
		} catch (error) {
			console.error('[WebviewExportAdapter] Full Pipeline Worker export error:', error);
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		} finally {
			if (this._fullPipelineWorkerClient) {
				this._fullPipelineWorkerClient.terminate();
				this._fullPipelineWorkerClient = null;
			}
		}
	}

	/**
	 * Serialize project data for Worker
	 * Resolves all media URLs and converts to Worker-compatible format
	 */
	private async _serializeProjectData(
		project: ProjectData,
		_config: ExportConfig
	): Promise<SerializedProjectData> {
		const tracks: SerializedTrack[] = [];

		for (const track of project.tracks) {
			const elements: SerializedElement[] = [];

			for (const element of track.elements) {
				// Get source URL
				let sourceUrl = '';
				if (element.type === 'media') {
					const mediaElement = element as MediaElement;
					const src = mediaElement.src;
					if (src) {
						// Resolve URL if needed
						sourceUrl = this._urlResolver ? await this._urlResolver(src) : src;
					}
				}

				// Determine element type for Worker
				let elementType: 'video' | 'audio' | 'image' | 'text' = 'video';
				if (element.type === 'media') {
					const ext = sourceUrl.toLowerCase().split('.').pop() ?? '';
					const videoExts = ['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v'];
					const audioExts = ['mp3', 'wav', 'aac', 'm4a', 'ogg'];
					const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp'];

					if (videoExts.includes(ext)) {
						elementType = 'video';
					} else if (audioExts.includes(ext)) {
						elementType = 'audio';
					} else if (imageExts.includes(ext)) {
						elementType = 'image';
					}
				} else if (element.type === 'text') {
					elementType = 'text';
				}

				// Build transform
				const transform: SerializedTransform = {
					x: element.transform?.x ?? 0,
					y: element.transform?.y ?? 0,
					width: element.transform?.scaleX ?? 1,
					height: element.transform?.scaleY ?? 1,
					rotation: element.transform?.rotation ?? 0,
					opacity: element.transform?.opacity ?? element.opacity ?? 1,
					flipX: (element.transform?.scaleX ?? 1) < 0,
					flipY: (element.transform?.scaleY ?? 1) < 0,
				};

				// Get volume value
				const mediaEl = element as MediaElement;
				let volumeValue = 1;
				if (mediaEl.audio?.volume !== undefined) {
					const vol = mediaEl.audio.volume;
					if (typeof vol === 'number') {
						volumeValue = vol;
					}
				}

				// Extract color correction from element (unified with preview)
				let colorCorrection: SerializedColorCorrection | undefined;
				const effectableEl = element as { colorCorrection?: { enabled?: boolean; basic?: Record<string, number> } };
				if (effectableEl.colorCorrection?.enabled && effectableEl.colorCorrection.basic) {
					const basic = effectableEl.colorCorrection.basic;
					colorCorrection = {
						exposure: basic.exposure,
						contrast: basic.contrast,
						saturation: basic.saturation,
						temperature: basic.temperature,
						tint: basic.tint,
						vibrance: basic.vibrance,
						highlights: basic.highlights,
						shadows: basic.shadows,
						whites: basic.whites,
						blacks: basic.blacks,
					};
				}

				// Preload media data for video elements (avoids Worker fetch issues with VSCode URLs)
				let preloadedData: ArrayBuffer | undefined;
				if (elementType === 'video' && sourceUrl) {
					try {
						console.log(`[WebviewExportAdapter] Preloading media data for ${sourceUrl.substring(0, 50)}...`);
						// First, get file size from HEAD request
						const headResponse = await fetch(sourceUrl, { method: 'HEAD' });
						const contentLength = headResponse.headers.get('Content-Length');
						const fileSize = contentLength ? parseInt(contentLength, 10) : 0;

						// Load first 2MB (moov is usually at the beginning)
						const initialSize = 2 * 1024 * 1024;
						const response = await fetch(sourceUrl, {
							headers: { Range: `bytes=0-${initialSize - 1}` },
						});
						if (response.ok || response.status === 206) {
							const initialData = await response.arrayBuffer();
							console.log(`[WebviewExportAdapter] Preloaded initial ${initialData.byteLength} bytes`);

							// Check if moov might be at the end (for faststart=false videos)
							// If file is larger than initial load and moov not found, load end of file
							if (fileSize > initialSize) {
								// Load last 2MB as well (moov might be at end)
								const endStart = Math.max(0, fileSize - 2 * 1024 * 1024);
								const endResponse = await fetch(sourceUrl, {
									headers: { Range: `bytes=${endStart}-${fileSize - 1}` },
								});
								if (endResponse.ok || endResponse.status === 206) {
									const endData = await endResponse.arrayBuffer();
									console.log(`[WebviewExportAdapter] Preloaded end ${endData.byteLength} bytes (offset ${endStart})`);

									// Combine both chunks
									const combined = new Uint8Array(initialData.byteLength + endData.byteLength + 8);
									// Store metadata: [initialSize (4 bytes), endStart (4 bytes), initialData, endData]
									const view = new DataView(combined.buffer);
									view.setUint32(0, initialData.byteLength, true);
									view.setUint32(4, endStart, true);
									combined.set(new Uint8Array(initialData), 8);
									combined.set(new Uint8Array(endData), 8 + initialData.byteLength);
									preloadedData = combined.buffer;
								} else {
									preloadedData = initialData;
								}
							} else {
								preloadedData = initialData;
							}
						}
					} catch (e) {
						console.warn(`[WebviewExportAdapter] Failed to preload media data:`, e);
					}
				}

				elements.push({
					id: element.id,
					type: elementType,
					sourceUrl,
					startTime: element.startTime,
					duration: element.duration,
					trimStart: element.trimStart,
					trimEnd: element.trimEnd,
					transform,
					colorCorrection,
					hidden: element.hidden,
					muted: element.muted,
					volume: volumeValue,
					preloadedData,
				});
			}

			tracks.push({
				id: track.id,
				type: track.type === 'audio' ? 'audio' : 'video',
				elements,
				hidden: track.hidden,
				muted: track.muted,
			});
		}

		return {
			duration: this._calculateProjectDuration(project),
			tracks,
		};
	}

	/**
	 * Legacy Worker export - main thread decodes, Worker renders/encodes
	 */
	private async _exportWithLegacyWorker(
		project: ProjectData,
		config: ExportConfig,
		totalFrames: number,
		onProgress?: ExportProgressCallback
	): Promise<ExportResult> {
		try {
			// Create Worker client
			this._workerClient = createExportWorkerClient();

			// Set up progress callback
			this._workerClient.onProgress = (progress) => {
				this._reportProgress(onProgress, progress);
			};

			// Set up error callback
			this._workerClient.onError = (error) => {
				console.error('[WebviewExportAdapter] Worker error:', error);
			};

			// Create OffscreenCanvas for Worker
			const canvas = new OffscreenCanvas(config.width, config.height);

			// Initialize Worker with canvas transfer
			await this._workerClient.init(canvas, {
				width: config.width,
				height: config.height,
				fps: config.fps,
				totalFrames,
				format: config.format,
				quality: config.quality,
				videoBitrate: config.videoBitrate ?? getDefaultBitrate(config.width, config.height, config.quality),
				audioBitrate: config.audioBitrate,
				includeAudio: config.includeAudio,
				maxInflightFrames: 4,
			});

			if (this._cancelled) {
				this._workerClient.cancel();
				return this._createCancelledResult();
			}

			// Create frame provider for decoding
			const frameProvider = createWebviewMediaFrameProvider({
				urlResolver: this._urlResolver ?? undefined,
				maxDecoderInstances: 6,
			});

			// Process video frames and audio in parallel
			const hasAudio = config.includeAudio !== false && this._hasAudioTracks(project);

			try {
				if (hasAudio) {
					const [videoResult, audioResult] = await Promise.allSettled([
						this._processVideoFramesWithWorker(project, config, totalFrames, frameProvider, onProgress),
						this._processAudioForWorker(project, config),
					]);

					if (videoResult.status === 'rejected') {
						throw videoResult.reason;
					}
					if (audioResult.status === 'rejected') {
						console.warn('[WebviewExportAdapter] Audio processing failed:', audioResult.reason);
					}
				} else {
					await this._processVideoFramesWithWorker(project, config, totalFrames, frameProvider, onProgress);
				}
			} finally {
				frameProvider.dispose();
			}

			if (this._cancelled) {
				this._workerClient.cancel();
				return this._createCancelledResult();
			}

			// Finalize and get result from Worker
			this._reportProgress(onProgress, {
				stage: 'muxing',
				currentFrame: totalFrames,
				totalFrames,
				percent: 90,
				elapsedTime: performance.now() - this._startTime,
				estimatedTimeRemaining: 0,
				currentFps: 0,
				message: 'Finalizing video...',
			});

			const result = await this._workerClient.finalize();

			const totalTime = performance.now() - this._startTime;

			this._reportProgress(onProgress, {
				stage: 'completed',
				currentFrame: totalFrames,
				totalFrames,
				percent: 100,
				elapsedTime: totalTime,
				estimatedTimeRemaining: 0,
				currentFps: result.averageFps,
				message: 'Export completed',
			});

			// Create Blob from ArrayBuffer
			const mimeType = config.format === 'webm' ? 'video/webm' : 'video/mp4';
			const blob = new Blob([result.outputBuffer], { type: mimeType });

			return {
				success: true,
				blob,
				fileSize: result.fileSize,
				totalTime,
				averageFps: result.averageFps,
			};
		} catch (error) {
			console.error('[WebviewExportAdapter] Worker export error:', error);
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		} finally {
			await this._cleanup();
			this._isExporting = false;
		}
	}

	/**
	 * Process video frames and send to Worker for encoding
	 */
	private async _processVideoFramesWithWorker(
		project: ProjectData,
		config: ExportConfig,
		totalFrames: number,
		frameProvider: ReturnType<typeof createWebviewMediaFrameProvider>,
		onProgress?: ExportProgressCallback
	): Promise<void> {
		if (!this._workerClient) {
			throw new Error('Worker client not initialized');
		}

		const frameDuration = 1 / config.fps;

		for (let frameIndex = 0; frameIndex < totalFrames && !this._cancelled; frameIndex++) {
			const timeInSeconds = frameIndex * frameDuration;

			// Gather video frames for this time point
			const videoFrames = await this._gatherVideoFramesForTime(
				project,
				timeInSeconds,
				config,
				frameProvider
			);

			// Submit frames to Worker
			await this._workerClient.submitFrame(frameIndex, timeInSeconds, videoFrames);

			// Report progress periodically
			if (frameIndex % 10 === 0) {
				const elapsed = performance.now() - this._startTime;
				const fps = (frameIndex + 1) / (elapsed / 1000);
				const remaining = ((totalFrames - frameIndex - 1) / fps) * 1000;

				this._reportProgress(onProgress, {
					stage: 'rendering',
					currentFrame: frameIndex + 1,
					totalFrames,
					percent: ((frameIndex + 1) / totalFrames) * 80,
					elapsedTime: elapsed,
					estimatedTimeRemaining: remaining,
					currentFps: fps,
					message: `Exporting frame ${frameIndex + 1}/${totalFrames} (Worker)`,
				});
			}

			// Yield to allow UI updates
			if (frameIndex % 5 === 0) {
				await new Promise(resolve => setTimeout(resolve, 0));
			}
		}
	}

	/**
	 * Gather video frames for a specific time point
	 */
	private async _gatherVideoFramesForTime(
		project: ProjectData,
		time: number,
		config: ExportConfig,
		frameProvider: ReturnType<typeof createWebviewMediaFrameProvider>
	): Promise<Array<{ elementId: string; frame: VideoFrame; transform: FrameTransform }>> {
		const frames: Array<{ elementId: string; frame: VideoFrame; transform: FrameTransform }> = [];

		// Iterate through tracks (bottom to top for proper layering)
		for (let trackIndex = project.tracks.length - 1; trackIndex >= 0; trackIndex--) {
			const track = project.tracks[trackIndex];
			if (!track || track.hidden || track.muted) continue;

			for (const element of track.elements) {
				if (element.hidden || element.muted) continue;

				// Check if element is active at this time
				const trimStart = element.trimStart ?? 0;
				const trimEnd = element.trimEnd ?? 0;
				const effectiveDuration = element.duration - trimStart - trimEnd;
				const elementStart = element.startTime;
				const elementEnd = elementStart + effectiveDuration;

				if (time < elementStart || time >= elementEnd) continue;

				// Only process media elements (video)
				if (element.type !== 'media') continue;

				const mediaElement = element as MediaElement;
				const src = mediaElement.src;
				if (!src) continue;

				// Check if it's a video file
				const ext = src.toLowerCase().split('.').pop();
				const videoExts = ['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v'];
				if (!videoExts.includes(ext ?? '')) continue;

				// Calculate time within the video
				const localTime = time - elementStart + trimStart;

				try {
					// Get video frame
					const frame = await frameProvider.getVideoFrame(element.id, src, localTime);
					if (!frame) continue;

					// Calculate transform
					const transform = this._calculateElementTransform(element, config);

					frames.push({
						elementId: element.id,
						frame,
						transform,
					});
				} catch (error) {
					console.warn(`[WebviewExportAdapter] Failed to get frame for ${element.id}:`, error);
				}
			}
		}

		return frames;
	}

	/**
	 * Calculate element transform for compositing
	 */
	private _calculateElementTransform(
		element: TimelineElement,
		config: ExportConfig
	): FrameTransform {
		// Get transform from element (normalized coordinates 0-1)
		const transform = element.transform;

		// Default to full frame if no transform
		if (!transform) {
			return {
				x: 0,
				y: 0,
				width: config.width,
				height: config.height,
				rotation: 0,
				opacity: element.opacity ?? 1,
				flipX: false,
				flipY: false,
			};
		}

		// Convert normalized coordinates to pixel coordinates
		// Transform x/y are normalized (0-1), where 0.5 is center
		const scaleX = transform.scaleX ?? 1;
		const scaleY = transform.scaleY ?? 1;
		const width = config.width * scaleX;
		const height = config.height * scaleY;

		// Calculate position (transform.x/y are center positions in normalized coords)
		const x = (transform.x - 0.5) * config.width + (config.width - width) / 2;
		const y = (transform.y - 0.5) * config.height + (config.height - height) / 2;

		return {
			x,
			y,
			width,
			height,
			rotation: transform.rotation ?? 0,
			opacity: transform.opacity ?? element.opacity ?? 1,
			flipX: scaleX < 0,
			flipY: scaleY < 0,
		};
	}

	/**
	 * Process audio for Worker export
	 * Decodes and mixes audio, then sends to Worker
	 */
	private async _processAudioForWorker(
		project: ProjectData,
		config: ExportConfig
	): Promise<void> {
		if (!this._workerClient) return;

		const audioTracks = this._extractAudioTracks(project);
		if (audioTracks.length === 0) return;

		const sampleRate = 48000;
		const channels = 2;

		// Calculate total timeline duration
		const totalDuration = this._calculateTotalDuration(project, config);
		const totalSamples = Math.ceil(totalDuration * sampleRate);

		// Create mixing buffer (interleaved stereo)
		const mixBuffer = new Float32Array(totalSamples * channels);

		// Decode and mix each track
		for (const track of audioTracks) {
			if (this._cancelled) break;

			try {
				// Resolve URL if needed
				const audioUrl = this._urlResolver
					? await this._urlResolver(track.filePath)
					: track.filePath;

				// Use WebviewAudioDecoder
				const audioDecoder = createWebviewAudioDecoder({
					source: audioUrl,
					sampleRate,
					channels,
				});

				await audioDecoder.open();
				const audioBuffer = await audioDecoder.decodeSegment(track.sourceStart, track.duration);

				// Mix into buffer at timeline position
				const timelineOffset = Math.floor(track.timelineStart * sampleRate);
				const decodedChannels = audioBuffer.numberOfChannels;
				const decodedLength = audioBuffer.length;

				for (let i = 0; i < decodedLength; i++) {
					const bufferIndex = (timelineOffset + i) * channels;
					if (bufferIndex >= mixBuffer.length) break;

					for (let ch = 0; ch < channels; ch++) {
						const sourceChannel = Math.min(ch, decodedChannels - 1);
						const channelData = audioBuffer.getChannelData(sourceChannel);
						let sample = (channelData[i] ?? 0) * track.volume;

						if (!Number.isFinite(sample)) {
							sample = 0;
						}

						const existingValue = mixBuffer[bufferIndex + ch] ?? 0;
						mixBuffer[bufferIndex + ch] = existingValue + sample;
					}
				}

				await audioDecoder.close();
			} catch (error) {
				console.warn('[WebviewExportAdapter] Audio track processing error:', error);
			}
		}

		// Clamp mixed buffer to [-1, 1] range
		for (let i = 0; i < mixBuffer.length; i++) {
			const value = mixBuffer[i] ?? 0;
			mixBuffer[i] = Math.max(-1, Math.min(1, value));
		}

		// Send to Worker
		await this._workerClient.submitAudio(mixBuffer, sampleRate, channels);
	}

	/**
	 * Process audio for Full Pipeline Worker export
	 * Returns mixed audio buffer to be sent to Worker
	 */
	private async _processAudioForFullPipelineWorker(
		project: ProjectData,
		config: ExportConfig
	): Promise<{ buffer: Float32Array; sampleRate: number; channels: number } | null> {
		const audioTracks = this._extractAudioTracks(project);
		if (audioTracks.length === 0) return null;

		const sampleRate = 48000;
		const channels = 2;

		// Calculate total timeline duration
		const totalDuration = this._calculateTotalDuration(project, config);
		const totalSamples = Math.ceil(totalDuration * sampleRate);

		console.log(`[WebviewExportAdapter] Processing audio for Full Pipeline Worker: ${audioTracks.length} tracks, ${totalDuration.toFixed(2)}s`);

		// Create mixing buffer (interleaved stereo)
		const mixBuffer = new Float32Array(totalSamples * channels);

		// Decode and mix each track
		for (const track of audioTracks) {
			if (this._cancelled) break;

			try {
				// Resolve URL if needed
				const audioUrl = this._urlResolver
					? await this._urlResolver(track.filePath)
					: track.filePath;

				// Use WebviewAudioDecoder (uses libav.js in main thread)
				const audioDecoder = createWebviewAudioDecoder({
					source: audioUrl,
					sampleRate,
					channels,
				});

				await audioDecoder.open();
				const audioBuffer = await audioDecoder.decodeSegment(track.sourceStart, track.duration);

				// Mix into buffer at timeline position
				const timelineOffset = Math.floor(track.timelineStart * sampleRate);
				const decodedChannels = audioBuffer.numberOfChannels;
				const decodedLength = audioBuffer.length;

				for (let i = 0; i < decodedLength; i++) {
					const bufferIndex = (timelineOffset + i) * channels;
					if (bufferIndex >= mixBuffer.length) break;

					for (let ch = 0; ch < channels; ch++) {
						const sourceChannel = Math.min(ch, decodedChannels - 1);
						const channelData = audioBuffer.getChannelData(sourceChannel);
						let sample = (channelData[i] ?? 0) * track.volume;

						if (!Number.isFinite(sample)) {
							sample = 0;
						}

						const existingValue = mixBuffer[bufferIndex + ch] ?? 0;
						mixBuffer[bufferIndex + ch] = existingValue + sample;
					}
				}

				await audioDecoder.close();
				console.log(`[WebviewExportAdapter] Track mixed: ${track.filePath}`);
			} catch (error) {
				console.warn('[WebviewExportAdapter] Audio track processing error:', error);
			}
		}

		// Clamp mixed buffer to [-1, 1] range
		for (let i = 0; i < mixBuffer.length; i++) {
			const value = mixBuffer[i] ?? 0;
			mixBuffer[i] = Math.max(-1, Math.min(1, value));
		}

		return { buffer: mixBuffer, sampleRate, channels };
	}
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a new WebviewExportAdapter instance
 */
export function createWebviewExportAdapter(): WebviewExportAdapter {
	return new WebviewExportAdapter();
}

/**
 * Check if pure Webview export is available (sync version)
 */
export function isWebviewExportAvailable(): boolean {
	// Check WebCodecs
	if (typeof VideoEncoder === 'undefined') {
		return false;
	}

	// Check WebGPU or WebGL
	if (typeof navigator.gpu === 'undefined' && typeof WebGLRenderingContext === 'undefined') {
		return false;
	}

	return true;
}
