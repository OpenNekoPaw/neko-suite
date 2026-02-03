/**
 * Export Service
 *
 * Coordinates timeline rendering, GPU compositing, animation evaluation,
 * and video encoding for non-web video export in Compatible Mode.
 */

import * as os from 'os';
import { webTransformToRust } from '@neko/shared/utils/coordinateTransform';

// Types from media-processor-rs
interface CompositorSessionType {
	composite(
		layers: CompositeLayerInput[],
		outputWidth: number,
		outputHeight: number,
		backgroundColor?: number[]
	): { data: Buffer; width: number; height: number; timeMs: number; layerCount: number };
	compositeSingle(
		layer: CompositeLayerInput,
		outputWidth: number,
		outputHeight: number
	): { data: Buffer; width: number; height: number; timeMs: number; layerCount: number };
}

interface AnimationSessionType {
	addTrack(track: KeyframeTrackInput): void;
	evaluate(time: number): { values: Record<string, AnimatableValueOutput> };
	duration(): number;
	setDuration(duration: number): void;
	setLoop(enabled: boolean, count?: number): void;
	isComplete(time: number): boolean;
	trackCount(): number;
	properties(): string[];
}

interface CompositeLayerInput {
	data: Buffer;
	width: number;
	height: number;
	transform?: {
		x: number;
		y: number;
		scaleX: number;
		scaleY: number;
		rotation: number;
		anchorX: number;
		anchorY: number;
	};
	opacity?: number;
	blendMode?: string;
	zIndex?: number;
	mask?: Buffer;
	maskInverted?: boolean;
}

interface KeyframeTrackInput {
	property: string;
	keyframes: Array<{
		time: number;
		value: AnimatableValueInput;
		easing?: string;
		interpolation?: string;
	}>;
	defaultValue?: AnimatableValueInput;
}

interface AnimatableValueInput {
	valueType: string;
	number?: number;
	x?: number;
	y?: number;
	z?: number;
	r?: number;
	g?: number;
	b?: number;
	a?: number;
	boolValue?: boolean;
}

interface AnimatableValueOutput {
	valueType: string;
	number?: number;
	x?: number;
	y?: number;
	z?: number;
	r?: number;
	g?: number;
	b?: number;
	a?: number;
	boolValue?: boolean;
}

// =============================================================================
// Export Configuration
// =============================================================================

export interface ExportConfig {
	/** Output file path */
	outputPath: string;
	/** Output width */
	width: number;
	/** Output height */
	height: number;
	/** Frame rate (fps) */
	fps: number;
	/** Duration in seconds */
	duration: number;
	/** Video codec */
	videoCodec?: 'h264' | 'h265' | 'vp9' | 'prores';
	/** Video bitrate in bps */
	videoBitrate?: number;
	/** Encoding preset */
	preset?: 'ultrafast' | 'fast' | 'medium' | 'slow' | 'veryslow';
	/** Container format */
	container?: 'mp4' | 'mov' | 'webm' | 'mkv';
	/** Include audio */
	includeAudio?: boolean;
	/** Audio codec */
	audioCodec?: 'aac' | 'mp3' | 'opus' | 'flac';
	/** Audio bitrate in bps */
	audioBitrate?: number;
	/** Audio sample rate */
	audioSampleRate?: number;
	/** Audio channels */
	audioChannels?: number;
	/** Background color [r, g, b, a] (0-1) */
	backgroundColor?: [number, number, number, number];
}

export interface ExportProgress {
	/** Current frame number */
	currentFrame: number;
	/** Total frames */
	totalFrames: number;
	/** Progress percentage (0-100) */
	percentage: number;
	/** Elapsed time in milliseconds */
	elapsedMs: number;
	/** Estimated remaining time in milliseconds */
	estimatedRemainingMs: number;
	/** Current phase */
	phase: 'initializing' | 'rendering' | 'encoding' | 'finalizing';
	/** Performance statistics (optional) */
	performanceStats?: {
		/** Average render time per frame (ms) */
		avgRenderTime: number;
		/** Average encode time per frame (ms) */
		avgEncodeTime: number;
		/** Average decode time per frame (ms) */
		avgDecodeTime?: number;
		/** Current FPS */
		currentFps: number;
		/** Memory used (MB) */
		memoryUsedMB?: number;
		/** VRAM used (MB) */
		vramUsedMB?: number;
		/** CPU usage (0-100%) */
		cpuUsage?: number;
		/** GPU usage (0-100%) */
		gpuUsage?: number;
	};
}

