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

import type {
  ChatMessage,
  AgentStep,
  ExecutorHooks,
} from '@neko/shared';

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
import { ContextManager, SimpleTokenCounter } from '../memory';
import { MemoryHooks } from '../hooks';
import { createValidationHooks } from '../validation';
import {
  createPermissionHooks,
  type PermissionHooks,
  type PermissionMode,
} from '../permission';
import {
  ToolGroupRegistry,
  registerBuiltinToolGroups,
} from '../skill';
import {
  ToolCategoryRegistry,
  ToolInjectionManager,
  createCoreMetaTools,
  DEFAULT_INJECTION_CONFIG,
} from '../tools';

// =============================================================================
// Constants
// =============================================================================

/** Default max context tokens */
const DEFAULT_MAX_CONTEXT_TOKENS = 100000;

/** Default reserved tokens for response */
const DEFAULT_RESERVED_TOKENS = 4000;

/** Default max iterations */
const DEFAULT_MAX_ITERATIONS = 50;

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
  private _contextManager: ContextManager;
  private _permissionHooks: PermissionHooks | null = null;

  // Registries
  private _toolGroupRegistry: ToolGroupRegistry;
  private _toolCategoryRegistry: ToolCategoryRegistry;
  private _toolInjectionManager: ToolInjectionManager;

  // State
  private _history: ChatMessage[] = [];
  private _isRunning = false;
  private _pendingConfirmations = new Map<string, {
    request: ToolConfirmationRequest;
    resolve: (approved: boolean) => void;
  }>();

  constructor(config: AgentSessionConfig) {
    this._config = config;
    this._executionMode = config.executionMode ?? 'auto';

    // Initialize context manager
    const tokenCounter = new SimpleTokenCounter();
    this._contextManager = new ContextManager({
      maxTokens: config.contextSettings?.maxTokens ?? DEFAULT_MAX_CONTEXT_TOKENS,
      reservedTokens: config.contextSettings?.reservedTokens ?? DEFAULT_RESERVED_TOKENS,
      strategy: 'sliding_window',
      tokenCounter,
    });

    // Initialize registries
    this._toolGroupRegistry = (config.toolGroupRegistry as ToolGroupRegistry) ?? new ToolGroupRegistry();
    if (!config.toolGroupRegistry) {
      registerBuiltinToolGroups(this._toolGroupRegistry);
    }

    this._toolCategoryRegistry = (config.toolCategoryRegistry as ToolCategoryRegistry) ?? new ToolCategoryRegistry();
    if (!config.toolCategoryRegistry) {
      // Populate with tool categories from ToolGroupRegistry
      const defaultActiveGroups = this._toolGroupRegistry.list().filter(g => g.defaultActive);
      for (const group of defaultActiveGroups) {
        for (const toolName of group.tools) {
          this._toolCategoryRegistry.categorizeTool(toolName, 'system', 'skill');
        }
      }
    }

    this._toolInjectionManager = new ToolInjectionManager(
      this._toolCategoryRegistry,
      this._toolGroupRegistry,
      DEFAULT_INJECTION_CONFIG
    );

    // Register core meta tools
    const metaTools = createCoreMetaTools(
      this._toolCategoryRegistry,
      this._toolInjectionManager,
      this._toolGroupRegistry
    );
    for (const tool of metaTools) {
      config.toolRegistry.register(tool);
      this._toolCategoryRegistry.categorizeTool(tool.name, 'system', 'core');
    }

    // Initialize executor
    this._initializeExecutor();

    // Initialize history with system prompt
    this._history.push({ role: 'system', content: config.systemPrompt });
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
      if (this._history.length > 0 && this._history[0].role === 'system') {
        this._history[0].content = config.systemPrompt;
      } else {
        this._history.unshift({ role: 'system', content: config.systemPrompt });
      }
    }

    // Reinitialize executor with new config
    this._initializeExecutor();
  }

  getExecutionMode(): ExecutionMode {
    return this._executionMode;
  }

  setExecutionMode(mode: ExecutionMode): void {
    this._executionMode = mode;
    // Only update permission hooks mode instead of rebuilding entire executor
    if (this._permissionHooks) {
      const permissionMode: PermissionMode = mode === 'plan' ? 'plan'
        : mode === 'auto' ? 'auto' : 'ask';
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
      // Prepare input (inject plan mode reminder if needed)
      let processedInput = input;
      if (this._executionMode === 'plan') {
        processedInput = `${PLAN_MODE_SYSTEM_REMINDER}\n\n${input}`;
      }

      const maxIterations = this._config.maxIterations ?? DEFAULT_MAX_ITERATIONS;
      let iteration = 0;

      // Add user input to history BEFORE execution (correct ordering)
      this._history.push({ role: 'user', content: input });

      // Execute via AgentExecutor streaming
      for await (const step of this._executor.executeStream(processedInput, {
        messages: [...this._history],
        metadata: {
          workspaceRoot: context?.workspaceRoot,
          projectType: context?.projectType,
          activeFile: context?.activeFile,
          ...context?.metadata,
        },
      })) {
        // Convert step to events
        yield* this._convertStepToEvents(step, ++iteration, maxIterations);
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
    return Array.from(this._pendingConfirmations.values()).map(p => p.request);
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

  clearHistory(): void {
    // Keep system prompt
    const systemPrompt = this._history.find(m => m.role === 'system');
    this._history = systemPrompt ? [systemPrompt] : [];
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
    const tokenCounter = new SimpleTokenCounter();
    return tokenCounter.countMessages(this._history);
  }

  async compressContext(): Promise<CompressionResult> {
    const originalTokens = this.getTokenCount();

    const compressed = await this._contextManager.compress(this._history);
    const compressedTokens = new SimpleTokenCounter().countMessages(compressed);
    this._history = compressed;

    const ratio = originalTokens > 0 ? compressedTokens / originalTokens : 1;

    return { originalTokens, compressedTokens, ratio };
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  dispose(): void {
    this.cancel();
    this._isRunning = false;
    for (const pending of this._pendingConfirmations.values()) {
      pending.resolve(false);
    }
    this._pendingConfirmations.clear();
  }

  // ---------------------------------------------------------------------------
  // Private Methods
  // ---------------------------------------------------------------------------

  private _initializeExecutor(): void {
    // Create memory hooks
    const memoryHooks = new MemoryHooks({
      contextManager: this._contextManager,
    });

    // Create validation hooks
    const validationHooks = createValidationHooks({
      imageConstraints: {
        maxSizeBytes: 5 * 1024 * 1024, // 5MB
        allowedFormats: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
      },
      outputConstraints: {
        mermaidPreValidate: true,
        onValidationFail: 'retry',
      },
      onValidationWarning: this._config.onValidationWarning,
      onValidationError: this._config.onValidationError,
    });

    // Create permission hooks
    const permissionMode: PermissionMode = this._executionMode === 'plan' ? 'plan'
      : this._executionMode === 'auto' ? 'auto' : 'ask';

    this._permissionHooks = createPermissionHooks({
      config: {
        mode: permissionMode,
        rules: {},
      },
      onToolAskStarted: (request) => this._handleToolConfirmation(request),
    });

    // Compose hooks
    const hooks: ExecutorHooks[] = [
      memoryHooks,
      validationHooks,
      this._permissionHooks,
      ...(this._config.hooks ?? []),
    ];

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
          model: this._config.modelId,
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
    // Store pending confirmation
    this._pendingConfirmations.set(toolCallId, {
      request,
      resolve: () => {},
    });

    // Call user callback if provided
    if (this._config.onConfirmTool) {
      this._config.onConfirmTool(request).then(approved => {
        this.confirmTool(toolCallId, approved);
      }).catch(err => {
        // Deny on error and clean up pending state
        this.confirmTool(toolCallId, false);
        console.error('[AgentSession] Tool confirmation failed:', err);
      });
    }
  }

  private *_convertStepToEvents(
    step: AgentStep,
    iteration: number,
    maxIterations: number
  ): Generator<AgentEvent> {
    // Emit iteration info
    yield {
      type: 'iteration',
      iteration: { current: iteration, max: maxIterations },
    };

    switch (step.type) {
      case 'think':
        // Extended thinking content
        if (step.thinking) {
          yield { type: 'thinking_content', thinking: step.thinking };
        }
        // Text content
        if (step.content) {
          yield { type: 'text', content: step.content };
          // If no tool calls, this is the final response — add to history
          if (!step.toolCalls || step.toolCalls.length === 0) {
            this._history.push({ role: 'assistant', content: step.content });
          }
        }
        // Tool calls
        if (step.toolCalls) {
          for (let i = 0; i < step.toolCalls.length; i++) {
            const tc = step.toolCalls[i];
            yield {
              type: 'tool_call',
              toolCall: {
                id: tc.id || `call_${iteration}_${i}`,
                name: tc.name,
                arguments: tc.arguments,
              },
            };
          }
        }
        break;

      case 'act':
        // Tool results
        if (step.toolResults) {
          for (let i = 0; i < step.toolResults.length; i++) {
            const result = step.toolResults[i] as {
              callId?: string;
              success: boolean;
              data?: unknown;
              error?: string;
            };
            yield {
              type: 'tool_result',
              toolResult: {
                toolCallId: result.callId || `call_${iteration}_${i}`,
                success: result.success,
                data: result.data,
                error: result.error,
              },
            };
          }
        }
        break;

      case 'observe':
        // Observe step doesn't emit events
        break;

      case 'respond':
        // Extended thinking content
        if (step.thinking) {
          yield { type: 'thinking_content', thinking: step.thinking };
        }
        // Final response
        if (step.content) {
          yield { type: 'text', content: step.content };
          // Add to history
          this._history.push({ role: 'assistant', content: step.content });
        }
        break;
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
