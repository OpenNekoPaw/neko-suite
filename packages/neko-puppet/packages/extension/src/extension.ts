/**
 * NekoPuppet Extension - 2D skeletal puppet animation editor (INP/MOC3)
 *
 * Main entry point for the NekoPuppet extension.
 * Provides custom editor for .nkp and .inp files.
 */
import * as vscode from 'vscode';
import { createVSCodeLogger, VSCodeErrorHandler } from '@neko/shared/vscode/extension';
import type { NekoPuppetAPI } from '@neko/shared';
import { PuppetEditorProvider } from './editor';
import { setRootLogger, getRootLogger } from './utils/logger';
import { setErrorHandler } from './utils/errorHandler';
import { registerCommands } from './commands';
import { createNekoPuppetCapabilityProvider } from './agentCapabilityProvider';
import { registerMarketInstallTargets } from './market/registerMarketInstallTargets';

/**
 * Activate the extension
 */
export async function activate(context: vscode.ExtensionContext): Promise<NekoPuppetAPI> {
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

  // Expose NekoPuppetAPI for cross-extension communication (neko-agent tools)
  const api: NekoPuppetAPI = {
    getCurrentFaceParams: () => puppetEditorProvider.getCurrentFaceParams(),
    setFaceParams: (params: Record<string, number>) => puppetEditorProvider.setFaceParams(params),
  };

  // Register Agent Capability Provider
  try {
    const provider = createNekoPuppetCapabilityProvider(api);
    await vscode.commands.executeCommand('neko.agent.registerCapabilities', provider);
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