export interface ExportResult {
	success: boolean;
	outputPath?: string;
	error?: string;
	/** Total export time in milliseconds */
	totalTimeMs?: number;
	/** Total frames rendered */
	framesRendered?: number;
	/** Average frame render time in milliseconds */
	avgFrameTimeMs?: number;
}

export type ExportProgressCallback = (progress: ExportProgress) => void;

// =============================================================================
// Track Layer Definition
// =============================================================================

export interface TrackLayer {
	/** Unique layer ID */
	id: string;
	/** Layer type */
	type: 'video' | 'image' | 'text' | 'shape' | 'effect';
	/** Start time in seconds (relative to timeline) */
	startTime: number;
	/** Duration in seconds */
	duration: number;
	/** Layer source (file path for video/image, content for text) */
	source?: string;
	/** Layer width (for non-video sources) */
	width?: number;
	/** Layer height (for non-video sources) */
	height?: number;
	/** Z-index (layer order) */
	zIndex: number;
	/** Blend mode */
	blendMode?: string;
	/** Initial opacity */
	opacity?: number;
	/** Transform */
	transform?: {
		x: number;
		y: number;
		scaleX: number;
		scaleY: number;
		rotation: number;
		anchorX: number;
		anchorY: number;
	};
	/** Keyframe animations */
	animations?: KeyframeTrackInput[];
	/** Mask layer ID */
	maskLayerId?: string;
	/** Effects to apply */
	effects?: Array<{
		type: string;
		params: Record<string, number | string | boolean>;
	}>;
}

// =============================================================================
// Export Service
// =============================================================================

/**
 * Export Service for rendering and encoding video from timeline
 */
export class ExportService {
	private _compositorSession: CompositorSessionType | null = null;
	private _animationSessions: Map<string, AnimationSessionType> = new Map();
	private _nativeModule: NativeModuleType | null = null;
	private _isInitialized = false;
	private _cancellationToken: { cancelled: boolean } | null = null;

	constructor() {}

	/**
	 * Initialize the export service
	 */
	async initialize(): Promise<void> {
		if (this._isInitialized) {
			return;
		}

		try {
			// Load native module
			this._nativeModule = await import('@neko/media-processor-rs') as unknown as NativeModuleType;

			// Create compositor session
			this._compositorSession = await this._nativeModule.CompositorSession.create();

			this._isInitialized = true;
			console.log('[ExportService] Initialized successfully');
		} catch (error) {
			console.error('[ExportService] Failed to initialize:', error);
			throw new Error(`Export service initialization failed: ${error}`);
		}
	}

