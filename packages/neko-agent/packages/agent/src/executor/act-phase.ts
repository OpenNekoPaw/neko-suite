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
  ToolResultAttachment,
  ToolProgress,
} from '@neko/shared';
import { runHooks } from './hook-runner';
import { partitionToolCalls } from './partition-tool-calls';

// =============================================================================
// Types
// =============================================================================

/** Collected progress event from a tool execution */
export interface ToolProgressEvent {
  toolCallId: string;
  toolName: string;
  percent: number;
  stage: string;
  preview?: string;
}

/** Dependencies for act-phase functions */
export interface ActDeps {
  toolRegistry: IToolRegistry;
  hooks: ExecutorHooks[];
  abortController: AbortController | null;
  metadata?: Record<string, unknown>;
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

  const signal = deps.abortController?.signal;
  const results: ToolResultWithMeta[] = [];
  const progressEvents: ToolProgressEvent[] = [];

  // Partition tool calls: concurrency-safe tools run in parallel,
  // unsafe tools run sequentially after (Fail-Closed default).
  const { concurrent, serial } = partitionToolCalls(toolCallInfos, deps.toolRegistry);

  // Phase 1: Execute concurrency-safe tools in parallel
  if (concurrent.length > 0) {
    const settled = await Promise.allSettled(
      concurrent.map((info) => executeToolCall(deps, info, progressEvents, signal)),
    );
    for (let i = 0; i < settled.length; i++) {
      const s = settled[i]!;
      if (s.status === 'fulfilled') {
        results.push(s.value);
      } else {
        const info = concurrent[i]!;
        results.push({
          success: false,
          error: (s.reason as Error).message ?? 'Unknown error',
          callId: info.id,
          name: info.name,
        });
      }
    }
  }

  // Phase 2: Execute unsafe tools sequentially
  for (const info of serial) {
    try {
      const result = await executeToolCall(deps, info, progressEvents, signal);
      results.push(result);
    } catch (err) {
      results.push({
        success: false,
        error: (err as Error).message ?? 'Unknown error',
        callId: info.id,
        name: info.name,
      });
    }
  }

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
    ...(progressEvents.length > 0 && { toolProgress: progressEvents }),
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

const TOOL_RESULT_ENVELOPE_SCHEMA = 'neko.tool-result.v1';

/**
 * Build tool result messages for context history.
 *
 * Tool result media stays provider-neutral here: attachments and perception
 * cards are serialized as stable metadata, while provider payload loading is
 * deferred to the AI SDK/platform adapter boundary.
 */
export function buildToolResultMessages(results: ToolResultWithMeta[]): ChatMessage[] {
  return results.map((result) => {
    const textContent = result.success
      ? JSON.stringify(result.data)
      : JSON.stringify({ error: result.error });

    const hasExtendedFields =
      (result.attachments?.length ?? 0) > 0 ||
      (result.perceptionCards?.length ?? 0) > 0 ||
      (result.backfillDiagnostics?.length ?? 0) > 0;

    if (!hasExtendedFields) {
      return {
        role: 'tool',
        content: textContent,
        toolCallId: result.callId,
      } as ChatMessage;
    }

    return {
      role: 'tool',
      content: JSON.stringify({
        schema: TOOL_RESULT_ENVELOPE_SCHEMA,
        ...(result.success ? {} : { success: false, error: result.error ?? 'Unknown error' }),
        data: result.data,
        attachments: result.attachments,
        perceptionCards: result.perceptionCards,
        backfillDiagnostics: result.backfillDiagnostics,
      }),
      toolCallId: result.callId,
    } as ChatMessage;
  });
}

/**
 * Extract attachments from a tool result (used by event converter).
 */
export function extractAttachments(result: ToolResultWithMeta): ToolResultAttachment[] | undefined {
  return result.attachments && result.attachments.length > 0 ? result.attachments : undefined;
}

// =============================================================================
// Internal Helpers
// =============================================================================

/**
 * Execute a single tool call through the hook chain.
 * Wires an onProgress callback that collects progress events.
 */
async function executeToolCall(
  deps: ActDeps,
  info: ToolCallInfo,
  progressEvents: ToolProgressEvent[],
  signal?: AbortSignal,
): Promise<ToolResultWithMeta> {
  // Check abort signal before execution
  if (signal?.aborted) {
    return { success: false, error: 'Execution aborted', callId: info.id, name: info.name };
  }

  // Create progress callback that collects events
  const onProgress = (progress: ToolProgress) => {
    progressEvents.push({
      toolCallId: info.id,
      toolName: info.name,
      percent: progress.percent,
      stage: progress.stage,
      preview: progress.preview,
    });
  };

  const execute = () =>
    deps.toolRegistry.execute(info.name, info.arguments, {
      onProgress,
      metadata:
        deps.metadata && Object.keys(deps.metadata).length > 0
          ? { ...deps.metadata, parentToolCallId: info.id }
          : { parentToolCallId: info.id },
    });

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
