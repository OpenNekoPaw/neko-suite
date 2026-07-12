/**
 * Core Meta Tools
 *
 * With 1M context, all tools are always visible. Meta tools now focus on:
 * - GetContext: Current state overview (active skill lifecycle, registered skills, tool categories)
 * - CreateSkill: Native typed creation of a complete portable Skill package
 * - ActivateSkill: AI-driven skill activation (injects lifecycle-scoped instructions)
 * - DeactivateSkill: Clear targeted active skill lifecycle records
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
  NekoSkillHostProjection,
  NekoSkillInterfaceMetadata,
  NekoSkillRelationships,
  ActiveSkillLifecycleRecordProjection,
  SkillLifecycleDiagnostic,
  SkillLifecycleSlot,
  ToolExecuteOptions,
  CreateSkillFailure,
  CreateSkillFailureCode,
  CreateSkillInput,
  CreateSkillResult,
  NekoSkillOverlay,
  PortableSkillDefinition,
  SkillDiagnostic,
  SkillResourceInput,
} from '@neko/shared';
import { BuiltinTool, isAgentProfileKind, isAgentProfileRelationship } from '@neko/shared';
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
  /** Optional Neko-authored display metadata; never contains Host runtime facts. */
  readonly interface?: NekoSkillInterfaceMetadata;
  /** Neko-authored discovery/composition relationships. */
  readonly relationships?: NekoSkillRelationships;
  /** Registry-projected Host facts for the current runtime. */
  readonly host?: NekoSkillHostProjection;
}

export interface SkillActivationRequest {
  readonly name: string;
  readonly reason: string;
  readonly slot?: SkillLifecycleSlot;
}

export type SkillProviderFailureCode =
  | 'skill-system-unavailable'
  | 'skill-not-found'
  | 'activation-rejected'
  | 'deactivation-rejected'
  | 'provider-error';

export type SkillActivationProviderResult =
  | Readonly<{
      readonly success: true;
      readonly skillName?: string;
      readonly requestedSkillName?: string;
      readonly allowedTools?: string[];
      readonly lifecycleRecordId?: string;
      readonly diagnostics?: readonly SkillLifecycleDiagnostic[];
    }>
  | Readonly<{
      readonly success: false;
      readonly code: SkillProviderFailureCode;
      readonly detail?: string;
      readonly diagnostics?: readonly SkillLifecycleDiagnostic[];
    }>;

export type SkillDeactivationProviderResult =
  | Readonly<{
      readonly success: true;
      readonly removedRecordIds?: readonly string[];
      readonly diagnostics?: readonly SkillLifecycleDiagnostic[];
    }>
  | Readonly<{
      readonly success: false;
      readonly code: SkillProviderFailureCode;
      readonly detail?: string;
      readonly diagnostics?: readonly SkillLifecycleDiagnostic[];
    }>;

export type ExecutionModeActivationFailureCode = 'activation-rejected' | 'provider-error';

export type ExecutionModeActivationResult =
  | Readonly<{
      readonly success: true;
      readonly changed: boolean;
      readonly requestedMode: ExecutionMode;
      readonly effectiveMode: ExecutionMode;
    }>
  | Readonly<{
      readonly success: false;
      readonly code: ExecutionModeActivationFailureCode;
      readonly detail?: string;
    }>;

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
  activateSkill(
    input: SkillActivationRequest,
  ): SkillProviderMaybePromise<SkillActivationProviderResult>;
  /** Deactivate the current active skill */
  deactivateSkill(input?: {
    readonly recordId?: string;
    readonly slot?: string;
    readonly skillName?: string;
  }): SkillProviderMaybePromise<SkillDeactivationProviderResult>;
  /** Create a complete portable Skill package without activating it. */
  createSkill?(input: CreateSkillInput): SkillProviderMaybePromise<CreateSkillResult>;
  /** Request an execution-mode change through an Agent-tool activation intent. */
  setExecutionMode?(input: {
    readonly mode: ExecutionMode;
    readonly reason?: string;
  }): SkillProviderMaybePromise<ExecutionModeActivationResult>;
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
    'Get current context: active skill lifecycle records, registered skills, and available tool categories.';
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
        result.activeSkillLifecycle = {
          records: lifecycle.records.map(({ lockedReason: _lockedReason, ...record }) => record),
          diagnostics: lifecycle.diagnostics.map(projectSkillLifecycleDiagnosticData),
        };
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
      result.toolDiscoveryNotes = [
        'The tools list contains currently categorized callable tools only.',
        'Provider capability catalogs and lifecycle descriptors are separate from callable tool availability.',
        'If a needed provider tool is absent, inspect registered skills and activate the relevant supplemental skill in referenceSkill when it should not replace the domain skill.',
      ];
    }

    return this.success(result);
  }
}

