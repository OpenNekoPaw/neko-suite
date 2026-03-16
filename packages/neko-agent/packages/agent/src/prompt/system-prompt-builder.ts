/**
 * System Prompt Builder — Initialization-phase prompt construction from static sources
 *
 * Responsibility: Load AGENTS.md from disk, handle locale/mode switching, and produce
 * the initial system prompt string. This output is typically passed to
 * SystemPromptComposer.setBase() for runtime management.
 *
 * Lifecycle:
 *   Builder.build() → initial prompt string → Composer.setBase() → runtime sections
 *
 * NOT to be confused with SystemPromptComposer, which handles runtime section-based
 * composition with token budgets and reversible injection.
 *
 * Usage:
 * ```typescript
 * const builder = new SystemPromptBuilder({ locale: 'en' });
 * await builder.loadAgentsFile('/path/to/project', '/home/user/.neko');
 * const basePrompt = builder.build();
 * // Then: composer.setBase(basePrompt);
 * ```
 */

import * as fs from 'fs';
import * as path from 'path';

import type {
  ISystemPromptBuilder,
  SystemPromptBuilderConfig,
  PromptMode,
  PromptLocale,
  AgentsSource,
  AgentsLoadResult,
} from './system-prompt-builder-types';

import { BUILTIN_PROMPTS } from './builtin-prompts';

// =============================================================================
// Constants
// =============================================================================

/** AGENTS.md filename */
const AGENTS_FILENAME = 'AGENTS.md';

/** Config directory name */
const CONFIG_DIR = '.neko';

// =============================================================================
// SystemPromptBuilder Implementation
// =============================================================================

/**
 * System Prompt Builder
 */
export class SystemPromptBuilder implements ISystemPromptBuilder {
  private _locale: PromptLocale;
  private _mode: PromptMode;
  private _customDefaultPrompt?: string;
  private _customPlanPrompt?: string;
  private _agentsContent: string | null = null;
  private _agentsSource: AgentsSource = null;

  constructor(config: SystemPromptBuilderConfig = {}) {
    this._locale = this._normalizeLocale(config.locale);
    this._mode = config.mode ?? 'default';
    this._customDefaultPrompt = config.customDefaultPrompt;
    this._customPlanPrompt = config.customPlanPrompt;
  }

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  setLocale(locale: PromptLocale | string): void {
    this._locale = this._normalizeLocale(locale);
  }

  getLocale(): PromptLocale {
    return this._locale;
  }

  setMode(mode: PromptMode): void {
    this._mode = mode;
  }

  getMode(): PromptMode {
    return this._mode;
  }

  togglePlanMode(): PromptMode {
    this._mode = this._mode === 'plan' ? 'default' : 'plan';
    return this._mode;
  }

  isPlanMode(): boolean {
    return this._mode === 'plan';
  }

  // ---------------------------------------------------------------------------
  // AGENTS.md Management
  // ---------------------------------------------------------------------------

  async loadAgentsFile(
    projectPath?: string,
    personalPath?: string,
  ): Promise<AgentsLoadResult | null> {
    // Try project AGENTS.md first (higher priority)
    if (projectPath) {
      const projectAgentsPath = path.join(projectPath, CONFIG_DIR, AGENTS_FILENAME);
      const result = await this._tryLoadFile(projectAgentsPath, 'project');
      if (result) {
        this._agentsContent = result.content;
        this._agentsSource = result.source;
        return result;
      }
    }

    // Try personal AGENTS.md
    if (personalPath) {
      const personalAgentsPath = path.join(personalPath, AGENTS_FILENAME);
      const result = await this._tryLoadFile(personalAgentsPath, 'personal');
      if (result) {
        this._agentsContent = result.content;
        this._agentsSource = result.source;
        return result;
      }
    }

    // No AGENTS.md found
    this._agentsContent = null;
    this._agentsSource = null;
    return null;
  }

  setAgentsContent(content: string | null, source: AgentsSource = null): void {
    this._agentsContent = content;
    this._agentsSource = source;
  }

  getAgentsContent(): string | null {
    return this._agentsContent;
  }

  getAgentsSource(): AgentsSource {
    return this._agentsSource;
  }

  // ---------------------------------------------------------------------------
  // Prompt Building
  // ---------------------------------------------------------------------------

  build(): string {
    // 1. Plan mode - use plan prompt
    if (this._mode === 'plan') {
      return this._getPlanPrompt();
    }

    // 2. AGENTS.md content (completely replaces default)
    if (this._agentsContent) {
      return this._agentsContent;
    }

    // 3. Built-in default prompt
    return this._getDefaultPrompt();
  }

  buildWithSkill(skillPrompt: string): string {
    const basePrompt = this.build();
    return `${basePrompt}\n\n# Active Skill\n\n${skillPrompt}`;
  }

  buildWithSuffix(suffix: string): string {
    const basePrompt = this.build();
    return `${basePrompt}\n\n${suffix}`;
  }

  // ---------------------------------------------------------------------------
  // Private Methods
  // ---------------------------------------------------------------------------

  private _normalizeLocale(locale?: PromptLocale | string): PromptLocale {
    if (!locale) return 'en';
    const lower = locale.toLowerCase();
    return lower.startsWith('zh') ? 'zh' : 'en';
  }

  private _getDefaultPrompt(): string {
    if (this._customDefaultPrompt) {
      return this._customDefaultPrompt;
    }
    const key = `default-${this._locale}` as const;
    return BUILTIN_PROMPTS[key];
  }

  private _getPlanPrompt(): string {
    if (this._customPlanPrompt) {
      return this._customPlanPrompt;
    }
    const key = `plan-${this._locale}` as const;
    return BUILTIN_PROMPTS[key];
  }

  private async _tryLoadFile(
    filePath: string,
    source: 'project' | 'personal',
  ): Promise<AgentsLoadResult | null> {
    try {
      if (!fs.existsSync(filePath)) {
        return null;
      }
      const content = fs.readFileSync(filePath, 'utf-8');
      return { content, source, path: filePath };
    } catch {
      return null;
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a system prompt builder
 */
export function createSystemPromptBuilder(config?: SystemPromptBuilderConfig): SystemPromptBuilder {
  return new SystemPromptBuilder(config);
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get default personal config path
 */
export function getDefaultPersonalPath(): string {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  return path.join(home, CONFIG_DIR);
}

/**
 * Check if AGENTS.md exists in a directory
 */
export function hasAgentsFile(dirPath: string): boolean {
  const agentsPath = path.join(dirPath, CONFIG_DIR, AGENTS_FILENAME);
  return fs.existsSync(agentsPath);
}
