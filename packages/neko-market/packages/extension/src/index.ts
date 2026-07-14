/**
 * Neko Marketplace Extension — Entry Point
 */

import * as vscode from 'vscode';
import {
  createVSCodeLogger,
  resolveLogLevelSetting,
  watchLogLevel,
} from '@neko/shared/vscode/extension';
import { createVSCodeMarketplaceServiceOptions, MarketplaceService } from './MarketplaceService';
import { MarketplaceProvider } from './MarketplaceProvider';
import { NekoMarketAPIImpl } from './market-api';
import type { NekoMarketAPI, MarketAssetEvent } from './market-api';

export type { NekoMarketAPI, MarketAssetEvent };

export async function activate(context: vscode.ExtensionContext): Promise<NekoMarketAPI> {
  const logger = createVSCodeLogger(
    'Neko Marketplace',
    'NekoMarket',
    context,
    resolveLogLevelSetting(context.extensionMode),
  );
  watchLogLevel(logger, context);

  logger.info('Neko Marketplace activating');

  const service = new MarketplaceService(
    logger,
    await createVSCodeMarketplaceServiceOptions(context),
  );
  const provider = new MarketplaceProvider(context.extensionUri, service, logger);
  const api = new NekoMarketAPIImpl(service);

  context.subscriptions.push(
    // Register webview view in Activity Bar
    vscode.window.registerWebviewViewProvider(MarketplaceProvider.viewType, provider),

    // neko.market.open — focus the marketplace panel
    vscode.commands.registerCommand('neko.market.open', () => {
      vscode.commands.executeCommand(`${MarketplaceProvider.viewType}.focus`);
    }),

    // neko.market.openSkills — focus panel and filter to skills
    vscode.commands.registerCommand('neko.market.openSkills', () => {
      vscode.commands.executeCommand(`${MarketplaceProvider.viewType}.focus`);
      provider.sendMessage({ type: 'market:filterByType', assetType: 'skill' });
    }),

    vscode.commands.registerCommand('neko.market.checkout', (packageId: string) =>
      service.openCheckout(packageId),
    ),
    vscode.commands.registerCommand('neko.market.renew', (packageId: string) =>
      service.openRenewal(packageId),
    ),
    vscode.commands.registerCommand('neko.market.invoice', (orderId: string) =>
      service.openInvoice(orderId),
    ),
    vscode.commands.registerCommand('neko.market.support', (orderId: string) =>
      service.openSupport(orderId),
    ),
    vscode.window.registerUriHandler({
      handleUri: async (uri) => {
        if (uri.path !== '/refresh') return;
        const packageId = new URLSearchParams(uri.query).get('packageId') ?? undefined;
        await service.refreshEntitlements(packageId);
        provider.sendMessage({ type: 'market:entitlementsRefreshed', data: { packageId } });
      },
    }),

    service,
    api,
    { dispose: () => provider.dispose() },
  );

  logger.info('Neko Marketplace activated');
  return api;
}

export function deactivate(): void {
  // Resources are disposed via context.subscriptions
}
