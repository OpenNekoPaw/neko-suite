/**
 * ConfigFileHandler - Config file import, watching, and openUserConfigFile
 */

import * as vscode from 'vscode';
import {
  ensureUserConfig,
  getUserConfigPath,
  runProviderCredentialConfigFileChangeRuntime,
  runProviderCredentialConfigFileImportRuntime,
  type Platform,
} from '@neko/platform';
import { buildConfigChangedRuntimeMessage } from '@neko/agent/runtime';
import { watchUserConfig, watchWorkspaceConfig } from '@neko/shared/config/config-reader';
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
   * Platform owns the default config shape; Extension only opens the file.
   */
  async handleOpenUserConfigFile(): Promise<void> {
    ensureUserConfig();
    const configPath = getUserConfigPath();

    const doc = await vscode.workspace.openTextDocument(configPath);
    await vscode.window.showTextDocument(doc, { preview: false });
  }

  /**
   * Import providers from config files into platform
   */
  private async importConfigs(): Promise<void> {
    await runProviderCredentialConfigFileImportRuntime(
      { ...this.workspacePathInput() },
      { config: this.platform.config, logger },
    );
  }

  /**
   * Watch config files for changes and re-import
   */
  private watchFiles(): void {
    const handleChange = () => {
      void runProviderCredentialConfigFileChangeRuntime(
        { ...this.workspacePathInput() },
        {
          config: this.platform.config,
          logger,
          notifyConfigChanged: () => {
            broadcastToWebviews(this.activeWebviews, buildConfigChangedRuntimeMessage());
          },
        },
      );
    };

    this.watcherCleanups.push(watchUserConfig(handleChange));

    const workspacePath = this.workspacePathInput().workspacePath;
    if (workspacePath) {
      this.watcherCleanups.push(watchWorkspaceConfig(workspacePath, handleChange));
    }
  }

  private workspacePathInput(): { workspacePath?: string } {
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    return workspacePath ? { workspacePath } : {};
  }

  dispose(): void {
    for (const cleanup of this.watcherCleanups) {
      cleanup();
    }
    this.watcherCleanups = [];
  }
}
