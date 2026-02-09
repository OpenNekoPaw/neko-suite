/**
 * PreviewService - Media preview orchestration service
 *
 * Wraps NativeEngine NAPI for media preview operations:
 * - Media probing (metadata extraction)
 * - Video playback control (start/stop/seek via H.264 stream)
 * - Audio segment decoding (PCM extraction)
 * - Waveform data generation
 *
 * Architecture:
 * PreviewService → NativeEngine (NAPI) → Rust EngineApi
 */

import * as vscode from 'vscode';

// =============================================================================
// Types (matching NativeEngine NAPI interface)
// =============================================================================

interface NativeEngineInstance {
	startFrameServer(port?: number | null): Promise<number>;
	stopFrameServer(): Promise<void>;
	getFrameServerPort(): number | null;
	dispatch(requestJson: string): Promise<string>;
	hasGpu(): boolean;
}

interface NativeEngineModule {
	NativeEngine: { create(): Promise<NativeEngineInstance> };
}

interface ActionRequest {
	group: string;
	action: string;
	id?: string;
	options?: Record<string, unknown>;
	body?: unknown;
}

interface ActionResponse {
	status: string;
	data?: Record<string, unknown>;
	error?: { code: string; message: string };
}

export interface MediaInfo {
	duration: number;
	width: number;
	height: number;
	fps: number;
	codec: string;
	format: string;
	bitrate?: number;
	hasAudio: boolean;
	audioCodec?: string;
	audioSampleRate?: number;
	audioChannels?: number;
}

// =============================================================================
// PreviewService
// =============================================================================

export class PreviewService implements vscode.Disposable {
	private _engine: NativeEngineInstance | null = null;
	private _port: number | null = null;
	private _disposed = false;
	private _activeStreamId: string | null = null;

	/**
	 * Try to create a PreviewService instance.
	 * Returns null if native addon is unavailable.
	 */
	static async tryCreate(): Promise<PreviewService | null> {
		const service = new PreviewService();
		const initialized = await service.initialize();
		if (initialized) {
			return service;
		}
		await service.dispose();
		return null;
	}

	private constructor() {}

	private async initialize(): Promise<boolean> {
		try {
			console.log('[PreviewService] Loading native addon...');
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const addon = require('@neko-engine/native-napi') as NativeEngineModule;
			this._engine = await addon.NativeEngine.create();
			console.log(
				`[PreviewService] NativeEngine created (GPU: ${this._engine.hasGpu() ? 'enabled' : 'disabled'})`
			);

			// Start embedded HTTP/WebSocket server
			this._port = await this._engine.startFrameServer(0);
			console.log(`[PreviewService] Frame server on port ${this._port}`);

			return true;
		} catch (error) {
			console.error(
				'[PreviewService] Failed to initialize:',
				error instanceof Error ? error.message : error
			);
			return false;
		}
	}

	// =========================================================================
	// Properties
	// =========================================================================

	get isAvailable(): boolean {
		return this._engine !== null && this._port !== null && !this._disposed;
	}

	get port(): number | null {
		return this._port;
	}

	get h264WebSocketUrl(): string | null {
		if (!this._port) return null;
		return `ws://127.0.0.1:${this._port}/ws/h264`;
	}

	// =========================================================================
	// Media Probing
	// =========================================================================

	/**
	 * Probe a media file and return its metadata
	 */
	async probeMedia(filePath: string): Promise<MediaInfo> {
		const result = await this.dispatch({
			group: 'videos',
			action: 'probe',
			options: { source: filePath },
		});

		if (result.status === 'error') {
			throw new Error(result.error?.message ?? 'Probe failed');
		}

		return result.data as unknown as MediaInfo;
	}

	// =========================================================================
	// Video Playback Control
	// =========================================================================

	/**
	 * Start video playback via H.264 stream.
	 * Builds a single-track timeline and dispatches to NativeEngine.
	 */
	async startVideoPlayback(
		filePath: string,
		mediaInfo: MediaInfo,
		startTime: number = 0,
		speed: number = 1.0
	): Promise<string | null> {
		// Stop any existing stream first
		await this.stopPlayback();

		const timeline = {
			id: 'preview-playback',
			duration: mediaInfo.duration,
			fps: mediaInfo.fps || 30,
			resolution: {
				width: mediaInfo.width || 1920,
				height: mediaInfo.height || 1080,
			},
			tracks: [
				{
					id: 'video-track',
					trackType: 'video',
					elements: [
						{
							id: 'video-0',
							type: 'media',
							src: filePath,
							startTime: 0,
							duration: mediaInfo.duration,
							trimStart: 0,
						},
					],
				},
			],
		};

		const result = await this.dispatch({
			group: 'timelines',
			action: 'stream',
			options: {
				sessionId: 'preview-playback',
				fps: mediaInfo.fps || 30,
				startTime,
			},
			body: timeline,
		});

		if (result.status === 'error') {
			console.error('[PreviewService] Failed to start playback:', result.error);
			return null;
		}

		const data = result.data as Record<string, unknown> | undefined;
		this._activeStreamId = (data?.streamId as string) ?? null;

		// Set playback speed if not 1.0
		if (this._activeStreamId && speed !== 1.0) {
			await this.dispatch({
				group: 'timelines',
				action: 'speed',
				options: {
					streamId: this._activeStreamId,
					speed,
				},
			});
		}

		return this._activeStreamId;
	}

