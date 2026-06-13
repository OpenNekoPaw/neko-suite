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
  AgentTraceContext,
} from '@neko/shared';
import { deriveAgentTraceContext, withAgentTrace } from '@neko/shared';
import { runHooksWithTrace } from './hook-runner';
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
export async function think(
  deps: ThinkDeps,
  context: AgentContext,
  phaseTrace?: AgentTraceContext,
): Promise<AgentStep> {
  const trace = deriveAgentTraceContext(phaseTrace ?? context.trace, { phase: 'think' });
  const { modifiedContext, options } = await prepareThinkContext(deps, context, trace);

  const response = await deps.service.chat(modifiedContext.messages, options, { trace });

  // Warn if response was truncated
  if (response.finishReason === 'length') {
    logger.warn('Response truncated due to max_tokens limit');
  }

  // Extract text content from message
  const rawContent =
    typeof response.message.content === 'string'
      ? response.message.content
      : Array.isArray(response.message.content)
        ? response.message.content
            .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
            .map((part) => part.text)
            .join('')
        : '';

  // Extract and strip <think> tags from content
  const { content, thinking: extractedThinking } = extractThinkTags(rawContent);

  // Preserve the original tool call ID from the API response
  const toolCalls = response.message.toolCalls?.map((tc) => ({
    id: tc.id,
    name: tc.function.name,
    arguments: parseToolCallArgs(tc.function.arguments),
  }));

  // Add assistant message to context (with stripped content)
  context.messages.push({
    ...response.message,
    content,
  });

  const step: AgentStep = {
    type: 'think',
    content,
    // Prefer API thinking field, then recover provider-emitted <think> tags.
    thinking: response.thinking || extractedThinking || undefined,
    toolCalls: toolCalls?.map((tc) => ({
      id: tc.id,
      name: tc.name,
      arguments: tc.arguments,
    })),
    timestamp: Date.now(),
    usage: response.usage,
  };

  // Hook: afterThink
  await runHooksWithTrace(deps.hooks, 'afterThink', trace, step, context);

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
  phaseTrace?: AgentTraceContext,
): AsyncGenerator<AgentStep> {
  const trace = deriveAgentTraceContext(phaseTrace ?? context.trace, { phase: 'think' });
  const { modifiedContext, options } = await prepareThinkContext(deps, context, trace);

  // Accumulate streaming response
  let content = '';
  let accumulatedThinking = '';
  const thinkStripper = new StreamingThinkTagStripper();
  const toolCallMap = new Map<string, { id: string; name: string; arguments: string }>();
  let finishReason: string | undefined;
  let streamUsage: AgentStep['usage'] | undefined;

  for await (const chunk of deps.service.chatStream(modifiedContext.messages, options, { trace })) {
    if (deps.abortController?.signal.aborted) break;

    switch (chunk.type) {
      case 'content':
        if (chunk.content) {
          content += chunk.content;

          const { text, thinking } = thinkStripper.push(chunk.content);

          if (thinking) {
            accumulatedThinking += (accumulatedThinking ? '\n\n' : '') + thinking;
          }

          if (text) {
            yield {
              type: 'content_delta',
              content: text,
              timestamp: Date.now(),
            };
          }
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
        streamUsage = chunk.usage;
        break;
    }
  }

  // Flush any remaining buffered content from the stripper
  const flushed = thinkStripper.flush();
  if (flushed.thinking) {
    accumulatedThinking += (accumulatedThinking ? '\n\n' : '') + flushed.thinking;
  }
  if (flushed.text) {
    yield {
      type: 'content_delta',
      content: flushed.text,
      timestamp: Date.now(),
    };
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

  // Extract and strip <think> tags from accumulated content
  const { content: strippedContent, thinking: extractedThinking } = extractThinkTags(content);

  // Build assistant message and add to context (with stripped content)
  const assistantMessage: ChatMessage = {
    role: 'assistant',
    content: strippedContent,
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
    content: strippedContent,
    thinking: accumulatedThinking || extractedThinking || undefined,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    timestamp: Date.now(),
    usage: streamUsage,
  };

  // Hook: afterThink
  await runHooksWithTrace(deps.hooks, 'afterThink', trace, step, context);

  yield step;
}

// =============================================================================
// Internal Helpers
// =============================================================================

/**
 * Parse tool call arguments from raw JSON, preserving malformed input as _raw.
 */
export function parseToolCallArgs(rawArgs: string): Record<string, unknown> {
  try {
    return JSON.parse(rawArgs);
  } catch {
    // LLM returned malformed JSON; keep the raw string for downstream diagnostics.
    return { _raw: rawArgs };
  }
}

/**
 * Extract and strip <think> tags from model output.
 * Some models (e.g., gpt-5.1-codex) output thinking content as <think>...</think> tags
 * in the text content instead of using the API's thinking field.
 *
 * @returns { content: stripped text, thinking: extracted thinking content or null }
 */
export function extractThinkTags(text: string): { content: string; thinking: string | null } {
  const thinkRegex = /<think>([\s\S]*?)<\/think>/gi;
  const matches = [...text.matchAll(thinkRegex)];

  if (matches.length === 0) {
    return { content: text, thinking: null };
  }

  // Extract all thinking content
  const thinkingParts = matches.map((m) => m[1]?.trim()).filter(Boolean);
  const thinking = thinkingParts.length > 0 ? thinkingParts.join('\n\n') : null;

  // Strip all <think> tags from content
  const content = text.replace(thinkRegex, '').trim();

  return { content, thinking };
}

export interface StreamingThinkTagStripperResult {
  text: string | null;
  thinking: string | null;
}

const OPEN_TAG = '<think>';
const CLOSE_TAG = '</think>';

/**
 * Buffer-based streaming stripper for <think> tags.
 *
 * Streaming chunks can split tags across boundaries (e.g. "<thi" + "nk>content</think>").
 * This class buffers content when a potential tag boundary is detected and only flushes
 * when it can determine whether the buffered content is a tag or plain text.
 */
export class StreamingThinkTagStripper {
  private buffer = '';
  private insideThinkBlock = false;
  private thinkContent = '';

  push(chunk: string): StreamingThinkTagStripperResult {
    this.buffer += chunk;
    return this.process();
  }

  flush(): StreamingThinkTagStripperResult {
    const result: StreamingThinkTagStripperResult = { text: null, thinking: null };

    if (this.insideThinkBlock) {
      // Unclosed <think> — treat accumulated think content + remaining buffer as plain text
      const leaked = OPEN_TAG + this.thinkContent + this.buffer;
      result.text = leaked || null;
      this.thinkContent = '';
    } else if (this.buffer) {
      // Leftover buffer is a partial tag prefix that never completed — flush as text
      result.text = this.buffer;
    }

    this.buffer = '';
    this.insideThinkBlock = false;
    return result;
  }

  private process(): StreamingThinkTagStripperResult {
    let text = '';
    let thinking = '';

    while (this.buffer.length > 0) {
      if (this.insideThinkBlock) {
        const closeIdx = this.buffer.toLowerCase().indexOf(CLOSE_TAG);
        if (closeIdx !== -1) {
          // Found close tag — extract thinking content
          this.thinkContent += this.buffer.slice(0, closeIdx);
          this.buffer = this.buffer.slice(closeIdx + CLOSE_TAG.length);
          this.insideThinkBlock = false;
          const trimmed = this.thinkContent.trim();
          if (trimmed) {
            thinking += (thinking ? '\n\n' : '') + trimmed;
          }
          this.thinkContent = '';
        } else if (this.couldBePartialTag(this.buffer, CLOSE_TAG)) {
          // Buffer tail could be start of </think> — hold
          break;
        } else {
          // No close tag possible — accumulate as think content
          this.thinkContent += this.buffer;
          this.buffer = '';
        }
      } else {
        const openIdx = this.buffer.toLowerCase().indexOf(OPEN_TAG);
        if (openIdx !== -1) {
          // Found open tag — flush text before it, enter think block
          const before = this.buffer.slice(0, openIdx);
          if (before) text += before;
          this.buffer = this.buffer.slice(openIdx + OPEN_TAG.length);
          this.insideThinkBlock = true;
          this.thinkContent = '';
        } else {
          // Check if the tail of the buffer could be a partial "<think>" prefix
          const safeFlushLen = this.getSafeFlushLength(this.buffer, OPEN_TAG);
          if (safeFlushLen > 0) {
            text += this.buffer.slice(0, safeFlushLen);
            this.buffer = this.buffer.slice(safeFlushLen);
          }
          break;
        }
      }
    }

    return {
      text: text || null,
      thinking: thinking || null,
    };
  }

  /**
   * Check if `buffer` could end with a partial prefix of `tag`.
   * Used inside a think block to detect partial `</think>`.
   */
  private couldBePartialTag(buffer: string, tag: string): boolean {
    const lowerBuf = buffer.toLowerCase();
    for (let len = 1; len < tag.length; len++) {
      if (lowerBuf.endsWith(tag.slice(0, len))) {
        return true;
      }
    }
    return false;
  }

  /**
   * Return how many characters from the start of `buffer` can be safely flushed
   * (i.e., the tail of the remaining buffer can't be a prefix of `tag`).
   */
  private getSafeFlushLength(buffer: string, tag: string): number {
    const lowerBuf = buffer.toLowerCase();
    for (let tailLen = Math.min(tag.length - 1, buffer.length); tailLen > 0; tailLen--) {
      if (tag.startsWith(lowerBuf.slice(-tailLen))) {
        return buffer.length - tailLen;
      }
    }
    return buffer.length;
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
  phaseTrace: AgentTraceContext,
): Promise<{
  modifiedContext: AgentContext;
  tools: ReturnType<IToolRegistry['toToolDefinitions']>;
  options: Record<string, unknown>;
}> {
  // Hook: beforeThink - can modify context
  let modifiedContext = context;
  const trace = deriveAgentTraceContext(phaseTrace, { phase: 'hook' });
  logger.debug(
    'neko.agent.think.prepare.start',
    withAgentTrace(trace, {
      hookCount: deps.hooks.filter((hook) => hook.beforeThink).length,
      messageCount: context.messages.length,
    }),
  );
  for (const hook of deps.hooks) {
    if (hook.beforeThink) {
      const startedAt = Date.now();
      const beforeMessageCount = modifiedContext.messages.length;
      modifiedContext = (await hook.beforeThink(modifiedContext)) || modifiedContext;
      logger.debug(
        'neko.agent.hook.beforeThink',
        withAgentTrace(trace, {
          hookName: hook.name ?? 'anonymous',
          durationMs: Date.now() - startedAt,
          beforeMessageCount,
          afterMessageCount: modifiedContext.messages.length,
          modified: modifiedContext.messages.length !== beforeMessageCount,
        }),
      );
    }
  }

  // Extract user input from last user message for skill matching
  const lastUserMessage = modifiedContext.messages.filter((m) => m.role === 'user').pop();
  const userInput = typeof lastUserMessage?.content === 'string' ? lastUserMessage.content : '';
  const toolFilter = getToolFilter(deps, userInput);
  const tools = deps.toolRegistry.toToolDefinitions(toolFilter);
  logger.debug(
    'neko.agent.think.prepare.end',
    withAgentTrace(phaseTrace, {
      messageCount: modifiedContext.messages.length,
      toolCount: tools.length,
      toolNames: tools.map((tool) => tool.function.name),
      toolFilter,
    }),
  );

  const options = {
    ...deps.config.serviceOptions,
    tools: tools.length > 0 ? tools : undefined,
    toolChoice: (tools.length > 0 ? 'auto' : undefined) as 'auto' | undefined,
    signal: deps.abortController?.signal,
  };

  return { modifiedContext, tools, options };
}
