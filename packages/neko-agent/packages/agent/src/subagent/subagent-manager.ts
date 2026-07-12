/**
 * SubAgent Manager - Manages SubAgent lifecycle and execution
 *
 * Features:
 * - Spawn SubAgents with specialized or general configurations
 * - Parallel execution with resource limits
 * - Foreground (blocking) and background (non-blocking) modes
 * - Event-driven status updates
 * - Timeout and cancellation support
 */

import { EventEmitter } from 'events';
import {
  formatChildRunScope,
  validateChildRunScope,
  validateConversationRunScope,
  type ChildRunScope,
  type ConversationRunScope,
} from '@neko-agent/types';
import type { AgentConfig } from '@neko/shared';
import { getLogger } from '../utils/logger';
import type {
  AgentToolPolicy,
  SubAgentConfig,
  SubAgentResult,
  SubAgentStatus,
  SubAgentEvent,
  SubAgentEventListener,
  SubAgentManagerDeps,
  ISubAgentManager,
  SpecializedAgentPreset,
  ModelTier,
  SubAgentModelRef,
  SubAgentExecutor,
  SubAgentModelTierResolverContext,
} from './types';
import { getSubAgentPromptLabels, localizeBuiltinSubAgentPreset } from './subagent-localization';

const logger = getLogger('SubAgentManager');

// =============================================================================
// Specialized Agent Presets
// =============================================================================

/**
 * Predefined configurations for specialized agent types
 */
const BASE_PRESETS: Record<string, SpecializedAgentPreset> = {
  'code-search': {
    description: 'Search and analyze code in the codebase',
    systemPrompt: `You are a code search specialist. Your task is to find relevant code patterns, definitions, and references.

Guidelines:
- Use grep and glob tools to search efficiently
- Read files to understand context
- Provide concise summaries of findings
- Report file paths and line numbers`,
    toolPolicy: { kind: 'allow-list', tools: ['Grep', 'Glob', 'Read', 'ListDirectory'] },
    defaultModelTier: 'fast',
    defaultMaxIterations: 15,
  },
  'file-explorer': {
    description: 'Explore and navigate file system',
    systemPrompt: `You are a file system navigator. Help locate and understand project structure.

Guidelines:
- Use glob to find files by pattern
- Use list_directory to explore structure
- Provide clear file organization summaries`,
    toolPolicy: { kind: 'allow-list', tools: ['Glob', 'Read', 'ListDirectory'] },
    defaultModelTier: 'fast',
    defaultMaxIterations: 10,
  },
  'test-runner': {
    description: 'Run and analyze tests',
    systemPrompt: `You are a test specialist. Run tests and analyze results.

Guidelines:
- Use bash to execute test commands
- Read test files to understand coverage
- Report failures with clear explanations
- Suggest fixes for failing tests`,
    toolPolicy: { kind: 'allow-list', tools: ['Bash', 'Read', 'Glob'] },
    defaultModelTier: 'balanced',
    defaultMaxIterations: 20,
  },
  'document-writer': {
    description: 'Write and update documentation',
    systemPrompt: `You are a documentation specialist. Create clear, concise documentation.

Guidelines:
- Read existing files to understand context
- Write well-structured markdown
- Follow project documentation conventions
- Keep documentation focused and accurate`,
    toolPolicy: { kind: 'allow-list', tools: ['Read', 'Write', 'Edit', 'Glob'] },
    defaultModelTier: 'balanced',
    defaultMaxIterations: 15,
  },
  general: {
    description: 'General purpose agent',
    systemPrompt: `You are a general-purpose agent. Complete the assigned task efficiently.

Guidelines:
- Focus only on the assigned task
- Be concise and efficient
- Report results clearly
- If you cannot complete the task, explain why`,
    toolPolicy: { kind: 'all' },
    defaultModelTier: 'balanced',
    defaultMaxIterations: 20,
  },
  'npc-character': {
    description: 'NPC character validation session',
    systemPrompt: `You are an isolated NPC character test agent.

Guidelines:
- Stay in the provided character profile and conversation mode.
- Treat confirmed profile facts as authoritative.
- Treat suggested profile facts as uncertain and avoid inventing certainty.
- Do not claim access to project files, tools, global memory, or hidden story context.
- If the profile lacks an answer, respond within the character's uncertainty.`,
    toolPolicy: { kind: 'none' },
    defaultModelTier: 'balanced',
    defaultMaxIterations: 12,
  },
};

export const SPECIALIZED_PRESETS: Readonly<Record<string, SpecializedAgentPreset>> = BASE_PRESETS;

