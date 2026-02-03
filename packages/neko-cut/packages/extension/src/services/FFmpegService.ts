/**
 * FFmpegService - 媒体处理服务（Rust N-API 后端）
 *
 * 职责：
 * - 封装 @neko/native-napi native addon
 * - 提供媒体探测、字幕提取功能
 *
 * NOTE: 视频帧提取已移至 GPU 路径 (RustMediaProcessorService)
 * CPU 帧提取 (extractFrame, extractFrames) 已被移除
 *
 * 设计原则：
 * - 单一职责：仅负责媒体探测和字幕提取
 * - 接口抽象：所有方法返回 Promise，便于 async/await
 * - 资源管理：Disposable 模式，确保资源清理
 */

import * as path from 'path';
import * as os from 'os';
import {
	MediaInfo,
	ExtractedSubtitleTrack,
} from '@neko/shared';

// =============================================================================
// N-API Types
// =============================================================================

interface JsProbeMediaInfo {
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
	audioBitrate?: number;
	hasSubtitles: boolean;
	subtitleStreams: JsProbeSubtitleStream[];
}

interface JsProbeSubtitleStream {
	index: number;
	codec: string;
	language?: string;
	title?: string;
	isDefault: boolean;
	isForced: boolean;
}

interface JsSubtitleCue {
	id: string;
	startTime: number;
	endTime: number;
	text: string;
}

interface JsExtractedSubtitleTrack {
	streamIndex: number;
	language?: string;
	title?: string;
	isDefault: boolean;
	cues: JsSubtitleCue[];
}

interface MediaProcessorAddon {
	probeMedia(path: string): JsProbeMediaInfo;
	extractAllSubtitles(path: string): JsExtractedSubtitleTrack[];
}

// =============================================================================
// FFmpegService
// =============================================================================

/**
 * 媒体处理服务（使用 Rust N-API）
 *
 * NOTE: 视频帧提取已移至 GPU 路径，请使用 RustMediaProcessorService.decodeFrame()
 */
export class FFmpegService {
	private addon: MediaProcessorAddon | null = null;
	private tempDir: string;
	private isInitialized = false;

	constructor() {
		this.tempDir = path.join(os.tmpdir(), 'neko-media-cache');
	}

	/**
	 * Initialize the service (lazy initialization)
	 */
	async initialize(): Promise<void> {
		if (this.isInitialized) return;

		try {
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			this.addon = require('@neko/native-napi') as MediaProcessorAddon;
			this.isInitialized = true;
			console.log('[FFmpegService] Initialized with Rust N-API backend');
		} catch (error) {
			throw new Error(
				`Failed to load media-processor-rs: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	/**
	 * Probe media file metadata
	 */
	async probeMediaInfo(videoPath: string): Promise<MediaInfo> {
		await this.initialize();

		if (!this.addon) {
			throw new Error('Media processor not initialized');
		}

		try {
			const info = this.addon.probeMedia(videoPath);
			return {
				duration: info.duration,
				width: info.width,
				height: info.height,
				fps: info.fps,
				codec: info.codec,
				format: info.format,
				bitrate: info.bitrate,
				hasAudio: info.hasAudio,
				audioCodec: info.audioCodec,
				audioSampleRate: info.audioSampleRate,
				audioChannels: info.audioChannels,
				audioBitrate: info.audioBitrate,
				hasSubtitles: info.hasSubtitles,
				subtitleStreams: info.subtitleStreams.map((s) => ({
					index: s.index,
					codec: s.codec,
					language: s.language,
					title: s.title,
					isDefault: s.isDefault,
					isForced: s.isForced,
				})),
			};
		} catch (error) {
			throw new Error(
				`Failed to probe media: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	/**
	 * Extract all subtitle tracks from a media file
	 */
	async extractAllSubtitles(videoPath: string): Promise<ExtractedSubtitleTrack[]> {
		await this.initialize();

		if (!this.addon) {
			throw new Error('Media processor not initialized');
		}

		try {
			const tracks = this.addon.extractAllSubtitles(videoPath);
			return tracks.map((track) => ({
				streamIndex: track.streamIndex,
				language: track.language,
				title: track.title,
				isDefault: track.isDefault,
				cues: track.cues.map((cue) => ({
					id: cue.id,
					startTime: cue.startTime,
					endTime: cue.endTime,
					text: cue.text,
				})),
			}));
		} catch (error) {
			throw new Error(
				`Failed to extract subtitles: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	/**
	 * Dispose resources
	 */
	async dispose(): Promise<void> {
		this.addon = null;
		this.isInitialized = false;
	}
}

// =============================================================================
// Singleton Instance
// =============================================================================

let ffmpegServiceInstance: FFmpegService | null = null;

/**
 * Get the singleton FFmpegService instance
 */
export function getFFmpegService(): FFmpegService {
	if (!ffmpegServiceInstance) {
		ffmpegServiceInstance = new FFmpegService();
	}
	return ffmpegServiceInstance;
}

/**
 * Dispose the singleton instance
 */
export function disposeFFmpegService(): void {
	if (ffmpegServiceInstance) {
		ffmpegServiceInstance.dispose();
		ffmpegServiceInstance = null;
	}
}
