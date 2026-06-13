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
  SubAgentExecutor,
  SubAgentModelTierResolverContext,
} from './types';
import { CREATIVE_PRESETS } from './creative-presets';

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

/**
 * All specialized presets (base + creative)
 */
export const SPECIALIZED_PRESETS: Record<string, SpecializedAgentPreset> = {
  ...BASE_PRESETS,
  ...CREATIVE_PRESETS,
};

// =============================================================================
// SubAgent Instance
// =============================================================================

interface SubAgentInstance {
  config: SubAgentConfig;
  parentId: string;
  conversationId: string;
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
  private instances = new Map<string, SubAgentInstance>();
  private emitter = new EventEmitter();

  // Resource limits
  static readonly MAX_CONCURRENT_SUBAGENTS = 5;
  static readonly MAX_SUBAGENTS_PER_PARENT = 10;
  static readonly DEFAULT_TIMEOUT = 5 * 60 * 1000; // 5 minutes

  constructor(private deps: SubAgentManagerDeps) {
    // Increase max listeners to prevent warnings with many subscribers
    this.emitter.setMaxListeners(50);
  }

  /**
   * Spawn a new SubAgent
   */
  async spawn(parentId: string, conversationId: string, config: SubAgentConfig): Promise<string> {
    // Check resource limits
    this.checkLimits(parentId);

    // Create instance
    const instance: SubAgentInstance = {
      config,
      parentId,
      conversationId,
      status: 'pending',
      abortController: new AbortController(),
      resolvers: [],
    };
    this.instances.set(config.id, instance);

    // Emit spawned event
    this.emit({
      type: 'spawned',
      subAgentId: config.id,
      parentAgentId: parentId,
      conversationId,
      data: this.toEventData(config, 'pending'),
      timestamp: Date.now(),
    });

    // Start execution asynchronously
    this.executeSubAgent(instance).catch((error) => {
      logger.error('Execution error', { subAgentId: config.id, error });
    });

    return config.id;
  }

  /**
   * Spawn multiple SubAgents in parallel
   */
  async spawnBatch(
    parentId: string,
    conversationId: string,
    configs: SubAgentConfig[],
  ): Promise<string[]> {
    const ids: string[] = [];
    for (const config of configs) {
      const id = await this.spawn(parentId, conversationId, config);
      ids.push(id);
    }
    return ids;
  }

  /**
   * Get SubAgent status
   */
  getStatus(subAgentId: string): SubAgentStatus | undefined {
    return this.instances.get(subAgentId)?.status;
  }

  /**
   * Get SubAgent result (blocks until complete or timeout)
   */
  async getResult(subAgentId: string, timeout?: number): Promise<SubAgentResult> {
    const instance = this.instances.get(subAgentId);
    if (!instance) {
      throw new Error(`SubAgent not found: ${subAgentId}`);
    }

    // If already completed, return result immediately
    if (instance.result) {
      return instance.result;
    }

    // Wait for completion
    return new Promise((resolve, reject) => {
      const effectiveTimeout = timeout || SubAgentManager.DEFAULT_TIMEOUT;

      // Add resolver to instance
      instance.resolvers.push({ resolve, reject });

      // Setup timeout
      const timeoutId = setTimeout(() => {
        const idx = instance.resolvers.findIndex((r) => r.resolve === resolve);
        if (idx >= 0) {
          instance.resolvers.splice(idx, 1);
        }
        reject(new Error(`Timeout waiting for SubAgent: ${subAgentId}`));
      }, effectiveTimeout);

      // If result becomes available, clear timeout
      const checkResult = () => {
        if (instance.result) {
          clearTimeout(timeoutId);
          resolve(instance.result);
        }
      };

      // Check immediately in case it completed between check and promise creation
      checkResult();
    });
  }

  /**
   * Get multiple SubAgent results
   */
  async getResults(subAgentIds: string[], timeout?: number): Promise<SubAgentResult[]> {
    return Promise.all(subAgentIds.map((id) => this.getResult(id, timeout)));
  }

  /**
   * Cancel a running SubAgent
   */
  cancel(subAgentId: string): void {
    const instance = this.instances.get(subAgentId);
    if (instance && instance.status === 'running') {
      instance.abortController?.abort();
      instance.executor?.abort();
    }
  }

  /**
   * Cancel all SubAgents for a parent
   */
  cancelAll(parentId: string): void {
    for (const [id, instance] of this.instances) {
      if (instance.parentId === parentId) {
        this.cancel(id);
      }
    }
  }

  /**
   * List all SubAgents for a parent
   */
  listByParent(parentId: string): SubAgentConfig[] {
    return Array.from(this.instances.values())
      .filter((i) => i.parentId === parentId)
      .map((i) => i.config);
  }

  /**
   * Subscribe to SubAgent events
   */
  onEvent(callback: SubAgentEventListener): () => void {
    this.emitter.on('subagent', callback);
    return () => this.emitter.off('subagent', callback);
  }

