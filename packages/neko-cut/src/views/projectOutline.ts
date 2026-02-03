/**
 * Project Outline Provider - Tree view for project structure
 */
import * as vscode from 'vscode';

interface OutlineItem {
  id: string;
  label: string;
  type: 'project' | 'track' | 'element';
  children?: OutlineItem[];
  icon?: string;
}

export class ProjectOutlineProvider implements vscode.TreeDataProvider<OutlineItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<OutlineItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private items: OutlineItem[] = [];

  constructor() {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  updateItems(items: OutlineItem[]): void {
    this.items = items;
    this.refresh();
  }

  getTreeItem(element: OutlineItem): vscode.TreeItem {
    const treeItem = new vscode.TreeItem(
      element.label,
      element.children && element.children.length > 0
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.None
    );

    treeItem.id = element.id;
    treeItem.contextValue = element.type;

    // Set icon based on type
    switch (element.type) {
      case 'project':
        treeItem.iconPath = new vscode.ThemeIcon('folder');
        break;
      case 'track':
        treeItem.iconPath = new vscode.ThemeIcon('layers');
        break;
      case 'element':
        treeItem.iconPath = this.getElementIcon(element.icon);
        break;
    }

    // Make elements clickable
    if (element.type === 'element') {
      treeItem.command = {
        command: 'neko.outline.selectElement',
        title: 'Select Element',
        arguments: [element.id],
      };
    }

    return treeItem;
  }

  getChildren(element?: OutlineItem): OutlineItem[] {
    if (!element) {
      return this.items;
    }
    return element.children || [];
  }

  getParent(element: OutlineItem): OutlineItem | undefined {
    // Find parent by searching through items
    const findParent = (items: OutlineItem[], target: OutlineItem): OutlineItem | undefined => {
      for (const item of items) {
        if (item.children?.some((child) => child.id === target.id)) {
          return item;
        }
        if (item.children) {
          const parent = findParent(item.children, target);
          if (parent) return parent;
        }
      }
      return undefined;
    };
    return findParent(this.items, element);
  }

  private getElementIcon(iconType?: string): vscode.ThemeIcon {
    switch (iconType) {
      case 'video':
        return new vscode.ThemeIcon('device-camera-video');
      case 'audio':
        return new vscode.ThemeIcon('unmute');
      case 'image':
        return new vscode.ThemeIcon('file-media');
      case 'text':
        return new vscode.ThemeIcon('symbol-text');
      case 'shape':
        return new vscode.ThemeIcon('symbol-misc');
      default:
        return new vscode.ThemeIcon('primitive-square');
    }
  }
}
