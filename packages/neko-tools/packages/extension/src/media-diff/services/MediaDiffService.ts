/**
 * MediaDiffService - Media Diff Service Facade
 *
 * Orchestrates Git operations and diff analyzers to provide
 * a unified interface for media diff functionality.
 *
 * Design:
 * - Facade pattern: Single entry point for diff operations
 * - Dependency injection: Analyzers injected via registry
 * - Progress reporting: Callback-based progress updates
 */

import * as vscode from 'vscode';
import {
	type MediaType,
	type DiffOptions,
	type DiffResult,
	type FileVersionPair,
	type GitCommitInfo,
	getMediaType,
	DEFAULT_DIFF_TIMEOUT,
} from '@neko/shared';
import { GitMediaService, type IGitMediaService } from './GitMediaService';
import {
	AnalyzerRegistry,
	type IMediaDiffAnalyzer,
} from './analyzers/IMediaDiffAnalyzer';

// =============================================================================
// Service Interface
// =============================================================================

/**
 * Progress callback
 */
export type DiffProgressCallback = (progress: number, stage: string) => void;

/**
 * Media diff service interface
 */
export interface IMediaDiffService extends vscode.Disposable {
	/**
	 * Analyze media file diff against Git ref
	 * @param uri - File URI to analyze
	 * @param ref - Git ref to compare against (default: HEAD)
	 * @param options - Analysis options
	 * @param onProgress - Progress callback
	 */
	analyze(
		uri: vscode.Uri,
		ref?: string,
		options?: DiffOptions,
		onProgress?: DiffProgressCallback,
		signal?: AbortSignal
	): Promise<DiffResult>;

	/**
	 * Analyze diff between two local files (not Git-based)
	 * @param currentUri - Current file URI (shown on the right)
	 * @param previousUri - Previous file URI (shown on the left)
	 * @param options - Analysis options
	 * @param onProgress - Progress callback
	 * @param signal - Optional AbortSignal for per-caller cancellation
	 */
	analyzeLocalFiles(
		currentUri: vscode.Uri,
		previousUri: vscode.Uri,
		options?: DiffOptions,
		onProgress?: DiffProgressCallback,
		signal?: AbortSignal
	): Promise<DiffResult>;

	/**
	 * Get file versions for comparison
	 */
	getFileVersions(uri: vscode.Uri, ref?: string): Promise<FileVersionPair>;

	/**
	 * Get file versions for local file comparison
	 */
	getLocalFileVersions(
		currentUri: vscode.Uri,
		previousUri: vscode.Uri
	): Promise<FileVersionPair>;

	/**
	 * Cancel ongoing analysis
	 */
	cancel(): void;

	/**
	 * Check if file is supported for diff
	 */
	isSupported(uri: vscode.Uri): boolean;

	/**
	 * Check if file has changes in Git
	 */
	hasChanges(uri: vscode.Uri): Promise<boolean>;

	/**
	 * Get file commit history
	 * @param uri - File URI
	 * @param maxCount - Maximum number of commits to return
	 */
	getFileHistory(uri: vscode.Uri, maxCount?: number): Promise<GitCommitInfo[]>;

	/**
	 * Register an analyzer
	 */
	registerAnalyzer(analyzer: IMediaDiffAnalyzer): void;

	/**
	 * Get commit history for a file
	 */
	getFileHistory(uri: vscode.Uri, maxCount?: number): Promise<import('@neko/shared').GitCommitInfo[]>;
}

// =============================================================================
// Service Implementation
// =============================================================================

/**
 * Media diff service implementation
 */
export class MediaDiffService implements IMediaDiffService {
	private readonly gitService: IGitMediaService;
	private readonly registry: AnalyzerRegistry;
	/** Track all active analyses for this service instance */
	private activeAnalyses = new Set<AbortController>();

	constructor(
		gitService?: IGitMediaService,
		registry?: AnalyzerRegistry
	) {
		this.gitService = gitService ?? new GitMediaService();
		this.registry = registry ?? new AnalyzerRegistry();
	}

