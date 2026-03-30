/**
 * CanvasOutlineProvider - TreeDataProvider for canvas outline
 *
 * Displays a semantically grouped tree of canvas nodes in the Explorer sidebar:
 *   Scenes (with child Shots nested inside)
 *   Shots (standalone, not belonging to any scene)
 *   Galleries
 *   Media
 *   Annotations
 *   Connections
 *
 * Updates automatically when canvas data changes via postMessage.
 */
import * as vscode from 'vscode';
import { BaseOutlineProvider } from '@neko/shared/vscode/extension';

// =============================================================================
// Types (lightweight copies to avoid importing webview types)
// =============================================================================

interface CanvasNodeInfo {
  id: string;
  type: string;
  label: string;
  detail?: string;
  locked?: boolean;
  /** For scene nodes: ordered shot ids contained in this scene */
  shotIds?: string[];
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
// Outline groups
// =============================================================================

type OutlineCategory =
  | 'scenes'
  | 'shots'
  | 'galleries'
  | 'media'
  | 'annotations'
  | 'other'
  | 'connections';

const CATEGORY_META: Record<OutlineCategory, { label: string; icon: string }> = {
  scenes: { label: '场景', icon: 'symbol-class' },
  shots: { label: '镜头', icon: 'device-camera-video' },
  galleries: { label: '画廊', icon: 'file-media' },
  media: { label: '媒体', icon: 'file-media' },
  annotations: { label: '标注', icon: 'edit' },
  other: { label: '其他', icon: 'symbol-misc' },
  connections: { label: '连接', icon: 'git-merge' },
};

// =============================================================================
// Tree Items
// =============================================================================

type OutlineElement =
  | { kind: 'category'; category: OutlineCategory; count: number }
  | { kind: 'node'; node: CanvasNodeInfo }
  | { kind: 'shot-child'; node: CanvasNodeInfo; parentSceneId: string }
  | { kind: 'connection'; connection: CanvasConnectionInfo };

// =============================================================================
// Icons
// =============================================================================

const NODE_ICONS: Record<string, vscode.ThemeIcon> = {
  media: new vscode.ThemeIcon('file-media'),
  storyboard: new vscode.ThemeIcon('note'),
  annotation: new vscode.ThemeIcon('edit'),
  text: new vscode.ThemeIcon('edit'),
  group: new vscode.ThemeIcon('symbol-folder'),
  shot: new vscode.ThemeIcon('device-camera-video'),
  scene: new vscode.ThemeIcon('symbol-class'),
  gallery: new vscode.ThemeIcon('file-media'),
  script: new vscode.ThemeIcon('file-code'),
  document: new vscode.ThemeIcon('file-text'),
  model: new vscode.ThemeIcon('package'),
  artboard: new vscode.ThemeIcon('browser'),
  'canvas-embed': new vscode.ThemeIcon('window'),
};

// =============================================================================
// Provider
// =============================================================================

export class CanvasOutlineProvider extends BaseOutlineProvider<OutlineElement, CanvasOutlineData> {
  /** Shot IDs that belong to a scene (computed on data update) */
  private containedShotIds = new Set<string>();
  /** Quick lookup: nodeId → CanvasNodeInfo */
  private nodeMap = new Map<string, CanvasNodeInfo>();

  // Recompute grouping data when outline data is updated
  protected override onDataUpdated(_data: CanvasOutlineData | null): void {
    this.containedShotIds.clear();
    this.nodeMap.clear();
    const data = this.data;
    if (!data) return;
    for (const n of data.nodes) {
      this.nodeMap.set(n.id, n);
      if (n.type === 'scene' && n.shotIds) {
        for (const sid of n.shotIds) {
          this.containedShotIds.add(sid);
        }
      }
    }
  }

