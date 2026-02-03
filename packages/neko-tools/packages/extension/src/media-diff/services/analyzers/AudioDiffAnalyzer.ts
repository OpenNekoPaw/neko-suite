/**
 * AudioDiffAnalyzer - Audio Diff Analyzer
 *
 * Analyzes differences between two audio versions using:
 * - Metadata comparison (duration, sample rate, channels)
 * - Waveform generation and comparison
 * - Amplitude correlation
 *
 * Reuses FFmpegService for audio decoding.
 */

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import type {
	DiffOptions,
	DiffResult,
	AudioDiffDetails,
	TimeRange,
} from '@uniedit/shared';
import { DEFAULT_WAVEFORM_SAMPLES } from '@uniedit/shared';
import { BaseMediaDiffAnalyzer } from './IMediaDiffAnalyzer';
import { FFmpegService } from '../../../services/FFmpegService';

// =============================================================================
// Constants
// =============================================================================

const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a'];

// Silence detection threshold (normalized amplitude)
const SILENCE_THRESHOLD = 0.01;

// Minimum silence duration in seconds
const MIN_SILENCE_DURATION = 0.5;

// =============================================================================
// Audio Diff Analyzer
// =============================================================================

/**
 * Audio diff analyzer implementation
 */
export class AudioDiffAnalyzer extends BaseMediaDiffAnalyzer {
	readonly mediaType = 'audio' as const;
	private readonly ffmpegService: FFmpegService;
	private tempFiles: string[] = [];

	constructor(ffmpegService?: FFmpegService) {
		super(AUDIO_EXTENSIONS);
		this.ffmpegService = ffmpegService ?? new FFmpegService();
	}

	async analyze(
		current: Buffer,
		previous: Buffer,
		options?: DiffOptions
	): Promise<DiffResult> {
		this.createAbortController();
		this.tempFiles = [];

		try {
			// Write buffers to temp files
			const [currentPath, previousPath] = await this.writeTempFiles(
				current,
				previous
			);

			this.throwIfAborted();

			// Initialize FFmpeg service
			await this.ffmpegService.initialize();

			// Probe media info
			const [currentInfo, previousInfo] = await Promise.all([
				this.ffmpegService.probeMediaInfo(currentPath),
				this.ffmpegService.probeMediaInfo(previousPath),
			]);

			this.throwIfAborted();

			// Decode audio to PCM
			const [currentPCM, previousPCM] = await Promise.all([
				this.ffmpegService.decodeAudioSegment(
					currentPath,
					0,
					currentInfo.duration
				),
				this.ffmpegService.decodeAudioSegment(
					previousPath,
					0,
					previousInfo.duration
				),
			]);

			this.throwIfAborted();

			// Generate waveforms
			const sampleCount = options?.precision
				? Math.round(options.precision * DEFAULT_WAVEFORM_SAMPLES * 2)
				: DEFAULT_WAVEFORM_SAMPLES;

			const currentWaveform = this.generateWaveform(
				currentPCM,
				sampleCount
			);
			const previousWaveform = this.generateWaveform(
				previousPCM,
				sampleCount
			);

			this.throwIfAborted();

			// Compare waveforms
			const waveformSimilarity = this.compareWaveforms(
				currentWaveform,
				previousWaveform
			);

			// Calculate spectral difference (simplified)
			const spectralDifference = this.computeSpectralDifference(
				currentPCM,
				previousPCM
			);

			this.throwIfAborted();

			// Detect silence regions
			const currentSilence = this.detectSilenceRegions(
				currentPCM,
				currentInfo.audioSampleRate ?? 48000
			);
			const previousSilence = this.detectSilenceRegions(
				previousPCM,
				previousInfo.audioSampleRate ?? 48000
			);

			// Build details
			const details: AudioDiffDetails = {
				duration: {
					current: currentInfo.duration,
					previous: previousInfo.duration,
				},
				sampleRate: {
					current: currentInfo.audioSampleRate ?? 0,
					previous: previousInfo.audioSampleRate ?? 0,
				},
				channels: {
					current: currentInfo.audioChannels ?? 0,
					previous: previousInfo.audioChannels ?? 0,
				},
				waveformSimilarity,
				spectralDifference,
				silenceRegions: {
					current: currentSilence,
					previous: previousSilence,
				},
			};

			// Calculate overall similarity
			let similarity = waveformSimilarity * 0.7 + (1 - spectralDifference) * 0.3;

			// Penalize for duration change
			const durationDiff = Math.abs(
				currentInfo.duration - previousInfo.duration
			);
			const maxDuration = Math.max(
				currentInfo.duration,
				previousInfo.duration
			);
			if (maxDuration > 0) {
				similarity *= 1 - (durationDiff / maxDuration) * 0.5;
			}

			return {
				mediaType: 'audio',
				similarity: Math.max(0, Math.min(1, similarity)),
				details,
				visualization: {
					currentWaveform,
					previousWaveform,
				},
			};
		} finally {
			await this.cleanupTempFiles();
		}
	}

	/**
	 * Generate downsampled waveform from PCM data
	 */
	private generateWaveform(pcmData: ArrayBuffer, samples: number): number[] {
		const float32Array = new Float32Array(pcmData);
		const waveform: number[] = [];

		if (float32Array.length === 0 || samples <= 0) {
			return waveform;
		}

		const samplesPerBucket = Math.max(
			1,
			Math.floor(float32Array.length / samples)
		);

		for (let i = 0; i < samples; i++) {
			let max = 0;
			const start = i * samplesPerBucket;
			const end = Math.min(start + samplesPerBucket, float32Array.length);

			for (let j = start; j < end; j++) {
				const value = Math.abs(float32Array[j] ?? 0);
				if (value > max) {
					max = value;
				}
			}

			waveform.push(max);
		}

		return waveform;
	}

