/**
 * MediaService - Webview 媒体消息路由服务
 *
 * 职责：
 * - 接收 Webview 的媒体处理请求 (IPC 消息)
 * - 转换为 NativeEngine ActionRequest
 * - 通过 FrameServerService.dispatch() 转发到 Rust 端
 * - 将 ActionResponse 转换回 Webview 消息格式
 *
 * 设计原则：
 * - 单一职责：仅负责消息路由，不做媒体处理
 * - 不支持降级：NativeEngine 不可用时直接报错
 * - 无缓存/队列：Rust 端处理并发和缓存
 */

import * as vscode from 'vscode';
import * as path from 'path';
import type { FrameServerService } from './FrameServerService';
import type {
	MediaRequest,
	MediaResponse,
	GetVideoFrameRequest,
	GetVideoFrameRangeRequest,
	ProbeMediaInfoRequest,
	ExtractSubtitlesRequest,
	GetWaveformRequest,
	CompatibleGetVideoFrameRequest,
	CompatibleGetVideoFrameResponse,
	RenderCompositeFrameRequest,
	RenderCompositeFrameResponse,
	CompatibleModeRequest,
	CompatibleModeResponse,
} from '@neko/shared';

// =============================================================================
// ActionRequest / ActionResponse helpers
// =============================================================================

interface ActionRequest {
	group: string;
	action: string;
	id?: string;
	options?: Record<string, unknown>;
	body?: unknown;
}

interface ActionResponse {
	id: string;
	status: 'ok' | 'error' | 'pending' | 'progress';
	data?: unknown;
	error?: { code: string; message: string } | null;
}

function buildActionJson(req: ActionRequest): string {
	return JSON.stringify({
		group: req.group,
		action: req.action,
		id: req.id ?? '',
		options: req.options ?? {},
		body: req.body ?? null,
	});
}

// =============================================================================
// MediaService
// =============================================================================

export class MediaService implements vscode.Disposable {
	private readonly documentDir: string | undefined;
	private disposed = false;

	// Active timeline stream IDs (for playback control)
	private _activeVideoStreamId: string | null = null;
	private _activeAudioStreamId: string | null = null;

	constructor(
		private readonly webviewPanel: vscode.WebviewPanel,
		private readonly frameServer: FrameServerService,
		documentUri?: vscode.Uri
	) {
		this.documentDir = documentUri
			? path.dirname(documentUri.fsPath)
			: undefined;
	}

	// =========================================================================
	// Message Routing
	// =========================================================================

	/**
	 * Handle incoming message from Webview
	 * @returns true if message was handled, false otherwise
	 */
	async handleMessage(message: unknown): Promise<boolean> {
		if (this.disposed) return false;
		if (typeof message !== 'object' || message === null) return false;

		const msg = message as Record<string, unknown>;
		const type = msg.type as string | undefined;
		if (typeof type !== 'string') return false;

		try {
			// Standard media requests
			if (this.isStandardMediaRequest(msg)) {
				await this.handleStandardMedia(message as MediaRequest);
				return true;
			}

			// Compatible mode requests
			if (this.isCompatibleModeRequest(msg)) {
				await this.handleCompatibleMode(
					message as CompatibleModeRequest
				);
				return true;
			}

			// Frame server playback control
			if (type.startsWith('media:frameServer:')) {
				await this.handlePlaybackControl(msg);
				return true;
			}

			// Media bitrate
			if (type === 'media:getMediaBitrate') {
				await this.handleMediaBitrate(msg);
				return true;
			}

			// Engine-side stream stats
			if (type === 'media:getStreamStats') {
				await this.handleStreamStats(msg);
				return true;
			}
		} catch (error) {
			console.error(
				'[MediaService] handleMessage error:',
				error instanceof Error ? error.message : JSON.stringify(error)
			);
		}

		return false;
	}

	// =========================================================================
	// Standard Media Requests → NativeEngine dispatch
	// =========================================================================

