/**
 * NekoAgent Status Bar
 *
 * Shows the active LLM model and — when a canvas project is open — the
 * configured image/video generation models.
 *
 * Examples:
 *   $(hubot) claude-sonnet-4-6
 *   $(hubot) claude-sonnet-4-6  ✨ flux-dev  🎬 wan2.1
 *
 * Clicking opens the AI Assistant chat panel.
 */

import * as vscode from 'vscode';
import type { Platform } from '@neko/platform';
import {
  getActiveGenerationConfig,
  onDidChangeGenerationConfig,
} from './services/canvasAmbientContext';

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

    let llmLabel: string;
    if (models.length === 0) {
      item.color = new vscode.ThemeColor('statusBarItem.warningForeground');
      llmLabel = 'Neko AI';
    } else {
      item.color = undefined;
      const name = models[0].name;
      llmLabel = name.length > 20 ? name.slice(0, 18) + '…' : name;
    }

    // Append generation model badges when a canvas project is active
    const genConfig = getActiveGenerationConfig();
    const badges: string[] = [];
    if (genConfig?.image) {
      const imgName = shortModelName(genConfig.image);
      badges.push(`✨ ${imgName}`);
    }
    if (genConfig?.video) {
      const vidName = shortModelName(genConfig.video);
      badges.push(`🎬 ${vidName}`);
    }

    const badgeSuffix = badges.length > 0 ? `  ${badges.join('  ')}` : '';
    item.text = `$(hubot) ${llmLabel}${badgeSuffix}`;
    item.show();
  }

  refresh();

  // Refresh when LLM configuration changes
  const configWatcher = vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('neko')) {
      refresh();
    }
  });

  // Refresh when canvas generation config changes
  const genConfigWatcher = onDidChangeGenerationConfig(() => {
    refresh();
  });

  return {
    dispose: () => {
      configWatcher.dispose();
      genConfigWatcher.dispose();
      item.dispose();
    },
  };
}

/** Shorten a model id for display: strip common prefixes and cap at 12 chars. */
function shortModelName(modelId: string): string {
  // Strip known provider prefixes for brevity
  const stripped = modelId
    .replace(/^(stability-ai\/|fal-ai\/|black-forest-labs\/|wan-|wan\.)/i, '')
    .replace(/^(flux-)/, 'flux-');
  return stripped.length > 12 ? stripped.slice(0, 11) + '…' : stripped;
}
