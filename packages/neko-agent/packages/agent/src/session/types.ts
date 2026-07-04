/**
 * Agent Session Types
 *
 * Unified session management for both CLI and Extension.
 * Re-exports types from other modules for convenience.
 */

import type {
  AgentCapabilityActivationIntent,
  AgentCapabilityActivationProgressEvent,
  ChatMessage,
  ExecutorHooks,
  IService,
  IToolRegistry,
  IToolGroupRegistry,
  IToolCategoryRegistry,
  IProviderCardRegistry,
  IOperationToolAdapterRegistry,
  PromptFragment,
} from '@neko/shared';
import type { ArtifactWatcherFactory } from '../runtime/types';
import type { ToolTraitsRegistry } from '../permission/tool-traits-registry';
import type {
  PerceptionClassifyClient,
  PerceptionDetectShotsClient,
  PerceptionSimilarityClient,
  PerceptionTranscribeClient,
} from '../tools/perception';
import type { AgentExternalProcessorRuntime } from '../runtime/external-processor-runtime';
import type { AgentContentAccessRuntime } from '../runtime/agent-content-access-runtime';
import type { AgentMessageQueueSnapshot, AgentQueuedMessageItem } from '@neko-agent/types';

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

export interface AgentEventErrorRecord {
  message: string;
  name?: string;
}

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
   * `CapabilityDiscoveryService.getAllPromptFragments()` and can be refreshed
   * later on the live session via `setPromptFragments()`.
   */
  promptFragments?: readonly PromptFragment[];

  /** Execution mode */
  executionMode?: ExecutionMode;

  /** Extended thinking budget (Claude only, recommended: 10000-50000) */
  thinkingBudget?: number;

  /** Provider-specific AI SDK request options projected by Platform. */
  providerOptions?: Record<string, unknown>;

  /** Max iterations to prevent infinite loops */
  maxIterations?: number;

  /** Temperature for LLM */
  temperature?: number;

  /** Top P sampling for LLM */
  topP?: number;

  /** Max tokens for response */
  maxTokens?: number;

  /** Provider ID override */
  providerId?: string;

  /** Model ID override */
  modelId?: string;

  /** Capabilities declared by the explicitly selected model. */
  modelCapabilities?: readonly string[];

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

  /** Host-visible activation progress for Skill/IDC/mode lifecycle changes. */
  onActivationProgress?: (
    conversationId: string,
    events: readonly AgentCapabilityActivationProgressEvent[],
  ) => void;

  /** External registries (optional, will create if not provided) */
  toolGroupRegistry?: IToolGroupRegistry;
  toolCategoryRegistry?: IToolCategoryRegistry;
  providerCardRegistry?: IProviderCardRegistry;

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
   * Optional validation runtime coordinator.
   *
   * When provided, session-level validation sources such as artifact
   * observation, self-evaluation guidance, and project-memory extraction
   * are delegated to this coordinator instead of being assembled ad hoc
   * inside AgentSession.
   */
  validationCoordinator?: import('@neko/shared').AgentValidationCoordinator;

  /**
   * Optional host/skill-owned validation coordinator factory.
   *
   * AgentSession calls this only after its generic runtime ports
   * (EventBus/StageTracker/project memory) are available. This keeps concrete
   * validation policies outside Agent core while allowing skills to subscribe to
   * agent-owned runtime events through stable shared ports.
   */
  validationCoordinatorFactory?: import('@neko/shared').AgentValidationCoordinatorFactory;

  /**
   * Optional host/skill-owned validation policy. Agent core no longer creates
   * default policy implementations; skills/extensions that own validation
   * should configure their injected coordinator directly.
   */
  validationControlPolicy?: import('@neko/shared').AgentValidationControlPolicy;

  /**
   * Host-contributed adapters that can turn successful tool outputs into
   * generic validation signals. Domain packages own concrete adapter rules.
   */
  toolResultValidationAdapters?: readonly import('@neko/shared').AgentToolResultValidationAdapter[];

  /**
   * Optional creative-process recovery provider. It only receives validation
   * decisions and may return stage guidance; it must not execute tools or
   * mutate project state.
   */
  creativeProcessRecoveryPolicy?: import('@neko/shared').AgentCreativeProcessRecoveryPolicy;

  /**
   * Optional skill/host-owned technical recovery chain factory.
   *
   * Agent core owns the ReAct hook point only. Concrete autoheal policies
   * and strategy packs are contributed by skill/domain packages through this
   * factory.
   */
  autohealChainFactory?: import('@neko/shared').AgentAutohealChainFactory;

  /**
   * Optional OperationTool adapter registry. Adapters only map approved
   * operation intents to EditOperation plans; they do not execute mutations.
   */
  operationToolAdapterRegistry?: IOperationToolAdapterRegistry;

  /**
   * Optional external processor runtime projected from the Host-owned registry.
   * Agent sessions may plan processor invocations through this interface, but
   * must not read processor source directories or Market/extension internals.
   */
  externalProcessorRuntime?: AgentExternalProcessorRuntime;

  /**
   * Optional Host-owned content access runtime.
   *
   * Agent-facing tools and provider asset loading use this boundary for
   * binary/media/document resource access. Cache paths and runtime handles
   * remain owned by Host content access/cache services.
   */
  contentAccessRuntime?: AgentContentAccessRuntime;

  /**
   * Optional clients for Agent-first perception evidence tools.
   *
   * Supplying a client registers the matching lazy ToolSet execution tool;
   * it does not inject the tool into the default prompt. Agent remains the
   * primary perceiver and can activate/call these tools only as optional
   * evidence providers.
   */
  perceptionClients?: {
    readonly transcribe?: PerceptionTranscribeClient;
    readonly similarity?: PerceptionSimilarityClient;
    readonly classify?: PerceptionClassifyClient;
    readonly detectShots?: PerceptionDetectShotsClient;
  };

  /**
   * Optional aggregate perception runtime.
   *
   * When supplied, AgentSession registers the lazy `perception.perceive`
   * aggregate tool. The pipeline remains a runtime service with injected
   * ports; Extension/Webview adapters do not own perception business logic.
   */
  perceptionPipeline?: import('../perception').IPerceptionPipeline;

  /**
   * Optional reference to the shared SkillService. When supplied, ablation
   * toggles that control discovery (e.g. `skillDiscovery: false`) can flip
   * the service's discovery state at session init and restore it on dispose.
   * The initializer is the only consumer — agent runtime code should not
   * reach through this field.
   */
  skillService?: import('../skill/skill-service').SkillService;

  /**
   * Optional runtime ArtifactService.
   *
   * When provided, Draft / Plan / Task writes go through this service so
   * session callers, runtime bootstrap, and host surfaces share the same
   * artifact persistence + run-binding entrypoint. When omitted but
   * `workspace.fsOps.writeFile` exists, AgentSession may bootstrap a default
   * workspace-backed service.
   */
  artifactService?: import('../runtime/artifact-service').IArtifactService;

  /**
   * Optional runtime artifact watcher factory.
   *
   * When supplied, AgentSession delegates draft/plan/task watch bootstrap to
   * the runtime artifact plane instead of directly instantiating the default
   * node-backed watcher. Hosts should normally provide this through the
   * unified runtime bootstrap (`IArtifactStore.createArtifactWatcher`).
   */
  artifactWatcherFactory?: ArtifactWatcherFactory;

  /**
   * Optional staged-creation task projection adapter.
   *
   * When provided, Task artifacts are mirrored into the shared task plane
   * (for example TaskManager-backed UI surfaces) so checklist progress no
   * longer lives only inside markdown artifacts or retired artifact indexes.
   */
  creationTaskProjection?: import('../task').ICreationTaskProjection;

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
   * Optional built-in IDC profile guidance.
   *
   * When provided, AgentSession enables StageTracker, ApprovalEngine,
   * StageGuardian, and optional persona Skill projection on top of the normal
   * Agent ReAct loop. This is prompt/stage guidance only; it does not create a
   * separate workflow, run store, or creation runtime.
   */
  stageTracking?: {
    /**
     * Optional source for persona Skills. Must be paired with
     * `skillService`; when omitted, stage projection still runs but stage changes do
     * not swap persona prompts.
     */
    skillRegistry?: import('@neko/shared').ISkillRegistry;
    /**
     * Optional injector for persona Skills. Must be paired with
     * `skillRegistry`; when omitted, stage projection still runs but persona binding is
     * skipped.
     */
    skillService?: import('../skill/skill-service').SkillService;
    /**
     * Skill lifecycle projection for stage persona records.
     * When supplied, stage persona activation writes lifecycle records instead
     * of mutating the single active injection adapter slot.
     */
    skillLifecycleRuntime?: import('../skill/skill-lifecycle-runtime').SkillLifecycleRuntime;
    /** Initial built-in IDC profile stage (default: none — tracker stays uninitialised). */
    initialStage?: import('@neko-agent/types').IdcStage;
    /**
     * Optional StageGuardian configuration (ADR §5.4, §6.5). When
     * omitted the guardian uses defaults (ordered-entry enforcement on,
     * timeout disabled). Set `enabled: false` to skip installing it.
     */
    guardian?: false | import('../skill/stage-guardian').StageGuardianConfig;
  };

  /**
   * Workspace persistence (ADR §7.4). When supplied, AgentSession creates a
   * NekoPaths resolver rooted at `root` and attaches JSONL event sinks under
   * `<root>/.neko/logs/`. Omitted = no disk sink; the session still runs.
   */
  workspace?: {
    /** Project root (not the `.neko/` subdirectory itself). */
    root: string;
    /**
     * Platform fsOps. Must implement NdjsonFsOps; when `readFile` is also
     * provided, the session auto-loads `.neko/preferences.md` and registers a
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
  | 'validation.stage_transition_requested' // Creative-process recovery requested retry/regress/restart guidance
  | 'agent.observation.created' // Agent-first multimodal observation recorded
  | 'agent.evidence.attached' // Optional evidence attached to an observation/rationale
  | 'agent.rationale.created' // Agent decision rationale recorded
  | 'thinking' // Agent is in thinking phase
  | 'thinking_content' // Extended thinking content (Claude)
  | 'text' // Text output (complete)
  | 'text_delta' // Streaming text chunk (incremental)
  | 'assistant_text_replacement' // Current assistant text is being internally repaired/replaced
  | 'tool_call' // Tool invocation
  | 'tool_result' // Tool execution result
  | 'tool_result_backfill' // Delayed tool result patch from background work
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

  /** Replacement reason for assistant_text_replacement events. */
  replacement?: {
    reason: 'output-validation-retry';
    attempt: number;
  };

  /** Number of user messages waiting behind the active run. */
  pendingCount?: number;

  /** Pending queue item accepted or affected by this event. */
  queuedMessageItem?: AgentQueuedMessageItem;

  /** Queue item removed from pending state because it began execution. */
  releasedQueuedMessageItem?: AgentQueuedMessageItem;

  /** Authoritative pending message queue snapshot. */
  messageQueueSnapshot?: AgentMessageQueueSnapshot;

  /** Extended thinking content */
  thinking?: string;

  /** Provider reasoning content that must be replayed with assistant messages. */
  reasoningContent?: string;

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
    /** Structured media perception generated after tool completion. */
    perceptionCards?: import('@neko/shared').PerceptionCard[];
    /** Diagnostics captured while merging delayed result payloads. */
    backfillDiagnostics?: import('@neko/shared').ToolResultBackfillDiagnostic[];
    /** Structured composite artifact transfer payloads. */
    artifacts?: import('@neko/shared').ToolResultArtifactTransfer[];
    /** Tool-level observability metadata persisted to journal consumers. */
    metadata?: Record<string, unknown>;
  };

  /** Delayed tool result backfill payload */
  toolResultBackfill?: import('@neko/shared').ToolResultBackfillPayload;

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

  /** Creative-process recovery transition request event */
  validationStageTransition?: {
    timestamp: number;
    activeRunId?: string;
    currentStageId?: string;
    decision: import('@neko/shared').AgentValidationDecision;
    guidance: import('@neko/shared').AgentStageTransitionGuidance;
  };

  /** Agent-first multimodal observation event */
  agentObservation?: import('@neko/shared').AgentObservation;

  /** Optional evidence attached to the Agent-first observation/rationale graph */
  agentEvidence?: import('@neko/shared').PerceptionEvidence;

  /** Agent decision rationale event */
  agentRationale?: import('@neko/shared').DecisionRationale;

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

  /** Error (on error). Journal replay receives the serialized record form. */
  error?: Error | AgentEventErrorRecord;
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