  /**
   * Cleanup completed SubAgents for a parent
   */
  cleanup(parentId: string): void {
    const toDelete: string[] = [];
    for (const [id, instance] of this.instances) {
      if (
        instance.parentId === parentId &&
        ['completed', 'failed', 'cancelled'].includes(instance.status)
      ) {
        toDelete.push(id);
      }
    }
    for (const id of toDelete) {
      this.instances.delete(id);
    }
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Check resource limits before spawning
   */
  private checkLimits(parentId: string): void {
    // Check per-parent limit
    const parentSubAgents = this.listByParent(parentId);
    if (parentSubAgents.length >= SubAgentManager.MAX_SUBAGENTS_PER_PARENT) {
      throw new Error(
        `Max SubAgents per parent reached: ${SubAgentManager.MAX_SUBAGENTS_PER_PARENT}`,
      );
    }

    // Check concurrent limit
    const runningCount = Array.from(this.instances.values()).filter(
      (i) => i.status === 'running',
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
    const { config, parentId, conversationId, abortController } = instance;
    instance.status = 'running';
    instance.startTime = Date.now();

    this.emit({
      type: 'started',
      subAgentId: config.id,
      parentAgentId: parentId,
      conversationId,
      data: this.toEventData(config, 'running'),
      timestamp: Date.now(),
    });

    try {
      // Get specialized preset
      const preset = SPECIALIZED_PRESETS[config.type];

      // =======================================================================
      // Step 1: Collect tools from ToolSkills
      // =======================================================================
      const toolSkillTools = this.collectToolSkillTools(config);

      // =======================================================================
      // Step 2: Determine runtime tool access
      // =======================================================================
      const allTools = this.deps.toolRegistry.toToolDefinitions();
      const toolPolicy = this.resolveToolPolicy(config, preset, toolSkillTools);
      const filteredTools = this.filterToolsByPolicy(allTools, toolPolicy);

      // =======================================================================
      // Step 3: Build system prompt with skill injections
      // =======================================================================
      const baseSystemPrompt = config.systemPrompt || this.buildSystemPrompt(config, preset);
      const systemPrompt = this.injectSkillsToPrompt(baseSystemPrompt, config);

      const modelTier = config.modelTier || preset.defaultModelTier;
      const primaryModel =
        config.modelId ||
        this.resolveModelId(modelTier, {
          parentId,
          conversationId,
          subAgentId: config.id,
          subAgentConfig: config,
        });
      if (!primaryModel) {
        throw new Error(
          `SubAgent model tier "${modelTier}" could not be resolved; configure modelTierResolver or pass modelId.`,
        );
      }

      // Create agent config
      const agentConfig: AgentConfig = {
        name: `subagent-${config.type}-${config.id}`,
        systemPrompt,
        tools: filteredTools,
        maxIterations: config.maxIterations || preset.defaultMaxIterations,
        primaryModel,
      };

      // Create executor
      const executor = this.deps.createAgent(agentConfig, undefined, {
        parentId,
        conversationId,
        subAgentId: config.id,
        subAgentConfig: config,
      });
      instance.executor = executor;

      // Build input prompt
      let inputPrompt = config.prompt;
      if (config.inheritContext && config.contextSummary) {
        inputPrompt = `## Context from Parent Agent\n${config.contextSummary}\n\n## Task\n${config.prompt}`;
      }

      // Setup timeout
      const timeout = config.timeout || SubAgentManager.DEFAULT_TIMEOUT;
      const timeoutId = setTimeout(() => {
        abortController?.abort();
      }, timeout);

      const emitProgress = (progress: string): void => {
        this.emit({
          type: 'progress',
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

      clearTimeout(timeoutId);

      // Build result
      instance.result = {
        id: config.id,
        status: 'completed',
        response: result.response,
        duration: Date.now() - instance.startTime!,
        iterations: result.iterations,
      };
      instance.status = 'completed';

      this.emit({
        type: 'completed',
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
        id: config.id,
        status: instance.status,
        error: errorMessage,
        duration: Date.now() - instance.startTime!,
      };

      this.emit({
        type: isCancelled ? 'cancelled' : 'failed',
        subAgentId: config.id,
        parentAgentId: parentId,
        conversationId,
        data: { ...this.toEventData(config, instance.status), error: errorMessage },
        timestamp: Date.now(),
      });

      // Resolve waiting promises (with the error result)
      this.resolveWaiters(instance);
    }
  }

  /**
   * Build system prompt for SubAgent
   */
  private buildSystemPrompt(config: SubAgentConfig, preset: SpecializedAgentPreset): string {
    return `${preset.systemPrompt}

## Your Task
${config.description}

Focus on completing this specific task efficiently and report your findings clearly.`;
  }

  /**
   * Resolve model tier to actual model ID
   */
  private resolveModelId(
    tier: ModelTier,
    context: SubAgentModelTierResolverContext,
  ): string | undefined {
    return this.deps.modelTierResolver?.(tier, context);
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
    return `${basePrompt}

# Injected Skills

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
    };
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