	/**
	 * Export timeline to video file
	 */
	async export(
		config: ExportConfig,
		layers: TrackLayer[],
		frameProvider: FrameProvider,
		progressCallback?: ExportProgressCallback
	): Promise<ExportResult> {
		if (!this._isInitialized || !this._nativeModule || !this._compositorSession) {
			throw new Error('Export service not initialized');
		}

		const startTime = Date.now();
		const totalFrames = Math.ceil(config.duration * config.fps);
		let framesRendered = 0;
		let totalFrameTime = 0;

		// Setup cancellation
		this._cancellationToken = { cancelled: false };

		try {
			// Phase: Initializing
			progressCallback?.({
				currentFrame: 0,
				totalFrames,
				percentage: 0,
				elapsedMs: 0,
				estimatedRemainingMs: 0,
				phase: 'initializing',
			});

			// Setup animation sessions for each layer
			this._setupAnimations(layers);

			// Create muxer session
			const muxer = this._nativeModule.MuxerSession.create({
				outputPath: config.outputPath,
				format: config.container || 'mp4',
			});

			// Add video stream
			muxer.addVideoStream({
				width: config.width,
				height: config.height,
				fps: config.fps,
				bitrate: config.videoBitrate,
				codec: config.videoCodec || 'h264',
				preset: config.preset || 'medium',
				pixelFormat: 'rgba',
			});

			// Add audio stream if needed
			if (config.includeAudio) {
				muxer.addAudioStream({
					sampleRate: config.audioSampleRate || 48000,
					channels: config.audioChannels || 2,
					bitrate: config.audioBitrate,
					codec: config.audioCodec || 'aac',
					sampleFormat: 'f32',
				});
			}

			// Create video encoder
			const videoEncoder = this._nativeModule.MediaProcessor.prototype.createVideoEncoder({
				width: config.width,
				height: config.height,
				fps: config.fps,
				bitrate: config.videoBitrate,
				codec: config.videoCodec || 'h264',
				preset: config.preset || 'medium',
				pixelFormat: 'rgba',
			});

			// Write muxer header
			muxer.writeHeader();

			const frameInterval = 1 / config.fps;
			const backgroundColor = config.backgroundColor || [0, 0, 0, 1];

			// CPU usage tracking
			let lastCpuInfo = os.cpus();
			const getCpuUsage = (): number => {
				const currentCpuInfo = os.cpus();
				let totalIdle = 0;
				let totalTick = 0;

				for (let i = 0; i < currentCpuInfo.length; i++) {
					const cpu = currentCpuInfo[i];
					const lastCpu = lastCpuInfo[i];
					if (!cpu || !lastCpu) continue;

					const idleDiff = cpu.times.idle - lastCpu.times.idle;
					const totalDiff =
						(cpu.times.user - lastCpu.times.user) +
						(cpu.times.nice - lastCpu.times.nice) +
						(cpu.times.sys - lastCpu.times.sys) +
						(cpu.times.idle - lastCpu.times.idle) +
						(cpu.times.irq - lastCpu.times.irq);

					totalIdle += idleDiff;
					totalTick += totalDiff;
				}

				lastCpuInfo = currentCpuInfo;
				return totalTick > 0 ? Math.round((1 - totalIdle / totalTick) * 100) : 0;
			};

			// Memory usage helper
			const getMemoryUsage = (): number => {
				const used = process.memoryUsage();
				return Math.round(used.heapUsed / (1024 * 1024));
			};

			// Phase: Rendering
			let totalRenderTime = 0;
			let totalEncodeTime = 0;
			let totalDecodeTime = 0;
			for (let frame = 0; frame < totalFrames; frame++) {
				// Check cancellation
				if (this._cancellationToken.cancelled) {
					throw new Error('Export cancelled');
				}

				const frameStartTime = Date.now();
				const currentTime = frame * frameInterval;

				// Get frame data for each layer at current time (includes decode time)
				const decodeStart = Date.now();
				const compositeLayers = await this._renderFrame(
					layers,
					currentTime,
					config.width,
					config.height,
					frameProvider
				);
				const decodeTime = Date.now() - decodeStart;
				totalDecodeTime += decodeTime;

				// Composite layers using GPU
				const renderStart = Date.now();
				const compositeResult = this._compositorSession.composite(
					compositeLayers,
					config.width,
					config.height,
					backgroundColor
				);
				const renderTime = Date.now() - renderStart;
				totalRenderTime += renderTime;

				// Encode frame
				const encodeStart = Date.now();
				const packets = videoEncoder.encodeFrame(
					{
						width: config.width,
						height: config.height,
						format: 'rgba',
						data: compositeResult.data,
						timestamp: currentTime,
						isKeyframe: frame === 0,
					},
					frame
				);

				// Write packets to muxer
				for (const packet of packets) {
					muxer.writeVideoPacket({
						data: packet.data,
						pts: packet.pts,
						dts: packet.dts,
						duration: packet.duration,
						isKeyframe: packet.isKeyframe,
					});
				}
				const encodeTime = Date.now() - encodeStart;
				totalEncodeTime += encodeTime;

				// Update progress
				framesRendered++;
				const frameTime = Date.now() - frameStartTime;
				totalFrameTime += frameTime;
				const avgFrameTime = totalFrameTime / framesRendered;
				const elapsedMs = Date.now() - startTime;
				const estimatedRemainingMs = avgFrameTime * (totalFrames - framesRendered);
				const currentFps = framesRendered / (elapsedMs / 1000);

				// Get CPU usage (sample every 10 frames to reduce overhead)
				const cpuUsage = frame % 10 === 0 ? getCpuUsage() : undefined;

				progressCallback?.({
					currentFrame: framesRendered,
					totalFrames,
					percentage: (framesRendered / totalFrames) * 100,
					elapsedMs,
					estimatedRemainingMs,
					phase: framesRendered < totalFrames ? 'rendering' : 'encoding',
					performanceStats: {
						avgRenderTime: totalRenderTime / framesRendered,
						avgEncodeTime: totalEncodeTime / framesRendered,
						avgDecodeTime: totalDecodeTime / framesRendered,
						currentFps,
						memoryUsedMB: getMemoryUsage(),
						cpuUsage,
					},
				});
			}

			// Phase: Finalizing
			progressCallback?.({
				currentFrame: framesRendered,
				totalFrames,
				percentage: 99,
				elapsedMs: Date.now() - startTime,
				estimatedRemainingMs: 0,
				phase: 'finalizing',
			});

			// Flush video encoder
			const flushPackets = videoEncoder.flush();
			for (const packet of flushPackets) {
				muxer.writeVideoPacket({
					data: packet.data,
					pts: packet.pts,
					dts: packet.dts,
					duration: packet.duration,
					isKeyframe: packet.isKeyframe,
				});
			}
			videoEncoder.close();

			// Finish muxer
			muxer.finish();

			const totalTimeMs = Date.now() - startTime;

			return {
				success: true,
				outputPath: config.outputPath,
				totalTimeMs,
				framesRendered,
				avgFrameTimeMs: totalFrameTime / framesRendered,
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
				framesRendered,
			};
		} finally {
			// Cleanup animation sessions
			this._animationSessions.clear();
			this._cancellationToken = null;
		}
	}

