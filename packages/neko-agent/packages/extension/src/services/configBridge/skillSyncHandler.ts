/**
 * SkillSyncHandler - Skill file scanning, caching, and enabled state management
 */

import type * as vscode from 'vscode';
import type { ConfiguredSkill, ConfiguredSlashCommand } from '@neko/shared';
import {
  SKILL_ENABLED_STATE_STORAGE_KEY,
  buildSkillConfigDataMessage,
  createEnabledStateRuntimeStore,
  createSkillConfigSyncRuntime,
  type SkillConfigSyncRuntime,
} from '@neko/agent/runtime';
import { getLogger } from '../../base';
import type { SkillFileService, SkillScanResult } from '../SkillFileService';
import type { PostMessageFn } from './types';
import { createVSCodeEnabledStateStorage } from './enabledStateStore';
import { broadcastToWebviews } from './broadcastHelper';

const logger = getLogger('SkillSyncHandler');

export class SkillSyncHandler implements vscode.Disposable {
  private readonly runtime: SkillConfigSyncRuntime<SkillScanResult>;
  private disposables: vscode.Disposable[] = [];

  constructor(
    private readonly skillFileService: SkillFileService,
    private readonly activeWebviews: Set<PostMessageFn>,
    context?: vscode.ExtensionContext,
  ) {
    this.runtime = createSkillConfigSyncRuntime({
      enabledState: createEnabledStateRuntimeStore({
        storageKey: SKILL_ENABLED_STATE_STORAGE_KEY,
        storage: createVSCodeEnabledStateStorage(context),
        logger,
      }),
      scanSkills: () => this.skillFileService.scanSkills(),
      toConfigured: (scanResult) => this.skillFileService.toConfigured(scanResult),
      logger,
    });

    // Listen for skill changes
    this.disposables.push(
      this.skillFileService.onSkillsChanged((result) => {
        this.handleChanged(result);
      }),
    );
  }

  /**
   * Initialize skill file sync. Returns a promise that resolves when done.
   */
  init(): void {
    this.runtime.init();
  }

  /**
   * Wait for initial sync to complete (used by getSkills message handler)
   */
  async waitForInit(): Promise<void> {
    await this.runtime.waitForInit();
  }

  getSkills(): ConfiguredSkill[] {
    return this.runtime.getSkills();
  }

  getCommands(): ConfiguredSlashCommand[] {
    return this.runtime.getCommands();
  }

  private handleChanged(result: SkillScanResult): void {
    const state = this.runtime.handleChanged(result);

    broadcastToWebviews(this.activeWebviews, buildSkillConfigDataMessage(state));
  }

  /**
   * Broadcast current skills state to all webviews
   */
  broadcast(): void {
    broadcastToWebviews(
      this.activeWebviews,
      buildSkillConfigDataMessage({
        skills: this.runtime.getSkills(),
        commands: this.runtime.getCommands(),
      }),
    );
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}
