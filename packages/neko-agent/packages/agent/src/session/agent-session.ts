/**
 * Agent Session - Unified session management for CLI and Extension
 *
 * This class provides a unified interface for agent execution across different
 * entry points (CLI, Extension, etc.). It encapsulates:
 * - Execution mode management (plan/ask/auto)
 * - Extended thinking support (Claude)
 * - Context compression
 * - History management
 * - Tool confirmation flow
 *
 * Architecture:
 * - AgentSession wraps AgentExecutor and provides session-level state
 * - Uses hooks composition for Memory, Validation, Permission
 * - Converts AgentStep to AgentEvent for unified event streaming
 */

import type { ChatMessage } from '@neko/shared';
import type { SkillInjection } from '../skill';
import { SkillInjectionCoordinator } from '../skill';
import { stepToEvents, recordStepInHistory, type StreamState } from './step-event-converter';

import type {
  IAgentSession,
  AgentSessionConfig,
  AgentEvent,
  ExecutionMode,
  ExecutionContext,
  CompressionResult,
} from './types';

import type { ToolConfirmationRequest } from '../permission/types';

import { AgentExecutor } from '../executor';
import { type ConversationCompressor } from '../context';
import { createExecutorHooks } from '../hooks';
import { type IPermissionManager, type PermissionMode } from '../permission';
import { type ToolGroupRegistry } from '../skill';
import { type ToolInjectionManager } from '../tools';
import { type SystemPromptComposer } from '../prompt/system-prompt-composer';
import { getLogger } from '../utils/logger';
import { initializeSession, DEFAULT_MAX_ITERATIONS } from './agent-session-initializer';

const logger = getLogger('AgentSession');

// =============================================================================
// Constants
// =============================================================================

/** Plan mode system reminder injected into user input */
export const PLAN_MODE_SYSTEM_REMINDER = `
[PLAN MODE ACTIVE]
You are in planning mode. Generate a detailed implementation plan but DO NOT execute any tools.
Describe what tools you would use and in what order, but do not call them.
`;

// =============================================================================
// AgentSession Implementation
// =============================================================================

/**
 * Agent Session - Unified session management
 */
export class AgentSession implements IAgentSession {
  // Configuration
  private _config: AgentSessionConfig;
  private _executionMode: ExecutionMode;

  // Core components
  private _executor: AgentExecutor | null = null;
  private _compressor: ConversationCompressor;
  private _permissionHooks: IPermissionManager | null = null;

  // Registries (used by _rebuildExecutor on configure())
  private _toolGroupRegistry: ToolGroupRegistry;
  private _toolInjectionManager: ToolInjectionManager;

  // Prompt composition
  private _promptComposer: SystemPromptComposer;

  // Skill injection (3-track coordinator)
  private _skillCoordinator!: SkillInjectionCoordinator;

  // State
  private _history: ChatMessage[] = [];
  private _isRunning = false;
  /** Tracks streaming state across step conversions */
  private _streamState: StreamState = { hasStreamedDeltas: false };
  private _pendingConfirmations = new Map<
    string,
    {
      request: ToolConfirmationRequest;
    }
  >();

  constructor(config: AgentSessionConfig) {
    this._config = config;
    this._executionMode = config.executionMode ?? 'auto';

    // Delegate component creation to initializer (SRP: init logic separate from runtime)
    const components = initializeSession(config, {
      onToolConfirmation: (request) => this._handleToolConfirmation(request),
    });

    // Assign initialized components
    this._compressor = components.compressor;
    this._toolGroupRegistry = components.toolGroupRegistry;
    this._toolInjectionManager = components.toolInjectionManager;
    this._promptComposer = components.promptComposer;
    this._executor = components.executor;
    this._permissionHooks = components.permissionHooks;
    this._history = components.history;

    // SkillInjectionCoordinator requires closures over Session fields
    // (e.g. _permissionHooks changes on configure()), so created here
    this._skillCoordinator = new SkillInjectionCoordinator({
      promptComposer: this._promptComposer,
      getPermissionHooks: () => this._permissionHooks,
      syncSystemPrompt: () => this._syncSystemPrompt(),
    });
  }

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  configure(config: Partial<AgentSessionConfig>): void {
    // Update config
    this._config = { ...this._config, ...config };

    // Update execution mode if changed
    if (config.executionMode !== undefined) {
      this._executionMode = config.executionMode;
    }

    // Update system prompt in history if changed
    if (config.systemPrompt !== undefined) {
      this._promptComposer.setBase(config.systemPrompt);
      this._syncSystemPrompt();
    }

    // Reinitialize executor with new config
    this._rebuildExecutor();
  }

