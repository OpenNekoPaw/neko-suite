/**
 * Sketch Status Bar - shows canvas info in VSCode status bar
 */
import * as vscode from 'vscode';
import type { SketchStatusInfo } from '../types';

export class SketchStatusBar implements vscode.Disposable {
  private readonly items: vscode.StatusBarItem[] = [];
  private readonly zoomItem: vscode.StatusBarItem;
  private readonly sizeItem: vscode.StatusBarItem;
  private readonly toolItem: vscode.StatusBarItem;
  private readonly layerItem: vscode.StatusBarItem;

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
  }

  update(info: SketchStatusInfo): void {
    this.zoomItem.text = `$(zoom-in) ${Math.round(info.zoom * 100)}%`;
    this.sizeItem.text = `$(screen-full) ${info.canvasSize}`;
    this.toolItem.text = `$(paintcan) ${info.activeTool}`;
    this.layerItem.text = `$(layers) ${info.layerCount} layers`;
  }

  show(): void {
    this.items.forEach((item) => item.show());
  }

  hide(): void {
    this.items.forEach((item) => item.hide());
  }

  dispose(): void {
    this.items.forEach((item) => item.dispose());
  }
}