	private async handleStandardMedia(
		request: MediaRequest
	): Promise<void> {
		let response: MediaResponse;

		try {
			switch (request.type) {
				case 'media:getVideoFrame':
					response = await this.handleVideoCapture(
						request as GetVideoFrameRequest
					);
					break;
				case 'media:getVideoFrameRange':
					response = await this.handleVideoFrameRange(
						request as GetVideoFrameRangeRequest
					);
					break;
				case 'media:probeMediaInfo':
					response = await this.handleProbeMedia(
						request as ProbeMediaInfoRequest
					);
					break;
				case 'media:extractSubtitles':
					response = await this.handleExtractSubtitles(
						request as ExtractSubtitlesRequest
					);
					break;
				case 'media:getWaveform':
					response = await this.handleGetWaveform(
						request as GetWaveformRequest
					);
					break;
				default:
					throw new Error(`Unknown media request type: ${request.type}`);
			}
		} catch (error) {
			response = {
				requestId: request.requestId,
				type: `media:response:${request.type.replace('media:', '')}` as never,
				error:
					error instanceof Error
						? error.message
						: 'Unknown error',
			};
		}

		this.sendResponse(response);
	}

	/**
	 * media:getVideoFrame → videos:capture
	 */
	private async handleVideoCapture(
		request: GetVideoFrameRequest
	): Promise<MediaResponse> {
		const { videoPath, timeInSeconds, quality } = request.payload;
		const absolutePath = this.resolveMediaPath(videoPath);

		const result = await this.dispatch({
			group: 'videos',
			action: 'capture',
			id: absolutePath,
			options: {
				time: timeInSeconds,
				quality: quality ?? 85,
				format: 'jpeg',
			},
		});

		// result.data should contain { data (base64), width, height, format }
		const data = result.data as Record<string, unknown>;
		return {
			requestId: request.requestId,
			type: 'media:response:getVideoFrame' as never,
			payload: {
				imageDataUrl: `data:image/jpeg;base64,${data.data as string}`,
			} as never,
		};
	}

	/**
	 * media:getVideoFrameRange → videos:capture (batch)
	 */
	private async handleVideoFrameRange(
		request: GetVideoFrameRangeRequest
	): Promise<MediaResponse> {
		const { videoPath, startTime, duration, fps, maxFrames } =
			request.payload;
		const absolutePath = this.resolveMediaPath(videoPath);

		const actualDuration = maxFrames
			? Math.min(duration, maxFrames / fps)
			: duration;
		const frameCount = Math.ceil(actualDuration * fps);
		const frameInterval = 1 / fps;

		// Capture frames sequentially
		const frames: Array<{ time: number; imageDataUrl: string }> = [];
		for (let i = 0; i < frameCount; i++) {
			const time = startTime + i * frameInterval;
			const result = await this.dispatch({
				group: 'videos',
				action: 'capture',
				id: absolutePath,
				options: {
					time,
					quality: request.payload.quality ?? 85,
					format: 'jpeg',
				},
			});
			const data = result.data as Record<string, unknown>;
			frames.push({
				time,
				imageDataUrl: `data:image/jpeg;base64,${data.data as string}`,
			});
		}

		return {
			requestId: request.requestId,
			type: 'media:response:getVideoFrameRange' as never,
			payload: { frames } as never,
		};
	}

	/**
	 * media:probeMediaInfo → videos:probe
	 */
	private async handleProbeMedia(
		request: ProbeMediaInfoRequest
	): Promise<MediaResponse> {
		const { videoPath } = request.payload;
		const absolutePath = this.resolveMediaPath(videoPath);

		const result = await this.dispatch({
			group: 'videos',
			action: 'probe',
			id: absolutePath,
		});

		return {
			requestId: request.requestId,
			type: 'media:response:probeMediaInfo' as never,
			payload: result.data as never,
		};
	}

	/**
	 * media:extractSubtitles → videos:extract
	 */
	private async handleExtractSubtitles(
		request: ExtractSubtitlesRequest
	): Promise<MediaResponse> {
		const { videoPath } = request.payload;
		const absolutePath = this.resolveMediaPath(videoPath);

		const result = await this.dispatch({
			group: 'videos',
			action: 'extract',
			id: absolutePath,
			options: { type: 'subtitles' },
		});

		return {
			requestId: request.requestId,
			type: 'media:response:extractSubtitles' as never,
			payload: result.data as never,
		};
	}

