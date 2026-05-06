import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { SkillInstallTarget } from '@neko/platform';
import { getSkillFileService } from '../services/SkillFileService';
import { getLogger } from '../base';
import { EndpointInstallTarget } from './EndpointInstallTarget';
import { ModelInstallTarget } from './ModelInstallTarget';
import { NEKO_MARKET_EXTENSION_ID, type NekoMarketAPI } from './marketApi';
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
    };

    context.subscriptions.push(
      market.registerInstallTarget(
        new SkillInstallTarget({
          skillsBaseDir: path.join(os.homedir(), '.neko', 'skills'),
          refreshSkills: () => getSkillFileService().triggerRescan(),
          logger: {
            info: (message) => logger.info(message),
            warn: (message, error) => logger.warn(message, error),
          },
        }),
      ),
      market.registerInstallTarget(new EndpointInstallTarget()),
      market.registerInstallTarget(new ProviderCardInstallTarget()),
      market.registerInstallTarget(new ModelInstallTarget(undefined, host)),
    );
  } catch (error) {
    logger.warn('Failed to register neko-agent market install targets', error);
  }
}
