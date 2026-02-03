/**
 * ImageDiffAnalyzer - Image Diff Analyzer
 *
 * Analyzes differences between two image versions using:
 * - Pixel-level comparison
 * - Structural similarity (SSIM-like)
 * - Heatmap generation for visual diff
 *
 * Uses sharp for cross-platform image processing.
 * Sharp is loaded dynamically to avoid blocking extension activation.
 */

import type {
	DiffOptions,
	DiffResult,
	ImageDiffDetails,
} from '@neko/shared';
import { BaseMediaDiffAnalyzer } from './IMediaDiffAnalyzer';

// Sharp types (for type safety without importing the module at top level)
type Sharp = typeof import('sharp');
type SharpInstance = ReturnType<Sharp>;
type SharpOutputInfo = {
	width: number;
	height: number;
	channels: number;
	size: number;
};

// Lazy-loaded sharp module
let sharpModule: Sharp | null = null;
let sharpLoadError: Error | null = null;

/**
 * Dynamically load sharp module
 */
async function getSharp(): Promise<Sharp> {
	if (sharpLoadError) {
		throw sharpLoadError;
	}
	if (sharpModule) {
		return sharpModule;
	}

	try {
		const sharpImport = await import('sharp');
		sharpModule = sharpImport.default as Sharp;
		console.log('[ImageDiffAnalyzer] Using sharp');
		return sharpModule;
	} catch (err) {
		sharpLoadError = new Error(
			`Failed to load sharp: ${err instanceof Error ? err.message : String(err)}. ` +
			'Image diff functionality will be disabled.'
		);
		throw sharpLoadError;
	}
}

// =============================================================================
// Constants
// =============================================================================

const IMAGE_EXTENSIONS = [
	'.png',
	'.jpg',
	'.jpeg',
	'.gif',
	'.webp',
	'.bmp',
	'.svg',
];

// =============================================================================
// Image Diff Analyzer
// =============================================================================

/**
 * Image diff analyzer implementation
 */
export class ImageDiffAnalyzer extends BaseMediaDiffAnalyzer {
	readonly mediaType = 'image' as const;

	constructor() {
		super(IMAGE_EXTENSIONS);
	}

	async analyze(
		current: Buffer,
		previous: Buffer,
		options?: DiffOptions
	): Promise<DiffResult> {
		this.createAbortController();

		// Get sharp module (lazy loaded)
		const sharp = await getSharp();

		try {
			// Decode images and get metadata
			const [currentMeta, previousMeta] = await Promise.all([
				sharp(current).metadata(),
				sharp(previous).metadata(),
			]);

			this.throwIfAborted();

			// Get raw pixel data
			const [currentData, previousData] = await Promise.all([
				sharp(current)
					.ensureAlpha()
					.raw()
					.toBuffer({ resolveWithObject: true }),
				sharp(previous)
					.ensureAlpha()
					.raw()
					.toBuffer({ resolveWithObject: true }),
			]);

			this.throwIfAborted();

			// Calculate dimensions
			const dimensions = {
				current: {
					width: currentMeta.width ?? 0,
					height: currentMeta.height ?? 0,
				},
				previous: {
					width: previousMeta.width ?? 0,
					height: previousMeta.height ?? 0,
				},
			};

			// Calculate pixel difference
			const pixelDifference = await this.computePixelDifference(
				currentData.data,
				previousData.data,
				currentData.info,
				previousData.info
			);

			this.throwIfAborted();

			// Calculate structural similarity
			const structuralSimilarity = await this.computeStructuralSimilarity(
				sharp,
				current,
				previous,
				dimensions.current,
				dimensions.previous
			);

			this.throwIfAborted();

			// Calculate color histogram difference
			const colorHistogramDiff = this.computeColorHistogramDiff(
				currentData.data,
				previousData.data
			);

			// Generate heatmap if requested
			let heatmap: ArrayBuffer | undefined;
			if (options?.generateHeatmap) {
				this.throwIfAborted();
				heatmap = await this.generateHeatmap(
					sharp,
					current,
					previous,
					Math.max(dimensions.current.width, dimensions.previous.width),
					Math.max(dimensions.current.height, dimensions.previous.height)
				);
			}

			// Calculate overall similarity
			const similarity =
				structuralSimilarity * 0.6 +
				(1 - pixelDifference) * 0.3 +
				(1 - colorHistogramDiff) * 0.1;

			const details: ImageDiffDetails = {
				dimensions,
				pixelDifference,
				structuralSimilarity,
				colorHistogramDiff,
			};

			return {
				mediaType: 'image',
				similarity: Math.max(0, Math.min(1, similarity)),
				details,
				visualization: heatmap ? { heatmap } : undefined,
			};
		} catch (error) {
			if (this.isAborted()) {
				throw new Error('Analysis was cancelled');
			}
			throw error;
		}
	}

