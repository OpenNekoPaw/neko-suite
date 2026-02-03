/**
 * Settings Manager
 * Handles AI Assistant settings state and persistence
 */

import * as vscode from 'vscode';
import { AIAssistantSettings, DEFAULT_SETTINGS } from './types';

export class SettingsManager {
  private _settings: AIAssistantSettings;

  constructor(private readonly _context: vscode.ExtensionContext) {
    // Load saved settings or use defaults
    const savedSettings = this._context.workspaceState.get<Partial<AIAssistantSettings>>('aiAssistant.settings');
    this._settings = { ...DEFAULT_SETTINGS, ...savedSettings };
  }

  /**
   * Get all settings
   */
  get settings(): AIAssistantSettings {
    return { ...this._settings };
  }

  /**
   * Get specific setting value
   */
  get<K extends keyof AIAssistantSettings>(key: K): AIAssistantSettings[K] {
    return this._settings[key];
  }

  /**
   * Update settings
   */
  update(updates: Partial<AIAssistantSettings>): void {
    this._settings = { ...this._settings, ...updates };
    this._persist();
  }

  /**
   * Update a single setting
   */
  set<K extends keyof AIAssistantSettings>(key: K, value: AIAssistantSettings[K]): void {
    this._settings[key] = value;
    this._persist();
  }

  /**
   * Reset settings to defaults
   */
  reset(): void {
    this._settings = { ...DEFAULT_SETTINGS };
    this._persist();
  }

  /**
   * Persist settings to workspace state
   */
  private _persist(): void {
    this._context.workspaceState.update('aiAssistant.settings', this._settings);
  }

  /**
   * Get selected provider ID
   */
  get selectedProviderId(): string | null {
    return this._settings.selectedProviderId;
  }

  set selectedProviderId(value: string | null) {
    this.set('selectedProviderId', value);
  }

  /**
   * Get selected model ID
   */
  get selectedModelId(): string | null {
    return this._settings.selectedModelId;
  }

  set selectedModelId(value: string | null) {
    this.set('selectedModelId', value);
  }

  /**
   * Get execution mode
   */
  get executionMode(): 'plan' | 'ask' | 'auto' {
    return this._settings.executionMode;
  }

  set executionMode(value: 'plan' | 'ask' | 'auto') {
    this.set('executionMode', value);
  }

  /**
   * Get custom system prompt
   */
  get customSystemPrompt(): string {
    return this._settings.customSystemPrompt;
  }

  set customSystemPrompt(value: string) {
    this.set('customSystemPrompt', value);
  }

  /**
   * Get auto execute tools setting
   */
  get autoExecuteTools(): boolean {
    return this._settings.autoExecuteTools;
  }

  /**
   * Get temperature
   */
  get temperature(): number {
    return this._settings.temperature;
  }

  /**
   * Get max tokens
   */
  get maxTokens(): number {
    return this._settings.maxTokens;
  }
}
