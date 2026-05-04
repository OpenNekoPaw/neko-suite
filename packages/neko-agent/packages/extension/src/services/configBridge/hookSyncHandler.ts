/**
 * HookSyncHandler - Hook file scanning and caching
 */

import type * as vscode from 'vscode';
import type { ConfiguredHook } from '@neko/shared';
import { createHookConfigSyncRuntime, type HookConfigSyncRuntime } from '@neko/agent/runtime';
import { getLogger } from '../../base';
import type { HookFileService, HookScanResult } from '../HookFileService';

const logger = getLogger('HookSyncHandler');

export class HookSyncHandler implements vscode.Disposable {
  private readonly runtime: HookConfigSyncRuntime<HookScanResult>;
  private disposables: vscode.Disposable[] = [];

  constructor(private readonly hookFileService: HookFileService) {
    this.runtime = createHookConfigSyncRuntime({
      scanHooks: () => this.hookFileService.scanHooks(),
      toConfigured: (scanResult) => this.hookFileService.toConfigured(scanResult),
      logger,
    });

    // Listen for hook changes
    this.disposables.push(
      this.hookFileService.onHooksChanged((result) => {
        this.handleChanged(result);
      }),
    );
  }

  async init(): Promise<void> {
    await this.runtime.init();
  }

  getHooks(): ConfiguredHook[] {
    return this.runtime.getHooks();
  }

  private handleChanged(result: HookScanResult): void {
    this.runtime.handleChanged(result);
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}
