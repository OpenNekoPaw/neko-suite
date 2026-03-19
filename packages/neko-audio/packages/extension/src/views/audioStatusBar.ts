/**
 * AudioStatusBar - Manages VSCode native status bar items for audio editor
 *
 * Shows duration, sample rate, channels, and codec in the VSCode status bar.
 * Items are only visible when an audio editor is active.
 */
import * as vscode from 'vscode';

// ===========
// Types
// ===========

export interface AudioStatusInfo {
  duration: number;
  sampleRate: number;
  channels: number;
  codec: string;
  bitrate?: number;
}

// ===========
// Manager
// ===========

export class AudioStatusBar implements vscode.Disposable {
  private durationItem: vscode.StatusBarItem;
  private sampleRateItem: vscode.StatusBarItem;
  private channelsItem: vscode.StatusBarItem;
  private codecItem: vscode.StatusBarItem;

  constructor() {
    this.durationItem = vscode.window.createStatusBarItem(
      'neko.audio.duration',
      vscode.StatusBarAlignment.Left,
      100,
    );
    this.durationItem.name = 'Audio Duration';
    this.durationItem.tooltip = 'Audio duration';

    this.sampleRateItem = vscode.window.createStatusBarItem(
      'neko.audio.sampleRate',
      vscode.StatusBarAlignment.Left,
      99,
    );
    this.sampleRateItem.name = 'Sample Rate';
    this.sampleRateItem.tooltip = 'Audio sample rate';

    this.channelsItem = vscode.window.createStatusBarItem(
      'neko.audio.channels',
      vscode.StatusBarAlignment.Left,
      98,
    );
    this.channelsItem.name = 'Audio Channels';
    this.channelsItem.tooltip = 'Audio channels';

    this.codecItem = vscode.window.createStatusBarItem(
      'neko.audio.codec',
      vscode.StatusBarAlignment.Left,
      97,
    );
    this.codecItem.name = 'Audio Codec';
    this.codecItem.tooltip = 'Audio codec and bitrate';
  }

  /** Update all status bar items with current audio info */
  update(info: AudioStatusInfo): void {
    this.durationItem.text = `$(clock) ${this.formatDuration(info.duration)}`;
    this.sampleRateItem.text = `$(pulse) ${(info.sampleRate / 1000).toFixed(1)} kHz`;
    this.channelsItem.text = `$(unmute) ${info.channels === 1 ? 'Mono' : info.channels === 2 ? 'Stereo' : `${info.channels}ch`}`;

    const bitrateStr = info.bitrate
      ? ` · ${info.bitrate >= 1000000 ? `${(info.bitrate / 1000000).toFixed(1)} Mbps` : `${(info.bitrate / 1000).toFixed(0)} kbps`}`
      : '';
    this.codecItem.text = `$(file-binary) ${info.codec}${bitrateStr}`;
  }

  /** Show all status bar items */
  show(): void {
    this.durationItem.show();
    this.sampleRateItem.show();
    this.channelsItem.show();
    this.codecItem.show();
  }

  /** Hide all status bar items */
  hide(): void {
    this.durationItem.hide();
    this.sampleRateItem.hide();
    this.channelsItem.hide();
    this.codecItem.hide();
  }

  dispose(): void {
    this.durationItem.dispose();
    this.sampleRateItem.dispose();
    this.channelsItem.dispose();
    this.codecItem.dispose();
  }

  private formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
}
