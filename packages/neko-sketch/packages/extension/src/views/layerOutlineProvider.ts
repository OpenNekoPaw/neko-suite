/**
 * Layer Outline Provider - TreeView for sketch layers
 */
import * as vscode from 'vscode';
import type { LayerOutlineData, LayerOutlineEntry } from '../types';

class LayerTreeItem extends vscode.TreeItem {
  constructor(
    public readonly entry: LayerOutlineEntry,
    public override readonly collapsibleState: vscode.TreeItemCollapsibleState,
  ) {
    super(entry.name, collapsibleState);
    this.id = entry.id;
    this.contextValue = entry.type;

    // Icon based on layer type
    const iconMap: Record<string, string> = {
      raster: 'file-media',
      group: 'folder',
      vector: 'symbol-misc',
      text: 'symbol-string',
      fill: 'paintcan',
      adjustment: 'settings',
    };
    this.iconPath = new vscode.ThemeIcon(iconMap[entry.type] ?? 'file');

    // Decorations for visibility/lock state
    const badges: string[] = [];
    if (!entry.visible) badges.push('H');
    if (entry.locked) badges.push('L');
    if (badges.length > 0) {
      this.description = badges.join(' ');
    }

    this.command = {
      command: 'neko.sketch.selectLayerFromOutline',
      title: 'Select Layer',
      arguments: [entry.id],
    };
  }
}

export class LayerOutlineProvider
  implements vscode.TreeDataProvider<LayerTreeItem>, vscode.Disposable
{
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<LayerTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private data: LayerOutlineData | null = null;

  updateData(data: LayerOutlineData | null): void {
    this.data = data;
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: LayerTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: LayerTreeItem): LayerTreeItem[] {
    if (!this.data) return [];

    const entries = element ? element.entry.children : this.data.layers;
    return entries.map(
      (entry) =>
        new LayerTreeItem(
          entry,
          entry.children.length > 0
            ? vscode.TreeItemCollapsibleState.Expanded
            : vscode.TreeItemCollapsibleState.None,
        ),
    );
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }
}
