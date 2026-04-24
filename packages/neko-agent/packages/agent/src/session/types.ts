/**
 * Agent Session Types
 *
 * Unified session management for both CLI and Extension.
 * Re-exports types from other modules for convenience.
 */

import type {
  ChatMessage,
  ExecutorHooks,
  IService,
  IToolRegistry,
  IToolGroupRegistry,
  IToolCategoryRegistry,
  PromptFragment,
} from '@neko/shared';
import type { ToolTraitsRegistry } from '../permission/tool-traits-registry';

// Re-export validation types
export type { ValidationError, ValidationWarning } from '../validation/types';

// Re-export permission types
export type { ToolConfirmationRequest, PermissionMode } from '../permission/types';

// =============================================================================
// Journal Writer Interface (avoids circular dep with journal-writer.ts)
// =============================================================================

/**
 * Journal writer interface for session event persistence.
 * Implemented by JournalWriter — defined here to break the circular dependency.
 */
export interface IJournalWriter {
  appendEvent(seq: number, event: AgentEvent): Promise<string>;
  appendSnapshot(
    seq: number,
    snapshot: { historyLength: number; executionMode: ExecutionMode; versionLogSize: number },
  ): Promise<void>;
  flush(): Promise<void>;
  dispose(): Promise<void>;
}

// =============================================================================
// Execution Mode
// =============================================================================

/**
 * Execution mode for agent
 * - plan: Only generate plan, don't execute tools
 * - ask: Require user confirmation for each tool call
 * - auto: Auto execute all tools
 */
export type ExecutionMode = 'plan' | 'ask' | 'auto';

// =============================================================================
// Session Configuration
// =============================================================================

/**
 * Agent session configuration
 */
export interface AgentSessionConfig {
  /** LLM service for chat */
  service: IService;

  /** Tool registry */
  toolRegistry: IToolRegistry;

  /** System prompt (use SystemPromptBuilder to construct) */
  systemPrompt: string;

  /**
   * Optional AGENTS.md overlay content to layer on top of the base prompt.
   * When set, the initializer injects this as an L3 environment-layer
   * section at priority 80 instead of merging it into the base. Typically
   * supplied by agentRunner from `SystemPromptBuilder.buildAgentsOverlay()`.
   */
  agentsOverride?: string;

  /**
   * Optional prompt fragments contributed by sub-package capability
   * providers. Each fragment becomes an L3 environment-layer section at
   * priority 70 (below AGENTS.md = 80, above project memory = 60). Ids
   * become composer section ids as `fragment:${f.id}`.
   *
   * Typically populated by agentRunner from
   * `CapabilityDiscoveryService.getAllPromptFragments()`.
   */
  promptFragments?: readonly PromptFragment[];

  /** Execution mode */
  executionMode?: ExecutionMode;

  /** Extended thinking budget (Claude only, recommended: 10000-50000) */
  thinkingBudget?: number;

  /** Max iterations to prevent infinite loops */
  maxIterations?: number;

  /** Temperature for LLM */
  temperature?: number;

  /** Max tokens for response */
  maxTokens?: number;

  /** Model ID override */
  modelId?: string;

  /** Additional hooks */
  hooks?: ExecutorHooks[];

  /** Context compression settings */
  contextSettings?: {
    maxTokens?: number;
    reservedTokens?: number;
  };

  /**
   * Enable creative-domain context compression.
   * When true (or a config object), older turns are compressed using
   * priority-based classification (user messages preserved verbatim,
   * creative decisions / version anchors / iteration chains summarised
   * with per-category token budgets).
   */
  creativeCompression?: boolean | import('@neko/shared').CreativeCompressionConfig;

  /** Tool confirmation callback (required for 'ask' mode) */
  onConfirmTool?: (
    request: import('../permission/types').ToolConfirmationRequest,
  ) => Promise<boolean>;

  /** Validation warning callback */
  onValidationWarning?: (warning: import('../validation/types').ValidationWarning) => void;

  /** Validation error callback */
  onValidationError?: (error: import('../validation/types').ValidationError) => void;

  /** External registries (optional, will create if not provided) */
  toolGroupRegistry?: IToolGroupRegistry;
  toolCategoryRegistry?: IToolCategoryRegistry;

