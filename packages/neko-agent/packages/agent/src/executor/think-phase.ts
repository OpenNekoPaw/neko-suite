/**
 * Think Phase — Model inference and response parsing
 *
 * Extracted from AgentExecutor. Provides both sync and streaming think steps
 * as pure functions with explicit dependency injection.
 *
 * NOT exported from executor/index.ts — internal implementation detail.
 */

import type {
  AgentConfig,
  AgentContext,
  AgentStep,
  ChatMessage,
  IService,
  IToolRegistry,
  ExecutorHooks,
  ToolFilterOptions,
  IToolGroupRegistry,
  IToolInjectionManager,
} from '@neko/shared';
import { runHooks } from './hook-runner';
import { getLogger } from '../utils/logger';

const logger = getLogger('ThinkPhase');

// =============================================================================
// Types
// =============================================================================

/** Dependencies for think-phase functions */
export interface ThinkDeps {
  service: IService;
  toolRegistry: IToolRegistry;
  hooks: ExecutorHooks[];
  config: AgentConfig;
  toolInjectionManager?: IToolInjectionManager;
  toolSkillRegistry?: IToolGroupRegistry;
  abortController: AbortController | null;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Think step — non-streaming. Calls service.chat() and returns a single AgentStep.
 */
export async function think(deps: ThinkDeps, context: AgentContext): Promise<AgentStep> {
  const { modifiedContext, options } = await prepareThinkContext(deps, context);

  const response = await deps.service.chat(modifiedContext.messages, options);

  // Warn if response was truncated
  if (response.finishReason === 'length') {
    logger.warn('Response truncated due to max_tokens limit');
  }

  // Extract text content from message
  const content =
    typeof response.message.content === 'string'
      ? response.message.content
      : Array.isArray(response.message.content)
        ? response.message.content
            .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
            .map((part) => part.text)
            .join('')
        : '';

  // Preserve the original tool call ID from the API response
  const toolCalls = response.message.toolCalls?.map((tc) => ({
    id: tc.id,
    name: tc.function.name,
    arguments: parseToolCallArgs(tc.function.arguments),
  }));

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
  await runHooks(deps.hooks, 'afterThink', step, context);

  return step;
}

/**
 * Think step with streaming — yields content_delta steps then final think step.
 *
 * Uses service.chatStream() for token-by-token output.
 */
export async function* thinkStream(
  deps: ThinkDeps,
  context: AgentContext,
): AsyncGenerator<AgentStep> {
  const { modifiedContext, options } = await prepareThinkContext(deps, context);

  // Accumulate streaming response
  let content = '';
  const toolCallMap = new Map<string, { id: string; name: string; arguments: string }>();
  let finishReason: string | undefined;

  for await (const chunk of deps.service.chatStream(modifiedContext.messages, options)) {
    if (deps.abortController?.signal.aborted) break;

    switch (chunk.type) {
      case 'content':
        if (chunk.content) {
          content += chunk.content;
          yield {
            type: 'content_delta',
            content: chunk.content,
            timestamp: Date.now(),
          };
        }
        break;

      case 'tool_call':
        if (chunk.toolCall) {
          const tc = chunk.toolCall;
          const id = tc.id ?? `auto_${toolCallMap.size}`;
          const existing = toolCallMap.get(id);
          if (existing) {
            // Append incremental arguments
            if (tc.function?.arguments) {
              existing.arguments += tc.function.arguments;
            }
          } else {
            toolCallMap.set(id, {
              id,
              name: tc.function?.name ?? '',
              arguments: tc.function?.arguments ?? '',
            });
          }
        }
        break;

      case 'done':
        finishReason = chunk.finishReason;
        break;
    }
  }

  // Warn if truncated
  if (finishReason === 'length') {
    logger.warn('Response truncated due to max_tokens limit');
  }

  // Parse tool calls from accumulated data
  const toolCalls = [...toolCallMap.values()].map((tc) => ({
    id: tc.id,
    name: tc.name,
    arguments: parseToolCallArgs(tc.arguments),
  }));

  // Build assistant message and add to context
  const assistantMessage: ChatMessage = {
    role: 'assistant',
    content,
    toolCalls:
      toolCalls.length > 0
        ? toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
          }))
        : undefined,
  };
  context.messages.push(assistantMessage);

  // Yield final think step
  const step: AgentStep = {
    type: 'think',
    content,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    timestamp: Date.now(),
  };

  // Hook: afterThink
  await runHooks(deps.hooks, 'afterThink', step, context);

  yield step;
}

// =============================================================================
// Internal Helpers
// =============================================================================

/**
 * Parse tool call arguments from raw JSON string with fallback
 */
export function parseToolCallArgs(rawArgs: string): Record<string, unknown> {
  try {
    return JSON.parse(rawArgs);
  } catch {
    // LLM returned malformed JSON — pass raw string as fallback
    return { _raw: rawArgs };
  }
}

/**
 * Get tool filter based on ToolInjectionManager / ToolSkillRegistry
 */
function getToolFilter(deps: ThinkDeps, input?: string): ToolFilterOptions | undefined {
  // Use ToolInjectionManager for three-layer injection
  if (deps.toolInjectionManager && input) {
    const tools = deps.toolInjectionManager.getToolsForTurn(input);
    if (tools.length > 0) {
      return { include: tools };
    }
  }

  // Fallback: get default tools from ToolSkillRegistry
  if (deps.toolSkillRegistry) {
    const defaultTools = deps.toolSkillRegistry.getDefaultTools();
    if (defaultTools.length > 0) {
      return { include: defaultTools };
    }
  }

  return undefined; // No filtering, use all tools
}

/**
 * Prepare context for a think step: run beforeThink hooks, extract tool filter,
 * build tool definitions and service options.
 */
async function prepareThinkContext(
  deps: ThinkDeps,
  context: AgentContext,
): Promise<{
  modifiedContext: AgentContext;
  tools: ReturnType<IToolRegistry['toToolDefinitions']>;
  options: Record<string, unknown>;
}> {
  // Hook: beforeThink - can modify context
  let modifiedContext = context;
  for (const hook of deps.hooks) {
    if (hook.beforeThink) {
      modifiedContext = (await hook.beforeThink(modifiedContext)) || modifiedContext;
    }
  }

  // Extract user input from last user message for skill matching
  const lastUserMessage = modifiedContext.messages.filter((m) => m.role === 'user').pop();
  const userInput = typeof lastUserMessage?.content === 'string' ? lastUserMessage.content : '';
  const toolFilter = getToolFilter(deps, userInput);
  const tools = deps.toolRegistry.toToolDefinitions(toolFilter);

  const options = {
    ...deps.config.serviceOptions,
    tools: tools.length > 0 ? tools : undefined,
    toolChoice: (tools.length > 0 ? 'auto' : undefined) as 'auto' | undefined,
    signal: deps.abortController?.signal,
  };

  return { modifiedContext, tools, options };
}
