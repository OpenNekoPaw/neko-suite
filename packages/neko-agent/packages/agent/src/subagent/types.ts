/**
 * SubAgent Types - Type definitions for SubAgent mechanism
 *
 * SubAgent allows parent agents to spawn child agents for parallel task execution.
 */

import type {
  AgentConfig,
  IAgentExecutor,
  ExecutorHooks,
  IService,
  IToolRegistry,
  ISkillRegistry,
  IToolGroupRegistry,
} from '@neko/shared';

// =============================================================================
// Core Types
// =============================================================================

/**
 * SubAgent run mode
 * - foreground: Block parent agent, wait for result
 * - background: Non-blocking, parent continues execution
 */
export type SubAgentRunMode = 'foreground' | 'background';

/**
 * SubAgent status
 */
export type SubAgentStatus =
  | 'pending' // Waiting to execute
  | 'running' // Executing
  | 'completed' // Finished successfully
  | 'failed' // Failed with error
  | 'cancelled'; // Cancelled by parent or timeout

/**
 * Specialized agent types with predefined configurations
 */
export type SpecializedAgentType =
  | 'code-search' // Search and analyze code
  | 'file-explorer' // Navigate file system
  | 'test-runner' // Run and analyze tests
  | 'document-writer' // Write documentation
  | 'general' // General purpose agent
  | 'npc-character' // Isolated NPC character validation
  // Creative domain experts (C.5)
  | 'creative-director' // Scene planning, visual storytelling, direction
  | 'cinematographer' // Composition, lighting, camera work
  | 'composer' // Music creation, sound design
  | 'editor' // Timeline editing, transitions, pacing
  | 'vfx-artist' // Visual effects, compositing, color grading
  | 'quality-checker'; // Media quality evaluation, consistency analysis

/**
 * Model tier for SubAgent
 */
export type ModelTier = 'fast' | 'balanced' | 'powerful';

/**
 * Explicit runtime tool access policy for SubAgents.
 */
export type AgentToolPolicy =
  | { readonly kind: 'none' }
  | { readonly kind: 'all' }
  | { readonly kind: 'allow-list'; readonly tools: readonly string[] };

/**
 * Resolves a ModelTier to a concrete model ID.
 * Runtime/platform configuration owns the concrete mapping.
 */
export interface SubAgentModelTierResolverContext {
  readonly parentId: string;
  readonly conversationId: string;
  readonly subAgentId: string;
  readonly subAgentConfig: SubAgentConfig;
}

export type ModelTierResolver = (
  tier: ModelTier,
  context?: SubAgentModelTierResolverContext,
) => string | undefined;

// =============================================================================
// Configuration
// =============================================================================

/**
 * SubAgent configuration
 */
export interface SubAgentConfig {
  /** Unique ID */
  id: string;
  /** Agent type (specialized or general) */
  type: SpecializedAgentType;
  /** Short description (3-5 words) */
  description: string;
  /** Detailed task prompt */
  prompt: string;
  /** Run mode */
  runMode: SubAgentRunMode;
  /** Explicit runtime tool policy. */
  toolPolicy?: AgentToolPolicy;
  /** System prompt override */
  systemPrompt?: string;
  /** Model ID or tier */
  modelId?: string;
  /** Model tier (maps to specific model) */
  modelTier?: ModelTier;
  /** Maximum iterations */
  maxIterations?: number;
  /** Timeout in ms */
  timeout?: number;
  /** Whether to inherit parent context */
  inheritContext?: boolean;
  /** Parent context summary */
  contextSummary?: string;
  /** Parent message ID in the host UI, when available */
  parentMessageId?: string;
  /** Parent tool call ID that spawned this SubAgent, when available */
  parentToolCallId?: string;

  // ==========================================================================
  // Skill & ToolSkill Injection (New)
  // ==========================================================================

  /**
   * Skills to inject into SubAgent
   * Skill content will be appended to system prompt
   * @example ["commit-helper", "code-review"]
   */
  skills?: string[];

