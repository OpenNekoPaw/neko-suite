/**
 * SlashCommandRegistry
 *
 * Allows other VSCode extensions (neko-canvas, neko-cut, etc.) to register
 * custom slash commands into the neko-agent chat panel.
 *
 * Usage from an extension:
 *   vscode.commands.executeCommand('neko.agent.registerSlashCommands', 'neko.nekocanvas', [
 *     { id: 'batch', name: '/batch', description: 'Batch generate images for selected shots', icon: '🖼️' },
 *     { id: 'export', name: '/export', description: 'Export storyboard to PDF/ZIP', icon: '📦' },
 *   ]);
 *
 * The registry pushes the updated merged list to the webview automatically.
 */

import * as vscode from 'vscode';

/** Single plugin slash command definition */
export interface PluginSlashCommandDef {
  id: string;
  name: string;
  description: string;
  icon?: string;
}

/** Entry stored internally */
interface RegistryEntry {
  extensionId: string;
  commands: PluginSlashCommandDef[];
}

/**
 * Registry that aggregates plugin slash commands from all registered extensions.
 * Implements vscode.Disposable for clean teardown.
 */
export class SlashCommandRegistry implements vscode.Disposable {
  private readonly _entries = new Map<string, RegistryEntry>();
  private readonly _onChange = new vscode.EventEmitter<void>();

  /** Fired whenever the registered command set changes */
  readonly onDidChange = this._onChange.event;

  /**
   * Register (or replace) commands from a specific extension.
   * @param extensionId - The extension's unique ID
   * @param commands    - Commands to expose in the chat panel
   */
  register(extensionId: string, commands: PluginSlashCommandDef[]): void {
    this._entries.set(extensionId, { extensionId, commands });
    this._onChange.fire();
  }

  /**
   * Unregister all commands from a specific extension.
   */
  unregister(extensionId: string): void {
    if (this._entries.delete(extensionId)) {
      this._onChange.fire();
    }
  }

  /**
   * Get all registered plugin commands as a flat list (sorted by extensionId for stability).
   */
  getAll(): Array<PluginSlashCommandDef & { extensionId: string }> {
    return [...this._entries.values()]
      .sort((a, b) => a.extensionId.localeCompare(b.extensionId))
      .flatMap((entry) =>
        entry.commands.map((cmd) => ({ ...cmd, extensionId: entry.extensionId })),
      );
  }

  dispose(): void {
    this._onChange.dispose();
  }
}

/** Singleton instance shared across the extension activation */
let _registry: SlashCommandRegistry | undefined;

export function getSlashCommandRegistry(): SlashCommandRegistry {
  if (!_registry) {
    _registry = new SlashCommandRegistry();
  }
  return _registry;
}
