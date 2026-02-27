/**
 * Agent Executor - Unified ReAct pattern agent execution with hooks support
 *
 * Features are implemented via composable hooks:
 * - RetryHooks: multi-model fallback, tool retry
 * - MemoryHooks: session memory, context management
 * - RecordingHooks: execution recording for template generation
 */

import type {
  AgentConfig,
  AgentContext,
  AgentState,
  AgentStep,
  AgentResult,
  IAgentExecutor,
  AgentCheckpoint,
  ChatMessage,
  ToolResult,
  IToolRegistry,
  IService,
  ExecutorHooks,
  ToolCallInfo,
  ToolResultWithMeta,
  IToolSkillRegistry,
  ToolFilterOptions,
  IToolInjectionManager,
} from '@neko/shared';
import { AgentError } from '../errors';

/**
 * Agent executor options
 *
 * Uses interfaces (IService, IToolRegistry) for dependency inversion.
 */
export interface AgentExecutorOptions {
  service: IService;
  toolRegistry: IToolRegistry;
  config: AgentConfig;
  /** Extensible hooks for additional capabilities */
  hooks?: ExecutorHooks[];
  /** ToolSkill registry for dynamic tool injection */
  toolSkillRegistry?: IToolSkillRegistry;
  /** Tool injection manager for three-layer injection */
  toolInjectionManager?: IToolInjectionManager;
  /** Callbacks */
  onStep?: (step: AgentStep) => void;
  onStateChange?: (state: AgentState) => void;
}

/**
 * Unified Agent Executor with hooks-based extensibility
 *
 * Core features:
 * - ReAct (Reasoning + Acting) execution loop
 * - Streaming and non-streaming execution
 * - Abort support
 * - Checkpoint and resume
 *
 * Extended features via hooks:
 * - RetryHooks: Tool retry, model fallback
 * - RecordingHooks: Execution recording for templates
 * - MemoryHooks: Context compression, session memory
 */
export class AgentExecutor implements IAgentExecutor {
  private service: IService;
  private toolRegistry: IToolRegistry;
  private config: AgentConfig;
  private hooks: ExecutorHooks[];
  private onStep?: (step: AgentStep) => void;
  private onStateChange?: (state: AgentState) => void;
  private state: AgentState = 'init';
  private abortController: AbortController | null = null;

  /** ToolSkill registry for dynamic tool injection */
  private toolSkillRegistry?: IToolSkillRegistry;
  /** Tool injection manager for three-layer injection */
  private toolInjectionManager?: IToolInjectionManager;

  constructor(options: AgentExecutorOptions) {
    this.service = options.service;
    this.toolRegistry = options.toolRegistry;
    this.config = options.config;
    this.hooks = options.hooks || [];
    this.onStep = options.onStep;
    this.onStateChange = options.onStateChange;
    this.toolSkillRegistry = options.toolSkillRegistry;
    this.toolInjectionManager = options.toolInjectionManager;
  }

  /**
   * Set tool injection manager
   */
  setToolInjectionManager(manager: IToolInjectionManager): void {
    this.toolInjectionManager = manager;
  }

  /**
   * Get tool filter based on ToolInjectionManager
   * @param input User input for skill matching (used by injection manager)
   */
  private getToolFilter(input?: string): ToolFilterOptions | undefined {
    // Use ToolInjectionManager for three-layer injection
    if (this.toolInjectionManager && input) {
      const tools = this.toolInjectionManager.getToolsForTurn(input);
      if (tools.length > 0) {
        return { include: tools };
      }
    }

    // Fallback: get default tools from ToolSkillRegistry
    if (this.toolSkillRegistry) {
      const defaultTools = this.toolSkillRegistry.getDefaultTools();
      if (defaultTools.length > 0) {
        return { include: defaultTools };
      }
    }

    return undefined; // No filtering, use all tools
  }

