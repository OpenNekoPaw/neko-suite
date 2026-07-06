/**
 * Core Meta Tools
 *
 * With 1M context, all tools are always visible. Meta tools now focus on:
 * - GetContext: Current state overview (active skill, registered skills, tool categories)
 * - ActivateSkill: AI-driven skill activation (injects domain-specific instructions)
 * - DeactivateSkill: Clear the active skill
 * - SetExecutionMode: AI-driven capability activation through typed intents
 */

import type {
  Tool,
  ToolResult,
  ToolCategory,
  ToolParameters,
  IToolCategoryRegistry,
  IToolGroupRegistry,
  IToolInjectionManager,
  RelatedSkill,
  SkillMediaWorkflowHint,
  ActiveSkillLifecycleRecordProjection,
  SkillLifecycleDiagnostic,
  ToolExecuteOptions,
} from '@neko/shared';
import { BuiltinTool } from '@neko/shared';
import type { ExecutionMode } from '../../session/types';

// =============================================================================
// Skill Provider Interface
// =============================================================================

export interface SkillContextSummary {
  readonly name: string;
  readonly description: string;
  readonly domain?: string;
  readonly relatedSkills?: readonly RelatedSkill[];
  readonly mediaWorkflow?: SkillMediaWorkflowHint;
}

export interface SkillActivationRequest {
  readonly name: string;
  readonly reason: string;
}

/**
 * Interface for providing skill information to meta tools.
 * Set by the extension layer after initialization.
 */
export interface ISkillProvider {
  /** List all registered skills and Agent-readable catalog metadata. */
  listSkills(): SkillProviderMaybePromise<SkillContextSummary[]>;
  /** Get active skill info */
  getActiveSkill(): SkillProviderMaybePromise<SkillContextSummary | null>;
  /** Get active lifecycle records for prompt/tool/UI projection. */
  getActiveSkillLifecycle?(): SkillProviderMaybePromise<{
    records: readonly ActiveSkillLifecycleRecordProjection[];
    diagnostics: readonly SkillLifecycleDiagnostic[];
  }>;
  /** Activate a skill by name after the Agent has decided and explained why. */
  activateSkill(input: SkillActivationRequest): SkillProviderMaybePromise<{
    success: boolean;
    message: string;
    allowedTools?: string[];
    lifecycleRecordId?: string;
    diagnostics?: readonly SkillLifecycleDiagnostic[];
  }>;
  /** Deactivate the current active skill */
  deactivateSkill(input?: {
    readonly recordId?: string;
    readonly slot?: string;
    readonly skillName?: string;
  }): SkillProviderMaybePromise<{
    success: boolean;
    message: string;
    removedRecordIds?: readonly string[];
    diagnostics?: readonly SkillLifecycleDiagnostic[];
  }>;
  /** Request an execution-mode change through an Agent-tool activation intent. */
  setExecutionMode?(input: {
    readonly mode: ExecutionMode;
    readonly reason?: string;
  }): SkillProviderMaybePromise<{
    readonly success: boolean;
    readonly message: string;
    readonly mode?: ExecutionMode;
  }>;
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
      const lifecycle = await this._skillProvider.getActiveSkillLifecycle?.();
      if (lifecycle) {
        result.activeSkillLifecycle = lifecycle;
      }
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
    'Activate a skill after ordinary Agent understanding confirms a domain skill is needed. Do not use keyword matching alone. Briefly state the activation reason before calling this tool. Only one skill can be active at a time.';
  readonly parameters: ToolParameters = {
    type: 'object',
    properties: {
      skillName: {
        type: 'string',
        description: 'Name of the skill to activate',
      },
      reason: {
        type: 'string',
        description:
          'Concise reason based on the current conversation and gathered context, explaining why this skill is needed now.',
      },
    },
    required: ['skillName', 'reason'],
  };
  readonly category: ToolCategory = 'system';

  private _skillProvider?: ISkillProvider;

  setSkillProvider(provider: ISkillProvider): void {
    this._skillProvider = provider;
  }

  async execute(args: Record<string, unknown>, options?: ToolExecuteOptions): Promise<ToolResult> {
    const validation = this.validateArgs(args);
    if (!validation.valid) {
      return this.error(validation.error ?? 'Invalid arguments');
    }

    if (!this._skillProvider) {
      return this.error('Skill system not initialized');
    }

    const skillName = args.skillName as string;
    const reason = typeof args.reason === 'string' ? args.reason.trim() : '';
    if (reason.length === 0) {
      return this.error('Activation reason is required');
    }

    const result = await this._skillProvider.activateSkill({ name: skillName, reason });

    if (!result.success) {
      return this.error(result.message);
    }

    return this.success({
      activated: true,
      skillName,
      reason,
      message: formatSkillActivatedMessage(skillName, options?.metadata?.['locale']),
      ...(result.allowedTools ? { allowedTools: result.allowedTools } : {}),
      ...(result.lifecycleRecordId ? { lifecycleRecordId: result.lifecycleRecordId } : {}),
      ...(result.diagnostics ? { diagnostics: result.diagnostics } : {}),
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
    properties: {
      recordId: {
        type: 'string',
        description: 'Optional lifecycle record id to deactivate',
      },
      slot: {
        type: 'string',
        description: 'Optional lifecycle slot to clear',
      },
      skillName: {
        type: 'string',
        description: 'Optional skill name to clear when unambiguous',
      },
    },
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

    const result = await this._skillProvider.deactivateSkill({
      ...(typeof _args.recordId === 'string' ? { recordId: _args.recordId } : {}),
      ...(typeof _args.slot === 'string' ? { slot: _args.slot } : {}),
      ...(typeof _args.skillName === 'string' ? { skillName: _args.skillName } : {}),
    });

    if (!result.success) {
      return this.error(result.message);
    }

    return this.success({
      deactivated: true,
      message: result.message,
      removedRecordIds: result.removedRecordIds,
      diagnostics: result.diagnostics,
    });
  }
}

// =============================================================================
// SetExecutionMode Tool
// =============================================================================

/**
 * SetExecutionMode - AI-driven visible execution-mode request.
 */
export class SetExecutionModeTool extends BuiltinTool {
  readonly name = 'SetExecutionMode';
  readonly description =
    'Request a visible execution mode change. Use plan to dry-run, ask to require approval, and auto to run approved safe actions automatically.';
  readonly parameters: ToolParameters = {
    type: 'object',
    properties: {
      mode: {
        type: 'string',
        enum: ['plan', 'ask', 'auto'],
        description: 'Execution mode to set',
      },
      reason: {
        type: 'string',
        description: 'Short reason shown in activation provenance',
      },
    },
    required: ['mode'],
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

    const mode = readExecutionMode(args.mode);
    if (!mode) {
      return this.error('Invalid execution mode');
    }
    if (!this._skillProvider?.setExecutionMode) {
      return this.error('Execution mode activation is not initialized');
    }

    const result = await this._skillProvider.setExecutionMode({
      mode,
      ...(typeof args.reason === 'string' ? { reason: args.reason } : {}),
    });

    if (!result.success) {
      return this.error(result.message);
    }

    return this.success({
      changed: true,
      mode: result.mode ?? mode,
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
    new SetExecutionModeTool(),
  ];
}

function readExecutionMode(value: unknown): ExecutionMode | null {
  return value === 'plan' || value === 'ask' || value === 'auto' ? value : null;
}

function formatSkillActivatedMessage(skillName: string, locale: unknown): string {
  return typeof locale === 'string' && locale.trim().toLowerCase().startsWith('zh')
    ? `已激活技能 "${skillName}"`
    : `Activated skill "${skillName}"`;
}