	/**
	 * Compare two waveforms using cross-correlation
	 */
	private compareWaveforms(
		current: number[],
		previous: number[]
	): number {
		if (current.length === 0 || previous.length === 0) {
			return 0;
		}

		// Normalize waveforms to same length
		const targetLength = Math.max(current.length, previous.length);
		const normalizedCurrent = this.resampleWaveform(current, targetLength);
		const normalizedPrevious = this.resampleWaveform(previous, targetLength);

		// Calculate correlation coefficient
		let sumCurrent = 0;
		let sumPrevious = 0;
		for (let i = 0; i < targetLength; i++) {
			sumCurrent += normalizedCurrent[i] ?? 0;
			sumPrevious += normalizedPrevious[i] ?? 0;
		}
		const meanCurrent = sumCurrent / targetLength;
		const meanPrevious = sumPrevious / targetLength;

		let numerator = 0;
		let denomCurrent = 0;
		let denomPrevious = 0;

		for (let i = 0; i < targetLength; i++) {
			const diffCurrent = (normalizedCurrent[i] ?? 0) - meanCurrent;
			const diffPrevious = (normalizedPrevious[i] ?? 0) - meanPrevious;
			numerator += diffCurrent * diffPrevious;
			denomCurrent += diffCurrent * diffCurrent;
			denomPrevious += diffPrevious * diffPrevious;
		}

		const denominator = Math.sqrt(denomCurrent * denomPrevious);
		if (denominator === 0) {
			return 1; // Both are constant (likely silence)
		}

		// Convert correlation (-1 to 1) to similarity (0 to 1)
		return (numerator / denominator + 1) / 2;
	}

	/**
	 * Resample waveform to target length using linear interpolation
	 */
	private resampleWaveform(waveform: number[], targetLength: number): number[] {
		if (waveform.length === targetLength) {
			return waveform;
		}

		const result: number[] = [];
		const ratio = (waveform.length - 1) / (targetLength - 1);

		for (let i = 0; i < targetLength; i++) {
			const pos = i * ratio;
			const index = Math.floor(pos);
			const fraction = pos - index;

			if (index >= waveform.length - 1) {
				result.push(waveform[waveform.length - 1] ?? 0);
			} else {
				const a = waveform[index] ?? 0;
				const b = waveform[index + 1] ?? 0;
				result.push(a + fraction * (b - a));
			}
		}

		return result;
	}

	/**
	 * Compute spectral difference (simplified energy-based approach)
	 */
	private computeSpectralDifference(
		currentPCM: ArrayBuffer,
		previousPCM: ArrayBuffer
	): number {
		const currentArray = new Float32Array(currentPCM);
		const previousArray = new Float32Array(previousPCM);

		// Calculate RMS energy for each
		let currentEnergy = 0;
		let previousEnergy = 0;

		for (let i = 0; i < currentArray.length; i++) {
			currentEnergy += (currentArray[i] ?? 0) ** 2;
		}
		currentEnergy = Math.sqrt(currentEnergy / currentArray.length);

		for (let i = 0; i < previousArray.length; i++) {
			previousEnergy += (previousArray[i] ?? 0) ** 2;
		}
		previousEnergy = Math.sqrt(previousEnergy / previousArray.length);

		// Normalize difference
		const maxEnergy = Math.max(currentEnergy, previousEnergy);
		if (maxEnergy === 0) {
			return 0; // Both are silence
		}

		return Math.abs(currentEnergy - previousEnergy) / maxEnergy;
	}

	/**
	 * Detect silence regions in audio
	 */
	private detectSilenceRegions(
		pcmData: ArrayBuffer,
		sampleRate: number
	): TimeRange[] {
		const float32Array = new Float32Array(pcmData);
		const regions: TimeRange[] = [];

		const samplesPerWindow = Math.floor(sampleRate * 0.05); // 50ms windows
		let silenceStart: number | null = null;

		for (let i = 0; i < float32Array.length; i += samplesPerWindow) {
			// Calculate window RMS
			let rms = 0;
			const windowEnd = Math.min(i + samplesPerWindow, float32Array.length);
			for (let j = i; j < windowEnd; j++) {
				rms += (float32Array[j] ?? 0) ** 2;
			}
			rms = Math.sqrt(rms / (windowEnd - i));

			const time = i / sampleRate;

			if (rms < SILENCE_THRESHOLD) {
				if (silenceStart === null) {
					silenceStart = time;
				}
			} else {
				if (silenceStart !== null) {
					const duration = time - silenceStart;
					if (duration >= MIN_SILENCE_DURATION) {
						regions.push({ start: silenceStart, end: time });
					}
					silenceStart = null;
				}
			}
		}

		// Handle trailing silence
		if (silenceStart !== null) {
			const endTime = float32Array.length / sampleRate;
			const duration = endTime - silenceStart;
			if (duration >= MIN_SILENCE_DURATION) {
				regions.push({ start: silenceStart, end: endTime });
			}
		}

		return regions;
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
			`audio-diff-current-${timestamp}-${random}.mp3`
		);
		const previousPath = path.join(
			tempDir,
			`audio-diff-previous-${timestamp}-${random}.mp3`
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
		this.cleanupTempFiles().catch(() => {});
	}
}
