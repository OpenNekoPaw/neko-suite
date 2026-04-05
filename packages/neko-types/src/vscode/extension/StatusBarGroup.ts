import * as vscode from 'vscode';

// ── Types ────────────────────────────────────────────────────────────────────

export interface StatusBarItemConfig {
  /** Unique identifier, e.g. 'neko.audio.duration' */
  id: string;
  alignment: vscode.StatusBarAlignment;
  priority: number;
  name?: string;
  tooltip?: string | vscode.MarkdownString;
  command?: string;
  /**
   * 'always' — shown/hidden together with the group (default).
   * 'conditional' — hidden by default; use setVisible() to control.
   */
  visible?: 'always' | 'conditional';
}

// ── Implementation ───────────────────────────────────────────────────────────

/**
 * Manages a group of VSCode StatusBarItems with unified lifecycle.
 *
 * Usage:
 * ```ts
 * const bar = new StatusBarGroup([
 *   { id: 'neko.audio.duration', alignment: Left, priority: 100, name: 'Duration' },
 *   { id: 'neko.audio.codec',    alignment: Left, priority: 99,  name: 'Codec' },
 *   { id: 'neko.audio.selection', alignment: Left, priority: 98,  visible: 'conditional' },
 * ]);
 *
 * bar.update('neko.audio.duration', '$(clock) 3:45');
 * bar.show();
 * bar.setVisible('neko.audio.selection', true);
 * // ...
 * bar.dispose();
 * ```
 */
export class StatusBarGroup implements vscode.Disposable {
  private readonly items = new Map<string, vscode.StatusBarItem>();
  private readonly alwaysIds: string[] = [];
  private isShown = false;

  constructor(configs: StatusBarItemConfig[]) {
    for (const cfg of configs) {
      const item = vscode.window.createStatusBarItem(cfg.id, cfg.alignment, cfg.priority);
      if (cfg.name) item.name = cfg.name;
      if (cfg.tooltip) item.tooltip = cfg.tooltip;
      if (cfg.command) item.command = cfg.command;
      this.items.set(cfg.id, item);

      if (cfg.visible !== 'conditional') {
        this.alwaysIds.push(cfg.id);
      }
    }
  }

  /** Retrieve an item by id for direct manipulation. */
  get(id: string): vscode.StatusBarItem | undefined {
    return this.items.get(id);
  }

  /** Show all 'always' items. */
  show(): void {
    this.isShown = true;
    for (const id of this.alwaysIds) {
      this.items.get(id)?.show();
    }
  }

  /** Hide all items (both 'always' and 'conditional'). */
  hide(): void {
    this.isShown = false;
    this.items.forEach((item) => item.hide());
  }

  /** Update an item's text and optionally its tooltip. */
  update(id: string, text: string, tooltip?: string | vscode.MarkdownString): void {
    const item = this.items.get(id);
    if (!item) return;
    item.text = text;
    if (tooltip !== undefined) item.tooltip = tooltip;
  }

  /** Show or hide a 'conditional' item. No-op when the group itself is hidden. */
  setVisible(id: string, visible: boolean): void {
    const item = this.items.get(id);
    if (!item) return;
    if (visible && this.isShown) {
      item.show();
    } else {
      item.hide();
    }
  }

  dispose(): void {
    this.items.forEach((item) => item.dispose());
    this.items.clear();
  }
}
