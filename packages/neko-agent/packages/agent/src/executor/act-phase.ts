/**
 * Act Phase — Tool execution and result observation
 *
 * Extracted from AgentExecutor. Provides act/observe/buildToolResultMessages
 * as pure functions with explicit dependency injection.
 *
 * NOT exported from executor/index.ts — internal implementation detail.
 */

import type {
  AgentStep,
  ChatMessage,
  IToolRegistry,
  ExecutorHooks,
  ToolCallInfo,
  ToolResultWithMeta,
} from '@neko/shared';
import { runHooks } from './hook-runner';

// =============================================================================
// Types
// =============================================================================

/** Dependencies for act-phase functions */
export interface ActDeps {
  toolRegistry: IToolRegistry;
  hooks: ExecutorHooks[];
  abortController: AbortController | null;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Act step — execute tool calls in parallel and collect results.
 */
export async function act(
  deps: ActDeps,
  toolCalls: Array<{ id?: string; name: string; arguments: Record<string, unknown> }>,
): Promise<AgentStep> {
  const toolCallInfos: ToolCallInfo[] = toolCalls.map((tc, i) => ({
    id: tc.id || `call_${Date.now()}_${i}`,
    name: tc.name,
    arguments: tc.arguments,
    index: i,
  }));

  // Hook: beforeAct
  await runHooks(deps.hooks, 'beforeAct', toolCallInfos);

  // Execute all tool calls in parallel for better performance
  const signal = deps.abortController?.signal;
  const settled = await Promise.allSettled(
    toolCallInfos.map((info) => executeToolCall(deps, info, signal)),
  );

  const results: ToolResultWithMeta[] = settled.map((s, i) => {
    if (s.status === 'fulfilled') {
      return s.value;
    }
    const info = toolCallInfos[i]!;
    return {
      success: false,
      error: (s.reason as Error).message ?? 'Unknown error',
      callId: info.id,
      name: info.name,
    };
  });

  // Hook: afterAct
  await runHooks(deps.hooks, 'afterAct', results);

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
 * Observe step — summarize tool execution results.
 */
export function observe(results: ToolResultWithMeta[]): AgentStep {
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
 * Build tool result messages for context history.
 */
export function buildToolResultMessages(results: ToolResultWithMeta[]): ChatMessage[] {
  return results.map(
    (result) =>
      ({
        role: 'tool',
        content: result.success
          ? JSON.stringify(result.data)
          : JSON.stringify({ error: result.error }),
        toolCallId: result.callId,
      }) as ChatMessage,
  );
}

// =============================================================================
// Internal Helpers
// =============================================================================

/**
 * Execute a single tool call through the hook chain
 */
async function executeToolCall(
  deps: ActDeps,
  info: ToolCallInfo,
  signal?: AbortSignal,
): Promise<ToolResultWithMeta> {
  // Check abort signal before execution
  if (signal?.aborted) {
    return { success: false, error: 'Execution aborted', callId: info.id, name: info.name };
  }

  const execute = () => deps.toolRegistry.execute(info.name, info.arguments);

  // Check if any hook wants to handle the tool call
  for (const hook of deps.hooks) {
    if (hook.onToolCall) {
      const result = await hook.onToolCall(info, execute);
      if (result !== null) return result;
    }
  }

  // No hook handled it, execute directly
  const toolResult = await execute();
  return { ...toolResult, callId: info.id, name: info.name };
}