// =============================================================================
// CreateSkill Tool
// =============================================================================

/**
 * CreateSkill - Native typed creation of a complete portable Agent Skill package.
 */
export class CreateSkillTool extends BuiltinTool {
  readonly name = 'CreateSkill';
  readonly description =
    'Create a complete portable Agent Skill package in the project or personal canonical Skill root. Creation writes the package atomically and makes it discoverable; it does not activate the Skill or grant permissions.';
  readonly parameters: ToolParameters = {
    type: 'object',
    properties: {
      target: {
        type: 'string',
        enum: ['project', 'personal'],
        description: 'Canonical destination root for the new Skill package.',
      },
      skill: {
        type: 'object',
        description: 'Complete portable SKILL.md definition.',
        properties: {
          name: { type: 'string', description: 'Portable Skill directory and frontmatter name.' },
          description: { type: 'string', description: 'Portable Skill discovery description.' },
          body: { type: 'string', description: 'Complete Markdown instruction body.' },
          license: { type: 'string', description: 'Optional license identifier or text.' },
          compatibility: {
            type: 'string',
            description: 'Optional portable compatibility description.',
          },
          metadata: {
            type: 'object',
            description: 'Optional portable string metadata.',
            additionalProperties: { type: 'string' },
          },
          allowedTools: {
            type: 'array',
            description: 'Optional portable allowed-tools identifiers.',
            items: { type: 'string' },
          },
        },
        required: ['name', 'description', 'body'],
        additionalProperties: false,
      },
      resources: {
        type: 'array',
        description: 'Optional contained files under scripts/, references/, or assets/.',
        items: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            encoding: { type: 'string', enum: ['utf8', 'base64'] },
            content: { type: 'string' },
          },
          required: ['path', 'encoding', 'content'],
          additionalProperties: false,
        },
      },
      neko: {
        type: 'object',
        description:
          'Optional versioned Neko Host overlay for author-owned interface and relationships.',
        properties: {
          schemaVersion: { type: 'integer', enum: [1] },
          interface: {
            type: 'object',
            properties: {
              displayName: { type: 'string' },
              shortDescription: { type: 'string' },
              iconSmall: { type: 'string' },
              defaultPrompt: { type: 'string' },
            },
            additionalProperties: false,
          },
          dependencies: {
            type: 'object',
            properties: {
              capabilities: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    requirement: { type: 'string', enum: ['required', 'optional'] },
                  },
                  required: ['id', 'requirement'],
                  additionalProperties: false,
                },
              },
              profiles: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    kind: {
                      type: 'string',
                      enum: ['artifact', 'creation', 'provider-expression'],
                    },
                    relationship: {
                      type: 'string',
                      enum: ['consumes', 'produces', 'requires', 'prefers'],
                    },
                    versionRange: { type: 'string' },
                  },
                  required: ['id', 'kind', 'relationship'],
                  additionalProperties: false,
                },
              },
            },
            additionalProperties: false,
          },
          relationships: {
            type: 'object',
            properties: {
              skills: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    relationship: { type: 'string' },
                  },
                  required: ['name', 'relationship'],
                  additionalProperties: false,
                },
              },
            },
            additionalProperties: false,
          },
        },
        required: ['schemaVersion'],
        additionalProperties: false,
      },
    },
    required: ['target', 'skill'],
    additionalProperties: false,
  };
  readonly category: ToolCategory = 'system';

  private _skillProvider?: ISkillProvider;

  setSkillProvider(provider: ISkillProvider): void {
    this._skillProvider = provider;
  }

  async execute(args: Record<string, unknown>, options?: ToolExecuteOptions): Promise<ToolResult> {
    const locale = options?.metadata?.['locale'];
    const input = readCreateSkillInput(args);
    if (!input) {
      return this.error(presentCreateSkillBoundaryFailure('invalid-input', locale));
    }
    if (!this._skillProvider?.createSkill) {
      return this.error(presentCreateSkillBoundaryFailure('creation-unavailable', locale));
    }

    try {
      const result = await this._skillProvider.createSkill(input);
      return this.success({
        created: true,
        source: result.source,
        rootId: result.rootId,
        relativePath: result.relativePath,
        absolutePath: result.absolutePath,
        fingerprint: result.fingerprint,
        diagnostics: result.diagnostics.map(projectSkillDiagnosticData),
      });
    } catch (error) {
      const failure = readCreateSkillFailure(error);
      if (!failure) {
        throw error;
      }
      const projectedFailure = {
        code: failure.code,
        diagnostics: failure.diagnostics.map(projectSkillDiagnosticData),
        ...(failure.detail === undefined ? {} : { detail: failure.detail }),
      };
      return {
        success: false,
        error: presentCreateSkillFailure(failure, locale, input.skill.name),
        data: projectedFailure,
      };
    }
  }
}