	/**
	 * media:getWaveform → audios:waveform
	 */
	private async handleGetWaveform(
		request: GetWaveformRequest
	): Promise<MediaResponse> {
		const { filePath } = request.payload;
		const absolutePath = this.resolveMediaPath(filePath);

		const result = await this.dispatch({
			group: 'audios',
			action: 'waveform',
			options: { source: absolutePath },
		});

		const data = result.data as Record<string, unknown>;
		const waveform = data.waveform as Record<string, unknown>;

		return {
			requestId: request.requestId,
			type: 'media:response:getWaveform' as never,
			payload: {
				sampleRate: waveform.sampleRate as number,
				channels: waveform.channels as number,
				peaksPerSecond: waveform.peaksPerSecond as number,
				duration: waveform.duration as number,
				peaks: waveform.peaks as number[][],
			} as never,
		};
	}

	// =========================================================================
	// Compatible Mode Requests
	// =========================================================================

	private async handleCompatibleMode(
		request: CompatibleModeRequest
	): Promise<void> {
		let response: CompatibleModeResponse;

		try {
			switch (request.type) {
				case 'media:compatibleGetVideoFrame':
					response = await this.handleCompatibleVideoFrame(
						request as CompatibleGetVideoFrameRequest
					);
					break;
				case 'media:renderCompositeFrame':
					response = await this.handleCompositeFrame(
						request as RenderCompositeFrameRequest
					);
					break;
				default:
					throw new Error(
						`Unknown compatible mode request: ${(request as { type: string }).type}`
					);
			}
		} catch (error) {
			if (request.type === 'media:compatibleGetVideoFrame') {
				response = {
					requestId: request.requestId,
					type: 'media:response:compatibleGetVideoFrame',
					error:
						error instanceof Error
							? error.message
							: 'Unknown error',
				};
			} else {
				response = {
					requestId: request.requestId,
					type: 'media:response:renderCompositeFrame',
					error:
						error instanceof Error
							? error.message
							: 'Unknown error',
				};
			}
		}

		this.sendResponse(response);
	}

	/**
	 * media:compatibleGetVideoFrame → videos:capture
	 */
	private async handleCompatibleVideoFrame(
		request: CompatibleGetVideoFrameRequest
	): Promise<CompatibleGetVideoFrameResponse> {
		const { videoPath, timeInSeconds, width, height } = request.payload;
		const absolutePath = this.resolveMediaPath(videoPath);

		const result = await this.dispatch({
			group: 'videos',
			action: 'capture',
			id: absolutePath,
			options: {
				time: timeInSeconds,
				quality: 85,
				format: 'jpeg',
				width,
				height,
			},
		});

		const data = result.data as Record<string, unknown>;
		const jpegBase64 = data.data as string;
		const jpegBuffer = Buffer.from(jpegBase64, 'base64');

		return {
			requestId: request.requestId,
			type: 'media:response:compatibleGetVideoFrame',
			payload: {
				imageData: new Uint8Array(jpegBuffer),
				width: (data.width as number) ?? width ?? 0,
				height: (data.height as number) ?? height ?? 0,
			},
		};
	}

	/**
	 * media:renderCompositeFrame → timelines:composite
	 */
	private async handleCompositeFrame(
		request: RenderCompositeFrameRequest
	): Promise<RenderCompositeFrameResponse> {
		const { layers, width, height, backgroundColor } = request.payload;

		// Build a minimal Timeline for the composite request
		// The Rust side expects a Timeline object in the body
		const timeline = this.buildTimelineForComposite(
			layers,
			width,
			height,
			backgroundColor
		);

		const result = await this.dispatch({
			group: 'timelines',
			action: 'composite',
			options: { frame: 0 },
			body: timeline,
		});

		const data = result.data as Record<string, unknown>;
		const frameBase64 = data.data as string;
		const frameBuffer = Buffer.from(frameBase64, 'base64');

		return {
			requestId: request.requestId,
			type: 'media:response:renderCompositeFrame',
			payload: {
				imageData: new Uint8Array(frameBuffer),
				width: (data.width as number) ?? width,
				height: (data.height as number) ?? height,
			},
		};
	}