// =============================================================================
// SubAgent Instance
// =============================================================================

interface SubAgentInstance {
  readonly scope: ChildRunScope;
  readonly config: SubAgentConfig;
  status: SubAgentStatus;
  executor?: SubAgentExecutor;
  result?: SubAgentResult;
  startTime?: number;
  abortController?: AbortController;
  resolvers: Array<{
    resolve: (result: SubAgentResult) => void;
    reject: (error: Error) => void;
  }>;
}

// =============================================================================
// SubAgent Manager Implementation
// =============================================================================

/**
 * SubAgent Manager
 *
 * Manages the lifecycle of child agents spawned by parent agents.
 * Provides resource limits, event handling, and result aggregation.
 */
export class SubAgentManager implements ISubAgentManager {
  private readonly instances = new Map<string, SubAgentInstance>();
  private readonly emitter = new EventEmitter();

  static readonly MAX_CONCURRENT_SUBAGENTS = 5;
  static readonly MAX_SUBAGENTS_PER_PARENT = 10;
  static readonly DEFAULT_TIMEOUT = 5 * 60 * 1000;

  constructor(private readonly deps: SubAgentManagerDeps) {
    this.emitter.setMaxListeners(50);
  }

  async spawn(scope: ChildRunScope, config: SubAgentConfig): Promise<ChildRunScope> {
    const validatedScope = this.requireSubAgentScope(scope);
    if (validatedScope.childRunId !== config.id) {
      throw new Error(
        `SubAgent scope/config mismatch: scope childRunId ${validatedScope.childRunId} does not match config id ${config.id}.`,
      );
    }
    this.checkLimits(validatedScope);

    const key = formatChildRunScope(validatedScope);
    if (this.instances.has(key)) {
      throw new Error(`SubAgent scope already exists: ${key}`);
    }

    const instance: SubAgentInstance = {
      scope: validatedScope,
      config,
      status: 'pending',
      abortController: new AbortController(),
      resolvers: [],
    };
    this.instances.set(key, instance);
    this.emit(this.createEvent(instance, 'spawned', this.toEventData(config, 'pending')));

    this.executeSubAgent(instance).catch((error) => {
      logger.error('Execution error', { scope: key, error });
    });
    return validatedScope;
  }

  async spawnBatch(
    entries: readonly { readonly scope: ChildRunScope; readonly config: SubAgentConfig }[],
  ): Promise<ChildRunScope[]> {
    const scopes: ChildRunScope[] = [];
    for (const entry of entries) scopes.push(await this.spawn(entry.scope, entry.config));
    return scopes;
  }

  getStatus(scope: ChildRunScope): SubAgentStatus | undefined {
    return this.instances.get(this.scopeKey(scope))?.status;
  }

  async getResult(scope: ChildRunScope, timeout?: number): Promise<SubAgentResult> {
    const validatedScope = this.requireSubAgentScope(scope);
    const key = formatChildRunScope(validatedScope);
    const instance = this.instances.get(key);
    if (!instance) throw new Error(`SubAgent not found: ${key}`);
    if (instance.result) return instance.result;

    return new Promise((resolve, reject) => {
      const effectiveTimeout = timeout ?? SubAgentManager.DEFAULT_TIMEOUT;
      const resolveWithCleanup = (result: SubAgentResult): void => {
        clearTimeout(timeoutId);
        resolve(result);
      };
      instance.resolvers.push({ resolve: resolveWithCleanup, reject });
      const timeoutId = setTimeout(() => {
        const index = instance.resolvers.findIndex((entry) => entry.resolve === resolveWithCleanup);
        if (index >= 0) instance.resolvers.splice(index, 1);
        reject(new Error(`Timeout waiting for SubAgent: ${key}`));
      }, effectiveTimeout);
      if (instance.result) resolveWithCleanup(instance.result);
    });
  }

  async getResults(scopes: readonly ChildRunScope[], timeout?: number): Promise<SubAgentResult[]> {
    return Promise.all(scopes.map((scope) => this.getResult(scope, timeout)));
  }

  cancel(scope: ChildRunScope): void {
    const instance = this.instances.get(this.scopeKey(scope));
    if (instance?.status === 'running') {
      instance.abortController?.abort();
      instance.executor?.abort();
    }
  }

  cancelRun(scope: ConversationRunScope): void {
    const owner = this.requireRunScope(scope);
    for (const instance of this.instances.values()) {
      if (this.isOwnedByRun(instance.scope, owner)) this.cancel(instance.scope);
    }
  }