	/**
	 * Compute pixel-level difference between two images
	 */
	private async computePixelDifference(
		currentData: Buffer,
		previousData: Buffer,
		currentInfo: SharpOutputInfo,
		previousInfo: SharpOutputInfo
	): Promise<number> {
		// If dimensions differ, resize to same size for comparison
		if (
			currentInfo.width !== previousInfo.width ||
			currentInfo.height !== previousInfo.height
		) {
			// Dimension change counts as significant difference
			return 0.5;
		}

		const pixelCount = currentInfo.width * currentInfo.height;
		let differentPixels = 0;
		const threshold = 10; // Color difference threshold

		for (let i = 0; i < currentData.length; i += 4) {
			const rDiff = Math.abs(
				(currentData[i] ?? 0) - (previousData[i] ?? 0)
			);
			const gDiff = Math.abs(
				(currentData[i + 1] ?? 0) - (previousData[i + 1] ?? 0)
			);
			const bDiff = Math.abs(
				(currentData[i + 2] ?? 0) - (previousData[i + 2] ?? 0)
			);
			const aDiff = Math.abs(
				(currentData[i + 3] ?? 0) - (previousData[i + 3] ?? 0)
			);

			if (
				rDiff > threshold ||
				gDiff > threshold ||
				bDiff > threshold ||
				aDiff > threshold
			) {
				differentPixels++;
			}
		}

		return differentPixels / pixelCount;
	}

	/**
	 * Compute structural similarity (simplified SSIM)
	 */
	private async computeStructuralSimilarity(
		sharp: Sharp,
		current: Buffer,
		previous: Buffer,
		currentDim: { width: number; height: number },
		previousDim: { width: number; height: number }
	): Promise<number> {
		// Resize both images to a standard size for comparison
		const targetSize = 256;

		const [currentResized, previousResized] = await Promise.all([
			sharp(current)
				.resize(targetSize, targetSize, { fit: 'fill' })
				.grayscale()
				.raw()
				.toBuffer(),
			sharp(previous)
				.resize(targetSize, targetSize, { fit: 'fill' })
				.grayscale()
				.raw()
				.toBuffer(),
		]);

		// Calculate mean
		let currentMean = 0;
		let previousMean = 0;
		const n = currentResized.length;

		for (let i = 0; i < n; i++) {
			currentMean += currentResized[i] ?? 0;
			previousMean += previousResized[i] ?? 0;
		}
		currentMean /= n;
		previousMean /= n;

		// Calculate variance and covariance
		let currentVar = 0;
		let previousVar = 0;
		let covariance = 0;

		for (let i = 0; i < n; i++) {
			const currentDiff = (currentResized[i] ?? 0) - currentMean;
			const previousDiff = (previousResized[i] ?? 0) - previousMean;
			currentVar += currentDiff * currentDiff;
			previousVar += previousDiff * previousDiff;
			covariance += currentDiff * previousDiff;
		}

		currentVar /= n;
		previousVar /= n;
		covariance /= n;

		// SSIM formula constants
		const c1 = 6.5025; // (0.01 * 255)^2
		const c2 = 58.5225; // (0.03 * 255)^2

		// Calculate SSIM
		const numerator =
			(2 * currentMean * previousMean + c1) *
			(2 * covariance + c2);
		const denominator =
			(currentMean * currentMean + previousMean * previousMean + c1) *
			(currentVar + previousVar + c2);

		return numerator / denominator;
	}