	// =========================================================================
	// Playback Control → timelines:stream / stop / seek
	// =========================================================================

	private async handlePlaybackControl(
		msg: Record<string, unknown>
	): Promise<void> {
		const type = msg.type as string;

		if (type === 'media:frameServer:projectPlayback:start') {
			const payload = msg.payload as {
				projectData: {
					tracks: unknown[];
					resolution: { width: number; height: number };
					fps: number;
					duration: number;
				};
				startTime: number;
				speed?: number;
			};

			console.log('[MediaService] Starting timelines:stream, baseDir:', this.documentDir);

			// Start timeline stream via timelines:stream
			// Engine now returns independent video and audio stream IDs
			const result = await this.dispatch({
				group: 'timelines',
				action: 'stream',
				options: {
					sessionId: 'playback',
					width: payload.projectData.resolution.width,
					height: payload.projectData.resolution.height,
					fps: payload.projectData.fps,
					startTime: payload.startTime,
					baseDir: this.documentDir ?? undefined,
				},
				body: payload.projectData,
			});

			const data = result.data as Record<string, unknown>;
			this._activeVideoStreamId = (data.videoStreamId as string) ?? (data.streamId as string) ?? null;
			this._activeAudioStreamId = (data.audioStreamId as string) ?? null;

			// Set speed if not 1.0
			if (
				this._activeVideoStreamId &&
				payload.speed &&
				payload.speed !== 1.0
			) {
				await this.dispatch({
					group: 'timelines',
					action: 'speed',
					options: {
						streamId: this._activeVideoStreamId,
						speed: payload.speed,
					},
				});
			}

			// Notify Webview of the stream IDs and WebSocket URLs
			if (this._activeVideoStreamId) {
				const port = this.frameServer.getPort();
				const baseUrl = port ? `ws://127.0.0.1:${port}/v1/streams` : null;
				this.sendResponse({
					type: 'frameServer:streamCreated',
					streamId: this._activeVideoStreamId,
					wsUrl: baseUrl
						? `${baseUrl}/${this._activeVideoStreamId}`
						: null,
					audioStreamId: this._activeAudioStreamId,
					audioWsUrl: baseUrl && this._activeAudioStreamId
						? `${baseUrl}/${this._activeAudioStreamId}`
						: null,
				});
			}

			console.log(
				`[MediaService] Stream started: video=${this._activeVideoStreamId}, audio=${this._activeAudioStreamId}`
			);
		} else if (type === 'media:frameServer:projectPlayback:stop') {
			if (this._activeVideoStreamId) {
				const stoppedVideoStreamId = this._activeVideoStreamId;
				await this.dispatch({
					group: 'timelines',
					action: 'stop',
					options: { streamId: this._activeVideoStreamId },
				});
				console.log(
					`[MediaService] Stream stopped: video=${this._activeVideoStreamId}`
				);
				this._activeVideoStreamId = null;
				this._activeAudioStreamId = null;

				// Notify Webview that stream was stopped
				this.sendResponse({
					type: 'frameServer:streamStopped',
					streamId: stoppedVideoStreamId,
				});
			}
		} else if (type === 'media:frameServer:projectPlayback:seek') {
			const payload = msg.payload as {
				projectData?: unknown;
				seekTime: number;
			};

			if (this._activeVideoStreamId) {
				await this.dispatch({
					group: 'timelines',
					action: 'seek',
					options: {
						streamId: this._activeVideoStreamId,
						time: payload.seekTime,
					},
				});
			}
		} else if (type === 'media:frameServer:playback:start') {
			// Single video playback — also use timelines:stream
			const payload = msg.payload as {
				videoPath: string;
				startTime?: number;
				fps?: number;
				speed?: number;
			};

			const absolutePath = this.resolveMediaPath(payload.videoPath);

			// Build a simple single-track timeline
			const timeline = {
				id: 'single-playback',
				duration: 3600, // Will be bounded by actual video duration
				fps: payload.fps ?? 30,
				resolution: { width: 1920, height: 1080 },
				tracks: [
					{
						id: 'video-track',
						trackType: 'video',
						elements: [
							{
								id: 'video-0',
								type: 'media',
								src: absolutePath,
								startTime: 0,
								duration: 3600,
								trimStart: payload.startTime ?? 0,
							},
						],
					},
				],
			};

			const result = await this.dispatch({
				group: 'timelines',
				action: 'stream',
				options: {
					sessionId: 'single-playback',
					fps: payload.fps ?? 30,
					startTime: payload.startTime ?? 0,
				},
				body: timeline,
			});

			const data = result.data as Record<string, unknown>;
			this._activeVideoStreamId = (data.videoStreamId as string) ?? (data.streamId as string) ?? null;
			this._activeAudioStreamId = (data.audioStreamId as string) ?? null;

			if (
				this._activeVideoStreamId &&
				payload.speed &&
				payload.speed !== 1.0
			) {
				await this.dispatch({
					group: 'timelines',
					action: 'speed',
					options: {
						streamId: this._activeVideoStreamId,
						speed: payload.speed,
					},
				});
			}
		} else if (type === 'media:frameServer:playback:stop') {
			if (this._activeVideoStreamId) {
				await this.dispatch({
					group: 'timelines',
					action: 'stop',
					options: { streamId: this._activeVideoStreamId },
				});
				this._activeVideoStreamId = null;
				this._activeAudioStreamId = null;
			}
		}
	}

