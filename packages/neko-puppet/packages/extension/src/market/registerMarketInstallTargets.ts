import * as vscode from 'vscode';
import { getLogger } from '../utils/logger';
import { NEKO_MARKET_EXTENSION_ID, type NekoMarketAPI } from './marketApi';
import { PuppetMotionInstallTarget } from './PuppetMotionInstallTarget';

export async function registerMarketInstallTargets(
  context: vscode.ExtensionContext,
): Promise<void> {
  const logger = getLogger('MarketInstallTargets');
  const extension = vscode.extensions.getExtension<NekoMarketAPI>(NEKO_MARKET_EXTENSION_ID);
  if (!extension) {
    logger.debug('neko-market not available, puppet-motion install target contribution skipped');
    return;
  }

  try {
    const market = extension.isActive ? extension.exports : await extension.activate();
    context.subscriptions.push(
      market.registerInstallTarget(new PuppetMotionInstallTarget(), 'puppet-motion'),
    );
  } catch (error) {
    logger.warn('Failed to register neko-puppet market install targets', error);
  }
}
