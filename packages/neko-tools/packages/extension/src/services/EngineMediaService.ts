/**
 * EngineMediaService - neko-engine Media Processing Adapter
 *
 * Adapter layer between diff analyzers and neko-engine's Rust FFmpeg backend.
 * All media operations delegate to neko-engine via vscode commands:
 *   - probeMediaInfo     → neko.engine.probeInternal
 *   - extractVideoFrame  → neko.engine.extractFrame
 *   - decodeAudioSegment → neko.engine.decodeAudio
 *
 * This adapter exists to:
 *   1. Decouple analyzers from vscode command names (testability)
 *   2. Provide graceful degradation when engine is unavailable
 *   3. Adapt neko-engine response shapes to analyzer expectations
 */

import * as vscode from 'vscode';

// =============================================================================
// Types
// =============================================================================

export interface MediaInfo {
	duration: number;
	width: number;
	height: number;
	fps: number;
	codec: string;
	hasAudio: boolean;
	audioSampleRate?: number;
	audioChannels?: number;
}

// =============================================================================
// Service
// =============================================================================

export class EngineMediaService {
	private initialized = false;

	/**
	 * Initialize the service.
	 */
	async initialize(): Promise<void> {
		if (this.initialized) return;
		this.initialized = true;
	}

	/**
	 * Probe media file for metadata.
	 * Delegates to neko-engine's probeMedia (Rust FFmpeg).
	 */
	async probeMediaInfo(filePath: string): Promise<MediaInfo> {
		try {
			const result = await vscode.commands.executeCommand<MediaInfo>(
				'neko.engine.probeInternal',
				filePath
			);
			if (result) return result;
		} catch {
			// Engine not available
		}

		return {
			duration: 0,
			width: 0,
			height: 0,
			fps: 0,
			codec: 'unknown',
			hasAudio: false,
		};
	}

	/**
	 * Extract a single video frame at the given timestamp.
	 * Returns the frame as a Buffer (PNG format).
	 */
	async extractVideoFrame(filePath: string, timeSeconds: number): Promise<Buffer> {
		try {
			const result = await vscode.commands.executeCommand<{ data: number[] }>(
				'neko.engine.extractFrame',
				filePath,
				timeSeconds
			);
			if (result?.data) {
				return Buffer.from(result.data);
			}
		} catch {
			// Engine not available
		}

		return Buffer.alloc(0);
	}

	/**
	 * Decode an audio segment to raw PCM (Float32, mono).
	 * Returns an ArrayBuffer of Float32 samples.
	 */
	async decodeAudioSegment(
		filePath: string,
		startSeconds: number,
		durationSeconds: number
	): Promise<ArrayBuffer> {
		try {
			const result = await vscode.commands.executeCommand<{ data: number[] }>(
				'neko.engine.decodeAudio',
				filePath,
				startSeconds,
				durationSeconds
			);
			if (result?.data) {
				const float32 = new Float32Array(result.data);
				return float32.buffer;
			}
		} catch {
			// Engine not available
		}

		return new Float32Array(0).buffer;
	}
}

/** @deprecated Use EngineMediaService instead */
export { EngineMediaService as FFmpegService };