  getTreeItem(element: OutlineElement): vscode.TreeItem {
    switch (element.kind) {
      case 'category': {
        const meta = CATEGORY_META[element.category];
        const item = new vscode.TreeItem(
          `${meta.label} (${element.count})`,
          element.count > 0
            ? vscode.TreeItemCollapsibleState.Expanded
            : vscode.TreeItemCollapsibleState.Collapsed,
        );
        item.iconPath = new vscode.ThemeIcon(meta.icon);
        item.contextValue = element.category;
        return item;
      }

      case 'node':
      case 'shot-child': {
        const { node } = element;
        const hasChildren = node.type === 'scene' && (node.shotIds?.length ?? 0) > 0;
        const item = new vscode.TreeItem(
          node.label,
          hasChildren
            ? vscode.TreeItemCollapsibleState.Expanded
            : vscode.TreeItemCollapsibleState.None,
        );
        item.iconPath = NODE_ICONS[node.type] ?? new vscode.ThemeIcon('circle-outline');
        item.description = node.detail;
        item.tooltip = `${node.type}: ${node.label}${node.locked ? ' 🔒' : ''}`;
        item.contextValue = 'canvasNode';
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
        const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
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

    // Root: show categories (only those with items)
    if (!element) {
      const nodes = this.data.nodes;
      const scenes = nodes.filter((n) => n.type === 'scene');
      const standaloneShots = nodes.filter(
        (n) => n.type === 'shot' && !this.containedShotIds.has(n.id),
      );
      const galleries = nodes.filter((n) => n.type === 'gallery');
      const media = nodes.filter((n) => n.type === 'media');
      const annotations = nodes.filter((n) => n.type === 'annotation' || n.type === 'text');
      const other = nodes.filter(
        (n) => !['scene', 'shot', 'gallery', 'media', 'annotation', 'text'].includes(n.type),
      );
      const conns = this.data.connections;

      const cats: OutlineElement[] = [];
      if (scenes.length > 0)
        cats.push({ kind: 'category', category: 'scenes', count: scenes.length });
      if (standaloneShots.length > 0)
        cats.push({ kind: 'category', category: 'shots', count: standaloneShots.length });
      if (galleries.length > 0)
        cats.push({ kind: 'category', category: 'galleries', count: galleries.length });
      if (media.length > 0) cats.push({ kind: 'category', category: 'media', count: media.length });
      if (annotations.length > 0)
        cats.push({ kind: 'category', category: 'annotations', count: annotations.length });
      if (other.length > 0) cats.push({ kind: 'category', category: 'other', count: other.length });
      if (conns.length > 0)
        cats.push({ kind: 'category', category: 'connections', count: conns.length });
      return cats;
    }

    // Category → children
    if (element.kind === 'category') {
      const nodes = this.data.nodes;
      switch (element.category) {
        case 'scenes':
          return nodes
            .filter((n) => n.type === 'scene')
            .map((node) => ({ kind: 'node' as const, node }));
        case 'shots':
          return nodes
            .filter((n) => n.type === 'shot' && !this.containedShotIds.has(n.id))
            .map((node) => ({ kind: 'node' as const, node }));
        case 'galleries':
          return nodes
            .filter((n) => n.type === 'gallery')
            .map((node) => ({ kind: 'node' as const, node }));
        case 'media':
          return nodes
            .filter((n) => n.type === 'media')
            .map((node) => ({ kind: 'node' as const, node }));
        case 'annotations':
          return nodes
            .filter((n) => n.type === 'annotation' || n.type === 'text')
            .map((node) => ({ kind: 'node' as const, node }));
        case 'other':
          return nodes
            .filter(
              (n) => !['scene', 'shot', 'gallery', 'media', 'annotation', 'text'].includes(n.type),
            )
            .map((node) => ({ kind: 'node' as const, node }));
        case 'connections':
          return this.data.connections.map((connection) => ({
            kind: 'connection' as const,
            connection,
          }));
      }
    }

    // Scene node → child shots
    if (
      (element.kind === 'node' || element.kind === 'shot-child') &&
      element.node.type === 'scene'
    ) {
      const shotIds = element.node.shotIds ?? [];
      return shotIds
        .map((sid) => this.nodeMap.get(sid))
        .filter((n): n is CanvasNodeInfo => n !== undefined)
        .map((node) => ({
          kind: 'shot-child' as const,
          node,
          parentSceneId: element.node.id,
        }));
    }

    return [];
  }
}
