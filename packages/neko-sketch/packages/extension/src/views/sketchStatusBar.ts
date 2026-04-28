/**
 * Sketch Status Bar - shows canvas info and workflow buttons in VSCode status bar
 */
import * as vscode from 'vscode';
import { StatusBarGroup } from '@neko/shared/vscode/extension';
import type { SketchStatusInfo } from '../types';
import type { SketchImportContext } from '@neko/shared';

// =============================================================================
// IDs
// =============================================================================

const ID = {
  zoom: 'neko.sketch.zoom',
  size: 'neko.sketch.size',
  tool: 'neko.sketch.tool',
  layer: 'neko.sketch.layer',
  backToSource: 'neko.sketch.backToSource',
  sendToTimeline: 'neko.sketch.sendToTimeline',
} as const;

// =============================================================================
// Manager
// =============================================================================

export class SketchStatusBar implements vscode.Disposable {
  private readonly group: StatusBarGroup;

  constructor() {
    this.group = new StatusBarGroup([
      // Canvas info items (always visible while editor is open)
      {
        id: ID.zoom,
        alignment: vscode.StatusBarAlignment.Right,
        priority: 200,
        command: 'neko.sketch.resetZoom',
        tooltip: 'Click to reset zoom',
      },
      { id: ID.size, alignment: vscode.StatusBarAlignment.Right, priority: 199 },
      { id: ID.tool, alignment: vscode.StatusBarAlignment.Right, priority: 198 },
      { id: ID.layer, alignment: vscode.StatusBarAlignment.Right, priority: 197 },
      // Workflow items (only visible when import context is set)
      {
        id: ID.backToSource,
        alignment: vscode.StatusBarAlignment.Left,
        priority: 100,
        command: 'neko.sketch.sendToCanvas',
        visible: 'conditional',
      },
      {
        id: ID.sendToTimeline,
        alignment: vscode.StatusBarAlignment.Left,
        priority: 99,
        command: 'neko.sketch.sendToTimeline',
        tooltip: 'Export canvas and add to Cut timeline',
        visible: 'conditional',
      },
    ]);
    this.group.update(ID.sendToTimeline, '$(arrow-right) Send to Timeline');
  }

  update(info: SketchStatusInfo): void {
    const rotation = info.rotation ? ` · ${Math.round((info.rotation * 180) / Math.PI)}°` : '';
    this.group.update(ID.zoom, `$(zoom-in) ${Math.round(info.zoom * 100)}%${rotation}`);
    this.group.update(ID.size, `$(screen-full) ${info.canvasSize}`);
    this.group.update(ID.tool, `$(paintcan) ${info.activeTool}`);
    this.group.update(ID.layer, `$(layers) ${info.layerCount} layers`);
  }

  /** Show/update the context-aware workflow buttons */
  updateContext(context: SketchImportContext): void {
    const sourceLabel =
      context.source === 'canvas'
        ? `Canvas Shot-${String(context.metadata?.['shotNumber'] ?? '?')}`
        : context.source === 'cut'
          ? 'Cut Clip'
          : context.source;

    this.group.update(ID.backToSource, `$(arrow-left) Back to ${sourceLabel}`);
    const backItem = this.group.get(ID.backToSource);
    if (backItem) backItem.tooltip = `Send edited image back to ${sourceLabel}`;
    this.group.setVisible(ID.backToSource, true);
    this.group.setVisible(ID.sendToTimeline, true);
  }

  show(): void {
    this.group.show();
    // Workflow buttons are shown only when updateContext() is called
  }

  hide(): void {
    this.group.hide();
  }

  dispose(): void {
    this.group.dispose();
  }
}
