/**
 * CanvasStatusBar - Manages VSCode native status bar items for canvas editor
 *
 * Shows node count, connection count, and zoom level in the VSCode status bar.
 * Items are only visible when a canvas editor is active.
 */
import * as vscode from 'vscode';

// =============================================================================
// Types
// =============================================================================

export interface CanvasStatusInfo {
  nodeCount: number;
  connectionCount: number;
  zoom: number;
  selectedCount: number;
}

// =============================================================================
// Manager
// =============================================================================

export class CanvasStatusBar implements vscode.Disposable {
  private nodeCountItem: vscode.StatusBarItem;
  private connectionCountItem: vscode.StatusBarItem;
  private zoomItem: vscode.StatusBarItem;
  private selectionItem: vscode.StatusBarItem;

  constructor() {
    // Create status bar items (right-aligned, lower priority = further right)
    this.nodeCountItem = vscode.window.createStatusBarItem(
      'neko.canvas.nodeCount',
      vscode.StatusBarAlignment.Left,
      100,
    );
    this.nodeCountItem.name = 'Canvas Nodes';
    this.nodeCountItem.tooltip = 'Number of nodes on canvas';

    this.connectionCountItem = vscode.window.createStatusBarItem(
      'neko.canvas.connectionCount',
      vscode.StatusBarAlignment.Left,
      99,
    );
    this.connectionCountItem.name = 'Canvas Connections';
    this.connectionCountItem.tooltip = 'Number of connections';

    this.zoomItem = vscode.window.createStatusBarItem(
      'neko.canvas.zoom',
      vscode.StatusBarAlignment.Right,
      101,
    );
    this.zoomItem.name = 'Canvas Zoom';
    this.zoomItem.tooltip = 'Canvas zoom level (click to reset)';
    this.zoomItem.command = 'neko.canvas.resetZoom';

    this.selectionItem = vscode.window.createStatusBarItem(
      'neko.canvas.selection',
      vscode.StatusBarAlignment.Left,
      98,
    );
    this.selectionItem.name = 'Canvas Selection';
    this.selectionItem.tooltip = 'Selected items';
  }

  /** Update all status bar items with current canvas info */
  update(info: CanvasStatusInfo): void {
    this.nodeCountItem.text = `$(symbol-class) ${info.nodeCount} nodes`;
    this.connectionCountItem.text = `$(git-merge) ${info.connectionCount}`;
    this.zoomItem.text = `$(zoom-in) ${Math.round(info.zoom * 100)}%`;

    if (info.selectedCount > 0) {
      this.selectionItem.text = `$(check) ${info.selectedCount} selected`;
      this.selectionItem.show();
    } else {
      this.selectionItem.hide();
    }
  }

  /** Show all status bar items (when canvas editor is active) */
  show(): void {
    this.nodeCountItem.show();
    this.connectionCountItem.show();
    this.zoomItem.show();
    // selectionItem shown conditionally in update()
  }

  /** Hide all status bar items (when canvas editor is not active) */
  hide(): void {
    this.nodeCountItem.hide();
    this.connectionCountItem.hide();
    this.zoomItem.hide();
    this.selectionItem.hide();
  }

  dispose(): void {
    this.nodeCountItem.dispose();
    this.connectionCountItem.dispose();
    this.zoomItem.dispose();
    this.selectionItem.dispose();
  }
}