	async analyze(
		uri: vscode.Uri,
		ref: string = 'HEAD',
		options?: DiffOptions,
		onProgress?: DiffProgressCallback,
		signal?: AbortSignal
	): Promise<DiffResult> {
		const abortController = new AbortController();
		this.activeAnalyses.add(abortController);

		// Link external signal to our internal controller
		if (signal) {
			if (signal.aborted) {
				this.activeAnalyses.delete(abortController);
				throw new Error('Analysis cancelled');
			}
			const onAbort = () => abortController.abort();
			signal.addEventListener('abort', onAbort, { once: true });
			// Clean up listener when analysis finishes
			abortController.signal.addEventListener('abort', () => {
				signal.removeEventListener('abort', onAbort);
			}, { once: true });
		}

		const mediaType = getMediaType(uri.fsPath);
		if (!mediaType) {
			this.activeAnalyses.delete(abortController);
			throw new Error(`Unsupported file type: ${uri.fsPath}`);
		}

		const analyzer = this.registry.get(mediaType);
		if (!analyzer) {
			this.activeAnalyses.delete(abortController);
			throw new Error(`No analyzer registered for type: ${mediaType}`);
		}

		try {
			// Report progress: fetching versions
			onProgress?.(10, 'Fetching file versions...');

			// Get file versions
			const versions = await this.gitService.getFileVersions(uri, ref);

			// Handle new file case - no diff analysis needed
			if (versions.isNewFile) {
				onProgress?.(100, 'Complete');
				return {
					mediaType,
					similarity: 0, // New file has no similarity to previous
					details: {
						isNewFile: true,
					},
				};
			}

			this.throwIfAborted(abortController);
			onProgress?.(30, 'Analyzing differences...');

			// Run analysis with timeout
			const ext = uri.fsPath.toLowerCase().match(/\.[^.]+$/)?.[0];
			const analysisOptions: DiffOptions = {
				timeout: DEFAULT_DIFF_TIMEOUT,
				generateHeatmap: true,
				...options,
				fileExtension: ext ?? undefined,
			};

			const result = await this.withTimeout(
				analyzer.analyze(
					Buffer.from(versions.current),
					Buffer.from(versions.previous),
					analysisOptions
				),
				analysisOptions.timeout ?? DEFAULT_DIFF_TIMEOUT
			);

			this.throwIfAborted(abortController);
			onProgress?.(100, 'Complete');

			return result;
		} catch (error) {
			if (abortController.signal.aborted) {
				throw new Error('Analysis cancelled');
			}
			throw error;
		} finally {
			this.activeAnalyses.delete(abortController);
		}
	}

	async getFileVersions(
		uri: vscode.Uri,
		ref: string = 'HEAD'
	): Promise<FileVersionPair> {
		return this.gitService.getFileVersions(uri, ref);
	}

	async getLocalFileVersions(
		currentUri: vscode.Uri,
		previousUri: vscode.Uri
	): Promise<FileVersionPair> {
		const currentMediaType = getMediaType(currentUri.fsPath);
		const previousMediaType = getMediaType(previousUri.fsPath);

		if (!currentMediaType) {
			throw new Error(`Unsupported file type: ${currentUri.fsPath}`);
		}
		if (!previousMediaType) {
			throw new Error(`Unsupported file type: ${previousUri.fsPath}`);
		}
		if (currentMediaType !== previousMediaType) {
			throw new Error(
				`Media type mismatch: ${currentMediaType} vs ${previousMediaType}`
			);
		}

		const [currentBuffer, previousBuffer] = await Promise.all([
			vscode.workspace.fs.readFile(currentUri),
			vscode.workspace.fs.readFile(previousUri),
		]);

		return {
			current: currentBuffer.buffer.slice(
				currentBuffer.byteOffset,
				currentBuffer.byteOffset + currentBuffer.byteLength
			) as ArrayBuffer,
			previous: previousBuffer.buffer.slice(
				previousBuffer.byteOffset,
				previousBuffer.byteOffset + previousBuffer.byteLength
			) as ArrayBuffer,
			currentPath: currentUri.fsPath,
			previousPath: previousUri.fsPath,
			mediaType: currentMediaType,
		};
	}

