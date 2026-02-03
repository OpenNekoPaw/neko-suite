/**
 * Platform Factory
 * 创建和配置 Platform 实例
 */

import * as vscode from 'vscode';
import { createPlatform, type Platform, type ITaskManager } from '@uniedit/platform';
import { VSCodeConfigStorage, migrateFromLegacyConfig } from '../services/vscodeConfigStorage';

/**
 * Platform Factory Options
 */
export interface PlatformFactoryOptions {
  context: vscode.ExtensionContext;
  taskManager: ITaskManager;
}

/**
 * 创建 Platform 实例
 */
export async function createPlatformInstance(
  options: PlatformFactoryOptions
): Promise<Platform> {
  const { context, taskManager } = options;

  // Migrate legacy config first
  await migrateFromLegacyConfig(context);

  const workspaceFolders = vscode.workspace.workspaceFolders;
  const currentLocale = vscode.env.language;

  const platform = createPlatform({
    userConfigStorage: new VSCodeConfigStorage(context),
    workspacePath: workspaceFolders?.[0]?.uri.fsPath,
    locale: currentLocale,
    taskManager,
  });

  // Register disposal
  context.subscriptions.push({ dispose: () => platform.dispose() });

  return platform;
}
