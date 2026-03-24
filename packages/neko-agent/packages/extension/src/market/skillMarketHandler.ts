/**
 * SkillMarketHandler — Handles marketplace messages from webview.
 *
 * Routes marketplace-related postMessage requests to SkillMarketService
 * and sends results back to the webview.
 */

import type { SkillMarketService } from './SkillMarketService';
import type { MarketSearchQuery } from '@neko/shared/types/asset/market';
import { getLogger } from '../base';

const logger = getLogger('SkillMarketHandler');

/** Message type from webview */
interface MarketWebviewMessage {
  type: string;
  [key: string]: unknown;
}

export class SkillMarketHandler {
  private _service: SkillMarketService | undefined;

  setService(service: SkillMarketService): void {
    this._service = service;
  }

  /**
   * Handle incoming market messages from webview.
   * Returns true if the message was handled.
   */
  async handleMessage(
    message: MarketWebviewMessage,
    postMessage: (msg: unknown) => void,
  ): Promise<boolean> {
    if (!this._service) return false;

    switch (message.type) {
      case 'market:search':
        return this.handleSearch(message.query as MarketSearchQuery, postMessage);

      case 'market:install':
        return this.handleInstall(
          message.packageId as string,
          message.version as string,
          postMessage,
        );

      case 'market:uninstall':
        return this.handleUninstall(message.packageId as string, postMessage);

      case 'market:listInstalled':
        return this.handleListInstalled(postMessage);

      case 'market:checkUpdates':
        return this.handleCheckUpdates(postMessage);

      case 'market:getFeatured':
        return this.handleGetFeatured(postMessage);

      default:
        return false;
    }
  }

  private async handleSearch(
    query: MarketSearchQuery,
    postMessage: (msg: unknown) => void,
  ): Promise<boolean> {
    try {
      const result = await this._service!.search(query);
      postMessage({ type: 'market:searchResult', data: result });
    } catch (error) {
      logger.error('Market search failed', error);
      postMessage({ type: 'market:error', error: String(error) });
    }
    return true;
  }

  private async handleInstall(
    packageId: string,
    version: string,
    postMessage: (msg: unknown) => void,
  ): Promise<boolean> {
    // Subscribe to progress events
    const disposable = this._service!.onInstallProgress((progress) => {
      postMessage({ type: 'market:installProgress', data: progress });
    });

    try {
      const result = await this._service!.install(packageId, version);
      postMessage({ type: 'market:installResult', data: result });
    } catch (error) {
      logger.error(`Install failed: ${packageId}`, error);
      postMessage({ type: 'market:error', error: String(error) });
    } finally {
      disposable.dispose();
    }
    return true;
  }

  private async handleUninstall(
    packageId: string,
    postMessage: (msg: unknown) => void,
  ): Promise<boolean> {
    try {
      await this._service!.uninstall(packageId);
      postMessage({ type: 'market:uninstallResult', data: { packageId, success: true } });
    } catch (error) {
      logger.error(`Uninstall failed: ${packageId}`, error);
      postMessage({ type: 'market:error', error: String(error) });
    }
    return true;
  }

  private async handleListInstalled(postMessage: (msg: unknown) => void): Promise<boolean> {
    try {
      const installed = await this._service!.listInstalled();
      postMessage({ type: 'market:installedList', data: installed });
    } catch (error) {
      logger.error('List installed failed', error);
      postMessage({ type: 'market:error', error: String(error) });
    }
    return true;
  }

  private async handleCheckUpdates(postMessage: (msg: unknown) => void): Promise<boolean> {
    try {
      const updates = await this._service!.checkUpdates();
      postMessage({ type: 'market:updates', data: updates });
    } catch (error) {
      logger.error('Check updates failed', error);
      postMessage({ type: 'market:error', error: String(error) });
    }
    return true;
  }

  private async handleGetFeatured(postMessage: (msg: unknown) => void): Promise<boolean> {
    try {
      const featured = await this._service!.getFeatured();
      postMessage({ type: 'market:featured', data: featured });
    } catch (error) {
      logger.error('Get featured failed', error);
      postMessage({ type: 'market:error', error: String(error) });
    }
    return true;
  }
}
