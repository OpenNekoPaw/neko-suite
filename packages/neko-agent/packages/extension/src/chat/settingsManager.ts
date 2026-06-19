/**
 * Settings Manager
 *
 * Facade over ConfigManager — reads scalar AI settings from ~/.neko/config.toml.
 * No longer uses VSCode workspaceState.
 *
 * Supports late initialization: can be constructed without a ConfigManager and
 * will return defaults until setConfigManager() is called.
 */

import {
  buildAssistantRuntimeSettingsSnapshot,
  type AssistantRuntimeSettingsSnapshot,
  type ConfigManager,
} from '@neko/platform';

export class SettingsManager {
  private _configManager: ConfigManager | null;

  constructor(configManager?: ConfigManager) {
    this._configManager = configManager ?? null;
  }

  /**
   * Late-bind ConfigManager (called when Platform becomes available)
   */
  setConfigManager(configManager: ConfigManager): void {
    this._configManager = configManager;
  }

  get selectedProviderId(): string | null {
    return this.snapshot.selectedProviderId;
  }

  get selectedModelId(): string | null {
    return this.snapshot.selectedModelId;
  }

  get executionMode(): 'plan' | 'ask' | 'auto' {
    return this.snapshot.executionMode;
  }

  get customSystemPrompt(): string {
    return this.snapshot.customSystemPrompt;
  }

  get autoExecuteTools(): boolean {
    return this.snapshot.autoExecuteTools;
  }

  get temperature(): number {
    return this.snapshot.temperature;
  }

  get maxTokens(): number {
    return this.snapshot.maxTokens;
  }

  get thinkingBudget(): number {
    return this.snapshot.thinkingBudget;
  }

  private get snapshot(): AssistantRuntimeSettingsSnapshot {
    return (
      this._configManager?.getAssistantRuntimeSettingsSnapshot() ??
      buildAssistantRuntimeSettingsSnapshot({
        defaultProvider: null,
        defaultModel: null,
      })
    );
  }
}
