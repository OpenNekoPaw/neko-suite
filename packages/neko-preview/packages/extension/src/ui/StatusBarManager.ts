/**
 * StatusBarManager - VSCode status bar integration for media preview
 *
 * Displays playback state and media info in the bottom status bar.
 * Format: $(icon) filename | codec details | time / duration
 */

import * as vscode from 'vscode';

export interface StatusBarMediaInfo {
  fileName: string;
  codec?: string;
  width?: number;
  height?: number;
  fps?: number;
  audioCodec?: string;
  audioSampleRate?: number;
  audioChannels?: number;
  duration: number;
}

type PlaybackState = 'playing' | 'paused' | 'stopped';

export class StatusBarManager implements vscode.Disposable {
  private readonly _statusItem: vscode.StatusBarItem;
  private _mediaInfo: StatusBarMediaInfo | null = null;
  private _playbackState: PlaybackState = 'stopped';
  private _currentTime = 0;

  constructor() {
    this._statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  }

  // =========================================================================
  // Public API
  // =========================================================================

  show(info: StatusBarMediaInfo): void {
    this._mediaInfo = info;
    this._playbackState = 'stopped';
    this._currentTime = 0;
    this.render();
    this._statusItem.show();
  }

  hide(): void {
    this._statusItem.hide();
    this._mediaInfo = null;
  }

  updatePlayback(state: PlaybackState, currentTime: number): void {
    this._playbackState = state;
    this._currentTime = currentTime;
    this.render();
  }

  // =========================================================================
  // Rendering
  // =========================================================================

  private render(): void {
    if (!this._mediaInfo) return;

    const icon = this.getIcon();
    const details = this.buildDetails();
    const time = `${this.formatTime(this._currentTime)} / ${this.formatTime(this._mediaInfo.duration)}`;

    this._statusItem.text = `${icon} ${this._mediaInfo.fileName} | ${details} | ${time}`;
    this._statusItem.tooltip = `Neko Preview: ${this._mediaInfo.fileName}`;
  }

  private getIcon(): string {
    switch (this._playbackState) {
      case 'playing':
        return '$(play)';
      case 'paused':
        return '$(debug-pause)';
      default:
        return '$(file-media)';
    }
  }

  private buildDetails(): string {
    const info = this._mediaInfo!;
    const parts: string[] = [];

    // Video info
    if (info.codec && info.width && info.height) {
      const resolution = `${info.width}x${info.height}`;
      const fps = info.fps ? ` ${Math.round(info.fps)}fps` : '';
      parts.push(`${info.codec.toUpperCase()} ${resolution}${fps}`);
    }

    // Audio info
    if (info.audioCodec) {
      const sr = info.audioSampleRate ? ` ${(info.audioSampleRate / 1000).toFixed(1)}kHz` : '';
      const ch =
        info.audioChannels === 1
          ? ' Mono'
          : info.audioChannels === 2
            ? ' Stereo'
            : info.audioChannels
              ? ` ${info.audioChannels}ch`
              : '';
      parts.push(`${info.audioCodec.toUpperCase()}${sr}${ch}`);
    }

    return parts.join(' | ') || 'Media';
  }

  private formatTime(seconds: number): string {
    if (!isFinite(seconds) || seconds < 0) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  // =========================================================================
  // Disposal
  // =========================================================================

  dispose(): void {
    this._statusItem.dispose();
  }
}
