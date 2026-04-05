/**
 * AudioStatusBar - Manages VSCode native status bar items for audio editor
 *
 * Shows duration, sample rate, channels, and codec in the VSCode status bar.
 * Items are only visible when an audio editor is active.
 */
import * as vscode from 'vscode';
import { StatusBarGroup } from '@neko/shared/vscode/extension';

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
// IDs
// ===========

const ID = {
  duration: 'neko.audio.duration',
  sampleRate: 'neko.audio.sampleRate',
  channels: 'neko.audio.channels',
  codec: 'neko.audio.codec',
} as const;

// ===========
// Manager
// ===========

export class AudioStatusBar implements vscode.Disposable {
  private readonly group: StatusBarGroup;

  constructor() {
    this.group = new StatusBarGroup([
      {
        id: ID.duration,
        alignment: vscode.StatusBarAlignment.Left,
        priority: 100,
        name: 'Audio Duration',
        tooltip: 'Audio duration',
      },
      {
        id: ID.sampleRate,
        alignment: vscode.StatusBarAlignment.Left,
        priority: 99,
        name: 'Sample Rate',
        tooltip: 'Audio sample rate',
      },
      {
        id: ID.channels,
        alignment: vscode.StatusBarAlignment.Left,
        priority: 98,
        name: 'Audio Channels',
        tooltip: 'Audio channels',
      },
      {
        id: ID.codec,
        alignment: vscode.StatusBarAlignment.Left,
        priority: 97,
        name: 'Audio Codec',
        tooltip: 'Audio codec and bitrate',
      },
    ]);
  }

  /** Update all status bar items with current audio info */
  update(info: AudioStatusInfo): void {
    this.group.update(ID.duration, `$(clock) ${this.formatDuration(info.duration)}`);
    this.group.update(ID.sampleRate, `$(pulse) ${(info.sampleRate / 1000).toFixed(1)} kHz`);
    this.group.update(
      ID.channels,
      `$(unmute) ${info.channels === 1 ? 'Mono' : info.channels === 2 ? 'Stereo' : `${info.channels}ch`}`,
    );

    const bitrateStr = info.bitrate
      ? ` · ${info.bitrate >= 1000000 ? `${(info.bitrate / 1000000).toFixed(1)} Mbps` : `${(info.bitrate / 1000).toFixed(0)} kbps`}`
      : '';
    this.group.update(ID.codec, `$(file-binary) ${info.codec}${bitrateStr}`);
  }

  /** Show all status bar items */
  show(): void {
    this.group.show();
  }

  /** Hide all status bar items */
  hide(): void {
    this.group.hide();
  }

  dispose(): void {
    this.group.dispose();
  }

  private formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
}
