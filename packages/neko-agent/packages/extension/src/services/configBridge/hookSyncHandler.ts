/**
 * HookSyncHandler - Hook file scanning and caching
 */

import type * as vscode from 'vscode';
import type { ConfiguredHook } from '@neko/shared';
import { getLogger } from '../../base';
import type { HookFileService, HookScanResult } from '../HookFileService';
import type { PostMessageFn } from './types';
import { broadcastToWebviews } from './broadcastHelper';

const logger = getLogger('HookSyncHandler');

export class HookSyncHandler implements vscode.Disposable {
  private initialized = false;
  private cachedHooks: ConfiguredHook[] = [];
  private disposables: vscode.Disposable[] = [];

  constructor(
    private readonly hookFileService: HookFileService,
    private readonly activeWebviews: Set<PostMessageFn>,
  ) {
    // Listen for hook changes
    this.disposables.push(
      this.hookFileService.onHooksChanged((result) => {
        this.handleChanged(result);
      }),
    );
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    try {
      const scanResult = await this.hookFileService.scanHooks();
      this.cachedHooks = this.hookFileService.toConfigured(scanResult);
    } catch (error) {
      logger.error('Failed to initialize hook file sync:', error);
    }
  }

  getHooks(): ConfiguredHook[] {
    return this.cachedHooks;
  }

  private handleChanged(result: HookScanResult): void {
    this.cachedHooks = this.hookFileService.toConfigured(result);

    broadcastToWebviews(this.activeWebviews, {
      type: 'hooksChanged',
      hooks: this.cachedHooks,
    });
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}