export interface ToolResultPatchResult {
  readonly patched: boolean;
  readonly eventId?: string;
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
   * Set execution mode through an explicit activation intent.
   */
  setExecutionModeWithIntent(mode: ExecutionMode, intent: AgentCapabilityActivationIntent): void;

  /**
   * Wire an ISkillProvider into the meta tools.
   * Called by the extension layer after the skill system is initialized.
   */
  setSkillProvider(provider: import('../tools/core/meta-tools').ISkillProvider): void;

  /**
   * Replace capability-contributed prompt fragments at runtime and sync the
   * composed system prompt immediately.
   */
  setPromptFragments(fragments: readonly PromptFragment[] | undefined): void;

  /**
   * Get the known IDC artifacts bound to a run.
   * Defaults to the active run when `runId` is omitted.
   */
  getArtifactsForRun(
    runId?: string,
  ): readonly import('../runtime/artifact-service').ArtifactRecord[];

  /**
   * List run ids that currently have persisted Draft / Plan / Task artifacts.
   */
  listArtifactRunIds(): readonly string[];

  /**
   * Recent validation coordination cycles assembled from artifact observation,
   * self-evaluation scheduling, and memory extraction.
   */
  getValidationCycles(): readonly import('@neko/shared').AgentValidationCycle[];

