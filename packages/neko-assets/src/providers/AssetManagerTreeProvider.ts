/**
 * Asset Manager Tree View Provider
 *
 * TreeDataProvider for the Activity Bar "Assets" view.
 * Shows entities grouped by category, with variants as children.
 */

import * as vscode from 'vscode';
import type { AssetEntity, AssetVariant, EntityCategory } from '@neko/shared';
import type { AssetLibrary } from '@neko/asset';

// =============================================================================
// Tree Item Types
// =============================================================================

type AssetTreeItem = CategoryItem | EntityItem | VariantItem;

class CategoryItem extends vscode.TreeItem {
	constructor(
		public readonly category: EntityCategory,
		public readonly entityCount: number,
	) {
		super(getCategoryLabel(category), vscode.TreeItemCollapsibleState.Collapsed);
		this.description = `${entityCount}`;
		this.iconPath = new vscode.ThemeIcon(getCategoryIcon(category));
		this.contextValue = 'category';
	}
}

class EntityItem extends vscode.TreeItem {
	constructor(public readonly entity: AssetEntity) {
		super(
			entity.name,
			entity.variants.length > 1
				? vscode.TreeItemCollapsibleState.Collapsed
				: vscode.TreeItemCollapsibleState.None,
		);
		this.description = entity.variants.length > 1 ? `${entity.variants.length} variants` : undefined;
		this.contextValue = 'entity';
		this.tooltip = [
			entity.name,
			entity.description,
			entity.tags.length > 0 ? `Tags: ${entity.tags.join(', ')}` : undefined,
		].filter(Boolean).join('\n');

		// Check if any files have accessibility issues
		const hasProblems = entity.variants.some(v =>
			v.files.some(f => f.status === 'offline' || f.status === 'missing'),
		);

		// Use thumbnail as icon if available, otherwise fall back to theme icon
		const defaultVariant = entity.variants.find(v => v.id === entity.defaultVariantId) ?? entity.variants[0];
		if (hasProblems) {
			this.iconPath = new vscode.ThemeIcon('warning',
				new vscode.ThemeColor('list.warningForeground'));
		} else if (defaultVariant?.thumbnailPath) {
			this.iconPath = vscode.Uri.file(defaultVariant.thumbnailPath);
		} else {
			this.iconPath = new vscode.ThemeIcon('file-media');
		}

		// Single variant → show primary file path
		if (entity.variants.length === 1 && entity.variants[0]?.files[0]) {
			const file = entity.variants[0].files[0];
			this.resourceUri = vscode.Uri.file(file.path);
			this.command = {
				command: 'vscode.open',
				title: 'Open File',
				arguments: [this.resourceUri],
			};
		}
	}
}

class VariantItem extends vscode.TreeItem {
	constructor(
		public readonly entity: AssetEntity,
		public readonly variant: AssetVariant,
	) {
		super(variant.name, vscode.TreeItemCollapsibleState.None);

		// Check for offline/missing files
		const offlineFiles = variant.files.filter(
			f => f.status === 'offline' || f.status === 'missing',
		);

		if (offlineFiles.length > 0) {
			this.description = `${offlineFiles.length} offline`;
			this.contextValue = 'variant:hasOffline';
		} else {
			this.description = variant.files.length > 0 ? `${variant.files.length} files` : 'no files';
			this.contextValue = 'variant';
		}

		// Use thumbnail as icon if available
		if (offlineFiles.length > 0) {
			this.iconPath = new vscode.ThemeIcon('warning',
				new vscode.ThemeColor('list.warningForeground'));
		} else if (variant.thumbnailPath) {
			this.iconPath = vscode.Uri.file(variant.thumbnailPath);
		} else {
			this.iconPath = new vscode.ThemeIcon('versions');
		}

		if (variant.files[0]) {
			this.resourceUri = vscode.Uri.file(variant.files[0].path);
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

export class AssetManagerTreeProvider implements vscode.TreeDataProvider<AssetTreeItem>, vscode.Disposable {
	private readonly _onDidChangeTreeData = new vscode.EventEmitter<AssetTreeItem | undefined>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	constructor(private readonly library: AssetLibrary) {}

	refresh(): void {
		this._onDidChangeTreeData.fire(undefined);
	}

	dispose(): void {
		this._onDidChangeTreeData.dispose();
	}

	async getTreeItem(element: AssetTreeItem): Promise<vscode.TreeItem> {
		return element;
	}

	async getChildren(element?: AssetTreeItem): Promise<AssetTreeItem[]> {
		if (!element) {
			return this.getRootItems();
		}
		if (element instanceof CategoryItem) {
			return this.getEntitiesForCategory(element.category);
		}
		if (element instanceof EntityItem && element.entity.variants.length > 1) {
			return element.entity.variants.map((v) => new VariantItem(element.entity, v));
		}
		return [];
	}

	private async getRootItems(): Promise<CategoryItem[]> {
		const entities = await this.library.getAllEntities();
		const grouped = new Map<EntityCategory, number>();

		for (const entity of entities) {
			grouped.set(entity.category, (grouped.get(entity.category) ?? 0) + 1);
		}

		return Array.from(grouped.entries())
			.sort((a, b) => b[1] - a[1])
			.map(([category, count]) => new CategoryItem(category, count));
	}

	private async getEntitiesForCategory(category: EntityCategory): Promise<EntityItem[]> {
		const entities = await this.library.getByCategory(category);
		return entities
			.sort((a, b) => b.updatedAt - a.updatedAt)
			.map((e) => new EntityItem(e));
	}
}

// =============================================================================
// Helpers
// =============================================================================

function getCategoryLabel(category: EntityCategory): string {
	const labels: Record<EntityCategory, string> = {
		character: 'Characters',
		creature: 'Creatures',
		object: 'Objects',
		vehicle: 'Vehicles',
		environment: 'Environments',
		effect: 'Effects',
		ui: 'UI',
		audio: 'Audio',
	};
	return labels[category] ?? category;
}

function getCategoryIcon(category: EntityCategory): string {
	const icons: Record<EntityCategory, string> = {
		character: 'person',
		creature: 'bug',
		object: 'package',
		vehicle: 'rocket',
		environment: 'globe',
		effect: 'sparkle',
		ui: 'layout',
		audio: 'unmute',
	};
	return icons[category] ?? 'file';
}