  /**
   * Settings hook loader for executing shell hooks from .neko/settings.json
   * - PreToolUse hooks: executed before each tool call in PermissionHooks
   * - UserPromptSubmit hooks: executed before each user message in execute()
   */
  settingsHookLoader?: import('../hook-loader/settings-hook-loader').SettingsHookLoader;

  /**
   * Project memory manager for cross-session fact persistence.
   * When provided, memory content is injected into the `environment` layer of
   * the system prompt and refreshed in-session whenever entries change.
   * Backed by `.neko/memory.md` in the project workspace root.
   */
  projectMemoryManager?: import('@neko/shared').IProjectMemoryManager;

  /**
   * Whether Journal-backed projection remains the primary persistence path.
   * `false` keeps journaling enabled but allows callers to rebuild adjacent
   * resume/storage layers in legacy Record-first mode as a rollback hatch.
   *
   * Default: true
   */
  journalAsSSOT?: boolean;

  /**
   * Whether working-memory compaction should emit compaction events into the
   * Journal. `false` preserves in-memory compression but skips Journal
   * provenance/logging for the compaction step.
   *
   * Default: true
   */
  compactLogging?: boolean;

  /**
   * Enable automatic KeyFact extraction from conversations.
   * When true, AgentSession extracts turn-level KeyFacts and routes them into
   * project memory (`.neko/memory.md`) after each successful turn.
   */
  autoMemoryExtraction?: boolean;

  /**
   * Enable per-turn memory recall injection from project memory.
   * When false, `.neko/memory.md` still exists as project memory state but the
   * recall results are not injected into the ephemeral prompt layer.
   *
   * Default: true
   */
  memoryRecall?: boolean;

  /**
   * Optional reference to the shared SkillService. When supplied, ablation
   * toggles that control discovery (e.g. `skillDiscovery: false`) can flip
   * the service's discovery state at session init and restore it on dispose.
   * The initializer is the only consumer — agent runtime code should not
   * reach through this field.
   */
  skillService?: import('../skill/skill-service').SkillService;

  /**
   * JSONL journal writer for session event persistence.
   * When provided, all non-streaming events are appended to a JSONL file
   * for crash recovery and session replay.
   */
  journalWriter?: IJournalWriter;

  /**
   * Conversation ID for journal correlation.
   */
  conversationId?: string;

  /**
   * Tool traits registry for creative auto mode.
   * When provided, auto mode uses trait-based decisions:
   * - reversible OR local → auto-allow
   * - network + irreversible → ask user
   * Without this, auto mode unconditionally allows (backward compatible).
   */
  traitsRegistry?: ToolTraitsRegistry;

  /**
   * IDC stage-tracking runtime.
   *
   * When provided, AgentSession enables the IDC runner pieces
   * (StageTracker, IdcRunStore, ApprovalEngine, StageGuardian, optional
   * workspace sinks). Persona auto-swap is optional: when both
   * `skillRegistry` and `skillService` are supplied, the session also
   * applies the matching persona Skill (`creation-persona` for draft/plan,
   * `execution-persona` for apply) on each stage transition.
   *
   * Omitted = IDC runtime stays dormant, preserving legacy behaviour for
   * callers that want a plain ReAct session.
   */
  stageTracking?: {
    /**
     * Optional source for persona Skills. Must be paired with
     * `skillService`; when omitted, IDC still runs but stage changes do
     * not swap persona prompts.
     */
    skillRegistry?: import('@neko/shared').ISkillRegistry;
    /**
     * Optional injector for persona Skills. Must be paired with
     * `skillRegistry`; when omitted, IDC still runs but persona binding is
     * skipped.
     */
    skillService?: import('../skill/skill-service').SkillService;
    /** Initial IDC stage (default: none — tracker stays uninitialised). */
    initialStage?: import('@neko-agent/types').IdcStage;
    /**
     * Optional StageGuardian configuration (ADR §5.4, §6.5). When
     * omitted the guardian uses defaults (ordered-entry enforcement on,
     * timeout disabled). Set `enabled: false` to skip installing it.
     */
    guardian?: false | import('../skill/stage-guardian').StageGuardianConfig;
  };