  getExecutionMode(): ExecutionMode {
    return this._executionMode;
  }

  setExecutionMode(mode: ExecutionMode): void {
    this._executionMode = mode;
    // Only update permission hooks mode instead of rebuilding entire executor
    if (this._permissionHooks) {
      const permissionMode: PermissionMode =
        mode === 'plan' ? 'plan' : mode === 'auto' ? 'auto' : 'ask';
      this._permissionHooks.setMode(permissionMode);
    }
  }

  // ---------------------------------------------------------------------------
  // Execution
  // ---------------------------------------------------------------------------

  async *execute(input: string, context?: ExecutionContext): AsyncIterable<AgentEvent> {
    if (!this._executor) {
      yield { type: 'error', error: new Error('Session not initialized') };
      return;
    }

    if (this._isRunning) {
      yield { type: 'error', error: new Error('Session is already running') };
      return;
    }

    this._isRunning = true;

    try {
      // Execute UserPromptSubmit hooks (if configured)
      let processedInput = input;
      if (this._config.settingsHookLoader) {
        const hookResult = await this._config.settingsHookLoader.executeUserPromptSubmit(input);
        if (hookResult.blocked) {
          yield {
            type: 'error',
            error: new Error(hookResult.reason ?? 'Message blocked by UserPromptSubmit hook'),
          };
          return;
        }
        // Append hook stdout as additional context
        if (hookResult.stdout?.trim()) {
          processedInput = `${input}\n\n[Context from hooks]\n${hookResult.stdout.trim()}`;
        }
      }

      // Prepare input (inject plan mode reminder if needed)
      if (this._executionMode === 'plan') {
        processedInput = `${PLAN_MODE_SYSTEM_REMINDER}\n\n${processedInput}`;
      }

      const maxIterations = this._config.maxIterations ?? DEFAULT_MAX_ITERATIONS;
      let iteration = 0;

      // Add user message to history first, then pass snapshot (including user message)
      // to executor with skipUserMessage flag so it doesn't duplicate
      this._history.push({ role: 'user', content: processedInput });
      this._syncSystemPrompt(); // Ensure system prompt is fresh before snapshot
      const messagesSnapshot = [...this._history];

      for await (const step of this._executor.executeStream(processedInput, {
        messages: messagesSnapshot,
        skipUserMessage: true,
        metadata: {
          workspaceRoot: context?.workspaceRoot,
          projectType: context?.projectType,
          activeFile: context?.activeFile,
          ...context?.metadata,
        },
      })) {
        ++iteration;
        // Record history first (side effects), then emit events (pure)
        recordStepInHistory(step, iteration, this._history);
        yield* stepToEvents(step, iteration, maxIterations, this._streamState);
      }

      // Emit done event
      const totalTokens = this.getTokenCount();
      yield {
        type: 'done',
        usage: {
          inputTokens: totalTokens,
          outputTokens: 0,
          totalTokens,
        },
      };
    } catch (error) {
      yield {
        type: 'error',
        error: error instanceof Error ? error : new Error(String(error)),
      };
    } finally {
      this._isRunning = false;
    }
  }

  cancel(): void {
    this._executor?.abort();
  }

  isRunning(): boolean {
    return this._isRunning;
  }

  // ---------------------------------------------------------------------------
  // Tool Confirmation
  // ---------------------------------------------------------------------------

  confirmTool(toolCallId: string, approved: boolean): void {
    const pending = this._pendingConfirmations.get(toolCallId);
    if (pending) {
      if (pending.request.confirmationToken && this._permissionHooks) {
        this._permissionHooks.confirmTool(pending.request.confirmationToken, approved);
      }
      this._pendingConfirmations.delete(toolCallId);
    }
  }

  getPendingConfirmations(): ToolConfirmationRequest[] {
    return Array.from(this._pendingConfirmations.values()).map((p) => p.request);
  }

  // ---------------------------------------------------------------------------
  // History Management
  // ---------------------------------------------------------------------------

  getHistory(): ChatMessage[] {
    return [...this._history];
  }

  addMessage(message: ChatMessage): void {
    this._history.push(message);
  }

  /**
   * Apply a skill injection to the active session.
   * Delegates to SkillInjectionCoordinator for atomic 3-track injection.
   */
  applySkillInjection(injection: SkillInjection): void {
    this._skillCoordinator.apply(injection);
  }

