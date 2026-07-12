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
  createVSCodeProjectFileIoAdapter,
} from '@neko/shared/vscode/extension';
import type { NekoPuppetAPI } from '@neko/shared';
import { PuppetEditorProvider } from './editor';
import { setRootLogger, getRootLogger } from './utils/logger';
import { setErrorHandler } from './utils/errorHandler';
import { registerCommands } from './commands';
import { createNekoPuppetCapabilityProvider } from './agentCapabilityProvider';
import { registerMarketInstallTargets } from './market/registerMarketInstallTargets';
import { PuppetLiveModeService } from './live';
import { PuppetProjectQualityFacade } from './PuppetProjectQualityFacade';

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
  const projectFileAdapter = createVSCodeProjectFileIoAdapter({ vscodeApi: vscode });
  const projectQuality = new PuppetProjectQualityFacade({
    fileOps: projectFileAdapter.fileOps,
    runtimeProbe: {
      async probe({ document }) {
        const adapter = document.puppet.runtimeAdapter;
        return {
          available: Boolean(adapter),
          profileId: document.puppet.animationModel ?? 'moc3-parameter',
          diagnostics: adapter
            ? []
            : [
                {
                  code: 'quality-evaluator-failed',
                  severity: 'warning',
                  message: 'The .nkp project does not persist an explicit runtime adapter.',
                },
              ],
        };
      },
    },
  });
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
    projectQuality,
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
