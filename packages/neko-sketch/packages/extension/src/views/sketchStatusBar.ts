/**
 * Sketch Status Bar - shows canvas info and workflow buttons in VSCode status bar
 */
import * as vscode from 'vscode';
import type { SketchStatusInfo } from '../types';
import type { SketchImportContext } from '@neko/shared';

export class SketchStatusBar implements vscode.Disposable {
  private readonly items: vscode.StatusBarItem[] = [];

  // Canvas info items (always visible while editor is open)
  private readonly zoomItem: vscode.StatusBarItem;
  private readonly sizeItem: vscode.StatusBarItem;
  private readonly toolItem: vscode.StatusBarItem;
  private readonly layerItem: vscode.StatusBarItem;

  // Phase 2: workflow items (only visible when import context is set)
  private readonly backToSourceItem: vscode.StatusBarItem;
  private readonly sendToTimelineItem: vscode.StatusBarItem;

  constructor() {
    this.zoomItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 200);
    this.zoomItem.command = 'neko.sketch.resetZoom';
    this.zoomItem.tooltip = 'Click to reset zoom';
    this.items.push(this.zoomItem);

    this.sizeItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 199);
    this.items.push(this.sizeItem);

    this.toolItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 198);
    this.items.push(this.toolItem);

    this.layerItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 197);
    this.items.push(this.layerItem);

    // Workflow buttons (Left side so they stand out)
    this.backToSourceItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.backToSourceItem.command = 'neko.sketch.sendToCanvas';
    this.items.push(this.backToSourceItem);

    this.sendToTimelineItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
    this.sendToTimelineItem.text = '$(arrow-right) Send to Timeline';
    this.sendToTimelineItem.tooltip = 'Export canvas and add to Cut timeline';
    this.sendToTimelineItem.command = 'neko.sketch.sendToTimeline';
    this.items.push(this.sendToTimelineItem);
  }

  update(info: SketchStatusInfo): void {
    this.zoomItem.text = `$(zoom-in) ${Math.round(info.zoom * 100)}%`;
    this.sizeItem.text = `$(screen-full) ${info.canvasSize}`;
    this.toolItem.text = `$(paintcan) ${info.activeTool}`;
    this.layerItem.text = `$(layers) ${info.layerCount} layers`;
  }

  /** Show/update the context-aware workflow buttons */
  updateContext(context: SketchImportContext): void {
    const sourceLabel =
      context.source === 'canvas'
        ? `Canvas Shot-${String(context.metadata?.['shotNumber'] ?? '?')}`
        : context.source === 'cut'
          ? 'Cut Clip'
          : context.source;

    this.backToSourceItem.text = `$(arrow-left) Back to ${sourceLabel}`;
    this.backToSourceItem.tooltip = `Send edited image back to ${sourceLabel}`;
    this.backToSourceItem.show();
    this.sendToTimelineItem.show();
  }

  show(): void {
    this.zoomItem.show();
    this.sizeItem.show();
    this.toolItem.show();
    this.layerItem.show();
    // Workflow buttons are shown only when updateContext() is called
  }

  hide(): void {
    this.items.forEach((item) => item.hide());
  }

  dispose(): void {
    this.items.forEach((item) => item.dispose());
  }
}
