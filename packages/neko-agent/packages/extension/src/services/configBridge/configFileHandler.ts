/**
 * ConfigFileHandler - Config file import, watching, and openUserConfigFile
 */

import * as vscode from 'vscode';
import type { Platform } from '@neko/platform';
import type { UnifiedConfig } from '@neko/shared';
import {
  readUserConfig,
  readWorkspaceConfig,
  watchUserConfig,
  watchWorkspaceConfig,
  getUserConfigPath,
  writeUserConfig,
} from '@neko/shared/config/config-reader.ts';
import { getLogger } from '../../base';
import type { PostMessageFn } from './types';
import { broadcastToWebviews } from './broadcastHelper';

const logger = getLogger('ConfigFileHandler');

export class ConfigFileHandler implements vscode.Disposable {
  private watcherCleanups: Array<() => void> = [];

  constructor(
    private readonly platform: Platform,
    private readonly activeWebviews: Set<PostMessageFn>,
  ) {}

  /**
   * Initialize: import config files and start watching
   */
  async init(): Promise<void> {
    await this.importConfigs();
    this.watchFiles();
  }

  /**
   * Open ~/.neko/config.json in the VS Code editor.
   * Creates the file with a provider template if it doesn't exist.
   */
  async handleOpenUserConfigFile(): Promise<void> {
    const configPath = getUserConfigPath();

    const fsModule = await import('fs');
    if (!fsModule.existsSync(configPath)) {
      writeUserConfig({
        providers: [
          {
            id: 'anthropic',
            name: 'anthropic',
            displayName: 'Anthropic',
            type: 'anthropic',
            apiUrl: 'https://api.anthropic.com',
            apiKey: 'YOUR_ANTHROPIC_API_KEY',
            enabled: true,
          },
        ],
      } as Parameters<typeof writeUserConfig>[0]);
    }

    const doc = await vscode.workspace.openTextDocument(configPath);
    await vscode.window.showTextDocument(doc, { preview: false });
  }

  /**
   * Import providers from config files into platform
   */
  private async importConfigs(): Promise<void> {
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    const configs: Array<UnifiedConfig> = [];
    const userConfig = readUserConfig();
    if (userConfig) configs.push(userConfig);

    if (workspacePath) {
      const wsConfig = readWorkspaceConfig(workspacePath);
      if (wsConfig) configs.push(wsConfig);
    }

    if (configs.length > 0) {
      await this.importProvidersFromConfigs(configs);
    }
  }

  /**
   * Import providers with API keys from config file data into the platform.
   * Workspace config overrides user config (last entry wins).
   */
  private async importProvidersFromConfigs(configs: Array<UnifiedConfig>): Promise<void> {
    const cm = this.platform.config;

    const keyMap = new Map<string, { apiKey: string; raw: Record<string, unknown> }>();
    for (const config of configs) {
      for (const provider of config.providers ?? []) {
        if (provider.apiKey) {
          keyMap.set(provider.id, {
            apiKey: provider.apiKey,
            raw: provider as unknown as Record<string, unknown>,
          });
        }
      }
    }

    for (const [id, { apiKey, raw }] of keyMap) {
      try {
        if (cm.getProvider(id)) {
          await cm.setProviderApiKey(id, apiKey);
        } else {
          await cm.setProvider(raw as unknown as Parameters<typeof cm.setProvider>[0]);
        }
      } catch (error) {
        logger.error(`Failed to import provider ${id} from config file:`, error);
      }
    }
  }

  /**
   * Watch config files for changes and re-import
   */
  private watchFiles(): void {
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    const handleChange = (_config: UnifiedConfig | null) => {
      void this.importConfigs().then(() => {
        broadcastToWebviews(this.activeWebviews, {
          type: 'configChanged',
          changeType: 'all',
        });
      });
    };

    this.watcherCleanups.push(watchUserConfig(handleChange));

    if (workspacePath) {
      this.watcherCleanups.push(watchWorkspaceConfig(workspacePath, handleChange));
    }
  }

  dispose(): void {
    for (const cleanup of this.watcherCleanups) {
      cleanup();
    }
    this.watcherCleanups = [];
  }
}
