/**
 * Media Library Tree View Provider
 *
 * TreeView for browsing configured external media directories.
 * Supports lazy-loading subdirectories and drag-and-drop to timeline.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { isMediaFile, detectMediaType } from '@neko/shared';
import type { ResolvedMediaLibrary } from '@neko/shared';
import type { MediaLibrarySettingsService } from '../services/MediaLibrarySettingsService';

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
			library.accessible ? 'Status: Online' : 'Status: Offline',
		].filter(Boolean).join('\n');
	}
}

class DirectoryItem extends vscode.TreeItem {
	readonly type = 'directory' as const;

	constructor(public readonly dirPath: string, dirName: string) {
		super(dirName, vscode.TreeItemCollapsibleState.Collapsed);
		this.contextValue = 'mediaLibrary:directory';
		this.iconPath = vscode.ThemeIcon.Folder;
	}
}

class MediaFileItem extends vscode.TreeItem {
	readonly type = 'file' as const;

	constructor(public readonly filePath: string, fileName: string) {
		super(fileName, vscode.TreeItemCollapsibleState.None);
		this.contextValue = 'mediaLibrary:file';
		this.resourceUri = vscode.Uri.file(filePath);
		this.command = {
			command: 'vscode.open',
			title: 'Open File',
			arguments: [vscode.Uri.file(filePath)],
		};

		const mediaType = detectMediaType(filePath);
		const iconMap: Record<string, string> = {
			video: 'file-media',
			audio: 'unmute',
			image: 'file-media',
		};
		this.iconPath = new vscode.ThemeIcon(iconMap[mediaType] ?? 'file');
	}
}

// =============================================================================
// Provider
// =============================================================================

const DRAG_MIME = 'application/vnd.neko.media-file';

export class MediaLibraryTreeProvider
	implements vscode.TreeDataProvider<MediaLibraryItem>, vscode.TreeDragAndDropController<MediaLibraryItem>, vscode.Disposable
{
	private readonly _onDidChangeTreeData = new vscode.EventEmitter<MediaLibraryItem | undefined>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	// TreeDragAndDropController
	readonly dragMimeTypes = [DRAG_MIME];
	readonly dropMimeTypes: string[] = [];

	private disposables: vscode.Disposable[] = [];

	constructor(private readonly settingsService: MediaLibrarySettingsService) {
		this.disposables.push(
			settingsService.onDidChange(() => this.refresh()),
		);
	}

	refresh(): void {
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

		const data = files.map(f => ({
			path: f.filePath,
			mediaType: detectMediaType(f.filePath),
		}));

		dataTransfer.set(
			DRAG_MIME,
			new vscode.DataTransferItem(JSON.stringify(data)),
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

			for (const dir of dirs) {
				items.push(new DirectoryItem(path.join(dirPath, dir.name), dir.name));
			}
			for (const file of files) {
				items.push(new MediaFileItem(path.join(dirPath, file.name), file.name));
			}

			return items;
		} catch {
			return [];
		}
	}

	private createPlaceholder(): vscode.TreeItem {
		const item = new vscode.TreeItem('No media libraries configured');
		item.command = {
			command: 'neko.assets.addMediaLibrary',
			title: 'Add Media Library',
		};
		return item;
	}

	dispose(): void {
		this._onDidChangeTreeData.dispose();
		for (const d of this.disposables) {
			d.dispose();
		}
		this.disposables = [];
	}
}
