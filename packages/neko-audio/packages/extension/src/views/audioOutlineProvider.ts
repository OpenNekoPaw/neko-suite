/**
 * AudioOutlineProvider - TreeDataProvider for audio file outline
 *
 * Displays audio metadata, format info, and stream details in the Explorer sidebar.
 * Updates automatically when audio data changes via postMessage.
 */
import * as vscode from 'vscode';
import { BaseOutlineProvider } from '@neko/shared/vscode/extension';

// ==============
// Types
// ========================

export interface AudioOutlineData {
  fileName: string;
  format: {
    formatName: string;
    duration: number;
    bitrate: number;
    size: number;
  };
  streams: Array<{
    index: number;
    codecName: string;
    codecType: string;
    sampleRate?: number;
    channels?: number;
    bitrate?: number;
  }>;
}

// ==========================
// Tree Items
// ===================

type OutlineElement =
  | { kind: 'root'; category: 'format' | 'streams' }
  | { kind: 'format-item'; label: string; value: string }
  | { kind: 'stream'; stream: AudioOutlineData['streams'][0] }
  | { kind: 'stream-item'; label: string; value: string };

// ==================
// Provider
// ===========================
export class AudioOutlineProvider extends BaseOutlineProvider<OutlineElement, AudioOutlineData> {
  getTreeItem(element: OutlineElement): vscode.TreeItem {
    switch (element.kind) {
      case 'root': {
        const isFormat = element.category === 'format';
        const count = isFormat ? 4 : (this.data?.streams.length ?? 0);
        const item = new vscode.TreeItem(
          isFormat ? 'Format' : `Streams (${count})`,
          vscode.TreeItemCollapsibleState.Expanded,
        );
        item.iconPath = isFormat ? new vscode.ThemeIcon('info') : new vscode.ThemeIcon('layers');
        item.contextValue = element.category;
        return item;
      }

      case 'format-item': {
        const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
        item.description = element.value;
        item.iconPath = new vscode.ThemeIcon('symbol-property');
        return item;
      }

      case 'stream': {
        const { stream } = element;
        const label = `Stream #${stream.index}: ${stream.codecType}`;
        const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.Collapsed);
        item.iconPath = new vscode.ThemeIcon('symbol-class');
        item.description = stream.codecName;
        item.tooltip = `${stream.codecType} stream (${stream.codecName})`;
        item.contextValue = 'audioStream';
        return item;
      }

      case 'stream-item': {
        const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
        item.description = element.value;
        item.iconPath = new vscode.ThemeIcon('symbol-property');
        return item;
      }
    }
  }

  getChildren(element?: OutlineElement): OutlineElement[] {
    if (!this.data) return [];

    // Root level: show categories
    if (!element) {
      return [
        { kind: 'root', category: 'format' },
        { kind: 'root', category: 'streams' },
      ];
    }

    // Category level
    if (element.kind === 'root') {
      if (element.category === 'format') {
        return [
          { kind: 'format-item', label: 'Format', value: this.data.format.formatName },
          {
            kind: 'format-item',
            label: 'Duration',
            value: this.formatDuration(this.data.format.duration),
          },
          {
            kind: 'format-item',
            label: 'Bitrate',
            value: this.formatBitrate(this.data.format.bitrate),
          },
          { kind: 'format-item', label: 'Size', value: this.formatSize(this.data.format.size) },
        ];
      }
      return this.data.streams.map((stream) => ({ kind: 'stream', stream }));
    }

    // Stream level: show stream properties
    if (element.kind === 'stream') {
      const { stream } = element;
      const items: OutlineElement[] = [
        { kind: 'stream-item', label: 'Codec', value: stream.codecName },
        { kind: 'stream-item', label: 'Type', value: stream.codecType },
      ];
      if (stream.sampleRate) {
        items.push({ kind: 'stream-item', label: 'Sample Rate', value: `${stream.sampleRate} Hz` });
      }
      if (stream.channels) {
        items.push({ kind: 'stream-item', label: 'Channels', value: String(stream.channels) });
      }
      if (stream.bitrate) {
        items.push({
          kind: 'stream-item',
          label: 'Bitrate',
          value: this.formatBitrate(stream.bitrate),
        });
      }
      return items;
    }

    return [];
  }

  // ==============
  // Helpers
  // ==============

  private formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  private formatBitrate(bitrate: number): string {
    if (bitrate >= 1000000) return `${(bitrate / 1000000).toFixed(1)} Mbps`;
    return `${(bitrate / 1000).toFixed(0)} kbps`;
  }

  private formatSize(bytes: number): string {
    if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(2)} GB`;
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(2)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${bytes} B`;
  }
}