	/**
	 * Cancel ongoing export
	 */
	cancel(): void {
		if (this._cancellationToken) {
			this._cancellationToken.cancelled = true;
		}
	}

	/**
	 * Dispose resources
	 */
	dispose(): void {
		this._animationSessions.clear();
		this._compositorSession = null;
		this._nativeModule = null;
		this._isInitialized = false;
	}

	// =========================================================================
	// Private Methods
	// =========================================================================

	private _setupAnimations(layers: TrackLayer[]): void {
		if (!this._nativeModule) return;

		for (const layer of layers) {
			if (layer.animations && layer.animations.length > 0) {
				const animSession = this._nativeModule.AnimationSession.create(
					`anim_${layer.id}`,
					layer.id
				);

				for (const track of layer.animations) {
					animSession.addTrack(track);
				}

				this._animationSessions.set(layer.id, animSession);
			}
		}
	}

	private async _renderFrame(
		layers: TrackLayer[],
		currentTime: number,
		outputWidth: number,
		outputHeight: number,
		frameProvider: FrameProvider
	): Promise<CompositeLayerInput[]> {
		const compositeLayers: CompositeLayerInput[] = [];

		// Sort layers by z-index
		const sortedLayers = [...layers].sort((a, b) => a.zIndex - b.zIndex);

		for (const layer of sortedLayers) {
			// Check if layer is active at current time
			if (currentTime < layer.startTime || currentTime >= layer.startTime + layer.duration) {
				continue;
			}

			// Get layer frame data
			const localTime = currentTime - layer.startTime;
			const frameData = await frameProvider.getFrameData(layer, localTime);

			if (!frameData) {
				continue;
			}

			// Evaluate animations
			let transform = layer.transform;
			let opacity = layer.opacity ?? 1.0;

			const animSession = this._animationSessions.get(layer.id);
			if (animSession) {
				const evaluated = animSession.evaluate(localTime);

				// Apply animated values
				if (evaluated.values) {
					if (evaluated.values['opacity']?.number !== undefined) {
						opacity = evaluated.values['opacity'].number;
					}
					if (evaluated.values['positionX']?.number !== undefined) {
						transform = { ...transform!, x: evaluated.values['positionX'].number };
					}
					if (evaluated.values['positionY']?.number !== undefined) {
						transform = { ...transform!, y: evaluated.values['positionY'].number };
					}
					if (evaluated.values['scaleX']?.number !== undefined) {
						transform = { ...transform!, scaleX: evaluated.values['scaleX'].number };
					}
					if (evaluated.values['scaleY']?.number !== undefined) {
						transform = { ...transform!, scaleY: evaluated.values['scaleY'].number };
					}
					if (evaluated.values['rotation']?.number !== undefined) {
						transform = { ...transform!, rotation: evaluated.values['rotation'].number };
					}
					if (evaluated.values['position']?.x !== undefined) {
						transform = {
							...transform!,
							x: evaluated.values['position'].x!,
							y: evaluated.values['position'].y!,
						};
					}
					if (evaluated.values['scale']?.x !== undefined) {
						transform = {
							...transform!,
							scaleX: evaluated.values['scale'].x!,
							scaleY: evaluated.values['scale'].y!,
						};
					}
				}
			}

			// Convert Web normalized coordinates to Rust pixel coordinates
			// Web uses 0-1 normalized coords (0.5, 0.5 = center)
			// Rust uses pixel coords (0, 0 = top-left)
			let rustTransform: CompositeLayerInput['transform'];
			if (transform) {
				const converted = webTransformToRust(
					{
						x: transform.x || 0.5,
						y: transform.y || 0.5,
						scaleX: transform.scaleX || 1,
						scaleY: transform.scaleY || 1,
						rotation: transform.rotation || 0,
						anchorX: transform.anchorX || 0.5,
						anchorY: transform.anchorY || 0.5,
					},
					outputWidth,
					outputHeight,
					frameData.width,
					frameData.height
				);
				rustTransform = {
					x: converted.x,
					y: converted.y,
					scaleX: converted.scaleX,
					scaleY: converted.scaleY,
					rotation: converted.rotation,
					anchorX: converted.anchorX,
					anchorY: converted.anchorY,
				};
			}

			compositeLayers.push({
				data: frameData.data,
				width: frameData.width,
				height: frameData.height,
				transform: rustTransform,
				opacity,
				blendMode: layer.blendMode,
				zIndex: layer.zIndex,
			});
		}

		return compositeLayers;
	}
}

