import * as vscode from 'vscode';
import { getLogger } from '../base';
import { NEKO_MARKET_EXTENSION_ID, type NekoMarketAPI } from './marketApi';
import { ShaderInstallTarget } from './ShaderInstallTarget';

export async function registerMarketInstallTargets(
  context: vscode.ExtensionContext,
): Promise<void> {
  const logger = getLogger('MarketInstallTargets');
  const extension = vscode.extensions.getExtension<NekoMarketAPI>(NEKO_MARKET_EXTENSION_ID);
  if (!extension) {
    logger.debug('neko-market not available, shader install target contribution skipped');
    return;
  }

  try {
    const market = extension.isActive ? extension.exports : await extension.activate();
    context.subscriptions.push(market.registerInstallTarget(new ShaderInstallTarget()));
  } catch (error) {
    logger.warn('Failed to register neko-cut market install targets', error);
  }
}