  /**
   * Workspace persistence (ADR §7.4). When supplied, AgentSession
   * creates a NekoPaths resolver rooted at `root` and attaches an
   * NdjsonEventSink that appends every bus event to
   * `<root>/.neko/logs/events.jsonl`. Omitted = no disk sink; the
   * session still runs but without persisted telemetry.
   *
   * Separate audit / step sinks are left for follow-up PRs (each
   * gets its own sink with a channel-filter predicate). This PR
   * ships the events sink only — the common case.
   */
  workspace?: {
    /** Project root (not the `.neko/` subdirectory itself). */
    root: string;
    /**
     * Platform fsOps. Must implement NdjsonFsOps; when `readFile` is
     * also provided (widened type, `readFile(path, 'utf-8')`), the
     * session auto-loads `.neko/preferences.md` and registers a
     * preferences strategy pack on the ApprovalEngine (ADR §9.3).
     */
    fsOps: import('../workspace').NdjsonFsOps & Partial<import('../workspace').PreferencesFsOps>;
    /**
     * Absolute path to the global `preferences.md` (typically
     * `~/.neko/preferences.md`). When omitted, only the project layer
     * is loaded. When the fsOps lacks `readFile`, this is ignored.
     */
    globalPreferencesPath?: string;
  };
}

// =============================================================================
// Session Events
// =============================================================================

/**
 * Agent event types
 */
export type AgentEventType =
  | 'user_message' // User input persisted to journal for resume / projection
  | 'compaction' // Working-memory compaction summary written to journal
  | 'compaction_failed' // Compaction attempt failed and tripped/advanced circuit state
  | 'memory_extraction' // Semantic memory extraction/write pipeline event
  | 'thinking' // Agent is in thinking phase
  | 'thinking_content' // Extended thinking content (Claude)
  | 'text' // Text output (complete)
  | 'text_delta' // Streaming text chunk (incremental)
  | 'tool_call' // Tool invocation
  | 'tool_result' // Tool execution result
  | 'tool_progress' // Tool execution progress update
  | 'tool_confirmation' // Tool requires confirmation
  | 'version_recorded' // Creative version entry recorded
  | 'coordinator_event' // Coordinator orchestration event
  | 'iteration' // Iteration info
  | 'done' // Execution complete
  | 'error' // Error occurred
  | 'messageQueued'; // Message queued while agent is running

/**
 * Agent event
 */
export interface AgentEvent {
  /** Event type */
  type: AgentEventType;

  /** Text content */
  content?: string;

  /** Extended thinking content */
  thinking?: string;

  /** Tool call info */
  toolCall?: {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  };

  /** Tool result */
  toolResult?: {
    toolCallId: string;
    success: boolean;
    data: unknown;
    error?: string;
    /** Multimodal attachments from tool execution (e.g. generated images) */
    attachments?: import('@neko/shared').ToolResultAttachment[];
  };

  /** Tool execution progress update */
  toolProgress?: {
    toolCallId: string;
    toolName: string;
    percent: number;
    stage: string;
    preview?: string;
  };

  /** Tool confirmation request */
  toolConfirmation?: import('../permission/types').ToolConfirmationRequest;

  /** Compaction summary event */
  compaction?: {
    timestamp: number;
    trigger: 'token_threshold' | 'turn_threshold' | 'manual';
    replacedEventIds: string[];
    summaryContent: string;
    summaryMessageRole: 'system' | 'user';
    tokenProfile: {
      before: number;
      after: number;
    };
    strategy: 'basic' | 'creative-priority';
  };

  /** Compaction failure event */
  compactionFailed?: {
    trigger: 'token_threshold' | 'turn_threshold' | 'manual';
    reason: string;
    failureCount: number;
    circuitOpen: boolean;
  };

  /** Memory extraction pipeline event */
  memoryExtraction?: {
    timestamp: number;
    sourceEventIds: string[];
    facts: Array<{
      id: string;
      content: string;
      category: 'preference' | 'decision' | 'context' | 'action';
      confidence: number;
      destination: 'project';
    }>;
    writeStatus: 'pending' | 'written' | 'rejected-by-user' | 'dedup';
  };

  /** Creative version entry (on version_recorded) */
  versionEntry?: import('@neko/shared').CreativeVersionEntry;

  /** Coordinator event (on coordinator_event) */
  coordinatorEvent?: import('@neko/shared').CoordinatorEvent;

  /** Iteration info */
  iteration?: {
    current: number;
    max: number;
  };

