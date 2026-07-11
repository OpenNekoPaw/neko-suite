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
  /** Create a complete portable Skill package without activating it. */
  createSkill?(input: CreateSkillInput): SkillProviderMaybePromise<CreateSkillResult>;
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

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const input = readCreateSkillInput(args);
    if (!input) {
      return this.error('Invalid CreateSkill input');
    }
    if (!this._skillProvider?.createSkill) {
      return this.error('Skill creation is not initialized');
    }

    try {
      const result = await this._skillProvider.createSkill(input);
      return this.success({
        created: true,
        ...result,
      });
    } catch (error) {
      const failure = readCreateSkillFailure(error);
      if (!failure) {
        throw error;
      }
      return {
        success: false,
        error: failure.diagnostics[0]?.message ?? `CreateSkill failed: ${failure.code}`,
        data: failure,
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
    'Activate a skill after ordinary Agent understanding confirms it is needed. Do not use keyword matching alone. Briefly state the activation reason before calling this tool. Use slot=domainSkill for the main task domain, and slot=referenceSkill for supplemental capability guidance such as Canvas authoring so the current domain skill stays active.';
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
    const slot = readOptionalSkillLifecycleSlot(args.slot);
    if (args.slot !== undefined && slot === undefined) {
      return this.error(`Invalid skill lifecycle slot: ${String(args.slot)}`);
    }

    const result = await this._skillProvider.activateSkill({
      name: skillName,
      reason,
      ...(slot ? { slot } : {}),
    });

    if (!result.success) {
      return this.error(result.message);
    }

    return this.success({
      activated: true,
      skillName,
      reason,
      ...(slot ? { slot } : {}),
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
    new CreateSkillTool(),
    new ActivateSkillTool(),
    new DeactivateSkillTool(),
    new SetExecutionModeTool(),
  ];
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
  return {
    code: value.code,
    diagnostics: value.diagnostics,
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

function formatSkillActivatedMessage(skillName: string, locale: unknown): string {
  return typeof locale === 'string' && locale.trim().toLowerCase().startsWith('zh')
    ? `已激活技能 "${skillName}"`
    : `Activated skill "${skillName}"`;
}
