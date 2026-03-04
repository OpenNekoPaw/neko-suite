/**
 * Asset File Decoration Provider
 *
 * Enhances the VS Code Explorer tree with asset metadata:
 * - Badge: media duration (e.g., "1:30") or resolution (e.g., "4K")
 * - Tooltip: full metadata (codec, resolution, fps, audio info)
 *
 * Metadata comes from the AssetLibrary — files must be imported/registered
 * to show decorations. Uses on-demand probing (no background scanning).
 */

import * as vscode from 'vscode';
import type { AssetLibrary } from '@neko/asset';
import type { AssetEntity, AssetFile, AssetFileStatus, MediaFileMetadata } from '@neko/shared';
import { isMediaFile } from '@neko/shared';

// =============================================================================
// Formatting Helpers
// =============================================================================

/**
 * Format duration in seconds to a short string.
 *
 * @example
 * formatDuration(90)   // "1:30"
 * formatDuration(3661) // "1:01:01"
 * formatDuration(5.5)  // "0:06"
 */
function formatDuration(seconds: number): string {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = Math.round(seconds % 60);

	if (h > 0) {
		return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
	}
	return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Format resolution to a short label.
 *
 * @example
 * formatResolution(3840, 2160) // "4K"
 * formatResolution(1920, 1080) // "1080p"
 * formatResolution(800, 600)   // "800x600"
 */
function formatResolution(width: number, height: number): string {
	if (width >= 3840) return '4K';
	if (width >= 2560) return '1440p';
	if (width >= 1920) return '1080p';
	if (width >= 1280) return '720p';
	if (width >= 640) return '480p';
	return `${width}x${height}`;
}

/**
 * Build tooltip string from metadata.
 */
function buildTooltip(metadata: MediaFileMetadata): string {
	const lines: string[] = [];

	if (metadata.width && metadata.height) {
		lines.push(`Resolution: ${metadata.width}x${metadata.height}`);
	}
	if (metadata.duration) {
		lines.push(`Duration: ${formatDuration(metadata.duration)}`);
	}
	if (metadata.frameRate) {
		lines.push(`Frame Rate: ${metadata.frameRate} fps`);
	}
	if (metadata.codec) {
		lines.push(`Codec: ${metadata.codec}`);
	}
	if (metadata.sampleRate) {
		lines.push(`Sample Rate: ${metadata.sampleRate} Hz`);
	}
	if (metadata.channels) {
		lines.push(`Channels: ${metadata.channels}`);
	}
	if (metadata.bitrate) {
		const kbps = Math.round(metadata.bitrate / 1000);
		lines.push(`Bitrate: ${kbps} kbps`);
	}
	if (metadata.fileSize) {
		const sizeMB = (metadata.fileSize / (1024 * 1024)).toFixed(1);
		lines.push(`Size: ${sizeMB} MB`);
	}

	return lines.join('\n');
}

// =============================================================================
// Provider
// =============================================================================

export class AssetFileDecorationProvider implements vscode.FileDecorationProvider {
	private readonly _onDidChangeFileDecorations = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();
	readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;

	/** Cache: file path → asset file data (to avoid repeated lookups) */
	private fileCache = new Map<string, AssetFile | null>();

	constructor(private readonly library: AssetLibrary) {}

	/**
	 * Provide file decoration for a given URI.
	 *
	 * Only decorates files that:
	 * 1. Are known media types (video/audio/image)
	 * 2. Have been imported into the AssetLibrary (have metadata)
	 */
	provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
		// Only process file:// URIs
		if (uri.scheme !== 'file') return undefined;

		// Only process media files
		if (!isMediaFile(uri.fsPath)) return undefined;

		// Look up cached file data
		const cached = this.fileCache.get(uri.fsPath);
		if (cached === null) return undefined; // Known to have no data
		if (cached) {
			return this.createDecorationForFile(cached);
		}

		// Trigger async lookup (don't block)
		this.lookupFile(uri.fsPath);
		return undefined;
	}

	/**
	 * Refresh decorations for specific files or all files.
	 */
	refresh(uris?: vscode.Uri[]): void {
		if (uris) {
			for (const uri of uris) {
				this.fileCache.delete(uri.fsPath);
			}
			this._onDidChangeFileDecorations.fire(uris);
		} else {
			this.fileCache.clear();
			this._onDidChangeFileDecorations.fire(undefined);
		}
	}

	// =========================================================================
	// Private
	// =========================================================================

	private createDecorationForFile(file: AssetFile): vscode.FileDecoration {
		// Status-based decorations take priority
		if (file.status === 'offline') {
			return {
				badge: '⚡',
				tooltip: 'Asset offline — path not accessible',
				color: new vscode.ThemeColor('list.warningForeground'),
			};
		}
		if (file.status === 'missing') {
			return {
				badge: '✕',
				tooltip: 'Asset missing — file not found',
				color: new vscode.ThemeColor('list.errorForeground'),
			};
		}

		// Normal metadata-based decoration
		return this.createDecoration(file.metadata);
	}

	private createDecoration(metadata: MediaFileMetadata): vscode.FileDecoration {
		// Determine badge content
		let badge: string | undefined;

		if (metadata.duration) {
			badge = formatDuration(metadata.duration);
		} else if (metadata.width && metadata.height) {
			badge = formatResolution(metadata.width, metadata.height);
		}

		// Badge is limited to 2 characters in VS Code FileDecoration
		// For longer strings, we truncate to fit
		if (badge && badge.length > 2) {
			// Use abbreviated format: "1m" for 1 minute, "4K" etc.
			if (metadata.duration) {
				const minutes = Math.round(metadata.duration / 60);
				if (minutes > 0) {
					badge = `${minutes}m`;
				} else {
					badge = `${Math.round(metadata.duration)}s`;
				}
			}
			// Resolution labels like "4K" already fit in 2 chars
			if (badge && badge.length > 2) {
				badge = badge.slice(0, 2);
			}
		}

		return {
			badge,
			tooltip: buildTooltip(metadata),
		};
	}

	private async lookupFile(fsPath: string): Promise<void> {
		try {
			const file = await this.findFileByPath(fsPath);
			this.fileCache.set(fsPath, file);

			if (file) {
				// Trigger re-render for this file
				this._onDidChangeFileDecorations.fire(vscode.Uri.file(fsPath));
			}
		} catch {
			this.fileCache.set(fsPath, null);
		}
	}

	/**
	 * Find metadata for a file path by searching through all entities.
	 * Also returns file status for decoration.
	 */
	private async findFileByPath(fsPath: string): Promise<AssetFile | null> {
		try {
			const entities: AssetEntity[] = await this.library.getAllEntities();

			for (const entity of entities) {
				for (const variant of entity.variants) {
					for (const file of variant.files) {
						if (this.pathMatches(file.path, fsPath)) {
							return file;
						}
					}
				}
			}
		} catch {
			// Library not initialized or other error
		}

		return null;
	}

	/**
	 * Find metadata for a file path by searching through all entities.
	 */
	private async findMetadataByPath(fsPath: string): Promise<MediaFileMetadata | null> {
		const file = await this.findFileByPath(fsPath);
		return file?.metadata ?? null;
	}

	/**
	 * Check if an asset file path matches the given filesystem path.
	 * Handles both relative and absolute paths.
	 */
	private pathMatches(assetPath: string, fsPath: string): boolean {
		// Normalize both paths
		const normalizedAsset = assetPath.replace(/\\/g, '/');
		const normalizedFs = fsPath.replace(/\\/g, '/');

		// Direct match
		if (normalizedAsset === normalizedFs) return true;

		// Asset path might be relative — check if fsPath ends with it
		if (normalizedFs.endsWith(normalizedAsset)) return true;

		return false;
	}
}
