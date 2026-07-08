/**
 * Agent Executor - Unified ReAct pattern agent execution with hooks support
 *
 * Orchestrates the think → act → observe loop. Phase-specific logic
 * is delegated to think-phase.ts and act-phase.ts.
 *
 * Features are implemented via composable hooks:
 * - RetryHooks: tool retry
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
import { createAgentTraceContext, deriveAgentTraceContext, withAgentTrace } from '@neko/shared';
import { AgentError } from '../errors';

import { runHooksWithTrace } from './hook-runner';
import { think, thinkStream, type ThinkDeps } from './think-phase';
import { act, observe, buildToolResultMessages, type ActDeps } from './act-phase';
import { getLogger } from '../utils/logger';

const logger = getLogger('Executor');

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
  /** Reads active artifact/profile validators after tools mutate turn state. */
  getActiveArtifactValidationRequirements?: () => readonly string[] | undefined;
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
 * - RetryHooks: Tool retry
 * - MemoryHooks: Context compression, session memory
 */
export class AgentExecutor implements IAgentExecutor {
  private service: IService;
  private toolRegistry: IToolRegistry;
  private config: AgentConfig;
  private hooks: ExecutorHooks[];
  private getActiveArtifactValidationRequirements?: () => readonly string[] | undefined;
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
    this.getActiveArtifactValidationRequirements = options.getActiveArtifactValidationRequirements;
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
   * Update service options (merges with existing).
   * Used by AgentSession to inject dynamic options like prompt cache sections.
   */
  updateServiceOptions(options: Record<string, unknown>): void {
    this.config = {
      ...this.config,
      serviceOptions: {
        ...this.config.serviceOptions,
        ...options,
      },
    };
  }

