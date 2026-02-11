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
	private _activeAudioStreamId: string | null = null;

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

	/**
	 * Build WebSocket URL for a specific stream
	 */
	getStreamWebSocketUrl(streamId: string): string | null {
		if (!this._port) return null;
		return `ws://127.0.0.1:${this._port}/v1/streams/${streamId}`;
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

		const data = result.data as Record<string, unknown>;
		const videoStreams = (data.videoStreams as Array<Record<string, unknown>>) ?? [];
		const audioStreams = (data.audioStreams as Array<Record<string, unknown>>) ?? [];
		const video = videoStreams[0] ?? {};
		const audio = audioStreams[0];

		return {
			duration: (data.duration as number) ?? 0,
			width: (video.width as number) ?? 0,
			height: (video.height as number) ?? 0,
			fps: (video.fps as number) ?? 0,
			codec: (video.codec as string) ?? '',
			format: (data.format as string) ?? '',
			bitrate: video.bitrate as number | undefined,
			hasAudio: audioStreams.length > 0,
			audioCodec: audio?.codec as string | undefined,
			audioSampleRate: audio?.sampleRate as number | undefined,
			audioChannels: audio?.channels as number | undefined,
		};
	}

	// =========================================================================
	// Video Playback Control
	// =========================================================================

	/**
	 * Start video playback via H.264 stream.
	 * Uses direct video transcoding (decode → encode) for efficient single-file preview.
	 * Also starts audio stream if the media has audio tracks.
	 */
	async startVideoPlayback(
		filePath: string,
		mediaInfo: MediaInfo,
		startTime: number = 0,
		speed: number = 1.0
	): Promise<{ videoStreamId: string | null; audioStreamId: string | null }> {
		// Stop any existing stream first
		await this.stopPlayback();

		// Start video stream
		const videoResult = await this.dispatch({
			group: 'videos',
			action: 'stream',
			options: {
				source: filePath,
				session_id: 'preview-playback',
			},
		});

		if (videoResult.status === 'error') {
			console.error('[PreviewService] Failed to start video playback:', videoResult.error);
			return { videoStreamId: null, audioStreamId: null };
		}

		const videoData = videoResult.data as Record<string, unknown> | undefined;
		this._activeStreamId = (videoData?.streamId as string) ?? null;

		// Start audio stream if media has audio
		let audioStreamId: string | null = null;
		if (mediaInfo.hasAudio) {
			const audioResult = await this.dispatch({
				group: 'audios',
				action: 'stream',
				options: {
					source: filePath,
					session_id: 'preview-audio',
				},
			});

			if (audioResult.status === 'error') {
				console.warn('[PreviewService] Failed to start audio stream:', audioResult.error);
			} else {
				const audioData = audioResult.data as Record<string, unknown> | undefined;
				audioStreamId = (audioData?.streamId as string) ?? null;
				this._activeAudioStreamId = audioStreamId;
			}
		}

		// Set playback speed if not 1.0
		if (this._activeStreamId && speed !== 1.0) {
			await this.dispatch({
				group: 'videos',
				action: 'speed',
				options: {
					streamId: this._activeStreamId,
					speed,
				},
			});
			if (this._activeAudioStreamId) {
				await this.dispatch({
					group: 'audios',
					action: 'speed',
					options: {
						streamId: this._activeAudioStreamId,
						speed,
					},
				});
			}
		}

		return { videoStreamId: this._activeStreamId, audioStreamId };
	}

	/**
	 * Stop current playback (video + audio)
	 */
	async stopPlayback(): Promise<void> {
		if (this._activeAudioStreamId) {
			try {
				await this.dispatch({
					group: 'audios',
					action: 'stop',
					options: { streamId: this._activeAudioStreamId },
				});
			} catch {
				// Ignore stop errors
			}
			this._activeAudioStreamId = null;
		}

		if (!this._activeStreamId) return;

		try {
			await this.dispatch({
				group: 'videos',
				action: 'stop',
				options: { streamId: this._activeStreamId },
			});
		} catch {
			// Ignore stop errors
		}
		this._activeStreamId = null;
	}

	/**
	 * Seek to a specific time (video + audio)
	 */
	async seekTo(time: number): Promise<void> {
		if (!this._activeStreamId) return;

		await this.dispatch({
			group: 'videos',
			action: 'seek',
			options: {
				streamId: this._activeStreamId,
				time,
			},
		});

		if (this._activeAudioStreamId) {
			await this.dispatch({
				group: 'audios',
				action: 'seek',
				options: {
					streamId: this._activeAudioStreamId,
					time,
				},
			});
		}
	}

	/**
	 * Set playback speed (video + audio)
	 */
	async setSpeed(speed: number): Promise<void> {
		if (!this._activeStreamId) return;

		await this.dispatch({
			group: 'videos',
			action: 'speed',
			options: {
				streamId: this._activeStreamId,
				speed,
			},
		});

		if (this._activeAudioStreamId) {
			await this.dispatch({
				group: 'audios',
				action: 'speed',
				options: {
					streamId: this._activeAudioStreamId,
					speed,
				},
			});
		}
	}

	/**
	 * Pause playback (video + audio)
	 */
	async pausePlayback(): Promise<void> {
		if (!this._activeStreamId) return;

		await this.dispatch({
			group: 'videos',
			action: 'pause',
			options: { streamId: this._activeStreamId },
		});

		if (this._activeAudioStreamId) {
			await this.dispatch({
				group: 'audios',
				action: 'pause',
				options: { streamId: this._activeAudioStreamId },
			});
		}
	}

	/**
	 * Resume playback (video + audio)
	 */
	async resumePlayback(): Promise<void> {
		if (!this._activeStreamId) return;

		await this.dispatch({
			group: 'videos',
			action: 'resume',
			options: { streamId: this._activeStreamId },
		});

		if (this._activeAudioStreamId) {
			await this.dispatch({
				group: 'audios',
				action: 'resume',
				options: { streamId: this._activeAudioStreamId },
			});
		}
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

	async dispatch(request: ActionRequest): Promise<ActionResponse> {
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
