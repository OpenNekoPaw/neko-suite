import * as vscode from 'vscode';
import {
  NEKO_AGENT_REFRESH_EXTERNAL_PROCESSORS_COMMAND,
  NEKO_AGENT_UNREGISTER_EXTERNAL_PROCESSOR_PACKAGE_COMMAND,
} from '@neko-agent/types';
import { SkillInstallTarget } from '@neko/platform';
import { getSkillFileService } from '../services/SkillFileService';
import { getLogger } from '../base';
import { EndpointInstallTarget } from './EndpointInstallTarget';
import { ModelInstallTarget } from './ModelInstallTarget';
import { ProcessorInstallTarget } from './ProcessorInstallTarget';
import { NEKO_MARKET_EXTENSION_ID, type NekoMarketAPI } from './marketApi';
import { ProfilePackageInstallTarget } from './ProfilePackageInstallTarget';
import { ProviderCardInstallTarget } from './ProviderCardInstallTarget';

export async function registerMarketInstallTargets(
  context: vscode.ExtensionContext,
): Promise<void> {
  const logger = getLogger('MarketInstallTargets');
  const extension = vscode.extensions.getExtension<NekoMarketAPI>(NEKO_MARKET_EXTENSION_ID);
  if (!extension) {
    logger.debug('neko-market not available, install target contribution skipped');
    return;
  }

  try {
    const market = extension.isActive ? extension.exports : await extension.activate();
    const host = {
      executeCommand: async <T>(command: string, ...args: unknown[]) =>
        vscode.commands.executeCommand<T>(command, ...args),
      refreshModels: async () => {
        await vscode.commands.executeCommand('neko.agent.refreshModels');
      },
      refreshProcessors: async () => {
        await vscode.commands.executeCommand(NEKO_AGENT_REFRESH_EXTERNAL_PROCESSORS_COMMAND);
      },
      unregisterProcessorPackage: async (packageId: string) => {
        await vscode.commands.executeCommand(
          NEKO_AGENT_UNREGISTER_EXTERNAL_PROCESSOR_PACKAGE_COMMAND,
          packageId,
        );
      },
    };

    context.subscriptions.push(
      market.registerInstallTarget(
        new SkillInstallTarget({
          refreshSkills: () => getSkillFileService().triggerRescan(),
          logger: {
            info: (message) => logger.info(message),
            warn: (message, error) => logger.warn(message, error),
          },
        }),
      ),
      market.registerInstallTarget(new EndpointInstallTarget()),
      market.registerInstallTarget(new ProviderCardInstallTarget()),
      market.registerInstallTarget(new ProfilePackageInstallTarget()),
      market.registerInstallTarget(new ModelInstallTarget(undefined, host)),
      market.registerInstallTarget(new ProcessorInstallTarget(undefined, host)),
    );
  } catch (error) {
    logger.warn('Failed to register neko-agent market install targets', error);
  }
}
