import * as vscode from 'vscode';
import type { ILogger } from '@neko/shared';
import { NEKO_MARKET_EXTENSION_ID, type NekoMarketAPI } from './marketApi';
import {
  ModelAssetInstallTarget,
  ModelConfigInstallTarget,
  ModelMotionInstallTarget,
  ModelScene2DInstallTarget,
} from './ModelMediaInstallTarget';

export async function registerMarketInstallTargets(
  context: vscode.ExtensionContext,
  logger: ILogger,
): Promise<void> {
  const extension = vscode.extensions.getExtension<NekoMarketAPI>(NEKO_MARKET_EXTENSION_ID);
  if (!extension) {
    logger.debug('neko-market not available, model media install target contribution skipped');
    return;
  }

  try {
    const market = extension.isActive ? extension.exports : await extension.activate();
    context.subscriptions.push(
      market.registerInstallTarget(new ModelScene2DInstallTarget(), 'model-2d-scene'),
      market.registerInstallTarget(new ModelAssetInstallTarget(), 'model-3d'),
      market.registerInstallTarget(new ModelMotionInstallTarget(), 'model-motion'),
      market.registerInstallTarget(new ModelConfigInstallTarget(), 'model-config'),
    );
  } catch (error) {
    logger.warn('Failed to register neko-model market install targets', error);
  }
}