	/**
	 * Stop current playback
	 */
	async stopPlayback(): Promise<void> {
		if (!this._activeStreamId) return;

		try {
			await this.dispatch({
				group: 'timelines',
				action: 'stop',
				options: { streamId: this._activeStreamId },
			});
		} catch {
			// Ignore stop errors
		}
		this._activeStreamId = null;
	}

	/**
	 * Seek to a specific time
	 */
	async seekTo(time: number): Promise<void> {
		if (!this._activeStreamId) return;

		await this.dispatch({
			group: 'timelines',
			action: 'seek',
			options: {
				streamId: this._activeStreamId,
				time,
			},
		});
	}

	/**
	 * Set playback speed
	 */
	async setSpeed(speed: number): Promise<void> {
		if (!this._activeStreamId) return;

		await this.dispatch({
			group: 'timelines',
			action: 'speed',
			options: {
				streamId: this._activeStreamId,
				speed,
			},
		});
	}

	/**
	 * Pause playback
	 */
	async pausePlayback(): Promise<void> {
		if (!this._activeStreamId) return;

		await this.dispatch({
			group: 'timelines',
			action: 'pause',
			options: { streamId: this._activeStreamId },
		});
	}

	/**
	 * Resume playback
	 */
	async resumePlayback(): Promise<void> {
		if (!this._activeStreamId) return;

		await this.dispatch({
			group: 'timelines',
			action: 'resume',
			options: { streamId: this._activeStreamId },
		});
	}

	// =========================================================================
	// Audio Operations
	// =========================================================================

	/**
	 * Decode an audio segment and return PCM data as base64
	 */
	async decodeAudioSegment(
		filePath: string,
		startTime: number,
		duration: number,
		sampleRate: number = 48000,
		channels: number = 2
	): Promise<{ buffer: string; sampleRate: number; channels: number; samples: number }> {
		const result = await this.dispatch({
			group: 'audios',
			action: 'extract',
			options: {
				source: filePath,
				startTime,
				duration,
				sampleRate,
				channels,
				format: 'f32le',
			},
		});

		if (result.status === 'error') {
			throw new Error(result.error?.message ?? 'Audio decode failed');
		}

		return result.data as unknown as {
			buffer: string;
			sampleRate: number;
			channels: number;
			samples: number;
		};
	}

	/**
	 * Get waveform data for visualization
	 */
	async getWaveform(
		filePath: string,
		samplesPerPixel: number = 256
	): Promise<{ peaks: number[]; duration: number; sampleRate: number }> {
		const result = await this.dispatch({
			group: 'audios',
			action: 'waveform',
			options: {
				source: filePath,
				samplesPerPixel,
			},
		});

		if (result.status === 'error') {
			throw new Error(result.error?.message ?? 'Waveform generation failed');
		}

		return result.data as unknown as {
			peaks: number[];
			duration: number;
			sampleRate: number;
		};
	}

	/**
	 * Capture a single video frame as JPEG
	 */
	async captureFrame(
		filePath: string,
		time: number,
		quality: number = 80
	): Promise<string> {
		const result = await this.dispatch({
			group: 'videos',
			action: 'capture',
			options: {
				source: filePath,
				time,
				quality,
				format: 'jpeg',
			},
		});

		if (result.status === 'error') {
			throw new Error(result.error?.message ?? 'Frame capture failed');
		}

		const data = result.data as Record<string, unknown> | undefined;
		return (data?.data as string) ?? '';
	}

	// =========================================================================
	// Dispatch
	// =========================================================================

	private async dispatch(request: ActionRequest): Promise<ActionResponse> {
		if (!this._engine || this._disposed) {
			throw new Error('PreviewService not available');
		}

		const json = JSON.stringify(request);
		const responseJson = await this._engine.dispatch(json);
		return JSON.parse(responseJson) as ActionResponse;
	}

	// =========================================================================
	// Disposal
	// =========================================================================

	async dispose(): Promise<void> {
		if (this._disposed) return;
		this._disposed = true;

		await this.stopPlayback();

		if (this._engine) {
			try {
				await this._engine.stopFrameServer();
				console.log('[PreviewService] Frame server stopped');
			} catch {
				// Ignore
			}
			this._engine = null;
		}

		this._port = null;
	}
}