  /**
   * Whether to inherit parent agent's active skills
   * @default false
   */
  inheritParentSkills?: boolean;

  /**
   * ToolSkills to activate for SubAgent
   * Tools from these skills will be merged into allow-list tool policies.
   * @example ["git-operations", "file-editing"]
   */
  toolSkills?: string[];

  /**
   * Whether to inherit parent agent's active ToolSkills
   * @default false
   */
  inheritParentToolSkills?: boolean;

  // ==========================================================================
  // Creative (C.5)
  // ==========================================================================

  /**
   * Quality tier for creative generation tasks.
   * Affects model selection and generation parameters.
   */
  qualityTier?: 'draft' | 'standard' | 'premium';
}

/**
 * Specialized agent preset configuration
 */
export interface SpecializedAgentPreset {
  /** Preset description */
  description: string;
  /** System prompt template */
  systemPrompt: string;
  /** Explicit runtime tool policy */
  toolPolicy: AgentToolPolicy;
  /** Default model tier */
  defaultModelTier: ModelTier;
  /** Default max iterations */
  defaultMaxIterations: number;
}

// =============================================================================
// Results
// =============================================================================

/**
 * SubAgent execution result
 */
export interface SubAgentResult {
  /** SubAgent ID */
  id: string;
  /** Final status */
  status: SubAgentStatus;
  /** Response content */
  response?: string;
  /** Error message if failed */
  error?: string;
  /** Execution duration in ms */
  duration?: number;
  /** Number of iterations */
  iterations?: number;
  /** Token usage */
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

// =============================================================================
// Events
// =============================================================================

/**
 * SubAgent event types
 */
export type SubAgentEventType =
  | 'spawned' // SubAgent created
  | 'started' // Execution started
  | 'progress' // Execution progress update
  | 'completed' // Execution completed
  | 'failed' // Execution failed
  | 'cancelled'; // Execution cancelled

/**
 * SubAgent event
 */
export interface SubAgentEvent {
  /** Event type */
  type: SubAgentEventType;
  /** SubAgent ID */
  subAgentId: string;
  /** Parent agent ID */
  parentAgentId: string;
  /** Conversation ID */
  conversationId: string;
  /** Event data */
  data?: {
    status?: SubAgentStatus;
    progress?: string;
    result?: SubAgentResult;
    error?: string;
    description?: string;
    subagentType?: string;
    runMode?: 'foreground' | 'background';
    modelTier?: ModelTier;
    parentMessageId?: string;
    parentToolCallId?: string;
  };
  /** Event timestamp */
  timestamp: number;
}

/**
 * SubAgent event listener
 */
export type SubAgentEventListener = (event: SubAgentEvent) => void;

// =============================================================================
// Manager Interface
// =============================================================================

/**
 * Agent executor type for SubAgent
 */
export interface SubAgentExecutor {
  execute(
    prompt: string,
    options?: { onProgress?: (progress: string) => void },
  ): Promise<{ success: boolean; response: string; iterations: number }>;
  abort(): void;
}

export interface SubAgentCreateAgentContext {
  parentId: string;
  conversationId: string;
  subAgentId: string;
  subAgentConfig: SubAgentConfig;
}

export interface SubAgentSkillContentProvider {
  readonly registry: Pick<ISkillRegistry, 'getSkill'>;
}

/**
 * SubAgentManager dependencies (Dependency Inversion)
 */
export interface SubAgentManagerDeps {
  /** Create AI service instance */
  createService: () => IService;
  /** Create agent executor */
  createAgent: (
    config: AgentConfig,
    hooks?: ExecutorHooks[],
    context?: SubAgentCreateAgentContext,
  ) => SubAgentExecutor;
  /** Tool registry */
  toolRegistry: IToolRegistry;
  /** Skill service (optional - for skill injection) */
  skillService?: SubAgentSkillContentProvider;
  /** ToolSkill registry (optional - for toolskill injection) */
  toolSkillRegistry?: IToolGroupRegistry;
  /** Custom model tier resolver supplied by runtime/platform configuration. */
  modelTierResolver?: ModelTierResolver;
}

/**
 * SubAgent manager interface
 */
export interface ISubAgentManager {
  /**
   * Spawn a new SubAgent
   * @param parentId Parent agent ID
   * @param conversationId Conversation ID
   * @param config SubAgent configuration
   * @returns SubAgent ID
   */
  spawn(parentId: string, conversationId: string, config: SubAgentConfig): Promise<string>;

