/**
 * MarketplaceHandler — Routes market:* messages from webview to MarketplaceService.
 *
 * Returns true if the message was handled, allowing provider to chain handlers.
 */

import type { ILogger } from '@neko/shared';
import { toBaseError } from '@neko/shared';
import type { MarketplaceService } from './MarketplaceService';
import type { MarketSearchQuery } from '@neko/shared/types/asset/market';
import type { AssetType } from '@neko/shared/types/asset/manifest';

interface WebviewMessage {
  type: string;
  [key: string]: unknown;
}

type PostMessageFn = (msg: unknown) => void;

export class MarketplaceHandler {
  constructor(
    private readonly _service: MarketplaceService,
    private readonly _logger: ILogger,
  ) {}

  async handleMessage(message: WebviewMessage, postMessage: PostMessageFn): Promise<boolean> {
    switch (message.type) {
      case 'market:search':
        return this._handleSearch(message['query'] as MarketSearchQuery, postMessage);

      case 'market:getFeatured':
        return this._handleGetFeatured(message['assetType'] as AssetType | undefined, postMessage);

      case 'market:getPackage':
        return this._handleGetPackage(message['packageId'] as string, postMessage);

      case 'market:install':
        return this._handleInstall(
          message['packageId'] as string,
          message['version'] as string,
          postMessage,
        );

      case 'market:uninstall':
        return this._handleUninstall(message['packageId'] as string, postMessage);

      case 'market:listInstalled':
        return this._handleListInstalled(postMessage);

      case 'market:checkUpdates':
        return this._handleCheckUpdates(postMessage);

      default:
        return false;
    }
  }

  private async _handleSearch(
    query: MarketSearchQuery,
    postMessage: PostMessageFn,
  ): Promise<boolean> {
    try {
      const result = await this._service.search(query);
      postMessage({ type: 'market:searchResult', data: result });
    } catch (err) {
      const e = toBaseError(err);
      this._logger.error('Search failed', e);
      postMessage({ type: 'market:error', error: e.message });
    }
    return true;
  }

  private async _handleGetFeatured(
    assetType: AssetType | undefined,
    postMessage: PostMessageFn,
  ): Promise<boolean> {
    try {
      const items = await this._service.getFeatured(assetType);
      postMessage({ type: 'market:featuredResult', data: items });
    } catch (err) {
      const e = toBaseError(err);
      this._logger.error('getFeatured failed', e);
      postMessage({ type: 'market:error', error: e.message });
    }
    return true;
  }

  private async _handleGetPackage(packageId: string, postMessage: PostMessageFn): Promise<boolean> {
    try {
      const pkg = await this._service.getPackage(packageId);
      postMessage({ type: 'market:packageResult', data: pkg });
    } catch (err) {
      const e = toBaseError(err);
      this._logger.error(`getPackage failed: ${packageId}`, e);
      postMessage({ type: 'market:error', error: e.message });
    }
    return true;
  }

  private async _handleInstall(
    packageId: string,
    version: string,
    postMessage: PostMessageFn,
  ): Promise<boolean> {
    const disposable = this._service.onInstallProgress((progress) => {
      postMessage({ type: 'market:installProgress', data: progress });
    });

    try {
      const result = await this._service.install(packageId, version);
      postMessage({ type: 'market:installResult', data: result });

      // Refresh installed list after success
      if (result.success) {
        const installed = await this._service.listInstalled();
        postMessage({ type: 'market:installedResult', data: installed });
      }
    } catch (err) {
      const e = toBaseError(err);
      this._logger.error(`Install failed: ${packageId}`, e);
      postMessage({ type: 'market:error', error: e.message });
    } finally {
      disposable.dispose();
    }
    return true;
  }

  private async _handleUninstall(packageId: string, postMessage: PostMessageFn): Promise<boolean> {
    try {
      await this._service.uninstall(packageId);
      postMessage({ type: 'market:uninstallResult', data: { packageId, success: true } });

      // Refresh installed list
      const installed = await this._service.listInstalled();
      postMessage({ type: 'market:installedResult', data: installed });
    } catch (err) {
      const e = toBaseError(err);
      this._logger.error(`Uninstall failed: ${packageId}`, e);
      postMessage({ type: 'market:error', error: e.message });
    }
    return true;
  }

  private async _handleListInstalled(postMessage: PostMessageFn): Promise<boolean> {
    try {
      const installed = await this._service.listInstalled();
      postMessage({ type: 'market:installedResult', data: installed });
    } catch (err) {
      const e = toBaseError(err);
      this._logger.error('listInstalled failed', e);
      postMessage({ type: 'market:error', error: e.message });
    }
    return true;
  }

  private async _handleCheckUpdates(postMessage: PostMessageFn): Promise<boolean> {
    try {
      const updates = await this._service.checkUpdates();
      postMessage({ type: 'market:updatesResult', data: updates });
    } catch (err) {
      const e = toBaseError(err);
      this._logger.error('checkUpdates failed', e);
      postMessage({ type: 'market:error', error: e.message });
    }
    return true;
  }
}
