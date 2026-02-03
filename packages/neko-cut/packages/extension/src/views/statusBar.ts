import * as vscode from 'vscode';
import { createServiceId } from '../base';

// =============================================================================
// 服务标识符
// =============================================================================

export const IStatusBar = createServiceId<IStatusBar>('statusBar');

// =============================================================================
// 接口定义
// =============================================================================

interface StatusInfo {
  currentTime: number;
  totalDuration: number;
  trackCount: number;
  elementCount: number;
  isPlaying: boolean;
  fps: number;
}

/** Export progress info for status bar */
export interface ExportStatusInfo {
  /** Is export in progress */
  isExporting: boolean;
  /** Progress percentage (0-100) */
  percent: number;
  /** Current stage message */
  message: string;
  /** Current frame / total frames */
  currentFrame?: number;
  totalFrames?: number;
  /** Processing FPS */
  currentFps?: number;
  /** Estimated time remaining in ms */
  estimatedTimeRemaining?: number;
}

export interface IStatusBar extends vscode.Disposable {
  show(): void;
  hide(): void;
  update(info: StatusInfo): void;
  updateExportProgress(info: ExportStatusInfo): void;
}

// =============================================================================
// 实现
// =============================================================================

export class StatusBar implements IStatusBar {
  private timeItem: vscode.StatusBarItem;
  private infoItem: vscode.StatusBarItem;
  private playStateItem: vscode.StatusBarItem;
  private exportItem: vscode.StatusBarItem;
  private isActive: boolean = false;

  constructor() {
    // Create status bar items with decreasing priority (left to right)
    this.playStateItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
    this.playStateItem.name = 'UniEdit Play State';

    this.timeItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      99
    );
    this.timeItem.name = 'UniEdit Timeline';

    this.infoItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      98
    );
    this.infoItem.name = 'UniEdit Info';

    // Export progress item - right aligned for visibility
    this.exportItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      1000
    );
    this.exportItem.name = 'UniEdit Export';
    this.exportItem.command = 'uniedit.showExportPanel';
  }

  public show(): void {
    this.isActive = true;
    this.playStateItem.show();
    this.timeItem.show();
    this.infoItem.show();
  }

  public hide(): void {
    this.isActive = false;
    this.playStateItem.hide();
    this.timeItem.hide();
    this.infoItem.hide();
  }

  public update(info: StatusInfo): void {
    if (!this.isActive) return;

    // Format time as MM:SS.ms
    const formatTime = (seconds: number): string => {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      const ms = Math.floor((seconds % 1) * 100);
      return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
    };

    // Play state
    if (info.isPlaying) {
      this.playStateItem.text = '$(debug-pause) Playing';
      this.playStateItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    } else {
      this.playStateItem.text = '$(play) Paused';
      this.playStateItem.backgroundColor = undefined;
    }
    this.playStateItem.tooltip = info.isPlaying ? 'Video is playing' : 'Video is paused';

    // Time display
    this.timeItem.text = `$(clock) ${formatTime(info.currentTime)} / ${formatTime(info.totalDuration)}`;
    this.timeItem.tooltip = `Current: ${formatTime(info.currentTime)}\nTotal: ${formatTime(info.totalDuration)}\nFPS: ${info.fps}`;

    // Track and element info
    this.infoItem.text = `$(layers) ${info.trackCount} tracks $(file-media) ${info.elementCount} elements`;
    this.infoItem.tooltip = `Tracks: ${info.trackCount}\nElements: ${info.elementCount}`;
  }

  public updateExportProgress(info: ExportStatusInfo): void {
    if (!info.isExporting) {
      this.exportItem.hide();
      return;
    }

    // Show export progress
    this.exportItem.show();

    const percent = Math.round(info.percent);

    // Build progress bar (10 chars)
    const filled = Math.floor(percent / 10);
    const progressBar = '█'.repeat(filled) + '░'.repeat(10 - filled);

    // Build text
    this.exportItem.text = `$(sync~spin) 导出中 ${progressBar} ${percent}%`;

    // Build tooltip with detailed info
    const tooltipLines = [info.message];

    if (info.currentFrame !== undefined && info.totalFrames !== undefined) {
      tooltipLines.push(`帧: ${info.currentFrame}/${info.totalFrames}`);
    }

    if (info.currentFps !== undefined && info.currentFps > 0) {
      tooltipLines.push(`速度: ${info.currentFps.toFixed(1)} fps`);
    }

    if (info.estimatedTimeRemaining !== undefined && info.estimatedTimeRemaining > 0) {
      const seconds = Math.ceil(info.estimatedTimeRemaining / 1000);
      if (seconds < 60) {
        tooltipLines.push(`剩余: 约 ${seconds} 秒`);
      } else {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        tooltipLines.push(`剩余: 约 ${mins}分${secs}秒`);
      }
    }

    tooltipLines.push('', '点击查看详情');

    this.exportItem.tooltip = tooltipLines.join('\n');
    this.exportItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  }

  public dispose(): void {
    this.playStateItem.dispose();
    this.timeItem.dispose();
    this.infoItem.dispose();
    this.exportItem.dispose();
  }
}
