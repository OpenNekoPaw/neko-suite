/**
 * Agent Executor - Unified ReAct pattern agent execution with hooks support
 *
 * Orchestrates the think → act → observe loop. Phase-specific logic
 * is delegated to think-phase.ts and act-phase.ts.
 *
 * Features are implemented via composable hooks:
 * - RetryHooks: multi-model fallback, tool retry
 * - MemoryHooks: session memory, context management
 */

import type {
  AgentConfig,
  AgentContext,
  AgentState,
  AgentStep,
  AgentResult,
  IAgentExecutor,
  AgentCheckpoint,
  IToolRegistry,
  IService,
  ExecutorHooks,
  ToolResultWithMeta,
  IToolGroupRegistry,
  IToolInjectionManager,
} from '@neko/shared';
import { AgentError } from '../errors';

import { runHooks } from './hook-runner';
import { think, thinkStream, type ThinkDeps } from './think-phase';
import { act, observe, buildToolResultMessages, type ActDeps } from './act-phase';

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
  toolSkillRegistry?: IToolGroupRegistry;
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
  private toolSkillRegistry?: IToolGroupRegistry;
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
   * Execute agent with user input
   */
  async execute(input: string, context?: Partial<AgentContext>): Promise<AgentResult> {
    const startTime = Date.now();
    const steps: AgentStep[] = [];

    this.abortController = new AbortController();
    const agentContext = this.initContext(input, context);

    // Hook: onExecuteStart
    await runHooks(this.hooks, 'onExecuteStart', input, agentContext);

    this.setState('think');

    try {
      const result = await this.runLoop(agentContext, steps, startTime);

      // Hook: onExecuteEnd
      await runHooks(this.hooks, 'onExecuteEnd', result);

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
      await runHooks(this.hooks, 'onExecuteEnd', result);

      // Hook: onError
      await runHooks(this.hooks, 'onError', error as Error, agentContext);

      return result;
    }
  }

  /**
   * Execute with streaming - yields steps as they complete
   */
  async *executeStream(input: string, context?: Partial<AgentContext>): AsyncIterable<AgentStep> {
    const startTime = Date.now();
    const steps: AgentStep[] = [];
    this.abortController = new AbortController();
    const agentContext = this.initContext(input, context);

    // Hook: onExecuteStart
    await runHooks(this.hooks, 'onExecuteStart', input, agentContext);

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
        // THINK (streaming — yields content_delta then final think step)
        this.setState('think');
        let thinkStep: AgentStep | undefined;
        for await (const step of thinkStream(this.thinkDeps, agentContext)) {
          if (step.type === 'content_delta') {
            yield step; // Stream delta to consumer
          } else {
            thinkStep = step;
            steps.push(step);
            yield step;
          }
        }

        if (!thinkStep) {
          yield { type: 'respond', content: 'No response from model', timestamp: Date.now() };
          return;
        }

        if (thinkStep.toolCalls && thinkStep.toolCalls.length > 0) {
          // ACT
          this.setState('act');
          const actStep = await act(this.actDeps, thinkStep.toolCalls);
          steps.push(actStep);
          yield actStep;

          // OBSERVE
          this.setState('observe');
          const observeStep = observe((actStep.toolResults as ToolResultWithMeta[]) || []);
          steps.push(observeStep);
          yield observeStep;

          // Add tool results to context
          const toolResults = (actStep.toolResults as ToolResultWithMeta[]) || [];
          agentContext.messages.push(...buildToolResultMessages(toolResults));

          // Hook: onIterationComplete
          await runHooks(this.hooks, 'onIterationComplete', agentContext.iteration, agentContext);
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
          await runHooks(this.hooks, 'onExecuteEnd', result);

          return;
        }
      } catch (error) {
        // Handle AbortError gracefully
        const isAbortError =
          error instanceof Error &&
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
    await runHooks(this.hooks, 'onExecuteEnd', result);

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

  /** Build ThinkDeps from current instance state */
  private get thinkDeps(): ThinkDeps {
    return {
      service: this.service,
      toolRegistry: this.toolRegistry,
      hooks: this.hooks,
      config: this.config,
      toolInjectionManager: this.toolInjectionManager,
      toolSkillRegistry: this.toolSkillRegistry,
      abortController: this.abortController,
    };
  }

  /** Build ActDeps from current instance state */
  private get actDeps(): ActDeps {
    return {
      toolRegistry: this.toolRegistry,
      hooks: this.hooks,
      abortController: this.abortController,
    };
  }

  /**
   * Initialize agent context from input and optional partial context
   */
  private initContext(input: string, context?: Partial<AgentContext>): AgentContext {
    const agentContext: AgentContext = {
      messages: context?.messages || [{ role: 'system', content: this.config.systemPrompt }],
      state: 'init',
      iteration: 0,
      toolResults: [],
      metadata: context?.metadata || {},
    };

    if (!context?.skipUserMessage) {
      agentContext.messages.push({ role: 'user', content: input });
    }

    return agentContext;
  }

  /**
   * Main execution loop
   */
  private async runLoop(
    context: AgentContext,
    steps: AgentStep[],
    startTime: number,
  ): Promise<AgentResult> {
    while (context.iteration < this.config.maxIterations) {
      // Check for abort
      if (this.abortController?.signal.aborted) {
        throw AgentError.execution('Agent execution was aborted');
      }

      context.iteration++;

      // THINK: Get model response
      this.setState('think');
      const thinkStep = await think(this.thinkDeps, context);
      steps.push(thinkStep);
      this.onStep?.(thinkStep);

      // Check if we have tool calls
      if (thinkStep.toolCalls && thinkStep.toolCalls.length > 0) {
        // ACT: Execute tools
        this.setState('act');
        const actStep = await act(this.actDeps, thinkStep.toolCalls);
        steps.push(actStep);
        this.onStep?.(actStep);

        // OBSERVE: Process results
        this.setState('observe');
        const observeStep = observe((actStep.toolResults as ToolResultWithMeta[]) || []);
        steps.push(observeStep);
        this.onStep?.(observeStep);

        // Add tool results to context
        const toolResults = (actStep.toolResults as ToolResultWithMeta[]) || [];
        context.messages.push(...buildToolResultMessages(toolResults));

        // Hook: onIterationComplete
        await runHooks(this.hooks, 'onIterationComplete', context.iteration, context);
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
}

/**
 * Create an agent executor with common defaults
 */
export function createAgentExecutor(options: AgentExecutorOptions): AgentExecutor {
  return new AgentExecutor(options);
}