  /**
   * Spawn multiple SubAgents in parallel
   */
  spawnBatch(
    parentId: string,
    conversationId: string,
    configs: SubAgentConfig[],
  ): Promise<string[]>;

  /**
   * Get SubAgent status
   */
  getStatus(subAgentId: string): SubAgentStatus | undefined;

  /**
   * Get SubAgent result (blocks until complete or timeout)
   */
  getResult(subAgentId: string, timeout?: number): Promise<SubAgentResult>;

  /**
   * Get multiple SubAgent results
   */
  getResults(subAgentIds: string[], timeout?: number): Promise<SubAgentResult[]>;

  /**
   * Cancel a running SubAgent
   */
  cancel(subAgentId: string): void;

  /**
   * Cancel all SubAgents for a parent
   */
  cancelAll(parentId: string): void;

  /**
   * List all SubAgents for a parent
   */
  listByParent(parentId: string): SubAgentConfig[];

  /**
   * Subscribe to SubAgent events
   * @returns Unsubscribe function
   */
  onEvent(callback: SubAgentEventListener): () => void;

  /**
   * Cleanup completed SubAgents for a parent
   */
  cleanup(parentId: string): void;
}

// =============================================================================
// Tool Types
// =============================================================================

/**
 * Task tool arguments
 */
export interface TaskToolArgs {
  /** Short task description (3-5 words) */
  description: string;
  /** Detailed task prompt */
  prompt: string;
  /** SubAgent type */
  subagent_type?: SpecializedAgentType;
  /** Run in background */
  run_in_background?: boolean;
  /** Model tier */
  model?: ModelTier;
  /** Resume a previous SubAgent */
  resume?: string;

  // Skill & ToolSkill injection
  /** Skills to inject into SubAgent */
  skills?: string[];
  /** Whether to inherit parent agent's active skills */
  inherit_parent_skills?: boolean;
  /** ToolSkills to activate for SubAgent */
  tool_skills?: string[];
  /** Whether to inherit parent agent's active ToolSkills */
  inherit_parent_tool_skills?: boolean;

  // Creative (C.5)
  /** Quality tier for creative generation tasks */
  quality_tier?: 'draft' | 'standard' | 'premium';
}

/**
 * TaskOutput tool arguments
 */
export interface TaskOutputToolArgs {
  /** SubAgent task ID */
  task_id: string;
  /** Whether to block until completion */
  block?: boolean;
  /** Max wait time in ms */
  timeout?: number;
}

// =============================================================================
// Context Bridge Types
// =============================================================================

/**
 * Context extraction options
 */
export interface ContextExtractionOptions {
  /** Max tokens for summary */
  maxTokens?: number;
  /** Include system prompt */
  includeSystemPrompt?: boolean;
  /** Number of recent messages to include */
  includeRecentMessages?: number;
}

/**
 * Context bridge interface
 */
export interface IContextBridge {
  /**
   * Extract summary from parent context
   */
  extractSummary(
    messages: Array<{ role: string; content: string | unknown }>,
    options?: ContextExtractionOptions,
  ): string;

  /**
   * Merge SubAgent results into parent context
   */
  mergeResults(
    parentMessages: Array<{ role: string; content: string }>,
    subAgentResults: Array<{ id: string; response: string; name?: string }>,
  ): Array<{ role: string; content: string }>;
}
