/**
 * VideoDiffAnalyzer - Video Diff Analyzer
 *
 * Analyzes differences between two video versions using:
 * - Metadata comparison (duration, resolution, FPS, codec)
 * - Keyframe sampling and comparison
 * - Per-frame similarity calculation
 *
 * Reuses EngineMediaService for frame extraction.
 */

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import type {
	DiffOptions,
	DiffResult,
	VideoDiffDetails,
	KeyframeDiff,
} from '@neko/shared';
import { DEFAULT_KEYFRAME_SAMPLES } from '@neko/shared';
import { BaseMediaDiffAnalyzer } from './IMediaDiffAnalyzer';
import { EngineMediaService } from '../../../services/EngineMediaService';
import { ImageDiffAnalyzer } from './ImageDiffAnalyzer';

// =============================================================================
// Constants
// =============================================================================

const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v'];

// =============================================================================
// Video Diff Analyzer
// =============================================================================

/**
 * Video diff analyzer implementation
 */
export class VideoDiffAnalyzer extends BaseMediaDiffAnalyzer {
	readonly mediaType = 'video' as const;
	private readonly engineMediaService: EngineMediaService;
	private readonly imageDiffAnalyzer: ImageDiffAnalyzer;
	private tempFiles: string[] = [];

	constructor(
		engineMediaService?: EngineMediaService,
		imageDiffAnalyzer?: ImageDiffAnalyzer
	) {
		super(VIDEO_EXTENSIONS);
		this.engineMediaService = engineMediaService ?? new EngineMediaService();
		this.imageDiffAnalyzer = imageDiffAnalyzer ?? new ImageDiffAnalyzer();
	}

	async analyze(
		current: Buffer,
		previous: Buffer,
		options?: DiffOptions
	): Promise<DiffResult> {
		this.createAbortController();
		this.tempFiles = [];

		try {
			// Write buffers to temp files (FFmpeg needs file paths)
			const [currentPath, previousPath] = await this.writeTempFiles(
				current,
				previous
			);

			this.throwIfAborted();

			// Initialize FFmpeg service
			await this.engineMediaService.initialize();

			// Probe media info
			const [currentInfo, previousInfo] = await Promise.all([
				this.engineMediaService.probeMediaInfo(currentPath),
				this.engineMediaService.probeMediaInfo(previousPath),
			]);

			this.throwIfAborted();

			// Determine sample count based on precision
			const sampleCount = options?.precision
				? Math.round(options.precision * DEFAULT_KEYFRAME_SAMPLES * 2)
				: DEFAULT_KEYFRAME_SAMPLES;

			// Extract and compare keyframes
			const keyframeDiffs = await this.compareKeyframes(
				currentPath,
				previousPath,
				currentInfo.duration,
				previousInfo.duration,
				Math.max(currentInfo.fps, previousInfo.fps) || 30,
				sampleCount
			);

			this.throwIfAborted();

			// Calculate overall similarity from keyframe similarities
			const avgSimilarity =
				keyframeDiffs.length > 0
					? keyframeDiffs.reduce((sum, kf) => sum + kf.similarity, 0) /
						keyframeDiffs.length
					: 0;

			// Build details
			const details: VideoDiffDetails = {
				duration: {
					current: currentInfo.duration,
					previous: previousInfo.duration,
				},
				resolution: {
					current: {
						width: currentInfo.width,
						height: currentInfo.height,
					},
					previous: {
						width: previousInfo.width,
						height: previousInfo.height,
					},
				},
				fps: {
					current: currentInfo.fps,
					previous: previousInfo.fps,
				},
				codec: {
					current: currentInfo.codec,
					previous: previousInfo.codec,
				},
				keyframeDiffs,
				audioTrackChanged: currentInfo.hasAudio !== previousInfo.hasAudio,
			};

			// Adjust similarity based on metadata changes
			let similarity = avgSimilarity;

			// Penalize for duration change
			const durationDiff = Math.abs(
				currentInfo.duration - previousInfo.duration
			);
			const maxDuration = Math.max(
				currentInfo.duration,
				previousInfo.duration
			);
			if (maxDuration > 0) {
				similarity *= 1 - (durationDiff / maxDuration) * 0.3;
			}

			// Penalize for resolution change
			if (
				currentInfo.width !== previousInfo.width ||
				currentInfo.height !== previousInfo.height
			) {
				similarity *= 0.9;
			}

			return {
				mediaType: 'video',
				similarity: Math.max(0, Math.min(1, similarity)),
				details,
			};
		} finally {
			// Cleanup temp files
			await this.cleanupTempFiles();
		}
	}

	/**
	 * Compare keyframes at regular intervals
	 */
	private async compareKeyframes(
		currentPath: string,
		previousPath: string,
		currentDuration: number,
		previousDuration: number,
		fps: number,
		sampleCount: number
	): Promise<KeyframeDiff[]> {
		const diffs: KeyframeDiff[] = [];
		const minDuration = Math.min(currentDuration, previousDuration);

		if (minDuration <= 0 || sampleCount <= 0) {
			return diffs;
		}

		const interval = minDuration / sampleCount;

		for (let i = 0; i < sampleCount; i++) {
			this.throwIfAborted();

			const time = i * interval;

			try {
				// Extract frames at same timestamp
				const [currentFrame, previousFrame] = await Promise.all([
					this.engineMediaService.extractVideoFrame(currentPath, time),
					this.engineMediaService.extractVideoFrame(previousPath, time),
				]);

				this.throwIfAborted();

				// Compare frames using image diff analyzer
				const frameDiff = await this.imageDiffAnalyzer.analyze(
					currentFrame,
					previousFrame,
					{ generateHeatmap: false }
				);

				diffs.push({
					time,
					similarity: frameDiff.similarity,
				});
			} catch (error) {
				// Skip frames that fail to extract
				console.warn(
					`[VideoDiffAnalyzer] Failed to compare frame at ${time}s:`,
					error
				);
				diffs.push({
					time,
					similarity: 0, // Assume different if extraction failed
				});
			}
		}

		return diffs;
	}

	/**
	 * Write buffers to temporary files
	 */
	private async writeTempFiles(
		current: Buffer,
		previous: Buffer
	): Promise<[string, string]> {
		const tempDir = os.tmpdir();
		const timestamp = Date.now();
		const random = Math.random().toString(36).slice(2);

		const currentPath = path.join(
			tempDir,
			`video-diff-current-${timestamp}-${random}.mp4`
		);
		const previousPath = path.join(
			tempDir,
			`video-diff-previous-${timestamp}-${random}.mp4`
		);

		await Promise.all([
			fs.writeFile(currentPath, current),
			fs.writeFile(previousPath, previous),
		]);

		this.tempFiles.push(currentPath, previousPath);

		return [currentPath, previousPath];
	}

	/**
	 * Cleanup temporary files
	 */
	private async cleanupTempFiles(): Promise<void> {
		for (const file of this.tempFiles) {
			try {
				await fs.unlink(file);
			} catch {
				// Ignore cleanup errors
			}
		}
		this.tempFiles = [];
	}

	override cancel(): void {
		super.cancel();
		this.imageDiffAnalyzer.cancel();
		// Schedule cleanup
		this.cleanupTempFiles().catch(() => {});
	}
}
