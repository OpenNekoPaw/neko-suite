/**
 * CanvasTimelineProvider - TimelineProvider for canvas edit history
 *
 * Shows a timeline of canvas editing operations (add/delete/move nodes, etc.)
 * in the VSCode Timeline panel.
 */
import * as vscode from 'vscode';

// =============================================================================
// Types
// =============================================================================

export interface CanvasTimelineEntry {
  /** Operation type */
  action: 'addNode' | 'deleteNode' | 'moveNode' | 'addConnection' | 'deleteConnection' | 'editNode' | 'paste' | 'undo' | 'redo';
  /** Human-readable description */
  label: string;
  /** Timestamp (ms since epoch) */
  timestamp: number;
  /** Optional detail */
  detail?: string;
}

// =============================================================================
// Icons
// =============================================================================

const ACTION_ICONS: Record<string, vscode.ThemeIcon> = {
  addNode: new vscode.ThemeIcon('add'),
  deleteNode: new vscode.ThemeIcon('trash'),
  moveNode: new vscode.ThemeIcon('move'),
  addConnection: new vscode.ThemeIcon('git-merge'),
  deleteConnection: new vscode.ThemeIcon('close'),
  editNode: new vscode.ThemeIcon('edit'),
  paste: new vscode.ThemeIcon('clippy'),
  undo: new vscode.ThemeIcon('discard'),
  redo: new vscode.ThemeIcon('redo'),
};

// =============================================================================
// Provider
// =============================================================================

export class CanvasTimelineProvider implements vscode.TimelineProvider {
  readonly id = 'neko-canvas-timeline';
  readonly label = 'Canvas History';

  private _onDidChange = new vscode.EventEmitter<vscode.TimelineChangeEvent | undefined>();
  readonly onDidChange = this._onDidChange.event;

  /** Per-document timeline entries (keyed by URI string) */
  private entries = new Map<string, CanvasTimelineEntry[]>();

  /** Maximum entries per document */
  private static readonly MAX_ENTRIES = 200;

  /** Supported URI schemes */
  readonly scheme = 'file';

  /** Record a new timeline entry for a document */
  addEntry(documentUri: vscode.Uri, entry: CanvasTimelineEntry): void {
    const key = documentUri.toString();
    let list = this.entries.get(key);
    if (!list) {
      list = [];
      this.entries.set(key, list);
    }

    list.push(entry);

    // Trim old entries
    if (list.length > CanvasTimelineProvider.MAX_ENTRIES) {
      list.splice(0, list.length - CanvasTimelineProvider.MAX_ENTRIES);
    }

    // Notify VSCode to refresh timeline
    this._onDidChange.fire({ uri: documentUri, reset: false });
  }

  /** Clear all entries for a document */
  clearEntries(documentUri: vscode.Uri): void {
    this.entries.delete(documentUri.toString());
    this._onDidChange.fire({ uri: documentUri, reset: true });
  }

  async provideTimeline(
    uri: vscode.Uri,
    options: vscode.TimelineOptions,
    _token: vscode.CancellationToken,
  ): Promise<vscode.Timeline> {
    const key = uri.toString();
    const allEntries = this.entries.get(key) ?? [];

    // Apply cursor-based pagination
    let filtered = allEntries;
    if (options.cursor) {
      const cursorTs = parseInt(options.cursor, 10);
      filtered = allEntries.filter((e) => e.timestamp < cursorTs);
    }

    // Limit results
    const limit = options.limit ?? 50;
    const pageSize = typeof limit === 'number' ? limit : limit.initial;
    const sliced = filtered.slice(-pageSize);

    const items: vscode.TimelineItem[] = sliced.map((entry) => {
      const item = new vscode.TimelineItem(
        entry.label,
        entry.timestamp,
      );
      item.description = entry.detail;
      item.iconPath = ACTION_ICONS[entry.action] ?? new vscode.ThemeIcon('circle-outline');
      item.contextValue = 'canvasTimelineEntry';
      return item;
    });

    return {
      items,
      paging: sliced.length < filtered.length
        ? { cursor: String(sliced[0]?.timestamp ?? 0) }
        : undefined,
    };
  }

  dispose(): void {
    this._onDidChange.dispose();
    this.entries.clear();
  }
}