// =============================================================================
// Frame Provider Interface
// =============================================================================

/**
 * Interface for providing frame data for layers
 */
export interface FrameProvider {
	/**
	 * Get frame data for a layer at a specific time
	 */
	getFrameData(
		layer: TrackLayer,
		localTime: number
	): Promise<{ data: Buffer; width: number; height: number } | null>;
}

// =============================================================================
// Native Module Type
// =============================================================================

interface NativeModuleType {
	MediaProcessor: {
		create(): Promise<{
			createVideoEncoder(config: {
				width: number;
				height: number;
				fps: number;
				bitrate?: number;
				codec: string;
				preset?: string;
				pixelFormat?: string;
			}): VideoEncoderSessionType;
			createAudioEncoder(config: {
				sampleRate: number;
				channels: number;
				bitrate?: number;
				codec?: string;
				sampleFormat?: string;
			}): AudioEncoderSessionType;
			decodeFrame(config: { path: string }, time: number): {
				width: number;
				height: number;
				format: string;
				data: Buffer;
				timestamp: number;
				isKeyframe: boolean;
			};
		}>;
		prototype: {
			createVideoEncoder(config: {
				width: number;
				height: number;
				fps: number;
				bitrate?: number;
				codec: string;
				preset?: string;
				pixelFormat?: string;
			}): VideoEncoderSessionType;
		};
	};
	MuxerSession: {
		create(config: { outputPath: string; format: string }): MuxerSessionType;
	};
	CompositorSession: {
		create(): Promise<CompositorSessionType>;
	};
	AnimationSession: {
		create(id: string, targetId: string): AnimationSessionType;
	};
}

interface VideoEncoderSessionType {
	encodeFrame(
		frame: { width: number; height: number; format: string; data: Buffer; timestamp: number; isKeyframe: boolean },
		pts: number
	): Array<{ data: Buffer; pts: number; dts: number; isKeyframe: boolean; duration: number }>;
	flush(): Array<{ data: Buffer; pts: number; dts: number; isKeyframe: boolean; duration: number }>;
	close(): void;
}

interface AudioEncoderSessionType {
	encodeFrame(data: Buffer, samples: number): Array<{ data: Buffer; pts: number; duration: number }>;
	flush(): Array<{ data: Buffer; pts: number; duration: number }>;
	close(): void;
}

interface MuxerSessionType {
	addVideoStream(config: {
		width: number;
		height: number;
		fps: number;
		bitrate?: number;
		codec: string;
		preset?: string;
		profile?: string;
		pixelFormat?: string;
	}): { index: number; timeBaseNum: number; timeBaseDen: number };
	addAudioStream(config: {
		sampleRate: number;
		channels: number;
		bitrate?: number;
		codec?: string;
		sampleFormat?: string;
	}): { index: number; timeBaseNum: number; timeBaseDen: number };
	writeHeader(): void;
	writeVideoPacket(packet: { data: Buffer; pts: number; dts: number; duration: number; isKeyframe: boolean }): void;
	writeAudioPacket(packet: { data: Buffer; pts: number; dts: number; duration: number; isKeyframe: boolean }): void;
	finish(): void;
	isOpen(): boolean;
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create and initialize an ExportService
 */
export async function createExportService(): Promise<ExportService> {
	const service = new ExportService();
	await service.initialize();
	return service;
}