  listByRun(scope: ConversationRunScope): SubAgentConfig[] {
    const owner = this.requireRunScope(scope);
    return Array.from(this.instances.values())
      .filter((instance) => this.isOwnedByRun(instance.scope, owner))
      .map((instance) => instance.config);
  }

  onEvent(callback: SubAgentEventListener): () => void {
    this.emitter.on('subagent', callback);
    return () => this.emitter.off('subagent', callback);
  }

  cleanupRun(scope: ConversationRunScope): void {
    const owner = this.requireRunScope(scope);
    for (const [key, instance] of this.instances) {
      if (
        this.isOwnedByRun(instance.scope, owner) &&
        (instance.status === 'completed' ||
          instance.status === 'failed' ||
          instance.status === 'cancelled')
      )
        this.instances.delete(key);
    }
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Check resource limits before spawning
   */
  private checkLimits(scope: ChildRunScope): void {
    const parentCount = Array.from(this.instances.values()).filter(
      (instance) =>
        this.isOwnedByRun(instance.scope, scope) &&
        instance.scope.parentRunId === scope.parentRunId,
    ).length;
    if (parentCount >= SubAgentManager.MAX_SUBAGENTS_PER_PARENT) {
      throw new Error(
        `Max SubAgents per parent reached: ${SubAgentManager.MAX_SUBAGENTS_PER_PARENT}`,
      );
    }

    const runningCount = Array.from(this.instances.values()).filter(
      (instance) => instance.status === 'running',
    ).length;
    if (runningCount >= SubAgentManager.MAX_CONCURRENT_SUBAGENTS) {
      throw new Error(
        `Max concurrent SubAgents reached: ${SubAgentManager.MAX_CONCURRENT_SUBAGENTS}`,
      );
    }
  }

  /**
   * Execute a SubAgent
   */
  private async executeSubAgent(instance: SubAgentInstance): Promise<void> {
    const { scope, config, abortController } = instance;
    const parentId = scope.parentRunId;
    const conversationId = scope.conversationId;
    instance.status = 'running';
    instance.startTime = Date.now();

    this.emit({
      type: 'started',
      scope,
      subAgentId: config.id,
      parentAgentId: parentId,
      conversationId,
      data: this.toEventData(config, 'running'),
      timestamp: Date.now(),
    });

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const locale = config.locale;
      const labels = getSubAgentPromptLabels(locale);
      const preset = this.getSpecializedPreset(config.type, locale);
      if (!preset) {
        throw new Error(`Unknown SubAgent preset type "${config.type}"`);
      }

      // =======================================================================
      // Step 1: Collect tools from ToolSkills
      // =======================================================================
      const toolSkillTools = this.collectToolSkillTools(config);

      // =======================================================================
      // Step 2: Determine runtime tool access
      // =======================================================================
      const allTools = this.deps.toolRegistry.toToolDefinitions(
        undefined,
        locale ? { locale } : undefined,
      );
      const toolPolicy = this.resolveToolPolicy(config, preset, toolSkillTools);
      const filteredTools = this.filterToolsByPolicy(allTools, toolPolicy);

      // =======================================================================
      // Step 3: Build system prompt with skill injections
      // =======================================================================
      const baseSystemPrompt = config.systemPrompt || this.buildSystemPrompt(config, preset);
      const systemPrompt = this.injectSkillsToPrompt(baseSystemPrompt, config);

      const modelTier = config.modelTier || preset.defaultModelTier;
      const modelRef = this.resolveModelRef(config, modelTier, {
        parentId,
        conversationId,
        subAgentId: config.id,
        subAgentConfig: config,
      });
      if (!modelRef) {
        throw new Error(
          `SubAgent model tier "${modelTier}" could not be resolved; configure modelTierResolver or pass providerId and modelId.`,
        );
      }

      // Create agent config
      const agentConfig: AgentConfig = {
        name: `subagent-${config.type}-${config.id}`,
        systemPrompt,
        tools: filteredTools,
        maxIterations: config.maxIterations || preset.defaultMaxIterations,
        providerId: modelRef.providerId,
        primaryModel: modelRef.modelId,
      };

      // Create executor
      const executor = this.deps.createAgent(agentConfig, undefined, {
        scope,
        parentId,
        conversationId,
        subAgentId: config.id,
        subAgentConfig: config,
      });
      instance.executor = executor;

      // Build input prompt
      let inputPrompt = config.prompt;
      if (config.inheritContext && config.contextSummary) {
        inputPrompt = `## ${labels.contextFromParentAgent}\n${config.contextSummary}\n\n## ${labels.task}\n${config.prompt}`;
      }

      // Setup timeout
      const timeout = config.timeout || SubAgentManager.DEFAULT_TIMEOUT;
      const timeoutId = setTimeout(() => {
        abortController?.abort();
      }, timeout);

      const emitProgress = (progress: string): void => {
        this.emit({
          type: 'progress',
          scope,
          subAgentId: config.id,
          parentAgentId: parentId,
          conversationId,
          data: { ...this.toEventData(config, 'running'), progress },
          timestamp: Date.now(),
        });
      };

      emitProgress('10% Preparing SubAgent execution');

      // Execute
      const result = await executor.execute(inputPrompt, { onProgress: emitProgress });

      // Build result
      instance.result = {
        scope,
        id: config.id,
        status: 'completed',
        response: result.response,
        duration: Date.now() - instance.startTime!,
        iterations: result.iterations,
      };
      instance.status = 'completed';

      this.emit({
        type: 'completed',
        scope,
        subAgentId: config.id,
        parentAgentId: parentId,
        conversationId,
        data: { ...this.toEventData(config, 'completed'), result: instance.result },
        timestamp: Date.now(),
      });

      // Resolve waiting promises
      this.resolveWaiters(instance);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isCancelled = errorMessage.includes('aborted') || abortController?.signal.aborted;

      instance.status = isCancelled ? 'cancelled' : 'failed';
      instance.result = {
        scope,
        id: config.id,
        status: instance.status,
        error: errorMessage,
        duration: Date.now() - instance.startTime!,
      };

      this.emit({
        type: isCancelled ? 'cancelled' : 'failed',
        scope,
        subAgentId: config.id,
        parentAgentId: parentId,
        conversationId,
        data: { ...this.toEventData(config, instance.status), error: errorMessage },
        timestamp: Date.now(),
      });

      // Resolve waiting promises (with the error result)
      this.resolveWaiters(instance);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  /**
   * Build system prompt for SubAgent
   */
  private buildSystemPrompt(config: SubAgentConfig, preset: SpecializedAgentPreset): string {
    const labels = getSubAgentPromptLabels(config.locale);
    return `${preset.systemPrompt}

## ${labels.yourTask}
${config.description}

${labels.taskFocusInstruction}`;
  }

  private getSpecializedPreset(
    type: string,
    locale: string | undefined,
  ): SpecializedAgentPreset | undefined {
    const builtinPreset = SPECIALIZED_PRESETS[type];
    if (builtinPreset) {
      return localizeBuiltinSubAgentPreset(type, builtinPreset, locale);
    }
    return this.deps.specializedPresets?.[type];
  }

  /**
   * Resolve model tier to actual model ID
   */
  private resolveModelRef(
    config: SubAgentConfig,
    tier: ModelTier,
    context: SubAgentModelTierResolverContext,
  ): SubAgentModelRef | undefined {
    if (config.modelId || config.providerId) {
      if (!config.providerId || !config.modelId) {
        throw new Error('SubAgent explicit model routing requires both providerId and modelId.');
      }
      return { providerId: config.providerId, modelId: config.modelId };
    }

    const resolved = this.deps.modelTierResolver?.(tier, context);
    if (!resolved) {
      return undefined;
    }
    if (typeof (resolved as unknown) === 'string') {
      throw new Error(
        'SubAgent modelTierResolver must return providerId and modelId. String-only model routing is not supported for chat calls.',
      );
    }
    return resolved;
  }

  /**
   * Collect tools from ToolSkills configuration
   */
  private collectToolSkillTools(config: SubAgentConfig): string[] {
    const tools: string[] = [];

    if (!this.deps.toolSkillRegistry) {
      return tools;
    }

    // Collect tools from specified ToolSkills
    if (config.toolSkills && config.toolSkills.length > 0) {
      const skillTools = this.deps.toolSkillRegistry.getActiveTools(config.toolSkills);
      tools.push(...skillTools);
    }

    return tools;
  }

  private resolveToolPolicy(
    config: SubAgentConfig,
    preset: SpecializedAgentPreset,
    toolSkillTools: string[],
  ): AgentToolPolicy {
    const policy = config.toolPolicy ?? preset.toolPolicy;
    return this.mergeToolPolicyWithToolSkills(policy, toolSkillTools);
  }

  /**
   * Apply ToolSkill additions to explicit policies where they are meaningful.
   */
  private mergeToolPolicyWithToolSkills(
    policy: AgentToolPolicy,
    toolSkillTools: string[],
  ): AgentToolPolicy {
    if (policy.kind !== 'allow-list' || toolSkillTools.length === 0) {
      return policy;
    }

    return {
      kind: 'allow-list',
      tools: this.mergeAllowedTools([...policy.tools], toolSkillTools),
    };
  }

  /**
   * Filter registered tools according to a resolved runtime policy.
   */
  private filterToolsByPolicy(
    allTools: AgentConfig['tools'],
    policy: AgentToolPolicy,
  ): AgentConfig['tools'] {
    if (policy.kind === 'none') {
      return [];
    }

    if (policy.kind === 'all') {
      return allTools;
    }

    const allowedTools = new Set(policy.tools);
    return allTools.filter((tool) => allowedTools.has(tool.function.name));
  }

  /**
   * Merge allow-listed tools from different sources.
   */
  private mergeAllowedTools(
    baseTools: readonly string[],
    toolSkillTools: readonly string[],
  ): string[] {
    if (baseTools.length === 0 && toolSkillTools.length === 0) {
      return [];
    }

    const merged = new Set<string>();

    for (const tool of baseTools) {
      merged.add(tool);
    }

    for (const tool of toolSkillTools) {
      merged.add(tool);
    }

    return Array.from(merged);
  }

  /**
   * Inject skill content into system prompt
   */
  private injectSkillsToPrompt(basePrompt: string, config: SubAgentConfig): string {
    if (!this.deps.skillService) {
      return basePrompt;
    }

    const skillContents: string[] = [];

    // Inject specified skills
    if (config.skills && config.skills.length > 0) {
      for (const skillName of config.skills) {
        const skill = this.deps.skillService.registry.getSkill(skillName);
        if (skill && skill.enabled) {
          skillContents.push(this.formatSkillContent(skill.name, skill.content));
        }
      }
    }

    // If no skills to inject, return base prompt
    if (skillContents.length === 0) {
      return basePrompt;
    }

    // Build final prompt with skill injections
    const labels = getSubAgentPromptLabels(config.locale);
    return `${basePrompt}

# ${labels.injectedSkills}

${skillContents.join('\n\n')}`;
  }

  /**
   * Format skill content for injection
   */
  private formatSkillContent(name: string, content: string): string {
    return `## Skill: ${name}

${content}`;
  }

  private toEventData(
    config: SubAgentConfig,
    status: SubAgentStatus,
  ): NonNullable<SubAgentEvent['data']> {
    return {
      status,
      description: config.description,
      subagentType: config.type,
      runMode: config.runMode,
      modelTier: config.modelTier,
      parentMessageId: config.parentMessageId,
      parentToolCallId: config.parentToolCallId,
      runId: config.runId,
      runStartedAt: config.runStartedAt,
    };
  }

  private createEvent(
    instance: SubAgentInstance,
    type: SubAgentEvent['type'],
    data?: SubAgentEvent['data'],
  ): SubAgentEvent {
    return {
      type,
      scope: instance.scope,
      subAgentId: instance.scope.childRunId,
      parentAgentId: instance.scope.parentRunId,
      conversationId: instance.scope.conversationId,
      ...(data ? { data } : {}),
      timestamp: Date.now(),
    };
  }

  private scopeKey(scope: ChildRunScope): string {
    return formatChildRunScope(this.requireSubAgentScope(scope));
  }

  private requireSubAgentScope(scope: ChildRunScope): ChildRunScope {
    const validation = validateChildRunScope(scope);
    if (!validation.ok) throw new Error(validation.diagnostic.message);
    if (validation.scope.childKind !== 'subagent') {
      throw new Error(
        `SubAgentManager requires childKind=subagent: ${formatChildRunScope(validation.scope)}`,
      );
    }
    return validation.scope;
  }

  private requireRunScope(scope: ConversationRunScope): ConversationRunScope {
    const validation = validateConversationRunScope(scope);
    if (!validation.ok) throw new Error(validation.diagnostic.message);
    return validation.scope;
  }

  private isOwnedByRun(scope: ChildRunScope, owner: ConversationRunScope): boolean {
    return scope.conversationId === owner.conversationId && scope.runId === owner.runId;
  }

  /**
   * Emit SubAgent event
   */
  private emit(event: SubAgentEvent): void {
    this.emitter.emit('subagent', event);
  }

  /**
   * Resolve all waiting promises for an instance
   */
  private resolveWaiters(instance: SubAgentInstance): void {
    if (instance.result) {
      for (const resolver of instance.resolvers) {
        resolver.resolve(instance.result);
      }
      instance.resolvers = [];
    }
  }
}