  /**
   * Get the injected OperationTool adapter registry, if this host provides one.
   */
  getOperationToolAdapterRegistry(): IOperationToolAdapterRegistry | null;

  /**
   * Persist a Draft artifact through the unified runtime artifact service.
   */
  writeDraftArtifact(
    draft: import('@neko-agent/types').Draft,
    options?: { runId?: string },
  ): Promise<import('../runtime/artifact-service').ArtifactRecord<'draft'>>;

  /**
   * Persist an ExecutionPlan artifact through the unified runtime artifact service.
   */
  writePlanArtifact(
    plan: import('@neko-agent/types').ExecutionPlan,
    options?: { runId?: string },
  ): Promise<import('../runtime/artifact-service').ArtifactRecord<'plan'>>;

  /**
   * Persist a Task artifact through the unified runtime artifact service.
   */
  writeTaskArtifact(
    task: import('@neko-agent/types').Task,
    options?: { runId?: string },
  ): Promise<import('../runtime/artifact-service').ArtifactRecord<'task'>>;

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
   * Patch an existing tool result after background work completes.
   */
  patchToolResult(
    payload: import('@neko/shared').ToolResultBackfillPayload,
  ): Promise<ToolResultPatchResult>;

  /**
   * Apply skill injection (reversible via removeSkillInjection)
   * Request-time projection adapter. Canonical active Skill records live in
   * SkillLifecycleRuntime when that runtime is supplied.
   * @param injection The injection payload
   * @param skill Optional full Skill object for active skill tracking + Track D (ToolSets)
   */
  applySkillInjection(
    injection: import('../skill').SkillInjection,
    skill?: import('@neko/shared').Skill,
  ): void;

  /**
   * Activate ToolSets that contain the given tools. Returns only ToolSets that
   * were newly activated by this call so callers can reverse turn-scoped state.
   */
  activateToolSetsForTools(toolNames: readonly string[]): readonly string[];

  /**
   * Deactivate a previously activated ToolSet.
   */
  deactivateToolSet(toolSetName: string): void;

  /**
   * Remove a previously injected skill prompt
   */
  removeSkillInjection(name: string): void;

  /**
   * Get the currently projected Skill adapter payload, if any.
   */
  getActiveSkill(): import('@neko/shared').Skill | undefined;

  /**
   * Clear the projected Skill adapter payload.
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
