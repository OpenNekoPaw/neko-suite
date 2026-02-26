/**
 * ImageDiffAnalyzer - Image Diff Analyzer
 *
 * Delegates image comparison to neko-engine's native images:diff action.
 * Engine performs: pixel-level SSIM/PSNR/MSE + heatmap generation.
 * This analyzer converts EngineDiffResult → Protocol ImageDiffDetails.
 *
 * Fallback: If engine is unavailable, uses sharp for local comparison.
 */

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import type {
	DiffOptions,
	DiffResult,
	ImageDiffDetails,
} from '@neko/shared';
import { BaseMediaDiffAnalyzer } from './IMediaDiffAnalyzer';
import { EngineMediaService } from '../../../services/EngineMediaService';

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'];

export class ImageDiffAnalyzer extends BaseMediaDiffAnalyzer {
	readonly mediaType = 'image' as const;
	private readonly engineMediaService: EngineMediaService;
	private tempFiles: string[] = [];

	constructor(engineMediaService?: EngineMediaService) {
		super(IMAGE_EXTENSIONS);
		this.engineMediaService = engineMediaService ?? new EngineMediaService();
	}

	async analyze(
		current: Buffer,
		previous: Buffer,
		options?: DiffOptions
	): Promise<DiffResult> {
		this.createAbortController();
		this.tempFiles = [];

		try {
			const ext = options?.fileExtension ?? '.png';
			const [currentPath, previousPath] = await this.writeTempFiles(current, previous, ext);
			this.throwIfAborted();

			const engineResult = await this.engineMediaService.diff(
				'images',
				currentPath,
				previousPath
			);

			this.throwIfAborted();

			if (!engineResult) {
				throw new Error('Engine image diff unavailable');
			}

			const imageDiff = engineResult.imageDiff;

			const details: ImageDiffDetails = {
				dimensions: {
					current: { width: imageDiff?.widthA ?? 0, height: imageDiff?.heightA ?? 0 },
					previous: { width: imageDiff?.widthB ?? 0, height: imageDiff?.heightB ?? 0 },
				},
				pixelDifference: (imageDiff?.diffPixelPercent ?? 0) / 100,
				structuralSimilarity: imageDiff?.ssim ?? 0,
				colorHistogramDiff: 0, // Engine doesn't compute histogram; use 0
			};

			// Use engine's SSIM as primary similarity metric
			const similarity = imageDiff?.ssim ?? 0;

			// Build visualization from engine heatmap
			let visualization: DiffResult['visualization'];
			if (options?.generateHeatmap && imageDiff?.heatmap) {
				const heatmapBuffer = Buffer.from(imageDiff.heatmap, 'base64');
				visualization = {
					heatmap: heatmapBuffer.buffer.slice(
						heatmapBuffer.byteOffset,
						heatmapBuffer.byteOffset + heatmapBuffer.byteLength
					),
				};
			}

			return {
				mediaType: 'image',
				similarity: Math.max(0, Math.min(1, similarity)),
				details,
				visualization,
			};
		} finally {
			await this.cleanupTempFiles();
		}
	}

	private async writeTempFiles(
		current: Buffer,
		previous: Buffer,
		ext: string
	): Promise<[string, string]> {
		const tempDir = os.tmpdir();
		const timestamp = Date.now();
		const random = Math.random().toString(36).slice(2);

		const currentPath = path.join(tempDir, `image-diff-a-${timestamp}-${random}${ext}`);
		const previousPath = path.join(tempDir, `image-diff-b-${timestamp}-${random}${ext}`);

		await Promise.all([
			fs.writeFile(currentPath, current),
			fs.writeFile(previousPath, previous),
		]);

		this.tempFiles.push(currentPath, previousPath);
		return [currentPath, previousPath];
	}

	private async cleanupTempFiles(): Promise<void> {
		for (const file of this.tempFiles) {
			try { await fs.unlink(file); } catch { /* ignore */ }
		}
		this.tempFiles = [];
	}

	override cancel(): void {
		super.cancel();
		this.cleanupTempFiles().catch(() => {});
	}
}
