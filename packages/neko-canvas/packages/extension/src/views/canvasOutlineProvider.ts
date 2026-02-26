/**
 * CanvasOutlineProvider - TreeDataProvider for canvas node outline
 *
 * Displays a tree of canvas nodes and connections in the Explorer sidebar.
 * Updates automatically when canvas data changes via postMessage.
 */
import * as vscode from 'vscode';
import { BaseOutlineProvider } from '@neko/shared/vscode/extension';

// =============================================================================
// Types (lightweight copies to avoid importing webview types)
// =============================================================================

interface CanvasNodeInfo {
  id: string;
  type: 'media' | 'storyboard' | 'annotation' | 'group';
  label: string;
  detail?: string;
  locked?: boolean;
}

interface CanvasConnectionInfo {
  id: string;
  sourceLabel: string;
  targetLabel: string;
  label?: string;
}

export interface CanvasOutlineData {
  name: string;
  nodes: CanvasNodeInfo[];
  connections: CanvasConnectionInfo[];
}

// =============================================================================
// Tree Items
// =============================================================================

type OutlineElement =
  | { kind: 'root'; category: 'nodes' | 'connections' }
  | { kind: 'node'; node: CanvasNodeInfo }
  | { kind: 'connection'; connection: CanvasConnectionInfo };

// =============================================================================
// Icons
// =============================================================================

const NODE_ICONS: Record<string, vscode.ThemeIcon> = {
  media: new vscode.ThemeIcon('file-media'),
  storyboard: new vscode.ThemeIcon('note'),
  annotation: new vscode.ThemeIcon('edit'),
  group: new vscode.ThemeIcon('symbol-folder'),
};

// =============================================================================
// Provider
// =============================================================================

export class CanvasOutlineProvider extends BaseOutlineProvider<OutlineElement, CanvasOutlineData> {
  getTreeItem(element: OutlineElement): vscode.TreeItem {
    switch (element.kind) {
      case 'root': {
        const isNodes = element.category === 'nodes';
        const count = isNodes
          ? (this.data?.nodes.length ?? 0)
          : (this.data?.connections.length ?? 0);
        const item = new vscode.TreeItem(
          isNodes ? `Nodes (${count})` : `Connections (${count})`,
          vscode.TreeItemCollapsibleState.Expanded,
        );
        item.iconPath = isNodes
          ? new vscode.ThemeIcon('symbol-class')
          : new vscode.ThemeIcon('git-merge');
        item.contextValue = element.category;
        return item;
      }

      case 'node': {
        const { node } = element;
        const item = new vscode.TreeItem(
          node.label,
          vscode.TreeItemCollapsibleState.None,
        );
        item.iconPath = NODE_ICONS[node.type] ?? new vscode.ThemeIcon('circle-outline');
        item.description = node.detail;
        item.tooltip = `${node.type}: ${node.label}${node.locked ? ' 🔒' : ''}`;
        item.contextValue = 'canvasNode';
        // Click to select node in canvas
        item.command = {
          command: 'neko.canvas.selectNodeFromOutline',
          title: 'Select Node',
          arguments: [node.id],
        };
        return item;
      }

      case 'connection': {
        const { connection } = element;
        const label = connection.label
          ? `${connection.sourceLabel} → ${connection.targetLabel} (${connection.label})`
          : `${connection.sourceLabel} → ${connection.targetLabel}`;
        const item = new vscode.TreeItem(
          label,
          vscode.TreeItemCollapsibleState.None,
        );
        item.iconPath = new vscode.ThemeIcon('arrow-right');
        item.contextValue = 'canvasConnection';
        item.command = {
          command: 'neko.canvas.selectConnectionFromOutline',
          title: 'Select Connection',
          arguments: [connection.id],
        };
        return item;
      }
    }
  }

  getChildren(element?: OutlineElement): OutlineElement[] {
    if (!this.data) return [];

    // Root level: show categories
    if (!element) {
      return [
        { kind: 'root', category: 'nodes' },
        { kind: 'root', category: 'connections' },
      ];
    }

    // Category level: show items
    if (element.kind === 'root') {
      if (element.category === 'nodes') {
        return this.data.nodes.map((node) => ({ kind: 'node', node }));
      }
      return this.data.connections.map((connection) => ({ kind: 'connection', connection }));
    }

    return [];
  }
}
