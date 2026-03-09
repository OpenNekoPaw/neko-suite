/**
 * SkillSyncHandler - Skill file scanning, caching, and enabled state management
 */

import type * as vscode from 'vscode';
import type { ConfiguredSkill, ConfiguredSlashCommand } from '@neko/shared';
import { getLogger } from '../../base';
import type { SkillFileService, SkillScanResult } from '../SkillFileService';
import type { PostMessageFn } from './types';
import { EnabledStateStore } from './enabledStateStore';
import { broadcastToWebviews } from './broadcastHelper';

const logger = getLogger('SkillSyncHandler');

const SKILL_ENABLED_STATE_KEY = 'skillEnabledState';

export class SkillSyncHandler implements vscode.Disposable {
  private initialized = false;
  private syncPromise: Promise<void> | null = null;

  private cachedSkills: ConfiguredSkill[] = [];
  private cachedCommands: ConfiguredSlashCommand[] = [];

  private readonly enabledState: EnabledStateStore;
  private disposables: vscode.Disposable[] = [];

  constructor(
    private readonly skillFileService: SkillFileService,
    private readonly activeWebviews: Set<PostMessageFn>,
    context?: vscode.ExtensionContext,
  ) {
    this.enabledState = new EnabledStateStore(SKILL_ENABLED_STATE_KEY, context);

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
    if (this.initialized) return;
    this.initialized = true;
    this.syncPromise = this.doSync();
  }

  /**
   * Wait for initial sync to complete (used by getSkills message handler)
   */
  async waitForInit(): Promise<void> {
    if (this.syncPromise) {
      await this.syncPromise;
    }
  }

  getSkills(): ConfiguredSkill[] {
    return this.cachedSkills;
  }

  getCommands(): ConfiguredSlashCommand[] {
    return this.cachedCommands;
  }

  private async doSync(): Promise<void> {
    try {
      const scanResult = await this.skillFileService.scanSkills();
      const { skills, commands } = this.skillFileService.toConfigured(scanResult);
      this.mergeAndCache(skills, commands);
    } catch (error) {
      logger.error('Failed to initialize skill file sync:', error);
    }
  }

  private handleChanged(result: SkillScanResult): void {
    const { skills, commands } = this.skillFileService.toConfigured(result);
    this.mergeAndCache(skills, commands);

    broadcastToWebviews(this.activeWebviews, {
      type: 'skillsChanged',
      skills: this.cachedSkills,
      commands: this.cachedCommands,
    });
  }

  private mergeAndCache(skills: ConfiguredSkill[], commands: ConfiguredSlashCommand[]): void {
    this.cachedSkills = this.enabledState.applyTo(skills, (s) => `skill:${s.name}`);
    this.cachedCommands = this.enabledState.applyTo(commands, (c) => `command:${c.command}`);
  }

  /**
   * Broadcast current skills state to all webviews
   */
  broadcast(): void {
    broadcastToWebviews(this.activeWebviews, {
      type: 'skillsChanged',
      skills: this.cachedSkills,
      commands: this.cachedCommands,
    });
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}
