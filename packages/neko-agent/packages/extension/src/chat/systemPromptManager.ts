/**
 * System Prompt Manager
 *
 * Delegates prompt building to @neko/agent's SystemPromptBuilder.
 * Extension layer only manages:
 * - Per-conversation mode state (default/plan)
 * - AGENTS.md loading trigger
 * - Platform prompt registry bridge
 *
 * All prompt content (builtin defaults, plan mode, locale variants)
 * lives in @neko/agent — no duplicates here.
 */

import * as vscode from 'vscode';
import type { Platform } from '@neko/platform';
import {
  createConversationPromptModeRuntime,
  createSystemPromptBuilder,
  runSystemPromptAgentsFileLoadRuntime,
  type ConversationPromptModeRuntime,
  type ConversationPromptModeSnapshot,
  type SystemPromptBuilder,
  type PromptMode,
} from '@neko/agent';

export type { PromptMode };

// =============================================================================
// SystemPromptManager
// =============================================================================

export class SystemPromptManager {
  private _platform?: Platform;
  private _builder: SystemPromptBuilder;
  private readonly _promptModes: ConversationPromptModeRuntime;

  constructor(platform?: Platform) {
    this._platform = platform;
    this._builder = createSystemPromptBuilder({ locale: 'en' });
    this._promptModes = createConversationPromptModeRuntime();
  }

  /**
   * Set or update Platform reference
   */
  setPlatform(platform: Platform): void {
    this._platform = platform;
  }

  /**
   * Set locale for built-in prompts
   */
  setLocale(locale: string): void {
    this._builder.setLocale(locale.toLowerCase().startsWith('zh') ? 'zh' : 'en');
  }

  /**
   * Get current mode
   */
  getMode(conversationId: string): PromptMode {
    return this._promptModes.getMode(conversationId);
  }

  /**
   * Set prompt mode (default or plan)
   */
  setMode(conversationId: string, mode: PromptMode): ConversationPromptModeSnapshot {
    return this._promptModes.setMode(conversationId, mode);
  }

  /**
   * Toggle between default and plan mode
   */
  togglePlanMode(conversationId: string): ConversationPromptModeSnapshot {
    return this._promptModes.togglePlanMode(conversationId);
  }

  /**
   * Check if in plan mode
   */
  isPlanMode(conversationId: string): boolean {
    return this._promptModes.isPlanMode(conversationId);
  }

  getPromptModeSnapshot(conversationId: string): ConversationPromptModeSnapshot {
    const mode = this.getMode(conversationId);
    return {
      conversationId,
      mode,
      isPlanMode: mode === 'plan',
    };
  }

  getPromptModeRuntime(): ConversationPromptModeRuntime {
    return this._promptModes;
  }

  clearPromptMode(conversationId: string): void {
    this._promptModes.clear(conversationId);
  }

  clearAllPromptModes(): void {
    this._promptModes.clearAll();
  }

  /**
   * Load AGENTS.md content (call this during initialization)
   */
  async loadAgentsFile(): Promise<void> {
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    await runSystemPromptAgentsFileLoadRuntime({ workspacePath }, { builder: this._builder });
  }

  /**
   * Reload AGENTS.md content (call when file changes)
   */
  async reloadAgentsFile(): Promise<void> {
    await this.loadAgentsFile();
  }

  /**
   * Get AGENTS.md content
   */
  getAgentsContent(): string | null {
    return this._builder.getAgentsContent();
  }

  /**
   * Get AGENTS.md source
   */
  getAgentsSource(): 'personal' | 'project' | null {
    return this._builder.getAgentsSource();
  }

  /**
   * Get current base system prompt.
   *
   * AGENTS.md is loaded by this manager but projected as an environment-layer
   * overlay by the runtime session. It must not replace the base protocol.
   */
  getPrompt(conversationId: string): string {
    return this._builder.buildForMode(this.getMode(conversationId));
  }

  /**
   * Get prompt by ID from Platform
   */
  getPlatformPrompt(promptId: string, variables?: Record<string, unknown>): string | undefined {
    if (!this._platform) return undefined;

    const prompt = this._platform.prompts.get(promptId);
    if (!prompt) return undefined;

    if (variables) {
      const rendered = this._platform.prompts.render(promptId, variables);
      return rendered.content;
    }

    return prompt.template;
  }

  /**
   * Register a custom prompt to Platform
   */
  registerPrompt(prompt: {
    id: string;
    name: string;
    description: string;
    template: string;
    variables?: Array<{
      name: string;
      description: string;
      type: 'string' | 'number' | 'boolean' | 'object' | 'array';
      required: boolean;
      default?: unknown;
    }>;
  }): void {
    if (!this._platform) return;

    this._platform.prompts.register({
      id: prompt.id,
      name: prompt.name,
      description: prompt.description,
      category: 'custom',
      template: prompt.template,
      variables: prompt.variables || [],
      version: '1.0.0',
    });
  }
}