  /**
   * Execute agent with user input
   */
  async execute(input: string, context?: Partial<AgentContext>): Promise<AgentResult> {
    const startTime = Date.now();
    const steps: AgentStep[] = [];

    this.abortController = new AbortController();

    // Initialize context
    const agentContext: AgentContext = {
      messages: context?.messages || [{ role: 'system', content: this.config.systemPrompt }],
      state: 'init',
      iteration: 0,
      toolResults: [],
      metadata: context?.metadata || {},
    };

    // Add user input (unless caller already included it in the snapshot)
    if (!context?.skipUserMessage) {
      agentContext.messages.push({ role: 'user', content: input });
    }

    // Hook: onExecuteStart
    await this.runHooks('onExecuteStart', input, agentContext);

    this.setState('think');

    try {
      const result = await this.runLoop(agentContext, steps, startTime);

      // Hook: onExecuteEnd
      await this.runHooks('onExecuteEnd', result);

      return result;
    } catch (error) {
      this.setState('error');
      const endTime = Date.now();

      const result: AgentResult = {
        success: false,
        response: error instanceof Error ? error.message : 'Unknown error',
        steps,
        iterations: agentContext.iteration,
        error: error instanceof Error ? error : new Error(String(error)),
        timing: {
          startTime,
          endTime,
          duration: endTime - startTime,
        },
      };

      // Hook: onExecuteEnd (even on error)
      await this.runHooks('onExecuteEnd', result);

      // Hook: onError
      await this.runHooks('onError', error as Error, agentContext);

      return result;
    }
  }

  /**
   * Execute with streaming - yields steps as they complete
   */
  async *executeStream(
    input: string,
    context?: Partial<AgentContext>
  ): AsyncIterable<AgentStep> {
    const startTime = Date.now();
    const steps: AgentStep[] = [];
    this.abortController = new AbortController();

    // Initialize context
    const agentContext: AgentContext = {
      messages: context?.messages || [{ role: 'system', content: this.config.systemPrompt }],
      state: 'init',
      iteration: 0,
      toolResults: [],
      metadata: context?.metadata || {},
    };

    // Add user input (unless caller already included it in the snapshot)
    if (!context?.skipUserMessage) {
      agentContext.messages.push({ role: 'user', content: input });
    }

    // Hook: onExecuteStart
    await this.runHooks('onExecuteStart', input, agentContext);

    this.setState('think');

    while (agentContext.iteration < this.config.maxIterations) {
      if (this.abortController.signal.aborted) {
        yield {
          type: 'respond',
          content: 'Agent execution was aborted',
          timestamp: Date.now(),
        };
        return;
      }

      agentContext.iteration++;

      try {
        // THINK
        this.setState('think');
        const thinkStep = await this.think(agentContext);
        steps.push(thinkStep);
        yield thinkStep;

        if (thinkStep.toolCalls && thinkStep.toolCalls.length > 0) {
          // ACT
          this.setState('act');
          const actStep = await this.act(thinkStep.toolCalls);
          steps.push(actStep);
          yield actStep;

          // OBSERVE
          this.setState('observe');
          const observeStep = this.observe((actStep.toolResults as ToolResultWithMeta[]) || []);
          steps.push(observeStep);
          yield observeStep;

          // Add to context
          const toolResults = (actStep.toolResults as ToolResultWithMeta[]) || [];
          for (const result of toolResults) {
            const toolContent = result.success
              ? JSON.stringify(result.data)
              : JSON.stringify({ error: result.error });
            agentContext.messages.push({
              role: 'tool',
              content: toolContent,
              toolCallId: result.callId,
            } as ChatMessage);
          }

          // Hook: onIterationComplete
          await this.runHooks('onIterationComplete', agentContext.iteration, agentContext);
        } else {
          // Final response - thinkStep already contains the response content
          this.setState('respond');

          const endTime = Date.now();
          const result: AgentResult = {
            success: true,
            response: thinkStep.content,
            steps,
            iterations: agentContext.iteration,
            timing: { startTime, endTime, duration: endTime - startTime },
          };
          await this.runHooks('onExecuteEnd', result);

          return;
        }
      } catch (error) {
        // Handle AbortError gracefully
        const isAbortError = error instanceof Error &&
          (error.name === 'AbortError' || error.message.includes('aborted'));

        if (isAbortError || this.abortController.signal.aborted) {
          yield {
            type: 'respond',
            content: 'Agent execution was aborted',
            timestamp: Date.now(),
          };
          return;
        }

        // Re-throw other errors
        throw error;
      }
    }

    // Max iterations
    const endTime = Date.now();
    const result: AgentResult = {
      success: false,
      response: 'Maximum iterations reached',
      steps,
      iterations: agentContext.iteration,
      error: new Error('Max iterations reached'),
      timing: { startTime, endTime, duration: endTime - startTime },
    };
    await this.runHooks('onExecuteEnd', result);

    yield {
      type: 'respond',
      content: 'Maximum iterations reached',
      timestamp: Date.now(),
    };
  }