	/**
	 * Compute color histogram difference
	 */
	private computeColorHistogramDiff(
		currentData: Buffer,
		previousData: Buffer
	): number {
		const bins = 32;
		const currentHist = new Array(bins * 3).fill(0);
		const previousHist = new Array(bins * 3).fill(0);

		// Build histograms
		for (let i = 0; i < currentData.length; i += 4) {
			const rBin = Math.floor(((currentData[i] ?? 0) / 256) * bins);
			const gBin =
				bins + Math.floor(((currentData[i + 1] ?? 0) / 256) * bins);
			const bBin =
				bins * 2 + Math.floor(((currentData[i + 2] ?? 0) / 256) * bins);
			currentHist[rBin]++;
			currentHist[gBin]++;
			currentHist[bBin]++;
		}

		for (let i = 0; i < previousData.length; i += 4) {
			const rBin = Math.floor(((previousData[i] ?? 0) / 256) * bins);
			const gBin =
				bins + Math.floor(((previousData[i + 1] ?? 0) / 256) * bins);
			const bBin =
				bins * 2 +
				Math.floor(((previousData[i + 2] ?? 0) / 256) * bins);
			previousHist[rBin]++;
			previousHist[gBin]++;
			previousHist[bBin]++;
		}

		// Normalize histograms
		const currentTotal = currentData.length / 4;
		const previousTotal = previousData.length / 4;

		for (let i = 0; i < currentHist.length; i++) {
			currentHist[i] = (currentHist[i] ?? 0) / currentTotal;
			previousHist[i] = (previousHist[i] ?? 0) / previousTotal;
		}

		// Calculate histogram intersection (1 - intersection = difference)
		let intersection = 0;
		for (let i = 0; i < currentHist.length; i++) {
			intersection += Math.min(
				currentHist[i] ?? 0,
				previousHist[i] ?? 0
			);
		}

		return 1 - intersection / 3; // Normalize by 3 channels
	}

	/**
	 * Generate visual difference heatmap
	 */
	private async generateHeatmap(
		sharp: Sharp,
		current: Buffer,
		previous: Buffer,
		width: number,
		height: number
	): Promise<ArrayBuffer> {
		// Resize both images to same dimensions
		const [currentResized, previousResized] = await Promise.all([
			sharp(current)
				.resize(width, height, { fit: 'fill' })
				.ensureAlpha()
				.raw()
				.toBuffer(),
			sharp(previous)
				.resize(width, height, { fit: 'fill' })
				.ensureAlpha()
				.raw()
				.toBuffer(),
		]);

		// Create diff buffer (RGBA)
		const diffBuffer = Buffer.alloc(width * height * 4);

		for (let i = 0; i < width * height * 4; i += 4) {
			const rDiff = Math.abs(
				(currentResized[i] ?? 0) - (previousResized[i] ?? 0)
			);
			const gDiff = Math.abs(
				(currentResized[i + 1] ?? 0) - (previousResized[i + 1] ?? 0)
			);
			const bDiff = Math.abs(
				(currentResized[i + 2] ?? 0) - (previousResized[i + 2] ?? 0)
			);
			const totalDiff = (rDiff + gDiff + bDiff) / 3;

			// Encode diff as red intensity with alpha
			diffBuffer[i] = Math.min(255, totalDiff * 3); // R - amplify difference
			diffBuffer[i + 1] = 0; // G
			diffBuffer[i + 2] = 0; // B
			diffBuffer[i + 3] = Math.min(200, totalDiff + 30); // A - semi-transparent
		}

		// Convert to PNG
		const pngBuffer = await sharp(diffBuffer, {
			raw: { width, height, channels: 4 },
		})
			.png()
			.toBuffer();

		return pngBuffer.buffer.slice(
			pngBuffer.byteOffset,
			pngBuffer.byteOffset + pngBuffer.byteLength
		);
	}
}