// =============================================================================
// ActivateSkill Tool
// =============================================================================

/**
 * ActivateSkill - AI-driven skill activation
 *
 * Activates a registered skill, injecting lifecycle-scoped instructions
 * into the conversation context. Multiple skills can coexist in different
 * slots; referenceSkill guidance does not replace the current domain skill.
 */
export class ActivateSkillTool extends BuiltinTool {
  readonly name = 'ActivateSkill';
  readonly description =
    'Activate a currently registered skill after ordinary Agent understanding confirms it is needed. Before calling, inspect GetContext in the current conversation and copy an exact registeredSkills.name; never construct or guess a skill name from the source modality, workflow stage, or task wording. Briefly state the activation reason before calling this tool. Use slot=domainSkill for the main task domain, and slot=referenceSkill for supplemental capability guidance such as Canvas authoring so the current domain skill stays active.';
  get parameters(): ToolParameters {
    return {
      type: 'object',
      properties: {
        skillName: {
          type: 'string',
          ...(this._registeredSkillNames.length > 0
            ? { enum: [...this._registeredSkillNames] }
            : {}),
          description: 'Exact registered skill name to activate',
        },
        reason: {
          type: 'string',
          description:
            'Concise reason based on the current conversation and gathered context, explaining why this skill is needed now.',
        },
        slot: {
          type: 'string',
          enum: [
            'domainSkill',
            'referenceSkill',
            'promptChainSkill',
            'ephemeralSkill',
            'stagePersona',
          ],
          description:
            'Optional lifecycle slot. Defaults to domainSkill. Use referenceSkill for supplemental guidance that must coexist with the active domain skill.',
        },
      },
      required: ['skillName', 'reason'],
    };
  }
  readonly category: ToolCategory = 'system';

  private _skillProvider?: ISkillProvider;
  private _registeredSkillNames: readonly string[] = [];

  setSkillProvider(provider: ISkillProvider): void {
    this._skillProvider = provider;
  }

  setRegisteredSkillNames(names: readonly string[]): void {
    this._registeredSkillNames = [...new Set(names)];
  }