  /**
   * Abort current execution
   */
  abort(): void {
    this.abortController?.abort();
  }

  /**
   * Get current state
   */
  getState(): AgentState {
    return this.state;
  }

  /**
   * Create checkpoint for resume
   */
  createCheckpoint(context: AgentContext): AgentCheckpoint {
    return {
      id: `checkpoint_${Date.now()}`,
      agentName: this.config.name,
      context: {
        ...context,
        messages: context.messages.map((m) => ({ ...m })),
        toolResults: [...(context.toolResults || [])],
        metadata: { ...context.metadata },
      },
      timestamp: Date.now(),
    };
  }

  /**
   * Get a specific hook by type
   */
  getHook<T extends ExecutorHooks>(name: string): T | undefined {
    return this.hooks.find((h) => h.name === name) as T | undefined;
  }

  /**
   * Add a hook dynamically
   */
  addHook(hook: ExecutorHooks): void {
    this.hooks.push(hook);
  }

  /**
   * Remove a hook by name
   */
  removeHook(name: string): boolean {
    const index = this.hooks.findIndex((h) => h.name === name);
    if (index >= 0) {
      this.hooks.splice(index, 1);
      return true;
    }
    return false;
  }

  // ============ Private Methods ============

  private setState(state: AgentState): void {
    this.state = state;
    this.onStateChange?.(state);
  }

  /**
   * Main execution loop
   */
  private async runLoop(
    context: AgentContext,
    steps: AgentStep[],
    startTime: number
  ): Promise<AgentResult> {
    while (context.iteration < this.config.maxIterations) {
      // Check for abort
      if (this.abortController?.signal.aborted) {
        throw AgentError.execution('Agent execution was aborted');
      }

      context.iteration++;

      // THINK: Get model response
      this.setState('think');
      const thinkStep = await this.think(context);
      steps.push(thinkStep);
      this.onStep?.(thinkStep);

      // Check if we have tool calls
      if (thinkStep.toolCalls && thinkStep.toolCalls.length > 0) {
        // ACT: Execute tools
        this.setState('act');
        const actStep = await this.act(thinkStep.toolCalls);
        steps.push(actStep);
        this.onStep?.(actStep);

        // OBSERVE: Process results
        this.setState('observe');
        const observeStep = this.observe((actStep.toolResults as ToolResultWithMeta[]) || []);
        steps.push(observeStep);
        this.onStep?.(observeStep);

        // Add tool results to context
        const toolResults = (actStep.toolResults as ToolResultWithMeta[]) || [];
        for (const result of toolResults) {
          const toolContent = result.success
            ? JSON.stringify(result.data)
            : JSON.stringify({ error: result.error });
          context.messages.push({
            role: 'tool',
            content: toolContent,
            toolCallId: result.callId,
          } as ChatMessage);
        }

        // Hook: onIterationComplete
        await this.runHooks('onIterationComplete', context.iteration, context);
      } else {
        // No tool calls, we have the final response
        this.setState('respond');

        const endTime = Date.now();
        return {
          success: true,
          response: thinkStep.content,
          steps,
          iterations: context.iteration,
          timing: {
            startTime,
            endTime,
            duration: endTime - startTime,
          },
        };
      }
    }

    // Max iterations reached
    this.setState('done');
    const endTime = Date.now();
    return {
      success: false,
      response: 'Maximum iterations reached without completing the task.',
      steps,
      iterations: context.iteration,
      error: new Error('Max iterations reached'),
      timing: {
        startTime,
        endTime,
        duration: endTime - startTime,
      },
    };
  }

