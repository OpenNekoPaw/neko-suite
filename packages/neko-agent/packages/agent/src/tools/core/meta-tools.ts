/**
 * Core Meta Tools
 *
 * With 1M context, all tools are always visible. Meta tools now focus on:
 * - GetContext: Current state overview (active skill, registered skills, tool categories)
 * - ActivateSkill: AI-driven skill activation (injects domain-specific instructions)
 * - DeactivateSkill: Clear the active skill
 */

import type {
  Tool,
  ToolResult,
  ToolCategory,
  ToolParameters,
  IToolCategoryRegistry,
  IToolGroupRegistry,
  IToolInjectionManager,
} from '@neko/shared';
import { BuiltinTool } from '@neko/shared';

// =============================================================================
// Skill Provider Interface
// =============================================================================

/**
 * Interface for providing skill information to meta tools.
 * Set by the extension layer after initialization.
 */
export interface ISkillProvider {
  /** List all registered skills (name + description) */
  listSkills(): SkillProviderMaybePromise<Array<{ name: string; description: string }>>;
  /** Get active skill info */
  getActiveSkill(): SkillProviderMaybePromise<{ name: string; description: string } | null>;
  /** Activate a skill by name. Returns injection result or error. */
  activateSkill(
    name: string,
  ): SkillProviderMaybePromise<{ success: boolean; message: string; allowedTools?: string[] }>;
  /** Deactivate the current active skill */
  deactivateSkill(): SkillProviderMaybePromise<{ success: boolean; message: string }>;
}

export type SkillProviderFactory = (conversationId: string) => ISkillProvider;

export type SkillProviderMaybePromise<T> = T | Promise<T>;

// =============================================================================
// GetContext Tool
// =============================================================================

/**
 * GetContext - Get current context information
 */
export class GetContextTool extends BuiltinTool {
  readonly name = 'GetContext';
  readonly description =
    'Get current context: active skill, registered skills, and available tool categories.';
  readonly parameters: ToolParameters = {
    type: 'object',
    properties: {
      includeTools: {
        type: 'boolean',
        description: 'Include full list of available tools grouped by category',
      },
    },
  };
  readonly category: ToolCategory = 'system';
  override readonly isConcurrencySafe = true;
  override readonly isReadOnly = true;

  private categoryRegistry: IToolCategoryRegistry;
  private skillRegistry?: IToolGroupRegistry;
  private _skillProvider?: ISkillProvider;

  constructor(categoryRegistry: IToolCategoryRegistry, skillRegistry?: IToolGroupRegistry) {
    super();
    this.categoryRegistry = categoryRegistry;
    this.skillRegistry = skillRegistry;
  }

  setSkillProvider(provider: ISkillProvider): void {
    this._skillProvider = provider;
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const includeTools = args.includeTools as boolean | undefined;

    const result: Record<string, unknown> = {};

    // Active skill
    if (this._skillProvider) {
      result.activeSkill = await this._skillProvider.getActiveSkill();
      result.registeredSkills = await this._skillProvider.listSkills();
    }

    // Tool categories (semantic groupings)
    if (this.skillRegistry) {
      const allGroups = this.skillRegistry.list();
      result.toolCategories = allGroups
        .filter((g) => g.enabled)
        .map((g) => ({ name: g.name, description: g.description, toolCount: g.tools.length }));
    }

    // Full tool list by category
    if (includeTools) {
      const categories = this.categoryRegistry.listCategories();
      result.tools = categories.map((cat) => ({
        category: cat.displayName,
        tools: this.categoryRegistry.getToolsByCategory(cat.id).map((t) => t.name),
      }));
    }

    return this.success(result);
  }
}

// =============================================================================
// ActivateSkill Tool
// =============================================================================

/**
 * ActivateSkill - AI-driven skill activation
 *
 * Activates a registered skill, injecting domain-specific instructions
 * into the conversation context. Only one skill can be active at a time.
 */
export class ActivateSkillTool extends BuiltinTool {
  readonly name = 'ActivateSkill';
  readonly description =
    'Activate a skill to receive specialized domain instructions. Use GetContext to see available skills. Only one skill can be active at a time.';
  readonly parameters: ToolParameters = {
    type: 'object',
    properties: {
      skillName: {
        type: 'string',
        description: 'Name of the skill to activate',
      },
    },
    required: ['skillName'],
  };
  readonly category: ToolCategory = 'system';

  private _skillProvider?: ISkillProvider;

  setSkillProvider(provider: ISkillProvider): void {
    this._skillProvider = provider;
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const validation = this.validateArgs(args);
    if (!validation.valid) {
      return this.error(validation.error ?? 'Invalid arguments');
    }

    if (!this._skillProvider) {
      return this.error('Skill system not initialized');
    }

    const skillName = args.skillName as string;
    const result = await this._skillProvider.activateSkill(skillName);

    if (!result.success) {
      return this.error(result.message);
    }

    return this.success({
      activated: true,
      skillName,
      message: result.message,
      allowedTools: result.allowedTools,
    });
  }
}

// =============================================================================
// DeactivateSkill Tool
// =============================================================================

/**
 * DeactivateSkill - Clear the active skill
 */
export class DeactivateSkillTool extends BuiltinTool {
  readonly name = 'DeactivateSkill';
  readonly description =
    'Deactivate the currently active skill, removing its specialized instructions.';
  readonly parameters: ToolParameters = {
    type: 'object',
    properties: {},
  };
  readonly category: ToolCategory = 'system';

  private _skillProvider?: ISkillProvider;

  setSkillProvider(provider: ISkillProvider): void {
    this._skillProvider = provider;
  }

  async execute(_args: Record<string, unknown>): Promise<ToolResult> {
    if (!this._skillProvider) {
      return this.error('Skill system not initialized');
    }

    const result = await this._skillProvider.deactivateSkill();

    if (!result.success) {
      return this.error(result.message);
    }

    return this.success({
      deactivated: true,
      message: result.message,
    });
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Factory function to create all core meta tools
 */
export function createCoreMetaTools(
  categoryRegistry: IToolCategoryRegistry,
  _injectionManager: IToolInjectionManager,
  skillRegistry?: IToolGroupRegistry,
): Tool[] {
  return [
    new GetContextTool(categoryRegistry, skillRegistry),
    new ActivateSkillTool(),
    new DeactivateSkillTool(),
  ];
}
