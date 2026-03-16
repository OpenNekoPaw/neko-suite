/**
 * Settings Manager
 *
 * Facade over ConfigManager — reads/writes scalar AI settings from ~/.neko/config.json.
 * No longer uses VSCode workspaceState.
 *
 * Supports late initialization: can be constructed without a ConfigManager and
 * will return defaults until setConfigManager() is called.
 */

import type { ConfigManager } from '@neko/platform';
import { DEFAULT_EXTENSION_CONFIG, DEFAULT_CONFIG } from '@neko/shared';
import type { AIAssistantSettings } from './types';
import { DEFAULT_SETTINGS } from './types';

/** Field mapping: AIAssistantSettings key → UnifiedConfig key */
const FIELD_MAP: Record<string, string> = {
  selectedProviderId: 'defaultProvider',
  selectedModelId: 'defaultModel',
};

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

  /**
   * Get all settings (snapshot)
   */
  get settings(): AIAssistantSettings {
    if (!this._configManager) return { ...DEFAULT_SETTINGS };
    return {
      selectedProviderId: this._configManager.getDefaultProviderScalar() ?? null,
      selectedModelId: this._configManager.getDefaultModelScalar() ?? null,
      customSystemPrompt: this._configManager.getCustomSystemPrompt(),
      autoExecuteTools: this._configManager.getAutoExecuteTools(),
      streamResponses: this._configManager.getStreamResponses(),
      showToolCalls: this._configManager.getShowToolCalls(),
      temperature: this._configManager.getTemperature(),
      maxTokens: this._configManager.getMaxTokens(),
      executionMode: this._configManager.getExecutionMode(),
    };
  }

  /**
   * Get specific setting value
   */
  get<K extends keyof AIAssistantSettings>(key: K): AIAssistantSettings[K] {
    return this.settings[key];
  }

  /**
   * Update settings
   */
  update(updates: Partial<AIAssistantSettings>): void {
    if (!this._configManager) return;
    const mapped: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      const configKey = FIELD_MAP[key] ?? key;
      mapped[configKey] = value;
    }
    void this._configManager.setScalars(mapped);
  }

  /**
   * Update a single setting
   */
  set<K extends keyof AIAssistantSettings>(key: K, value: AIAssistantSettings[K]): void {
    if (!this._configManager) return;
    const configKey = FIELD_MAP[key as string] ?? (key as string);
    void this._configManager.setScalar(
      configKey as keyof import('@neko/shared').UnifiedConfig,
      value as never,
    );
  }

  /**
   * Reset settings to defaults
   */
  reset(): void {
    if (!this._configManager) return;
    void this._configManager.setScalars({
      defaultProvider: undefined,
      defaultModel: undefined,
      customSystemPrompt: undefined,
      autoExecuteTools: undefined,
      streamResponses: undefined,
      showToolCalls: undefined,
      temperature: undefined,
      maxTokens: undefined,
      executionMode: undefined,
      thinkingBudget: undefined,
    });
  }

  // ===========================================================================
  // Convenience Properties (backward compatible)
  // ===========================================================================

  get selectedProviderId(): string | null {
    return this._configManager?.getDefaultProviderScalar() ?? null;
  }

  set selectedProviderId(value: string | null) {
    void this._configManager?.setScalar('defaultProvider', value ?? undefined);
  }

  get selectedModelId(): string | null {
    return this._configManager?.getDefaultModelScalar() ?? null;
  }

  set selectedModelId(value: string | null) {
    void this._configManager?.setScalar('defaultModel', value ?? undefined);
  }

  get executionMode(): 'plan' | 'ask' | 'auto' {
    return this._configManager?.getExecutionMode() ?? DEFAULT_EXTENSION_CONFIG.executionMode;
  }

  set executionMode(value: 'plan' | 'ask' | 'auto') {
    void this._configManager?.setScalar('executionMode', value);
  }

  get customSystemPrompt(): string {
    return (
      this._configManager?.getCustomSystemPrompt() ?? DEFAULT_EXTENSION_CONFIG.customSystemPrompt
    );
  }

  set customSystemPrompt(value: string) {
    void this._configManager?.setScalar('customSystemPrompt', value);
  }

  get autoExecuteTools(): boolean {
    return this._configManager?.getAutoExecuteTools() ?? DEFAULT_EXTENSION_CONFIG.autoExecuteTools;
  }

  get temperature(): number {
    return this._configManager?.getTemperature() ?? DEFAULT_CONFIG.temperature;
  }

  get maxTokens(): number {
    return this._configManager?.getMaxTokens() ?? DEFAULT_CONFIG.maxTokens;
  }

  get thinkingBudget(): number {
    return this._configManager?.getThinkingBudget() ?? DEFAULT_EXTENSION_CONFIG.thinkingBudget;
  }
}
