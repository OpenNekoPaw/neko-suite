/**
 * NekoAgent Status Bar
 *
 * Shows the active LLM model in the VSCode status bar.
 * Clicking opens the AI Assistant chat panel.
 */

import * as vscode from 'vscode';
import type { Platform } from '@neko/platform';

/**
 * Creates and manages the Neko Agent status bar item.
 * Returns a disposable that cleans up the item on deactivation.
 */
export function createStatusBar(platform: Platform): vscode.Disposable {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  item.command = 'neko.ai.chat';
  item.tooltip = 'Neko AI Assistant — click to open chat';

  function refresh(): void {
    const models = platform.config
      .getEnabledModels()
      .filter((m) => (m.capabilities as string[] | undefined)?.includes('chat'));
    if (models.length === 0) {
      item.text = '$(hubot) Neko AI';
      item.color = new vscode.ThemeColor('statusBarItem.warningForeground');
    } else {
      // Prefer the first enabled chat model as the display model
      const model = models[0];
      const name = model.name.length > 20 ? model.name.slice(0, 18) + '…' : model.name;
      item.text = `$(hubot) ${name}`;
      item.color = undefined;
    }
    item.show();
  }

  refresh();

  // Refresh when configuration changes (models added/removed/enabled/disabled)
  const configWatcher = vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('neko')) {
      refresh();
    }
  });

  return {
    dispose: () => {
      configWatcher.dispose();
      item.dispose();
    },
  };
}
