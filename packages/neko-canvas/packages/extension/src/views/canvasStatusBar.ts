/**
 * CanvasStatusBar - Manages VSCode native status bar items for canvas editor
 *
 * Shows node count, connection count, and zoom level in the VSCode status bar.
 * Items are only visible when a canvas editor is active.
 */
import * as vscode from 'vscode';
import { StatusBarGroup } from '@neko/shared/vscode/extension';

// =============================================================================
// Types
// =============================================================================

export interface CanvasStatusInfo {
  nodeCount: number;
  connectionCount: number;
  zoom: number;
  selectedCount: number;
  subsystemSummary?: string;
}

// =============================================================================
// IDs
// =============================================================================

const ID = {
  nodeCount: 'neko.canvas.nodeCount',
  connectionCount: 'neko.canvas.connectionCount',
  zoom: 'neko.canvas.zoom',
  selection: 'neko.canvas.selection',
  subsystems: 'neko.canvas.subsystems',
} as const;

// =============================================================================
// Manager
// =============================================================================

export class CanvasStatusBar implements vscode.Disposable {
  private readonly group: StatusBarGroup;

  constructor() {
    this.group = new StatusBarGroup([
      {
        id: ID.nodeCount,
        alignment: vscode.StatusBarAlignment.Left,
        priority: 100,
        name: 'Canvas Nodes',
        tooltip: 'Number of nodes on canvas',
      },
      {
        id: ID.connectionCount,
        alignment: vscode.StatusBarAlignment.Left,
        priority: 99,
        name: 'Canvas Connections',
        tooltip: 'Number of connections',
      },
      {
        id: ID.zoom,
        alignment: vscode.StatusBarAlignment.Right,
        priority: 101,
        name: 'Canvas Zoom',
        tooltip: 'Canvas zoom level (click to reset)',
        command: 'neko.canvas.resetZoom',
      },
      {
        id: ID.selection,
        alignment: vscode.StatusBarAlignment.Left,
        priority: 98,
        name: 'Canvas Selection',
        tooltip: 'Selected items',
        visible: 'conditional',
      },
      {
        id: ID.subsystems,
        alignment: vscode.StatusBarAlignment.Left,
        priority: 97,
        name: 'Canvas Subsystems',
        tooltip: 'Active Canvas subsystems',
        visible: 'conditional',
      },
    ]);
  }

  /** Update all status bar items with current canvas info */
  update(info: CanvasStatusInfo): void {
    this.group.update(ID.nodeCount, `$(symbol-class) ${info.nodeCount} nodes`);
    this.group.update(ID.connectionCount, `$(git-merge) ${info.connectionCount}`);
    this.group.update(ID.zoom, `$(zoom-in) ${Math.round(info.zoom * 100)}%`);

    if (info.selectedCount > 0) {
      this.group.update(ID.selection, `$(check) ${info.selectedCount} selected`);
      this.group.setVisible(ID.selection, true);
    } else {
      this.group.setVisible(ID.selection, false);
    }

    if (info.subsystemSummary) {
      this.group.update(ID.subsystems, `$(symbol-namespace) ${info.subsystemSummary}`);
      this.group.setVisible(ID.subsystems, true);
    } else {
      this.group.setVisible(ID.subsystems, false);
    }
  }

  /** Show all status bar items (when canvas editor is active) */
  show(): void {
    this.group.show();
  }

  /** Hide all status bar items (when canvas editor is not active) */
  hide(): void {
    this.group.hide();
  }

  dispose(): void {
    this.group.dispose();
  }
}
