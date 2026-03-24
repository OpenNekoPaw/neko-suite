/**
 * Neko Marketplace Extension — Entry Point
 */

import * as vscode from 'vscode';
import { createVSCodeLogger } from '@neko/shared/vscode/extension';
import { LogLevel } from '@neko/shared';
import { MarketplaceService } from './MarketplaceService';
import { MarketplaceProvider } from './MarketplaceProvider';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const logger = createVSCodeLogger('Neko Marketplace', 'NekoMarket', context, LogLevel.Info);

  logger.info('Neko Marketplace activating');

  const service = new MarketplaceService(logger);
  const provider = new MarketplaceProvider(context.extensionUri, service, logger);

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
    { dispose: () => provider.dispose() },
  );

  logger.info('Neko Marketplace activated');
}

export function deactivate(): void {
  // Resources are disposed via context.subscriptions
}
