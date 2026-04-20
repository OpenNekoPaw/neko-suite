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
  appendEvent(seq: number, event: AgentEvent): Promise<void>;
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
   * Global memory manager for cross-project persistence.
   * When provided, memory content is injected into the `environment` layer
   * of the system prompt. Backed by `~/.neko/global-memory.md`.
   */
  globalMemoryManager?: import('@neko/shared').IProjectMemoryManager;

  /**
   * Enable automatic KeyFact extraction from conversations.
   * When true, CreativeMemoryHooks will extract key facts after each turn.
   */
  autoMemoryExtraction?: boolean;

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
   * Dual-flow architecture binding (W3 of dual-flow plan).
   *
   * When provided, AgentSession maintains a FlowSwitcher and auto-applies
   * the matching persona Skill (`flow-creation` / `flow-execution`) via the
   * injection coordinator on every transition.
   *
   * Both `skillRegistry` and `skillService` must be supplied together — the
   * binding needs the registry to resolve the persona Skill by name and the
   * service to prepare the SkillInjection payload. Omitted = dual-flow is
   * dormant, preserving pre-P1 session behaviour for callers that don't
   * use the skill system.
   */
  dualFlow?: {
    skillRegistry: import('@neko/shared').ISkillRegistry;
    skillService: import('../skill/skill-service').SkillService;
    /** Initial flow kind (default: 'creation'). */
    initialKind?: import('@neko-agent/types').FlowKind;
  };
}

// =============================================================================
// Session Events
// =============================================================================

/**
 * Agent event types
 */
export type AgentEventType =
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
  addMessage(message: ChatMessage): void;

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
  loadHistory(messages: ChatMessage[]): void;

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
