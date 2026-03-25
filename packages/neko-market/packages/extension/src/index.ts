/**
 * Neko Marketplace Extension — Entry Point
 */

import * as vscode from 'vscode';
import { createVSCodeLogger } from '@neko/shared/vscode/extension';
import { LogLevel } from '@neko/shared';
import { MarketplaceService } from './MarketplaceService';
import { MarketplaceProvider } from './MarketplaceProvider';
import { NekoMarketAPIImpl } from './market-api';
import type { NekoMarketAPI, MarketAssetEvent } from './market-api';

export type { NekoMarketAPI, MarketAssetEvent };

export async function activate(context: vscode.ExtensionContext): Promise<NekoMarketAPI> {
  const logger = createVSCodeLogger('Neko Marketplace', 'NekoMarket', context, LogLevel.Info);

  logger.info('Neko Marketplace activating');

  const service = new MarketplaceService(logger);
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
