/**
 * Media Library Tree View Provider
 *
 * TreeView for browsing configured external media directories.
 * Supports lazy-loading subdirectories and drag-and-drop to timeline.
 *
 * Phase 4 enhancements:
 * - Thumbnails for video/image files
 * - Metadata tooltips (resolution, duration, codec, etc.)
 * - Preview integration (video/audio/image)
 * - Fixed drag protocol (ASSET_DRAG_MIME + MediaFileDragData)
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { isMediaFile, detectMediaType, ASSET_DRAG_MIME, type MediaFileMetadata, type MediaFileDragData } from '@neko/shared';
import type { ResolvedMediaLibrary } from '@neko/shared';
import type { MediaLibrarySettingsService } from '../services/MediaLibrarySettingsService';
import type { ThumbnailService } from '../services/ThumbnailService';
import { formatDuration, formatResolution, buildMetadataTooltipLines } from '../utils/formatters';
import { t } from '../i18n';

// =============================================================================
// Dependencies
// =============================================================================

export interface MediaLibraryDeps {
	settingsService: MediaLibrarySettingsService;
	thumbnailService: ThumbnailService;
	metadataExtractor: (filePath: string) => Promise<MediaFileMetadata>;
}

// =============================================================================
// Tree Item Types
// =============================================================================

type MediaLibraryItem = LibraryRootItem | DirectoryItem | MediaFileItem;

class LibraryRootItem extends vscode.TreeItem {
	readonly type = 'libraryRoot' as const;

	constructor(public readonly library: ResolvedMediaLibrary) {
		super(library.name, vscode.TreeItemCollapsibleState.Collapsed);
		this.description = library.resolvedPath;
		this.contextValue = library.accessible ? 'mediaLibrary' : 'mediaLibrary:offline';

		this.iconPath = library.accessible
			? new vscode.ThemeIcon('folder-library')
			: new vscode.ThemeIcon('warning', new vscode.ThemeColor('list.warningForeground'));

		this.tooltip = [
			library.name,
			`Path: ${library.resolvedPath}`,
			`Variable: \${${library.variable}}`,
			library.overridden ? `Overridden from: ${library.originalPath}` : null,
			library.accessible ? t('mediaLibrary.status.online') : t('mediaLibrary.status.offline'),
		].filter(Boolean).join('\n');
	}
}

class DirectoryItem extends vscode.TreeItem {
	readonly type = 'directory' as const;

	constructor(public readonly dirPath: string, dirName: string, fileCount?: number) {
		super(dirName, vscode.TreeItemCollapsibleState.Collapsed);
		this.contextValue = 'mediaLibrary:directory';
		this.iconPath = vscode.ThemeIcon.Folder;
		if (fileCount !== undefined && fileCount > 0) {
			this.description = fileCount === 1
				? t('mediaLibrary.fileCount', { count: fileCount })
				: t('mediaLibrary.fileCount.plural', { count: fileCount });
		}
	}
}

class MediaFileItem extends vscode.TreeItem {
	readonly type = 'file' as const;

	constructor(
		public readonly filePath: string,
		fileName: string,
		metadata?: MediaFileMetadata,
		thumbnailPath?: string | null,
	) {
		super(fileName, vscode.TreeItemCollapsibleState.None);
		this.contextValue = 'mediaLibrary:file';
		this.resourceUri = vscode.Uri.file(filePath);

		const mediaType = detectMediaType(filePath);

		// Command: preview based on media type
		if (mediaType === 'video') {
			this.command = {
				command: 'vscode.openWith',
				title: t('command.previewVideo'),
				arguments: [vscode.Uri.file(filePath), 'neko.videoPreview'],
			};
		} else if (mediaType === 'audio') {
			this.command = {
				command: 'vscode.openWith',
				title: t('command.previewAudio'),
				arguments: [vscode.Uri.file(filePath), 'neko.audioPreview'],
			};
		} else {
			this.command = {
				command: 'vscode.open',
				title: t('command.openFile'),
				arguments: [vscode.Uri.file(filePath)],
			};
		}

		// Icon: thumbnail for video/image, ThemeIcon for audio
		if (thumbnailPath) {
			this.iconPath = vscode.Uri.file(thumbnailPath);
		} else if (mediaType === 'image') {
			// Images use original file as icon (VSCode auto-scales)
			this.iconPath = vscode.Uri.file(filePath);
		} else {
			const iconMap: Record<string, string> = {
				video: 'file-media',
				audio: 'unmute',
			};
			this.iconPath = new vscode.ThemeIcon(iconMap[mediaType] ?? 'file');
		}

		// Tooltip: metadata if available
		if (metadata) {
			const lines = buildMetadataTooltipLines(metadata);
			if (lines.length > 0) {
				const md = new vscode.MarkdownString();
				md.appendText(fileName);
				md.appendText('\n\n');
				md.appendText(lines.join('\n'));
				this.tooltip = md;
			}
		}
	}
}

// =============================================================================
// Provider
// =============================================================================

export class MediaLibraryTreeProvider
	implements vscode.TreeDataProvider<MediaLibraryItem>, vscode.TreeDragAndDropController<MediaLibraryItem>, vscode.Disposable
{
	private readonly _onDidChangeTreeData = new vscode.EventEmitter<MediaLibraryItem | undefined>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	// TreeDragAndDropController
	readonly dragMimeTypes = [ASSET_DRAG_MIME];
	readonly dropMimeTypes: string[] = [];

	private disposables: vscode.Disposable[] = [];

	// Caches
	private thumbnailCache = new Map<string, string | null>();
	private metadataCache = new Map<string, MediaFileMetadata>();
	private pendingThumbnails = new Set<string>();
	private refreshDebounceTimer?: NodeJS.Timeout;

	private readonly settingsService: MediaLibrarySettingsService;
	private readonly thumbnailService: ThumbnailService;
	private readonly metadataExtractor: (filePath: string) => Promise<MediaFileMetadata>;

	constructor(deps: MediaLibraryDeps) {
		this.settingsService = deps.settingsService;
		this.thumbnailService = deps.thumbnailService;
		this.metadataExtractor = deps.metadataExtractor;

		this.disposables.push(
			deps.settingsService.onDidChange(() => this.refresh()),
		);
	}

	refresh(): void {
		// Clear all caches
		this.thumbnailCache.clear();
		this.metadataCache.clear();
		this.pendingThumbnails.clear();
		this._onDidChangeTreeData.fire(undefined);
	}

	getTreeItem(element: MediaLibraryItem): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: MediaLibraryItem): Promise<MediaLibraryItem[]> {
		if (!element) {
			return this.getRootItems();
		}
		if (element instanceof LibraryRootItem) {
			if (!element.library.accessible) return [];
			return this.listDirectory(element.library.resolvedPath);
		}
		if (element instanceof DirectoryItem) {
			return this.listDirectory(element.dirPath);
		}
		return [];
	}

	// Drag support
	handleDrag(
		source: readonly MediaLibraryItem[],
		dataTransfer: vscode.DataTransfer,
	): void {
		const files = source.filter(
			(s): s is MediaFileItem => s instanceof MediaFileItem,
		);
		if (files.length === 0) return;

		const dragData: MediaFileDragData = {
			type: 'media-file',
			files: files.map(f => ({
				path: f.filePath,
				name: path.basename(f.filePath),
				mediaType: detectMediaType(f.filePath) as 'video' | 'audio' | 'image',
			})),
		};

		dataTransfer.set(
			ASSET_DRAG_MIME,
			new vscode.DataTransferItem(JSON.stringify(dragData)),
		);
	}

	// =========================================================================
	// Private
	// =========================================================================

	private async getRootItems(): Promise<MediaLibraryItem[]> {
		const libraries = await this.settingsService.getResolvedLibraries();
		if (libraries.length === 0) {
			return [this.createPlaceholder()];
		}
		return libraries
			.filter(lib => lib.enabled)
			.map(lib => new LibraryRootItem(lib));
	}

	private async listDirectory(dirPath: string): Promise<MediaLibraryItem[]> {
		try {
			const entries = await fs.readdir(dirPath, { withFileTypes: true });
			const items: MediaLibraryItem[] = [];

			// Directories first (skip hidden), then media files
			const dirs = entries
				.filter(e => e.isDirectory() && !e.name.startsWith('.'))
				.sort((a, b) => a.name.localeCompare(b.name));

			const files = entries
				.filter(e => e.isFile() && isMediaFile(e.name))
				.sort((a, b) => a.name.localeCompare(b.name));

			// Count media files for directory description
			const mediaFileCount = files.length;

			for (const dir of dirs) {
				items.push(new DirectoryItem(path.join(dirPath, dir.name), dir.name, mediaFileCount));
			}

			for (const file of files) {
				const filePath = path.join(dirPath, file.name);
				const mediaType = detectMediaType(filePath);

				// Get cached metadata
				let metadata = this.metadataCache.get(filePath);
				if (!metadata) {
					// Trigger async metadata extraction (don't block)
					this.extractMetadata(filePath);
				}

				// Get cached thumbnail
				let thumbnailPath: string | null | undefined = this.thumbnailCache.get(filePath);
				if (thumbnailPath === undefined && mediaType === 'video') {
					// Trigger async thumbnail generation (don't block)
					this.generateThumbnail(filePath);
					thumbnailPath = null;
				}

				items.push(new MediaFileItem(filePath, file.name, metadata, thumbnailPath));
			}

			return items;
		} catch {
			return [];
		}
	}

	private async extractMetadata(filePath: string): Promise<void> {
		try {
			const metadata = await this.metadataExtractor(filePath);
			this.metadataCache.set(filePath, metadata);
			this.debouncedRefresh(filePath);
		} catch {
			// Silently ignore metadata extraction failures
		}
	}

	private async generateThumbnail(filePath: string): Promise<void> {
		// Prevent duplicate requests
		if (this.pendingThumbnails.has(filePath)) return;
		this.pendingThumbnails.add(filePath);

		try {
			const result = await this.thumbnailService.generate(filePath);
			this.thumbnailCache.set(filePath, result?.path ?? null);
			if (result) {
				this.debouncedRefresh(filePath);
			}
		} catch {
			this.thumbnailCache.set(filePath, null);
		} finally {
			this.pendingThumbnails.delete(filePath);
		}
	}

	private debouncedRefresh(filePath: string): void {
		if (this.refreshDebounceTimer) {
			clearTimeout(this.refreshDebounceTimer);
		}
		this.refreshDebounceTimer = setTimeout(() => {
			this._onDidChangeTreeData.fire(undefined);
		}, 100);
	}

	private createPlaceholder(): vscode.TreeItem {
		const item = new vscode.TreeItem(t('mediaLibrary.placeholder'));
		item.command = {
			command: 'neko.assets.addMediaLibrary',
			title: t('mediaLibrary.placeholder.action'),
		};
		return item;
	}

	dispose(): void {
		if (this.refreshDebounceTimer) {
			clearTimeout(this.refreshDebounceTimer);
		}
		this._onDidChangeTreeData.dispose();
		for (const d of this.disposables) {
			d.dispose();
		}
		this.disposables = [];
	}
}