  /**
   * Execute agent with user input
   */
  async execute(input: string, context?: Partial<AgentContext>): Promise<AgentResult> {
    const startTime = Date.now();
    const steps: AgentStep[] = [];

    this.abortController = new AbortController();
    const agentContext = this.initContext(input, context);
    const trace = deriveAgentTraceContext(agentContext.trace, { phase: 'session' });
    logger.debug(
      'neko.agent.execute.start',
      withAgentTrace(trace, {
        mode: 'non-stream',
        inputLength: input.length,
        maxIterations: this.config.maxIterations,
      }),
    );

    // Hook: onExecuteStart
    await runHooksWithTrace(this.hooks, 'onExecuteStart', trace, input, agentContext);

    this.setState('think');

    try {
      const result = await this.runLoop(agentContext, steps, startTime);
      logger.debug(
        'neko.agent.execute.end',
        withAgentTrace(trace, {
          success: result.success,
          iterations: result.iterations,
          durationMs: result.timing.duration,
          stepCount: result.steps.length,
        }),
      );

      // Hook: onExecuteEnd
      await runHooksWithTrace(this.hooks, 'onExecuteEnd', trace, result);

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
      logger.debug(
        'neko.agent.execute.error',
        withAgentTrace(trace, {
          iterations: agentContext.iteration,
          durationMs: endTime - startTime,
          error: error instanceof Error ? error.message : String(error),
        }),
      );

      // Hook: onExecuteEnd (even on error)
      await runHooksWithTrace(this.hooks, 'onExecuteEnd', trace, result);

      // Hook: onError
      await runHooksWithTrace(this.hooks, 'onError', trace, error as Error, agentContext);

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
    const trace = deriveAgentTraceContext(agentContext.trace, { phase: 'session' });
    logger.debug(
      'neko.agent.execute.start',
      withAgentTrace(trace, {
        mode: 'stream',
        inputLength: input.length,
        maxIterations: this.config.maxIterations,
      }),
    );

    // Hook: onExecuteStart
    await runHooksWithTrace(this.hooks, 'onExecuteStart', trace, input, agentContext);

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
      const iterationTrace = deriveAgentTraceContext(trace, {
        iteration: agentContext.iteration,
      });
      const thinkTrace = deriveAgentTraceContext(iterationTrace, {
        phase: 'think',
      });
      logger.debug(
        'neko.agent.iteration.start',
        withAgentTrace(thinkTrace, {
          iteration: agentContext.iteration,
          maxIterations: this.config.maxIterations,
          messageCount: agentContext.messages.length,
        }),
      );

      try {
        // THINK (streaming — yields content_delta then final think step)
        this.setState('think');
        const thinkStartedAt = Date.now();
        let thinkStep: AgentStep | undefined;
        for await (const step of thinkStream(this.thinkDeps, agentContext, thinkTrace)) {
          if (step.type === 'content_delta') {
            yield step; // Stream delta to consumer
          } else {
            thinkStep = step;
          }
        }

        if (!thinkStep) {
          logger.debug(
            'neko.agent.think.end',
            withAgentTrace(thinkTrace, {
              durationMs: Date.now() - thinkStartedAt,
              toolCallCount: 0,
              result: 'empty',
            }),
          );
          yield { type: 'respond', content: 'No response from model', timestamp: Date.now() };
          return;
        }
        logger.debug(
          'neko.agent.think.end',
          withAgentTrace(thinkTrace, {
            durationMs: Date.now() - thinkStartedAt,
            toolCallCount: thinkStep.toolCalls?.length ?? 0,
            contentLength: thinkStep.content.length,
            usage: thinkStep.usage,
          }),
        );

        const outputRetry = consumeOutputValidationRetry(agentContext);
        if (outputRetry && !(thinkStep.toolCalls && thinkStep.toolCalls.length > 0)) {
          const replacementStep: AgentStep = {
            type: 'content_delta',
            content: '',
            deltaKind: 'assistant_text_replacement',
            replacement: {
              reason: 'output-validation-retry',
              attempt: outputRetry.attempt,
            },
            timestamp: Date.now(),
          };
          yield replacementStep;
          logger.debug(
            'neko.agent.output-validation.retry',
            withAgentTrace(thinkTrace, {
              iteration: agentContext.iteration,
              attempt: outputRetry.attempt,
              codes: outputRetry.codes,
            }),
          );
          continue;
        }

        steps.push(thinkStep);
        yield thinkStep;

        if (thinkStep.toolCalls && thinkStep.toolCalls.length > 0) {
          // ACT
          this.setState('act');
          const actTrace = deriveAgentTraceContext(iterationTrace, {
            phase: 'act',
          });
          const actStartedAt = Date.now();
          const actStep = await act(this.getActDeps(agentContext, actTrace), thinkStep.toolCalls);
          steps.push(actStep);
          yield actStep;
          const toolResults = (actStep.toolResults as ToolResultWithMeta[]) || [];
          logger.debug(
            'neko.agent.act.end',
            withAgentTrace(actTrace, {
              durationMs: Date.now() - actStartedAt,
              toolCallCount: thinkStep.toolCalls.length,
              successCount: toolResults.filter((result) => result.success).length,
              failureCount: toolResults.filter((result) => !result.success).length,
            }),
          );

          // OBSERVE
          this.setState('observe');
          const observeTrace = deriveAgentTraceContext(iterationTrace, {
            phase: 'observe',
          });
          const observeStep = observe((actStep.toolResults as ToolResultWithMeta[]) || []);
          steps.push(observeStep);
          yield observeStep;

          // Add tool results to context
          agentContext.messages.push(...buildToolResultMessages(toolResults));
          this.syncActiveArtifactValidationRequirements(agentContext);

          // Hook: onIterationComplete
          await runHooksWithTrace(
            this.hooks,
            'onIterationComplete',
            observeTrace,
            agentContext.iteration,
            agentContext,
          );
          logger.debug(
            'neko.agent.iteration.end',
            withAgentTrace(observeTrace, {
              iteration: agentContext.iteration,
              stepCount: steps.length,
              messageCount: agentContext.messages.length,
              continued: true,
            }),
          );
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
          await runHooksWithTrace(this.hooks, 'onExecuteEnd', trace, result);
          logger.debug(
            'neko.agent.execute.end',
            withAgentTrace(trace, {
              success: result.success,
              iterations: result.iterations,
              durationMs: result.timing.duration,
              stepCount: result.steps.length,
            }),
          );

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
    await runHooksWithTrace(this.hooks, 'onExecuteEnd', trace, result);
    logger.debug(
      'neko.agent.execute.end',
      withAgentTrace(trace, {
        success: result.success,
        iterations: result.iterations,
        durationMs: result.timing.duration,
        error: result.error?.message,
      }),
    );

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

  /** Build ActDeps from current instance state and turn metadata */
  private getActDeps(context: AgentContext, trace?: NonNullable<AgentContext['trace']>): ActDeps {
    return {
      toolRegistry: this.toolRegistry,
      hooks: this.hooks,
      abortController: this.abortController,
      metadata: context.metadata,
      trace: trace ?? context.trace,
    };
  }

  private syncActiveArtifactValidationRequirements(context: AgentContext): void {
    const requirements = this.getActiveArtifactValidationRequirements?.();
    if (requirements && requirements.length > 0) {
      context.metadata = {
        ...context.metadata,
        artifactValidationRequirements: [...requirements],
      };
      return;
    }

    if (context.metadata['artifactValidationRequirements'] === undefined) {
      return;
    }

    const { artifactValidationRequirements: _removed, ...metadata } = context.metadata;
    void _removed;
    context.metadata = metadata;
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
      trace:
        context?.trace ??
        createAgentTraceContext({
          conversationId:
            typeof context?.metadata?.conversationId === 'string'
              ? context.metadata.conversationId
              : undefined,
          turnId:
            typeof context?.metadata?.turnId === 'string' ? context.metadata.turnId : undefined,
          runId: typeof context?.metadata?.runId === 'string' ? context.metadata.runId : undefined,
        }),
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
      const iterationTrace = deriveAgentTraceContext(context.trace, {
        iteration: context.iteration,
      });
      const thinkTrace = deriveAgentTraceContext(iterationTrace, {
        phase: 'think',
      });
      logger.debug(
        'neko.agent.iteration.start',
        withAgentTrace(thinkTrace, {
          iteration: context.iteration,
          maxIterations: this.config.maxIterations,
          messageCount: context.messages.length,
        }),
      );

      // THINK: Get model response
      this.setState('think');
      const thinkStartedAt = Date.now();
      const thinkStep = await think(this.thinkDeps, context, thinkTrace);
      logger.debug(
        'neko.agent.think.end',
        withAgentTrace(thinkTrace, {
          durationMs: Date.now() - thinkStartedAt,
          toolCallCount: thinkStep.toolCalls?.length ?? 0,
          contentLength: thinkStep.content.length,
          usage: thinkStep.usage,
        }),
      );

      const outputRetry = consumeOutputValidationRetry(context);
      if (outputRetry && !(thinkStep.toolCalls && thinkStep.toolCalls.length > 0)) {
        logger.debug(
          'neko.agent.output-validation.retry',
          withAgentTrace(thinkTrace, {
            iteration: context.iteration,
            attempt: outputRetry.attempt,
            codes: outputRetry.codes,
          }),
        );
        continue;
      }

      steps.push(thinkStep);
      this.onStep?.(thinkStep);

      // Check if we have tool calls
      if (thinkStep.toolCalls && thinkStep.toolCalls.length > 0) {
        // ACT: Execute tools
        this.setState('act');
        const actTrace = deriveAgentTraceContext(iterationTrace, {
          phase: 'act',
        });
        const actStartedAt = Date.now();
        const actStep = await act(this.getActDeps(context, actTrace), thinkStep.toolCalls);
        steps.push(actStep);
        this.onStep?.(actStep);
        const toolResults = (actStep.toolResults as ToolResultWithMeta[]) || [];
        logger.debug(
          'neko.agent.act.end',
          withAgentTrace(actTrace, {
            durationMs: Date.now() - actStartedAt,
            toolCallCount: thinkStep.toolCalls.length,
            successCount: toolResults.filter((result) => result.success).length,
            failureCount: toolResults.filter((result) => !result.success).length,
          }),
        );

        // OBSERVE: Process results
        this.setState('observe');
        const observeTrace = deriveAgentTraceContext(iterationTrace, {
          phase: 'observe',
        });
        const observeStep = observe((actStep.toolResults as ToolResultWithMeta[]) || []);
        steps.push(observeStep);
        this.onStep?.(observeStep);

        // Add tool results to context
        context.messages.push(...buildToolResultMessages(toolResults));
        this.syncActiveArtifactValidationRequirements(context);

        // Hook: onIterationComplete
        await runHooksWithTrace(
          this.hooks,
          'onIterationComplete',
          observeTrace,
          context.iteration,
          context,
        );
        logger.debug(
          'neko.agent.iteration.end',
          withAgentTrace(observeTrace, {
            iteration: context.iteration,
            stepCount: steps.length,
            messageCount: context.messages.length,
            continued: true,
          }),
        );
      } else {
        // No tool calls, we have the final response
        this.setState('respond');

        const endTime = Date.now();
        logger.debug(
          'neko.agent.iteration.end',
          withAgentTrace(thinkTrace, {
            iteration: context.iteration,
            stepCount: steps.length,
            messageCount: context.messages.length,
            continued: false,
          }),
        );
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

interface OutputValidationRetryMetadata {
  readonly attempt: number;
  readonly codes: readonly string[];
}

function consumeOutputValidationRetry(context: AgentContext): OutputValidationRetryMetadata | null {
  const value = context.metadata['outputValidationRetry'];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const attempt = record['attempt'];
  const codes = record['codes'];
  if (typeof attempt !== 'number' || !Number.isFinite(attempt)) return null;
  const normalizedCodes = Array.isArray(codes)
    ? codes.filter((code): code is string => typeof code === 'string')
    : [];
  const { outputValidationRetry: _removed, ...metadata } = context.metadata;
  void _removed;
  context.metadata = metadata;
  return {
    attempt,
    codes: normalizedCodes,
  };
}