	// =========================================================================
	// Stream Stats / Media Bitrate
	// =========================================================================

	private async handleStreamStats(
		msg: Record<string, unknown>
	): Promise<void> {
		const requestId = msg.requestId as string;
		const streamId = this._activeVideoStreamId;

		if (!streamId) {
			this.sendResponse({
				type: 'media:response:getStreamStats',
				requestId,
				payload: null,
			});
			return;
		}

		try {
			const resultJson = await this.frameServer.dispatch(
				buildActionJson({
					group: 'timelines',
					action: 'stream_stats',
					options: { streamId },
				})
			);
			const result = JSON.parse(resultJson) as ActionResponse;

			this.sendResponse({
				type: 'media:response:getStreamStats',
				requestId,
				payload: result.data ?? null,
			});
		} catch (error) {
			this.sendResponse({
				type: 'media:response:getStreamStats',
				requestId,
				error:
					error instanceof Error
						? error.message
						: 'Unknown error',
			});
		}
	}

	private async handleMediaBitrate(
		msg: Record<string, unknown>
	): Promise<void> {
		const requestId = msg.requestId as string;
		const payload = msg.payload as { mediaPath: string };

		try {
			const absolutePath = this.resolveMediaPath(payload.mediaPath);

			const result = await this.dispatch({
				group: 'videos',
				action: 'probe',
				id: absolutePath,
			});

			const data = result.data as Record<string, unknown>;
			const videoBitrate = (data.bitrate as number) ?? 0;
			const audioBitrate = (data.audioBitrate as number) ?? 0;
			const totalBitrate = videoBitrate + audioBitrate;

			const formatBitrate = (bps: number): string => {
				if (bps >= 1000000)
					return `${(bps / 1000000).toFixed(1)} Mbps`;
				if (bps >= 1000) return `${(bps / 1000).toFixed(0)} Kbps`;
				return `${bps} bps`;
			};

			this.sendResponse({
				type: 'media:response:getMediaBitrate',
				requestId,
				payload: {
					videoBitrate,
					audioBitrate,
					totalBitrate,
					videoBitrateStr: formatBitrate(videoBitrate),
					totalBitrateStr: formatBitrate(totalBitrate),
				},
			});
		} catch (error) {
			this.sendResponse({
				type: 'media:response:getMediaBitrate',
				requestId,
				error:
					error instanceof Error
						? error.message
						: 'Unknown error',
			});
		}
	}

