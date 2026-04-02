/**
 * NekoPuppet Extension - Inochi2D puppet animation editor
 *
 * Main entry point for the NekoPuppet extension.
 * Provides custom editor for .nkp and .inp files.
 */
import * as vscode from 'vscode';
import { createVSCodeLogger, VSCodeErrorHandler } from '@neko/shared/vscode/extension';
import { PuppetEditorProvider } from './editor';
import { setRootLogger, getRootLogger } from './utils/logger';
import { setErrorHandler } from './utils/errorHandler';
import { registerCommands } from './commands';

/**
 * Activate the extension
 */
export function activate(context: vscode.ExtensionContext): void {
  const rootLogger = createVSCodeLogger('Neko Puppet', 'NekoPuppet', context);
  setRootLogger(rootLogger);
  setErrorHandler(new VSCodeErrorHandler(rootLogger));
  const logger = getRootLogger();

  logger.info('Activating extension...');

  const puppetEditorProvider = new PuppetEditorProvider(context);

  // Register custom editor for .nkp and .inp files
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      PuppetEditorProvider.viewType,
      puppetEditorProvider,
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
      },
    ),
  );

  // Register commands
  registerCommands(context);

  logger.info('Extension activated');
}

/**
 * Deactivate the extension
 */
export function deactivate(): void {
  getRootLogger().info('Deactivating extension...');
}
