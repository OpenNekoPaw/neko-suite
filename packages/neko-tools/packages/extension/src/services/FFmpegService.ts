/**
 * FFmpegService - FFmpeg Integration Service (Stub)
 *
 * Provides FFmpeg-based media operations for diff analyzers.
 * Currently delegates to neko-engine's probeMedia when available,
 * with graceful degradation when FFmpeg is not installed.
 *
 * TODO: Full implementation with bundled FFmpeg binary or
 * neko-engine native module integration.
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

export class FFmpegService {
	private initialized = false;

	/**
	 * Initialize FFmpeg service.
	 * Attempts to locate FFmpeg binary or connect to neko-engine.
	 */
	async initialize(): Promise<void> {
		if (this.initialized) return;
		this.initialized = true;
	}

	/**
	 * Probe media file for metadata.
	 * Delegates to neko-engine when available.
	 */
	async probeMediaInfo(filePath: string): Promise<MediaInfo> {
		// Try neko-engine first
		try {
			const result = await vscode.commands.executeCommand<MediaInfo>(
				'neko.engine.probeInternal',
				filePath
			);
			if (result) return result;
		} catch {
			// Engine not available
		}

		// Fallback: return minimal info
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
		// Try neko-engine frame extraction
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

		// Return empty buffer as fallback
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
		// Try neko-engine audio decoding
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

		// Return empty buffer as fallback
		return new Float32Array(0).buffer;
	}
}
