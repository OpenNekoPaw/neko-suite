import * as vscode from 'vscode';
import { getLogger } from '../utils/logger';
import { NEKO_MARKET_EXTENSION_ID, type NekoMarketAPI } from './marketApi';
import {
  PuppetConfigInstallTarget,
  PuppetModelInstallTarget,
  PuppetMotionInstallTarget,
} from './PuppetMediaInstallTarget';

export async function registerMarketInstallTargets(
  context: vscode.ExtensionContext,
): Promise<void> {
  const logger = getLogger('MarketInstallTargets');
  const extension = vscode.extensions.getExtension<NekoMarketAPI>(NEKO_MARKET_EXTENSION_ID);
  if (!extension) {
    logger.debug('neko-market not available, puppet media install target contribution skipped');
    return;
  }

  try {
    const market = extension.isActive ? extension.exports : await extension.activate();
    context.subscriptions.push(
      market.registerInstallTarget(new PuppetModelInstallTarget(), 'puppet-model'),
      market.registerInstallTarget(new PuppetMotionInstallTarget(), 'puppet-motion'),
      market.registerInstallTarget(new PuppetConfigInstallTarget(), 'puppet-config'),
    );
  } catch (error) {
    logger.warn('Failed to register neko-puppet market install targets', error);
  }
}
