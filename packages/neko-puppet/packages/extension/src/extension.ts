/**
 * NekoPuppet Extension - 2D skeletal puppet animation editor (MOC3)
 *
 * Main entry point for the NekoPuppet extension.
 * Provides custom editor for .nkp/.moc3 files.
 */
import * as vscode from 'vscode';
import {
  createVSCodeLogger,
  VSCodeErrorHandler,
  resolveLogLevelSetting,
  watchLogLevel,
} from '@neko/shared/vscode/extension';
import type { NekoPuppetAPI } from '@neko/shared';
import { PuppetEditorProvider } from './editor';
import { setRootLogger, getRootLogger } from './utils/logger';
import { setErrorHandler } from './utils/errorHandler';
import { registerCommands } from './commands';
import { createNekoPuppetCapabilityProvider } from './agentCapabilityProvider';
import { registerMarketInstallTargets } from './market/registerMarketInstallTargets';
import { PuppetLiveModeService } from './live';

/**
 * Activate the extension
 */
export async function activate(context: vscode.ExtensionContext): Promise<NekoPuppetAPI> {
  const rootLogger = createVSCodeLogger(
    'Neko Puppet',
    'NekoPuppet',
    context,
    resolveLogLevelSetting(context.extensionMode),
  );
  setRootLogger(rootLogger);
  setErrorHandler(new VSCodeErrorHandler(rootLogger));
  watchLogLevel(rootLogger, context);
  const logger = getRootLogger();

  logger.info('Activating extension...');

  const puppetEditorProvider = new PuppetEditorProvider(context);
  const liveModeService = new PuppetLiveModeService({
    editorProvider: puppetEditorProvider,
    logger: logger.child('LiveMode'),
  });

  // Register custom editor for .nkp/.moc3 files.
  context.subscriptions.push(
    liveModeService,
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
  registerCommands(context, liveModeService);

  logger.info('Extension activated');

  // Expose NekoPuppetAPI for cross-extension communication (neko-agent tools)
  const api: NekoPuppetAPI = {
    getCurrentFaceParams: () => puppetEditorProvider.getCurrentFaceParams(),
    isActive: () => puppetEditorProvider.isActive(),
    setFaceParams: (params: Record<string, number>) => puppetEditorProvider.setFaceParams(params),
  };

  // Register Agent Capability Provider
  try {
    const provider = createNekoPuppetCapabilityProvider(api);
    void vscode.commands.executeCommand('neko.agent.registerCapabilities', provider);
  } catch {
    // neko-agent not installed — silently skip
  }

  await registerMarketInstallTargets(context);

  return api;
}

/**
 * Deactivate the extension
 */
export function deactivate(): void {
  getRootLogger().info('Deactivating extension...');
}