	// =========================================================================
	// Helpers
	// =========================================================================

	/**
	 * Dispatch an ActionRequest to NativeEngine via FrameServerService
	 */
	private async dispatch(req: ActionRequest): Promise<ActionResponse> {
		const json = buildActionJson(req);
		const responseJson = await this.frameServer.dispatch(json);
		const response = JSON.parse(responseJson) as ActionResponse;

		if (response.status === 'error') {
			const errMsg = response.error?.message
				?? `${req.group}:${req.action} failed`;
			throw new Error(errMsg);
		}

		return response;
	}

	/**
	 * Resolve media path to absolute path
	 */
	private resolveMediaPath(mediaPath: string): string {
		if (path.isAbsolute(mediaPath)) return mediaPath;

		if (this.documentDir) {
			return path.resolve(this.documentDir, mediaPath);
		}

		const workspaceRoot =
			vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		if (workspaceRoot) {
			return path.join(workspaceRoot, mediaPath);
		}

		return mediaPath;
	}

	/**
	 * Build a minimal Timeline object for timelines:composite
	 */
	private buildTimelineForComposite(
		layers: Array<{
			source: string;
			sourceTime: number;
			transform?: {
				x?: number;
				y?: number;
				scaleX?: number;
				scaleY?: number;
				rotation?: number;
				anchorX?: number;
				anchorY?: number;
			};
			opacity?: number;
			zIndex?: number;
		}>,
		width: number,
		height: number,
		backgroundColor?: [number, number, number, number]
	): object {
		return {
			id: 'composite-frame',
			duration: 1,
			fps: 30,
			resolution: { width, height },
			backgroundColor: backgroundColor
				? backgroundColor.map((c) => c / 255)
				: [0, 0, 0, 1],
			tracks: [
				{
					id: 'composite-track',
					trackType: 'video',
					elements: layers.map((layer, index) => ({
						id: `layer-${index}`,
						type: 'media',
						src: this.resolveMediaPath(layer.source),
						startTime: 0,
						duration: 1,
						trimStart: layer.sourceTime,
						transform: layer.transform,
						opacity: layer.opacity ?? 1,
						zIndex: layer.zIndex ?? index,
					})),
				},
			],
		};
	}

	/**
	 * Send response to Webview (safely handles disposed webview)
	 */
	private sendResponse(response: unknown): void {
		if (this.disposed) return;
		try {
			this.webviewPanel.webview.postMessage(response);
		} catch {
			// Webview was disposed, silently ignore
		}
	}

	// =========================================================================
	// Type Guards
	// =========================================================================

	private isStandardMediaRequest(
		msg: Record<string, unknown>
	): boolean {
		return (
			typeof msg.type === 'string' &&
			msg.type.startsWith('media:') &&
			!msg.type.includes('compatible') &&
			!msg.type.includes('renderComposite') &&
			!msg.type.includes('frameServer') &&
			msg.type !== 'media:getPerformanceStats' &&
			msg.type !== 'media:getMediaBitrate' &&
			typeof msg.requestId === 'string' &&
			typeof msg.timestamp === 'number' &&
			typeof msg.payload === 'object'
		);
	}

	private isCompatibleModeRequest(
		msg: Record<string, unknown>
	): boolean {
		return (
			typeof msg.type === 'string' &&
			(msg.type === 'media:compatibleGetVideoFrame' ||
				msg.type === 'media:renderCompositeFrame') &&
			typeof msg.requestId === 'string' &&
			typeof msg.timestamp === 'number' &&
			typeof msg.payload === 'object'
		);
	}

	// =========================================================================
	// Disposal
	// =========================================================================

	dispose(): void {
		this.disposed = true;

		// Stop active stream if any
		if (this._activeVideoStreamId) {
			this.dispatch({
				group: 'timelines',
				action: 'stop',
				options: { streamId: this._activeVideoStreamId },
			}).catch(() => {
				// Ignore errors during disposal
			});
			this._activeVideoStreamId = null;
			this._activeAudioStreamId = null;
		}
	}
}
