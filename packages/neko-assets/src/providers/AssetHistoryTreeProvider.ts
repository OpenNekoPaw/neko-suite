/**
 * Asset History Tree View Provider
 *
 * TreeDataProvider for the Activity Bar "History" view.
 * Shows recent asset changes based on Git history.
 */

import * as vscode from 'vscode';
import type { AssetLibrary } from '@neko/asset';

// =============================================================================
// Tree Items
// =============================================================================

class RecentEntityItem extends vscode.TreeItem {
	constructor(
		name: string,
		category: string,
		lastUsedAt: number | undefined,
		filePath?: string,
	) {
		super(name, vscode.TreeItemCollapsibleState.None);
		this.description = category;
		this.iconPath = new vscode.ThemeIcon('history');
		this.contextValue = 'recentEntity';

		if (lastUsedAt) {
			this.tooltip = `Last used: ${new Date(lastUsedAt).toLocaleString()}`;
		}

		if (filePath) {
			this.resourceUri = vscode.Uri.file(filePath);
			this.command = {
				command: 'vscode.open',
				title: 'Open File',
				arguments: [this.resourceUri],
			};
		}
	}
}

// =============================================================================
// Provider
// =============================================================================

export class AssetHistoryTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable {
	private readonly _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	constructor(private readonly library: AssetLibrary) {}

	refresh(): void {
		this._onDidChangeTreeData.fire(undefined);
	}

	dispose(): void {
		this._onDidChangeTreeData.dispose();
	}

	async getTreeItem(element: vscode.TreeItem): Promise<vscode.TreeItem> {
		return element;
	}

	async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
		if (element) return [];

		const recent = await this.library.getRecent(20);
		if (recent.length === 0) {
			return [new vscode.TreeItem('No recent assets')];
		}

		return recent.map((entity) => {
			const primaryFile = entity.variants[0]?.files[0];
			return new RecentEntityItem(
				entity.name,
				entity.category,
				entity.lastUsedAt,
				primaryFile?.path,
			);
		});
	}
}