  /**
   * Remove a previously injected skill prompt (reversible injection).
   * Delegates to SkillInjectionCoordinator for atomic 3-track cleanup.
   */
  removeSkillInjection(name: string): void {
    this._skillCoordinator.remove(name);
  }

  /**
   * Check if a tool is allowed by the active skill.
   * Returns true if no skill restrictions are active.
   */
  isToolAllowed(toolName: string): boolean {
    const allowedTools = this._skillCoordinator.getActiveSkillAllowedTools();
    if (!allowedTools?.length) return true;
    return allowedTools.includes(toolName);
  }

  clearHistory(): void {
    // Rebuild from composer to preserve current prompt composition
    this._history = [{ role: 'system', content: this._promptComposer.compose() }];
  }

  loadHistory(messages: ChatMessage[]): void {
    this._history = [...messages];
    // Ensure system prompt is present
    if (this._history.length === 0 || this._history[0].role !== 'system') {
      this._history.unshift({ role: 'system', content: this._config.systemPrompt });
    }
  }

  // ---------------------------------------------------------------------------
  // Context Management
  // ---------------------------------------------------------------------------

  getTokenCount(): number {
    return this._compressor.estimateTokens(this._history);
  }

  async compressContext(): Promise<CompressionResult> {
    const originalTokens = this.getTokenCount();

    const result = await this._compressor.compress(this._history);
    this._history = result.messages.map((m) => m.message);
    const compressedTokens = this._compressor.estimateTokens(this._history);

    const ratio = originalTokens > 0 ? compressedTokens / originalTokens : 1;

    return { originalTokens, compressedTokens, ratio };
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  dispose(): void {
    this.cancel();
    this._isRunning = false;
    // Reject all pending tool confirmations via permission hooks
    for (const pending of this._pendingConfirmations.values()) {
      if (pending.request.confirmationToken && this._permissionHooks) {
        this._permissionHooks.confirmTool(pending.request.confirmationToken, false);
      }
    }
    this._pendingConfirmations.clear();
  }

  // ---------------------------------------------------------------------------
  // Private Methods
  // ---------------------------------------------------------------------------

  /** Sync the composed system prompt into _history[0] */
  private _syncSystemPrompt(): void {
    const composed = this._promptComposer.compose();
    if (this._history.length > 0 && this._history[0]?.role === 'system') {
      this._history[0].content = composed;
    }
  }

  private _rebuildExecutor(): void {
    // Create hooks chain via factory (OCP: new hooks don't require Session changes)
    const permissionMode: PermissionMode =
      this._executionMode === 'plan' ? 'plan' : this._executionMode === 'auto' ? 'auto' : 'ask';

    const { hooks, permissionHooks } = createExecutorHooks({
      compressor: this._compressor,
      permissionMode,
      onToolAskStarted: (request) => this._handleToolConfirmation(request),
      settingsHookLoader: this._config.settingsHookLoader,
      customHooks: this._config.hooks,
      onValidationWarning: this._config.onValidationWarning,
      onValidationError: this._config.onValidationError,
    });

    this._permissionHooks = permissionHooks;

    // Create executor
    this._executor = new AgentExecutor({
      service: this._config.service,
      toolRegistry: this._config.toolRegistry,
      config: {
        name: 'agent-session',
        systemPrompt: this._config.systemPrompt,
        tools: this._config.toolRegistry.toToolDefinitions(),
        maxIterations: this._config.maxIterations ?? DEFAULT_MAX_ITERATIONS,
        primaryModel: this._config.modelId,
        serviceOptions: {
          modelId: this._config.modelId,
          temperature: this._config.temperature,
          maxTokens: this._config.maxTokens,
          thinkingBudget: this._config.thinkingBudget,
        },
      },
      hooks,
      toolSkillRegistry: this._toolGroupRegistry,
      toolInjectionManager: this._toolInjectionManager,
    });
  }

  private _handleToolConfirmation(request: ToolConfirmationRequest): void {
    const toolCallId = request.toolCall.id;
    // Store pending confirmation (resolve is handled by onConfirmTool callback)
    this._pendingConfirmations.set(toolCallId, { request });

    // Call user callback if provided
    if (this._config.onConfirmTool) {
      this._config
        .onConfirmTool(request)
        .then((approved) => {
          this.confirmTool(toolCallId, approved);
        })
        .catch((err) => {
          // Deny on error and clean up pending state
          this.confirmTool(toolCallId, false);
          logger.error('Tool confirmation failed', { error: err });
        });
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create an agent session
 */
export function createAgentSession(config: AgentSessionConfig): AgentSession {
  return new AgentSession(config);
}
