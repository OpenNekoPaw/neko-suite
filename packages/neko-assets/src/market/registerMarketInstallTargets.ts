import * as vscode from 'vscode';
import { getLogger } from '../utils/logger';
import { NEKO_MARKET_EXTENSION_ID, type NekoMarketAPI } from './marketApi';
import { VoicePackInstallTarget } from './VoicePackInstallTarget';

export async function registerMarketInstallTargets(
  context: vscode.ExtensionContext,
): Promise<void> {
  const logger = getLogger('MarketInstallTargets');
  const extension = vscode.extensions.getExtension<NekoMarketAPI>(NEKO_MARKET_EXTENSION_ID);
  if (!extension) {
    logger.debug('neko-market not available, voice-pack install target contribution skipped');
    return;
  }

  try {
    const market = extension.isActive ? extension.exports : await extension.activate();
    context.subscriptions.push(
      market.registerInstallTarget(new VoicePackInstallTarget(), 'voice-pack'),
    );
  } catch (error) {
    logger.warn('Failed to register neko-assets market install targets', error);
  }
}
