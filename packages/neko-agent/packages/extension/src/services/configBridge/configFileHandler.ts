/**
 * ConfigFileHandler - user-owned config file opening
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import { serializeUnifiedConfigToToml } from '@neko/shared';
import { migrateLegacyJsonConfigToToml } from '@neko/shared/config/config-migration';
import { getLegacyUserConfigPath } from '@neko/shared/config/config-reader';
import { DEFAULT_USER_CONFIG, getUserConfigPath } from '@neko/platform';
import { getLogger } from '../../base';

const logger = getLogger('ConfigFileHandler');

export class ConfigFileHandler implements vscode.Disposable {
  constructor() {}

  /**
   * Initialize config file handler.
   */
  async init(): Promise<void> {
    logger.debug('Config file watching is disabled; snapshots load on Agent session/tab open.');
  }

  /**
   * Open ~/.neko/config.toml in the VS Code editor.
   * Platform owns the default config shape; Extension only opens the file.
   */
  async handleOpenUserConfigFile(): Promise<void> {
    const configPath = getUserConfigPath();
    if (!fs.existsSync(configPath)) {
      const doc = await vscode.workspace.openTextDocument({
        language: 'toml',
        content: buildUserConfigTemplate(),
      });
      await vscode.window.showTextDocument(doc, { preview: false });
      await vscode.window.showInformationMessage(
        `Neko config file does not exist yet. Save this template as ${configPath} when ready.`,
      );
      return;
    }

    const doc = await vscode.workspace.openTextDocument(configPath);
    await vscode.window.showTextDocument(doc, { preview: false });
  }

  async handleMigrateLegacyUserConfigFile(): Promise<void> {
    await migrateLegacyUserConfigFileInVsCode();
  }

  dispose(): void {}
}

export function buildUserConfigTemplate(): string {
  return serializeUnifiedConfigToToml(DEFAULT_USER_CONFIG);
}

export async function migrateLegacyUserConfigFileInVsCode(): Promise<void> {
  const result = migrateLegacyJsonConfigToToml({
    legacyJsonPath: getLegacyUserConfigPath(),
    tomlPath: getUserConfigPath(),
  });

  if (result.status === 'migrated') {
    await vscode.window.showInformationMessage(
      `Migrated Neko config to ${result.tomlPath}. Legacy JSON was moved to ${result.backupPath}.`,
    );
    const doc = await vscode.workspace.openTextDocument(result.tomlPath);
    await vscode.window.showTextDocument(doc, { preview: false });
    return;
  }

  await vscode.window.showErrorMessage(
    result.diagnostic?.message ?? `Neko config migration failed: ${result.status}`,
  );
}
