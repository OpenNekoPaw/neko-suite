/**
 * AudioDiffAnalyzer - Audio Diff Analyzer
 *
 * Delegates audio comparison to neko-engine's native audios:diff action.
 * Engine performs: FFmpeg decode → 48kHz mono PCM → SNR + diff regions.
 * This analyzer converts EngineDiffResult → Protocol AudioDiffDetails.
 */

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import type {
	DiffOptions,
	DiffResult,
	AudioDiffDetails,
} from '@neko/shared';
import { BaseMediaDiffAnalyzer } from './IMediaDiffAnalyzer';
import { EngineMediaService } from '../../../services/EngineMediaService';

const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a'];

export class AudioDiffAnalyzer extends BaseMediaDiffAnalyzer {
	readonly mediaType = 'audio' as const;
	private readonly engineMediaService: EngineMediaService;
	private tempFiles: string[] = [];

	constructor(engineMediaService?: EngineMediaService) {
		super(AUDIO_EXTENSIONS);
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
			const ext = options?.fileExtension ?? '.mp3';
			const [currentPath, previousPath] = await this.writeTempFiles(current, previous, ext);
			this.throwIfAborted();

			const engineResult = await this.engineMediaService.diff(
				'audios',
				currentPath,
				previousPath
			);

			this.throwIfAborted();

			if (!engineResult) {
				throw new Error('Engine audio diff unavailable');
			}

			// Convert Engine types → Protocol types
			const audioDiff = engineResult.audioDiff;
			const details: AudioDiffDetails = {
				duration: {
					current: audioDiff?.durationA ?? 0,
					previous: audioDiff?.durationB ?? 0,
				},
				sampleRate: {
					current: audioDiff?.compareSampleRate ?? 0,
					previous: audioDiff?.compareSampleRate ?? 0,
				},
				channels: { current: 1, previous: 1 }, // Engine compares as mono
				waveformSimilarity: this.snrToSimilarity(audioDiff?.snr ?? 0),
				spectralDifference: (audioDiff?.diffPercent ?? 0) / 100,
			};

			// Compute overall similarity from SNR
			let similarity = details.waveformSimilarity;

			// Penalize for duration difference
			const durationA = audioDiff?.durationA ?? 0;
			const durationB = audioDiff?.durationB ?? 0;
			const durationDiff = Math.abs(durationA - durationB);
			const maxDuration = Math.max(durationA, durationB);
			if (maxDuration > 0) {
				similarity *= 1 - (durationDiff / maxDuration) * 0.5;
			}

			return {
				mediaType: 'audio',
				similarity: Math.max(0, Math.min(1, similarity)),
				details,
			};
		} finally {
			await this.cleanupTempFiles();
		}
	}

	/**
	 * Convert SNR (dB) to similarity score (0-1).
	 * SNR=Infinity → identical (1.0), SNR=0 → completely different (0.0)
	 */
	private snrToSimilarity(snr: number): number {
		if (!isFinite(snr)) return 1.0;
		if (snr <= 0) return 0;
		// 60dB+ is essentially identical, 0dB is completely different
		return Math.min(1, snr / 60);
	}

	private async writeTempFiles(
		current: Buffer,
		previous: Buffer,
		ext: string
	): Promise<[string, string]> {
		const tempDir = os.tmpdir();
		const timestamp = Date.now();
		const random = Math.random().toString(36).slice(2);

		const currentPath = path.join(tempDir, `audio-diff-a-${timestamp}-${random}${ext}`);
		const previousPath = path.join(tempDir, `audio-diff-b-${timestamp}-${random}${ext}`);

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