  /**
   * Think step - get model response
   */
  private async think(context: AgentContext): Promise<AgentStep> {
    // Hook: beforeThink - can modify context
    let modifiedContext = context;
    for (const hook of this.hooks) {
      if (hook.beforeThink) {
        modifiedContext = (await hook.beforeThink(modifiedContext)) || modifiedContext;
      }
    }

    // Get tool filter based on active ToolSkills or injection manager
    // Extract user input from last user message for skill matching
    const lastUserMessage = modifiedContext.messages
      .filter(m => m.role === 'user')
      .pop();
    const userInput = typeof lastUserMessage?.content === 'string'
      ? lastUserMessage.content
      : '';
    const toolFilter = this.getToolFilter(userInput);
    const tools = this.toolRegistry.toToolDefinitions(toolFilter);

    const response = await this.service.chat(modifiedContext.messages, {
      ...this.config.serviceOptions,
      tools: tools.length > 0 ? tools : undefined,
      toolChoice: tools.length > 0 ? 'auto' : undefined,
      signal: this.abortController?.signal,
    });

    // Warn if response was truncated
    if (response.finishReason === 'length') {
      console.warn('[AgentExecutor] Response truncated due to max_tokens limit.');
    }

    // Extract text content from message
    const content = typeof response.message.content === 'string'
      ? response.message.content
      : Array.isArray(response.message.content)
        ? response.message.content
            .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
            .map(part => part.text)
            .join('')
        : '';

    // Preserve the original tool call ID from the API response
    const toolCalls = response.message.toolCalls?.map((tc) => {
      let parsedArgs: Record<string, unknown> = {};
      try {
        parsedArgs = JSON.parse(tc.function.arguments);
      } catch {
        // LLM returned malformed JSON — pass raw string as fallback
        parsedArgs = { _raw: tc.function.arguments };
      }
      return {
        id: tc.id,
        name: tc.function.name,
        arguments: parsedArgs,
      };
    });

    // Add assistant message to context
    context.messages.push(response.message);

    const step: AgentStep = {
      type: 'think',
      content,
      thinking: response.thinking,
      toolCalls: toolCalls?.map((tc) => ({
        id: tc.id,
        name: tc.name,
        arguments: tc.arguments,
      })),
      timestamp: Date.now(),
    };

    // Hook: afterThink
    await this.runHooks('afterThink', step, context);

    return step;
  }

  /**
   * Act step - execute tools
   */
  private async act(
    toolCalls: Array<{ id?: string; name: string; arguments: Record<string, unknown> }>
  ): Promise<AgentStep> {
    const toolCallInfos: ToolCallInfo[] = toolCalls.map((tc, i) => ({
      id: tc.id || `call_${Date.now()}_${i}`,
      name: tc.name,
      arguments: tc.arguments,
      index: i,
    }));

    // Hook: beforeAct
    await this.runHooks('beforeAct', toolCallInfos);

    const results: ToolResultWithMeta[] = [];

    for (const info of toolCallInfos) {
      // Check abort signal before each tool execution
      if (this.abortController?.signal.aborted) {
        results.push({
          success: false,
          error: 'Execution aborted',
          callId: info.id,
          name: info.name,
        });
        break;
      }

      // Create the execute function
      const execute = () => this.toolRegistry.execute(info.name, info.arguments);

      // Check if any hook wants to handle the tool call
      let result: ToolResultWithMeta | null = null;

      for (const hook of this.hooks) {
        if (hook.onToolCall) {
          result = await hook.onToolCall(info, execute);
          if (result !== null) break; // Only break when hook actually handled it
        }
      }

      // If no hook handled it, execute directly
      if (!result) {
        const toolResult = await execute();
        result = {
          ...toolResult,
          callId: info.id,
          name: info.name,
        };
      }

      results.push(result);
    }

    // Hook: afterAct
    await this.runHooks('afterAct', results);

    return {
      type: 'act',
      content: `Executed ${toolCalls.length} tool(s)`,
      toolCalls: toolCalls.map((tc) => ({
        id: tc.id,
        name: tc.name,
        arguments: tc.arguments,
      })),
      toolResults: results,
      timestamp: Date.now(),
    };
  }

  /**
   * Observe step - summarize results
   */
  private observe(results: ToolResultWithMeta[]): AgentStep {
    const summary = results
      .map((r, i) => {
        const retryInfo = r.retryCount && r.retryCount > 0 ? ` (retried ${r.retryCount}x)` : '';
        if (r.success) {
          return `Tool ${i + 1} (${r.name}): Success${retryInfo}`;
        } else {
          return `Tool ${i + 1} (${r.name}): Failed - ${r.error}${retryInfo}`;
        }
      })
      .join('\n');

    return {
      type: 'observe',
      content: summary,
      toolResults: results,
      timestamp: Date.now(),
    };
  }

  /**
   * Run hooks for a specific event
   */
  private async runHooks(event: keyof ExecutorHooks, ...args: unknown[]): Promise<void> {
    for (const hook of this.hooks) {
      const handler = hook[event];
      if (typeof handler === 'function') {
        await (handler as (...args: unknown[]) => Promise<void> | void).apply(hook, args);
      }
    }
  }
}

/**
 * Create an agent executor with common defaults
 */
export function createAgentExecutor(options: AgentExecutorOptions): AgentExecutor {
  return new AgentExecutor(options);
}