	async analyzeLocalFiles(
		currentUri: vscode.Uri,
		previousUri: vscode.Uri,
		options?: DiffOptions,
		onProgress?: DiffProgressCallback,
		signal?: AbortSignal
	): Promise<DiffResult> {
		const abortController = new AbortController();
		this.activeAnalyses.add(abortController);

		// Link external signal to our internal controller
		if (signal) {
			if (signal.aborted) {
				this.activeAnalyses.delete(abortController);
				throw new Error('Analysis cancelled');
			}
			const onAbort = () => abortController.abort();
			signal.addEventListener('abort', onAbort, { once: true });
			abortController.signal.addEventListener('abort', () => {
				signal.removeEventListener('abort', onAbort);
			}, { once: true });
		}

		const currentMediaType = getMediaType(currentUri.fsPath);
		const previousMediaType = getMediaType(previousUri.fsPath);

		if (!currentMediaType) {
			this.activeAnalyses.delete(abortController);
			throw new Error(`Unsupported file type: ${currentUri.fsPath}`);
		}
		if (!previousMediaType) {
			this.activeAnalyses.delete(abortController);
			throw new Error(`Unsupported file type: ${previousUri.fsPath}`);
		}
		if (currentMediaType !== previousMediaType) {
			this.activeAnalyses.delete(abortController);
			throw new Error(
				`Cannot compare different media types: ${currentMediaType} vs ${previousMediaType}`
			);
		}

		const analyzer = this.registry.get(currentMediaType);
		if (!analyzer) {
			this.activeAnalyses.delete(abortController);
			throw new Error(`No analyzer registered for type: ${currentMediaType}`);
		}

		try {
			// Report progress: fetching versions
			onProgress?.(10, 'Reading files...');

			// Get file versions
			const versions = await this.getLocalFileVersions(currentUri, previousUri);

			this.throwIfAborted(abortController);
			onProgress?.(30, 'Analyzing differences...');

			// Run analysis with timeout
			const ext = currentUri.fsPath.toLowerCase().match(/\.[^.]+$/)?.[0];
			const analysisOptions: DiffOptions = {
				timeout: DEFAULT_DIFF_TIMEOUT,
				generateHeatmap: true,
				...options,
				fileExtension: ext ?? undefined,
			};

			const result = await this.withTimeout(
				analyzer.analyze(
					Buffer.from(versions.current),
					Buffer.from(versions.previous),
					analysisOptions
				),
				analysisOptions.timeout ?? DEFAULT_DIFF_TIMEOUT
			);

			this.throwIfAborted(abortController);
			onProgress?.(100, 'Complete');

			return result;
		} catch (error) {
			if (abortController.signal.aborted) {
				throw new Error('Analysis cancelled');
			}
			throw error;
		} finally {
			this.activeAnalyses.delete(abortController);
		}
	}

	cancel(): void {
		for (const ac of this.activeAnalyses) {
			ac.abort();
		}
		this.activeAnalyses.clear();
		this.registry.cancelAll();
	}

	isSupported(uri: vscode.Uri): boolean {
		const mediaType = getMediaType(uri.fsPath);
		return mediaType !== null && this.registry.isSupported(mediaType);
	}

	async hasChanges(uri: vscode.Uri): Promise<boolean> {
		const changes = await this.gitService.getChangedMediaFiles();
		return changes.some((c) => c.uri === uri.toString());
	}

	async getFileHistory(
		uri: vscode.Uri,
		maxCount?: number
	): Promise<GitCommitInfo[]> {
		return this.gitService.getFileHistory(uri, maxCount);
	}

	registerAnalyzer(analyzer: IMediaDiffAnalyzer): void {
		this.registry.register(analyzer);
	}

	/**
	 * Throw if analysis was aborted
	 */
	private throwIfAborted(ac: AbortController): void {
		if (ac.signal.aborted) {
			throw new Error('Analysis cancelled');
		}
	}

	/**
	 * Wrap promise with timeout
	 */
	private async withTimeout<T>(
		promise: Promise<T>,
		timeoutMs: number
	): Promise<T> {
		return Promise.race([
			promise,
			new Promise<T>((_, reject) =>
				setTimeout(
					() => reject(new Error('Analysis timed out')),
					timeoutMs
				)
			),
		]);
	}

	dispose(): void {
		this.cancel();
		this.gitService.dispose();
		this.registry.clear();
	}
}

// =============================================================================
// Service Factory
// =============================================================================

let instance: MediaDiffService | null = null;

/**
 * Get singleton instance of MediaDiffService
 */
export function getMediaDiffService(): MediaDiffService {
	if (!instance) {
		instance = new MediaDiffService();
	}
	return instance;
}

/**
 * Dispose singleton instance
 */
export function disposeMediaDiffService(): void {
	if (instance) {
		instance.dispose();
		instance = null;
	}
}
