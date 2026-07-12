/**
 * SubAgent Types - Type definitions for SubAgent mechanism
 *
 * SubAgent allows parent agents to spawn child agents for parallel task execution.
 */

import type { ChildRunScope, ConversationRunScope } from '@neko-agent/types';
import type {
  AgentConfig,
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
 * Agent-owned SubAgent preset types. Domain-specific presets are contributed by
 * hosts through `SubAgentManagerDeps.specializedPresets`.
 */
export type BuiltinSpecializedAgentType =
  | 'code-search' // Search and analyze code
  | 'file-explorer' // Navigate file system
  | 'test-runner' // Run and analyze tests
  | 'document-writer' // Write documentation
  | 'general' // General purpose agent
  | 'npc-character'; // Isolated NPC character validation

export type SpecializedAgentType = BuiltinSpecializedAgentType | (string & {});

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

export interface SubAgentModelRef {
  readonly providerId: string;
  readonly modelId: string;
}

export type ModelTierResolverResult = SubAgentModelRef;

export type ModelTierResolver = (
  tier: ModelTier,
  context?: SubAgentModelTierResolverContext,
) => ModelTierResolverResult | undefined;

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
  /** Provider ID for the explicit model. Required when modelId is set. */
  providerId?: string;
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
  /** Owning durable run id, when spawned by long-running Agent work */
  runId?: string;
  /** Optional durable run start timestamp for restored run disambiguation */
  runStartedAt?: number;
  /** Runtime prompt locale inherited from the parent turn. */
  locale?: string;

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

  /**
   * Host-defined preset options. Agent runtime preserves these for contributed
   * presets but does not interpret domain-specific keys.
   */
  presetOptions?: Record<string, unknown>;
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
  /** Complete immutable owner identity. */
  scope: ChildRunScope;
  /** Local SubAgent ID for presentation only. */
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
  /** Complete immutable owner identity. */
  scope: ChildRunScope;
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
    runId?: string;
    runStartedAt?: number;
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
  scope: ChildRunScope;
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
  /** Host-contributed specialized presets. */
  specializedPresets?: Readonly<Record<string, SpecializedAgentPreset>>;
}

/**
 * SubAgent manager interface
 */
export interface ISubAgentManager {
  /** Spawn a SubAgent owned by the complete child-run scope. */
  spawn(scope: ChildRunScope, config: SubAgentConfig): Promise<ChildRunScope>;

  /** Spawn multiple independently scoped SubAgents. */
  spawnBatch(
    entries: readonly { readonly scope: ChildRunScope; readonly config: SubAgentConfig }[],
  ): Promise<ChildRunScope[]>;

  /** Get SubAgent status through its complete owner scope. */
  getStatus(scope: ChildRunScope): SubAgentStatus | undefined;

  /** Get SubAgent result through its complete owner scope. */
  getResult(scope: ChildRunScope, timeout?: number): Promise<SubAgentResult>;

  /** Get multiple SubAgent results through complete owner scopes. */
  getResults(scopes: readonly ChildRunScope[], timeout?: number): Promise<SubAgentResult[]>;

  /** Cancel exactly one scoped SubAgent. */
  cancel(scope: ChildRunScope): void;

  /** Cancel all SubAgents owned by one conversation run. */
  cancelRun(scope: ConversationRunScope): void;

  /** List SubAgent configs owned by one conversation run. */
  listByRun(scope: ConversationRunScope): SubAgentConfig[];

  /** Subscribe to SubAgent events. */
  onEvent(callback: SubAgentEventListener): () => void;

  /** Cleanup terminal SubAgents owned by one conversation run. */
  cleanupRun(scope: ConversationRunScope): void;
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

  /** Host-defined options passed through to contributed presets. */
  preset_options?: Record<string, unknown>;
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
  /** Runtime prompt locale used for wrapper labels. */
  locale?: string;
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
    locale?: string,
  ): Array<{ role: string; content: string }>;
}
