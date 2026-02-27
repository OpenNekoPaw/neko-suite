/**
 * VideoDiffAnalyzer - Video Diff Analyzer
 *
 * Delegates video comparison to neko-engine's native videos:diff action.
 * Engine performs: FFmpeg SSIM/PSNR filter → per-frame metrics + diff regions.
 * This analyzer converts EngineDiffResult → Protocol VideoDiffDetails.
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
import { BaseMediaDiffAnalyzer } from './IMediaDiffAnalyzer';
import { EngineMediaService } from '../../../services/EngineMediaService';

const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v'];

export class VideoDiffAnalyzer extends BaseMediaDiffAnalyzer {
	readonly mediaType = 'video' as const;
	private readonly engineMediaService: EngineMediaService;
	private activeTempFiles = new Set<string>();

	constructor(engineMediaService?: EngineMediaService) {
		super(VIDEO_EXTENSIONS);
		this.engineMediaService = engineMediaService ?? new EngineMediaService();
	}

	async analyze(
		current: Buffer,
		previous: Buffer,
		options?: DiffOptions
	): Promise<DiffResult> {
		this.createAbortController();
		const localTempFiles: string[] = [];

		try {
			// Prefer original file paths when available (local comparison)
			// to avoid Buffer → temp file round-trip and extension mismatch issues
			let currentPath: string;
			let previousPath: string;
			if (options?.currentPath && options?.previousPath) {
				currentPath = options.currentPath;
				previousPath = options.previousPath;
			} else {
				const ext = options?.fileExtension ?? '.mp4';
				[currentPath, previousPath] = await this.writeTempFiles(current, previous, ext, localTempFiles);
			}
			this.throwIfAborted();

			const engineResult = await this.engineMediaService.diff(
				'videos',
				currentPath,
				previousPath
			);

			this.throwIfAborted();

			if (!engineResult) {
				throw new Error('Engine video diff unavailable');
			}

			const videoDiff = engineResult.videoDiff;
			const fields = engineResult.fields ?? [];

			// Convert per-frame SSIM metrics → KeyframeDiff[]
			const keyframeDiffs: KeyframeDiff[] = (videoDiff?.frameMetrics ?? []).map(fm => ({
				time: fm.timestamp,
				similarity: fm.ssim,
			}));

			// Extract codec from engine fields
			const codecField = fields.find(f => f.field === 'codec');

			const details: VideoDiffDetails = {
				duration: {
					current: videoDiff?.durationA ?? 0,
					previous: videoDiff?.durationB ?? 0,
				},
				resolution: {
					current: { width: videoDiff?.widthA ?? 0, height: videoDiff?.heightA ?? 0 },
					previous: { width: videoDiff?.widthB ?? 0, height: videoDiff?.heightB ?? 0 },
				},
				fps: {
					current: videoDiff?.fpsA ?? 0,
					previous: videoDiff?.fpsB ?? 0,
				},
				codec: {
					current: codecField?.valueA ?? 'unknown',
					previous: codecField?.valueB ?? 'unknown',
				},
				keyframeDiffs,
				audioTrackChanged: videoDiff?.audioDiff !== undefined,
			};

			// Use engine's avgSsim as overall similarity
			let similarity = videoDiff?.avgSsim ?? 0;

			// Penalize for duration change
			const durationA = videoDiff?.durationA ?? 0;
			const durationB = videoDiff?.durationB ?? 0;
			const durationDiff = Math.abs(durationA - durationB);
			const maxDuration = Math.max(durationA, durationB);
			if (maxDuration > 0) {
				similarity *= 1 - (durationDiff / maxDuration) * 0.3;
			}

			// Penalize for resolution change
			if (videoDiff && (videoDiff.widthA !== videoDiff.widthB || videoDiff.heightA !== videoDiff.heightB)) {
				similarity *= 0.9;
			}

			return {
				mediaType: 'video',
				similarity: Math.max(0, Math.min(1, similarity)),
				details,
			};
		} finally {
			await this.cleanupFiles(localTempFiles);
		}
	}

	private async writeTempFiles(
		current: Buffer,
		previous: Buffer,
		ext: string,
		localTempFiles: string[]
	): Promise<[string, string]> {
		const tempDir = os.tmpdir();
		const timestamp = Date.now();
		const random = Math.random().toString(36).slice(2);

		const currentPath = path.join(tempDir, `video-diff-a-${timestamp}-${random}${ext}`);
		const previousPath = path.join(tempDir, `video-diff-b-${timestamp}-${random}${ext}`);

		await Promise.all([
			fs.writeFile(currentPath, current),
			fs.writeFile(previousPath, previous),
		]);

		localTempFiles.push(currentPath, previousPath);
		this.activeTempFiles.add(currentPath);
		this.activeTempFiles.add(previousPath);
		return [currentPath, previousPath];
	}

	private async cleanupFiles(files: string[]): Promise<void> {
		for (const file of files) {
			try { await fs.unlink(file); } catch { /* ignore */ }
			this.activeTempFiles.delete(file);
		}
	}

	override cancel(): void {
		super.cancel();
		const files = [...this.activeTempFiles];
		this.activeTempFiles.clear();
		for (const file of files) {
			fs.unlink(file).catch(() => {});
		}
	}
}