  /** Usage stats (on done) */
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };

  /** Error (on error) */
  error?: Error;
}

// =============================================================================
// Context Compression
// =============================================================================

/**
 * Context compression result
 */
export interface CompressionResult {
  /** Original token count */
  originalTokens: number;

  /** Compressed token count */
  compressedTokens: number;

  /** Compression ratio (0-1) */
  ratio: number;
}

// =============================================================================
// Session Interface
// =============================================================================

/**
 * Agent session interface
 *
 * Provides unified session management for both CLI and Extension.
 * Encapsulates:
 * - Execution mode (plan/ask/auto)
 * - Extended thinking support
 * - Context compression
 * - History management
 * - Tool confirmation flow
 */
export interface IAgentSession {
  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  /**
   * Update session configuration
   * Can be called to change settings mid-session
   */
  configure(config: Partial<AgentSessionConfig>): void;

  /**
   * Get current execution mode
   */
  getExecutionMode(): ExecutionMode;

  /**
   * Set execution mode
   */
  setExecutionMode(mode: ExecutionMode): void;

  /**
   * Wire an ISkillProvider into the meta tools.
   * Called by the extension layer after the skill system is initialized.
   */
  setSkillProvider(provider: import('../tools/core/meta-tools').ISkillProvider): void;

  // ---------------------------------------------------------------------------
  // Execution
  // ---------------------------------------------------------------------------

  /**
   * Execute user input
   * @param input User message
   * @param context Optional execution context
   * @returns Async iterable of agent events
   */
  execute(input: string, context?: ExecutionContext): AsyncIterable<AgentEvent>;

  /**
   * Cancel current execution
   */
  cancel(): void;

  /**
   * Check if session is currently executing
   */
  isRunning(): boolean;

  // ---------------------------------------------------------------------------
  // Tool Confirmation (for 'ask' mode)
  // ---------------------------------------------------------------------------

  /**
   * Confirm or reject a pending tool call
   * @param toolCallId Tool call ID
   * @param approved Whether to approve
   */
  confirmTool(toolCallId: string, approved: boolean): void;

  /**
   * Get pending tool confirmations
   */
  getPendingConfirmations(): import('../permission/types').ToolConfirmationRequest[];

  // ---------------------------------------------------------------------------
  // History Management
  // ---------------------------------------------------------------------------

  /**
   * Get conversation history
   */
  getHistory(): ChatMessage[];

  /**
   * Add message to history
   */
  addMessage(message: ChatMessage, sourceEventIds?: readonly string[]): void;

  /**
   * Apply skill injection (reversible via removeSkillInjection)
   * @param injection The injection payload
   * @param skill Optional full Skill object for active skill tracking + Track D (ToolSets)
   */
  applySkillInjection(
    injection: import('../skill').SkillInjection,
    skill?: import('@neko/shared').Skill,
  ): void;

  /**
   * Remove a previously injected skill prompt
   */
  removeSkillInjection(name: string): void;

  /**
   * Get the currently active skill (if any).
   * Delegates to SkillInjectionCoordinator.
   */
  getActiveSkill(): import('@neko/shared').Skill | undefined;

  /**
   * Clear the active skill — reverses all injection tracks.
   * Delegates to SkillInjectionCoordinator.clearActive().
   */
  clearActiveSkill(): void;

  /**
   * Check if a tool is allowed by the active skill.
   * Returns true if no skill restrictions are active.
   */
  isToolAllowed(toolName: string): boolean;

  /**
   * Clear conversation history
   */
  clearHistory(): void;

  /**
   * Load history from external source
   */
  loadHistory(messages: ChatMessage[], messageEventIds?: readonly (readonly string[])[]): void;

  // ---------------------------------------------------------------------------
  // Context Management
  // ---------------------------------------------------------------------------

  /**
   * Get current context token count
   */
  getTokenCount(): number;

  /**
   * Compress context to reduce tokens
   */
  compressContext(): Promise<CompressionResult>;

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Dispose session resources
   */
  dispose(): void;
}

/**
 * Execution context (optional metadata)
 */
export interface ExecutionContext {
  /** Workspace root path */
  workspaceRoot?: string;

  /** Project type */
  projectType?: string;

  /** Active file path */
  activeFile?: string;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}
