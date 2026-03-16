/**
 * System Prompt Manager
 *
 * Delegates prompt building to @neko/agent's SystemPromptBuilder.
 * Extension layer only manages:
 * - Mode state (default/plan)
 * - AGENTS.md loading trigger
 * - Platform prompt registry bridge
 *
 * All prompt content (builtin defaults, plan mode, locale variants)
 * lives in @neko/agent — no duplicates here.
 */

import * as vscode from 'vscode';
import type { Platform } from '@neko/platform';
import {
  createSystemPromptBuilder,
  getDefaultPersonalPath,
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

  constructor(platform?: Platform) {
    this._platform = platform;
    this._builder = createSystemPromptBuilder({ locale: 'en' });
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
  getMode(): PromptMode {
    return this._builder.getMode();
  }

  /**
   * Set prompt mode (default or plan)
   */
  setMode(mode: PromptMode): void {
    this._builder.setMode(mode);
  }

  /**
   * Toggle between default and plan mode
   */
  togglePlanMode(): PromptMode {
    return this._builder.togglePlanMode();
  }

  /**
   * Check if in plan mode
   */
  isPlanMode(): boolean {
    return this._builder.isPlanMode();
  }

  /**
   * Load AGENTS.md content (call this during initialization)
   */
  async loadAgentsFile(): Promise<void> {
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    await this._builder.loadAgentsFile(workspacePath, getDefaultPersonalPath());
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
   * Get current system prompt
   *
   * Priority (handled by SystemPromptBuilder):
   * 1. Plan mode prompt (if in plan mode)
   * 2. AGENTS.md content (project > personal)
   * 3. Built-in default prompt
   */
  getPrompt(): string {
    return this._builder.build();
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