  async execute(args: Record<string, unknown>, options?: ToolExecuteOptions): Promise<ToolResult> {
    const locale = options?.metadata?.['locale'];
    const validation = this.validateArgs(args);
    if (!validation.valid) {
      return this.error(presentSkillToolInputFailure('invalid-activation-arguments', locale));
    }

    if (!this._skillProvider) {
      return this.error(presentSkillToolInputFailure('skill-system-unavailable', locale));
    }

    const skillName = args.skillName as string;
    const reason = typeof args.reason === 'string' ? args.reason.trim() : '';
    if (reason.length === 0) {
      return this.error(presentSkillToolInputFailure('activation-reason-required', locale));
    }
    const slot = readOptionalSkillLifecycleSlot(args.slot);
    if (args.slot !== undefined && slot === undefined) {
      return this.error(
        presentSkillToolInputFailure('invalid-lifecycle-slot', locale, String(args.slot)),
      );
    }

    const result = await this._skillProvider.activateSkill({
      name: skillName,
      reason,
      ...(slot ? { slot } : {}),
    });

    if (!result.success) {
      return this.error(presentSkillProviderFailure('activate', result, locale, skillName));
    }

    const activatedSkillName = result.skillName ?? skillName;
    return this.success({
      activated: true,
      skillName: activatedSkillName,
      ...(result.requestedSkillName ? { requestedSkillName: result.requestedSkillName } : {}),
      reason,
      ...(slot ? { slot } : {}),
      ...(result.allowedTools ? { allowedTools: result.allowedTools } : {}),
      ...(result.lifecycleRecordId ? { lifecycleRecordId: result.lifecycleRecordId } : {}),
      ...(result.diagnostics
        ? { diagnostics: result.diagnostics.map(projectSkillLifecycleDiagnosticData) }
        : {}),
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
    'Deactivate an active skill lifecycle record. Do not clear the current domain skill merely to use a supplemental handoff or reference skill; target recordId, slot, or skillName only when explicit cleanup is needed.';
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

  async execute(_args: Record<string, unknown>, options?: ToolExecuteOptions): Promise<ToolResult> {
    const locale = options?.metadata?.['locale'];
    if (!this._skillProvider) {
      return this.error(presentSkillToolInputFailure('skill-system-unavailable', locale));
    }

    const result = await this._skillProvider.deactivateSkill({
      ...(typeof _args.recordId === 'string' ? { recordId: _args.recordId } : {}),
      ...(typeof _args.slot === 'string' ? { slot: _args.slot } : {}),
      ...(typeof _args.skillName === 'string' ? { skillName: _args.skillName } : {}),
    });

    if (!result.success) {
      return this.error(presentSkillProviderFailure('deactivate', result, locale));
    }

    return this.success({
      deactivated: true,
      ...(result.removedRecordIds ? { removedRecordIds: result.removedRecordIds } : {}),
      ...(result.diagnostics
        ? { diagnostics: result.diagnostics.map(projectSkillLifecycleDiagnosticData) }
        : {}),
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

  async execute(args: Record<string, unknown>, options?: ToolExecuteOptions): Promise<ToolResult> {
    const locale = options?.metadata?.['locale'];
    if (args.mode === undefined) {
      return this.error(presentExecutionModeBoundaryFailure('invalid-arguments', locale));
    }

    const mode = readExecutionMode(args.mode);
    if (!mode) {
      return this.error(presentExecutionModeBoundaryFailure('invalid-mode', locale));
    }
    if (args.reason !== undefined && typeof args.reason !== 'string') {
      return this.error(presentExecutionModeBoundaryFailure('invalid-arguments', locale));
    }
    if (!this._skillProvider?.setExecutionMode) {
      return this.error(presentExecutionModeBoundaryFailure('activation-unavailable', locale));
    }

    const result = await this._skillProvider.setExecutionMode({
      mode,
      ...(typeof args.reason === 'string' ? { reason: args.reason } : {}),
    });

    if (!result.success) {
      return this.error(presentExecutionModeProviderFailure(result, locale));
    }

    return this.success({
      changed: result.changed,
      requestedMode: result.requestedMode,
      mode: result.effectiveMode,
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
    new CreateSkillTool(),
    new ActivateSkillTool(),
    new DeactivateSkillTool(),
    new SetExecutionModeTool(),
  ];
}

type ExecutionModeBoundaryFailureCode =
  'invalid-arguments' | 'invalid-mode' | 'activation-unavailable';

function presentExecutionModeBoundaryFailure(
  code: ExecutionModeBoundaryFailureCode,
  locale: unknown,
): string {
  const zh = isChinesePromptLocale(locale);
  switch (code) {
    case 'invalid-arguments':
      return zh ? '执行模式参数无效。' : 'Invalid execution mode arguments.';
    case 'invalid-mode':
      return zh ? '执行模式无效。' : 'Invalid execution mode.';
    case 'activation-unavailable':
      return zh ? '执行模式激活功能不可用。' : 'Execution mode activation is unavailable.';
  }
}

function presentExecutionModeProviderFailure(
  result: Extract<ExecutionModeActivationResult, { success: false }>,
  locale: unknown,
): string {
  const zh = isChinesePromptLocale(locale);
  const summary =
    result.code === 'activation-rejected'
      ? zh
        ? '无法激活执行模式。'
        : 'The execution mode was not activated.'
      : zh
        ? '激活执行模式时提供商失败。'
        : 'The provider failed while activating the execution mode.';
  return result.detail ? `${summary} ${zh ? '详情：' : 'Details: '}${result.detail}` : summary;
}

type CreateSkillBoundaryFailureCode = 'invalid-input' | 'creation-unavailable';

function presentCreateSkillBoundaryFailure(
  code: CreateSkillBoundaryFailureCode,
  locale: unknown,
): string {
  const zh = isChinesePromptLocale(locale);
  switch (code) {
    case 'invalid-input':
      return zh ? 'CreateSkill 输入无效。' : 'Invalid CreateSkill input';
    case 'creation-unavailable':
      return zh ? '技能创建功能不可用。' : 'Skill creation is not initialized';
  }
}

function presentCreateSkillFailure(
  failure: CreateSkillFailure,
  locale: unknown,
  skillName: string,
): string {
  const zh = isChinesePromptLocale(locale);
  const summary = presentCreateSkillFailureSummary(failure.code, zh, skillName);
  const details = [
    ...failure.diagnostics.map((diagnostic) =>
      JSON.stringify(projectSkillDiagnosticData(diagnostic)),
    ),
    ...(failure.detail === undefined ? [] : [failure.detail]),
  ];
  return details.length === 0
    ? summary
    : `${summary} ${zh ? '详情：' : 'Details: '}${details.join('; ')}`;
}

function presentCreateSkillFailureSummary(
  code: CreateSkillFailureCode,
  zh: boolean,
  skillName: string,
): string {
  switch (code) {
    case 'invalid-skill':
      return zh ? `技能 "${skillName}" 的定义无效。` : `Skill "${skillName}" is invalid.`;
    case 'invalid-overlay':
      return zh
        ? `技能 "${skillName}" 的 Neko 配置无效。`
        : `Skill "${skillName}" has an invalid Neko overlay.`;
    case 'invalid-resource-path':
      return zh
        ? `技能 "${skillName}" 包含无效的资源路径。`
        : `Skill "${skillName}" contains an invalid resource path.`;
    case 'reserved-resource-path':
      return zh
        ? `技能 "${skillName}" 使用了保留资源路径。`
        : `Skill "${skillName}" uses a reserved resource path.`;
    case 'skill-already-exists':
      return zh ? `技能 "${skillName}" 已存在。` : `Skill "${skillName}" already exists.`;
    case 'atomic-commit-conflict':
      return zh
        ? `创建技能 "${skillName}" 时发生提交冲突。`
        : `A commit conflict occurred while creating skill "${skillName}".`;
    case 'filesystem-error':
      return zh
        ? `创建技能 "${skillName}" 时文件系统操作失败。`
        : `A filesystem operation failed while creating skill "${skillName}".`;
  }
}

function projectSkillDiagnosticData(diagnostic: SkillDiagnostic): {
  readonly area: SkillDiagnostic['area'];
  readonly code: string;
  readonly severity: SkillDiagnostic['severity'];
  readonly path?: string;
} {
  return {
    area: diagnostic.area,
    code: diagnostic.code,
    severity: diagnostic.severity,
    ...(diagnostic.path === undefined ? {} : { path: diagnostic.path }),
  };
}

function readCreateSkillInput(args: Record<string, unknown>): CreateSkillInput | null {
  if (!hasOnlyProperties(args, ['target', 'skill', 'resources', 'neko'])) {
    return null;
  }
  if (args.target !== 'project' && args.target !== 'personal') {
    return null;
  }
  const skill = readPortableSkillDefinition(args.skill);
  if (!skill) {
    return null;
  }
  const resources = readSkillResources(args.resources);
  if (args.resources !== undefined && !resources) {
    return null;
  }
  const neko = readNekoSkillOverlay(args.neko);
  if (args.neko !== undefined && !neko) {
    return null;
  }
  return {
    target: args.target,
    skill,
    ...(resources ? { resources } : {}),
    ...(neko ? { neko } : {}),
  };
}

function readPortableSkillDefinition(value: unknown): PortableSkillDefinition | null {
  if (
    !isRecord(value) ||
    !hasOnlyProperties(value, [
      'name',
      'description',
      'body',
      'license',
      'compatibility',
      'metadata',
      'allowedTools',
    ])
  ) {
    return null;
  }
  if (
    typeof value.name !== 'string' ||
    typeof value.description !== 'string' ||
    typeof value.body !== 'string'
  ) {
    return null;
  }
  if (value.license !== undefined && typeof value.license !== 'string') {
    return null;
  }
  if (value.compatibility !== undefined && typeof value.compatibility !== 'string') {
    return null;
  }
  const metadata = readStringRecord(value.metadata);
  if (value.metadata !== undefined && !metadata) {
    return null;
  }
  const allowedTools = readStringArray(value.allowedTools);
  if (value.allowedTools !== undefined && !allowedTools) {
    return null;
  }
  return {
    name: value.name,
    description: value.description,
    body: value.body,
    ...(typeof value.license === 'string' ? { license: value.license } : {}),
    ...(typeof value.compatibility === 'string' ? { compatibility: value.compatibility } : {}),
    ...(metadata ? { metadata } : {}),
    ...(allowedTools ? { allowedTools } : {}),
  };
}

function readSkillResources(value: unknown): readonly SkillResourceInput[] | null {
  if (value === undefined) {
    return null;
  }
  if (!Array.isArray(value)) {
    return null;
  }
  const resources: SkillResourceInput[] = [];
  for (const entry of value) {
    if (
      !isRecord(entry) ||
      !hasOnlyProperties(entry, ['path', 'encoding', 'content']) ||
      typeof entry.path !== 'string' ||
      typeof entry.content !== 'string' ||
      (entry.encoding !== 'utf8' && entry.encoding !== 'base64')
    ) {
      return null;
    }
    resources.push({
      path: entry.path,
      encoding: entry.encoding,
      content: entry.content,
    });
  }
  return resources;
}

function readNekoSkillOverlay(value: unknown): NekoSkillOverlay | null {
  if (
    !isRecord(value) ||
    !hasOnlyProperties(value, ['schemaVersion', 'interface', 'dependencies', 'relationships']) ||
    value.schemaVersion !== 1
  ) {
    return null;
  }
  const interfaceMetadata = readNekoSkillInterface(value.interface);
  if (value.interface !== undefined && !interfaceMetadata) {
    return null;
  }
  const dependencies = readNekoSkillDependencies(value.dependencies);
  if (value.dependencies !== undefined && !dependencies) {
    return null;
  }
  const relationships = readNekoSkillRelationships(value.relationships);
  if (value.relationships !== undefined && !relationships) {
    return null;
  }
  return {
    schemaVersion: 1,
    ...(interfaceMetadata ? { interface: interfaceMetadata } : {}),
    ...(dependencies ? { dependencies } : {}),
    ...(relationships ? { relationships } : {}),
  };
}

function readNekoSkillInterface(value: unknown): NekoSkillOverlay['interface'] | null {
  if (value === undefined) {
    return null;
  }
  if (
    !isRecord(value) ||
    !hasOnlyProperties(value, ['displayName', 'shortDescription', 'iconSmall', 'defaultPrompt'])
  ) {
    return null;
  }
  const fields = ['displayName', 'shortDescription', 'iconSmall', 'defaultPrompt'] as const;
  for (const field of fields) {
    if (value[field] !== undefined && typeof value[field] !== 'string') {
      return null;
    }
  }
  return {
    ...(typeof value.displayName === 'string' ? { displayName: value.displayName } : {}),
    ...(typeof value.shortDescription === 'string'
      ? { shortDescription: value.shortDescription }
      : {}),
    ...(typeof value.iconSmall === 'string' ? { iconSmall: value.iconSmall } : {}),
    ...(typeof value.defaultPrompt === 'string' ? { defaultPrompt: value.defaultPrompt } : {}),
  };
}

function readNekoSkillDependencies(value: unknown): NekoSkillOverlay['dependencies'] | null {
  if (value === undefined) {
    return null;
  }
  if (!isRecord(value) || !hasOnlyProperties(value, ['capabilities', 'profiles'])) {
    return null;
  }
  const capabilities =
    value.capabilities === undefined
      ? undefined
      : readNekoCapabilityDependencies(value.capabilities);
  if (value.capabilities !== undefined && !capabilities) {
    return null;
  }
  const profiles =
    value.profiles === undefined ? undefined : readNekoProfileDependencies(value.profiles);
  if (value.profiles !== undefined && !profiles) {
    return null;
  }
  return {
    ...(capabilities ? { capabilities } : {}),
    ...(profiles ? { profiles } : {}),
  };
}

function readNekoCapabilityDependencies(
  value: unknown,
): NonNullable<NekoSkillOverlay['dependencies']>['capabilities'] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const dependencies: Array<{ id: string; requirement: 'required' | 'optional' }> = [];
  for (const entry of value) {
    if (
      !isRecord(entry) ||
      !hasOnlyProperties(entry, ['id', 'requirement']) ||
      typeof entry.id !== 'string' ||
      (entry.requirement !== 'required' && entry.requirement !== 'optional')
    ) {
      return null;
    }
    dependencies.push({ id: entry.id, requirement: entry.requirement });
  }
  return dependencies;
}

function readNekoProfileDependencies(
  value: unknown,
): NonNullable<NekoSkillOverlay['dependencies']>['profiles'] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const dependencies: NonNullable<
    NonNullable<NekoSkillOverlay['dependencies']>['profiles']
  >[number][] = [];
  for (const entry of value) {
    if (
      !isRecord(entry) ||
      !hasOnlyProperties(entry, ['id', 'kind', 'relationship', 'versionRange']) ||
      typeof entry.id !== 'string' ||
      !isAgentProfileKind(entry.kind) ||
      !isAgentProfileRelationship(entry.relationship) ||
      (entry.versionRange !== undefined && typeof entry.versionRange !== 'string')
    ) {
      return null;
    }
    dependencies.push({
      id: entry.id,
      kind: entry.kind,
      relationship: entry.relationship,
      ...(typeof entry.versionRange === 'string' ? { versionRange: entry.versionRange } : {}),
    });
  }
  return dependencies;
}

function readNekoSkillRelationships(value: unknown): NekoSkillOverlay['relationships'] | null {
  if (value === undefined) {
    return null;
  }
  if (!isRecord(value) || !hasOnlyProperties(value, ['skills'])) {
    return null;
  }
  if (value.skills === undefined) {
    return {};
  }
  if (!Array.isArray(value.skills)) {
    return null;
  }
  const skills: Array<{ name: string; relationship: string }> = [];
  for (const entry of value.skills) {
    if (
      !isRecord(entry) ||
      !hasOnlyProperties(entry, ['name', 'relationship']) ||
      typeof entry.name !== 'string' ||
      typeof entry.relationship !== 'string'
    ) {
      return null;
    }
    skills.push({ name: entry.name, relationship: entry.relationship });
  }
  return { skills };
}

function readCreateSkillFailure(value: unknown): CreateSkillFailure | null {
  if (!isRecord(value) || !isCreateSkillFailureCode(value.code)) {
    return null;
  }
  if (!Array.isArray(value.diagnostics) || !value.diagnostics.every(isSkillDiagnostic)) {
    return null;
  }
  if (value.detail !== undefined && typeof value.detail !== 'string') {
    return null;
  }
  return {
    code: value.code,
    diagnostics: value.diagnostics,
    ...(typeof value.detail === 'string' ? { detail: value.detail } : {}),
  };
}

function isCreateSkillFailureCode(value: unknown): value is CreateSkillFailureCode {
  return (
    value === 'invalid-skill' ||
    value === 'invalid-overlay' ||
    value === 'invalid-resource-path' ||
    value === 'reserved-resource-path' ||
    value === 'skill-already-exists' ||
    value === 'atomic-commit-conflict' ||
    value === 'filesystem-error'
  );
}

function isSkillDiagnostic(value: unknown): value is SkillDiagnostic {
  return (
    isRecord(value) &&
    (value.area === 'portable' ||
      value.area === 'overlay' ||
      value.area === 'compatibility' ||
      value.area === 'quality' ||
      value.area === 'creation' ||
      value.area === 'migration') &&
    typeof value.code === 'string' &&
    (value.severity === 'error' || value.severity === 'warning' || value.severity === 'info') &&
    typeof value.message === 'string' &&
    (value.path === undefined || typeof value.path === 'string')
  );
}

function readStringRecord(value: unknown): Readonly<Record<string, string>> | null {
  if (value === undefined) {
    return null;
  }
  if (!isRecord(value)) {
    return null;
  }
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== 'string') {
      return null;
    }
    result[key] = entry;
  }
  return result;
}

function readStringArray(value: unknown): readonly string[] | null {
  if (value === undefined) {
    return null;
  }
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string') ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyProperties(
  value: Readonly<Record<string, unknown>>,
  allowedProperties: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowedProperties.includes(key));
}

function readExecutionMode(value: unknown): ExecutionMode | null {
  return value === 'plan' || value === 'ask' || value === 'auto' ? value : null;
}

function readOptionalSkillLifecycleSlot(value: unknown): SkillLifecycleSlot | undefined {
  switch (value) {
    case undefined:
      return undefined;
    case 'stagePersona':
    case 'domainSkill':
    case 'referenceSkill':
    case 'ephemeralSkill':
    case 'promptChainSkill':
      return value;
    default:
      return undefined;
  }
}

type SkillToolInputFailureCode =
  | 'skill-system-unavailable'
  | 'invalid-activation-arguments'
  | 'activation-reason-required'
  | 'invalid-lifecycle-slot';

function presentSkillToolInputFailure(
  code: SkillToolInputFailureCode,
  locale: unknown,
  detail?: string,
): string {
  const zh = isChinesePromptLocale(locale);
  switch (code) {
    case 'skill-system-unavailable':
      return zh ? '技能系统不可用。' : 'The skill system is unavailable.';
    case 'invalid-activation-arguments':
      return zh ? '技能激活参数无效。' : 'Invalid skill activation arguments.';
    case 'activation-reason-required':
      return zh ? '必须提供激活原因。' : 'An activation reason is required.';
    case 'invalid-lifecycle-slot': {
      if (detail === undefined) {
        throw new Error('Invalid lifecycle slot projection requires detail.');
      }
      return zh ? `技能生命周期槽位无效：${detail}` : `Invalid skill lifecycle slot: ${detail}`;
    }
  }
}

function presentSkillProviderFailure(
  action: 'activate' | 'deactivate',
  result: Extract<
    SkillActivationProviderResult | SkillDeactivationProviderResult,
    { success: false }
  >,
  locale: unknown,
  skillName?: string,
): string {
  const zh = isChinesePromptLocale(locale);
  const summary = presentSkillProviderFailureSummary(action, result.code, zh, skillName);
  const details = [
    ...(result.diagnostics ?? []).map((diagnostic) =>
      JSON.stringify(projectSkillLifecycleDiagnosticData(diagnostic)),
    ),
    ...(result.detail ? [result.detail] : []),
  ];
  return details.length > 0
    ? `${summary} ${zh ? '详情：' : 'Details: '}${details.join('; ')}`
    : summary;
}

function presentSkillProviderFailureSummary(
  action: 'activate' | 'deactivate',
  code: SkillProviderFailureCode,
  zh: boolean,
  skillName?: string,
): string {
  switch (code) {
    case 'skill-system-unavailable':
      return zh ? '技能系统不可用。' : 'The skill system is unavailable.';
    case 'skill-not-found': {
      const name = requireSkillName(skillName);
      return zh ? `未找到技能 "${name}"。` : `Skill "${name}" was not found.`;
    }
    case 'activation-rejected': {
      const name = requireSkillName(skillName);
      return zh ? `无法激活技能 "${name}"。` : `Skill "${name}" was not activated.`;
    }
    case 'deactivation-rejected':
      return zh ? '无法停用技能。' : 'The skill was not deactivated.';
    case 'provider-error':
      if (action === 'activate') {
        const name = requireSkillName(skillName);
        return zh
          ? `激活技能 "${name}" 时提供商失败。`
          : `The provider failed while activating skill "${name}".`;
      }
      return zh ? '停用技能时提供商失败。' : 'The provider failed while deactivating the skill.';
  }
}

function isChinesePromptLocale(locale: unknown): boolean {
  return locale === 'zh-cn';
}

function requireSkillName(skillName: string | undefined): string {
  if (skillName === undefined) {
    throw new Error('Skill activation failure projection requires skillName.');
  }
  return skillName;
}

function projectSkillLifecycleDiagnosticData(diagnostic: SkillLifecycleDiagnostic): {
  readonly code: SkillLifecycleDiagnostic['code'];
  readonly conversationId?: string;
  readonly skillName?: string;
  readonly slot?: SkillLifecycleSlot;
  readonly recordId?: string;
  readonly details?: Record<string, unknown>;
} {
  return {
    code: diagnostic.code,
    ...(diagnostic.conversationId ? { conversationId: diagnostic.conversationId } : {}),
    ...(diagnostic.skillName ? { skillName: diagnostic.skillName } : {}),
    ...(diagnostic.slot ? { slot: diagnostic.slot } : {}),
    ...(diagnostic.recordId ? { recordId: diagnostic.recordId } : {}),
    ...(diagnostic.details ? { details: diagnostic.details } : {}),
  };
}
