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

// Re-export validation types
export type { ValidationError, ValidationWarning } from '../validation/types';

// Re-export permission types
export type { ToolConfirmationRequest, PermissionMode } from '../permission/types';

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
  | 'tool_confirmation' // Tool requires confirmation
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
  };

  /** Tool confirmation request */
  toolConfirmation?: import('../permission/types').ToolConfirmationRequest;

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
