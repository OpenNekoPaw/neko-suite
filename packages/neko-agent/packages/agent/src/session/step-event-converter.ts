/**
 * Step-Event Converter — Pure functions for AgentStep ↔ AgentEvent conversion
 *
 * Extracted from AgentSession to separate event generation and history recording
 * from session management concerns.
 *
 * NOT exported from session/index.ts — internal implementation detail.
 */

import type { AgentStep, ChatMessage } from '@neko/shared';
import type { AgentEvent } from './types';

// =============================================================================
// Types
// =============================================================================

/** Mutable state tracking streaming deltas across calls (passed by reference) */
export interface StreamState {
  hasStreamedDeltas: boolean;
}

// =============================================================================
// Event Generation
// =============================================================================

/**
 * Convert an AgentStep to AgentEvent(s).
 * Pure generator — no side effects except mutating the shared StreamState.
 */
export function* stepToEvents(
  step: AgentStep,
  iteration: number,
  maxIterations: number,
  streamState: StreamState,
): Generator<AgentEvent> {
  // Skip iteration event for streaming deltas (sub-events within a think cycle)
  if (step.type !== 'content_delta') {
    yield {
      type: 'iteration',
      iteration: { current: iteration, max: maxIterations },
    };
  }

  switch (step.type) {
    case 'content_delta':
      if (step.content) {
        yield { type: 'text_delta', content: step.content };
        streamState.hasStreamedDeltas = true;
      }
      break;

    case 'think':
      if (step.thinking) {
        yield { type: 'thinking_content', thinking: step.thinking };
      }
      // Only emit full text if we didn't already stream deltas
      if (step.content && !streamState.hasStreamedDeltas) {
        yield { type: 'text', content: step.content };
      }
      streamState.hasStreamedDeltas = false; // Reset for next think cycle

      if (step.toolCalls && step.toolCalls.length > 0) {
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
      // Emit progress events before results (for proper UI sequencing)
      if (step.toolProgress) {
        for (const progress of step.toolProgress) {
          yield {
            type: 'tool_progress',
            toolProgress: {
              toolCallId: progress.toolCallId,
              toolName: progress.toolName,
              percent: progress.percent,
              stage: progress.stage,
              preview: progress.preview,
            },
          };
        }
      }

      if (step.toolResults) {
        for (let i = 0; i < step.toolResults.length; i++) {
          const result = step.toolResults[i] as {
            callId?: string;
            success: boolean;
            data?: unknown;
            error?: string;
            attachments?: import('@neko/shared').ToolResultAttachment[];
            perceptionCards?: import('@neko/shared').PerceptionCard[];
            backfillDiagnostics?: import('@neko/shared').ToolResultBackfillDiagnostic[];
            metadata?: Record<string, unknown>;
          };
          const metadata = extractToolResultMetadata(result);
          yield {
            type: 'tool_result',
            toolResult: {
              toolCallId: result.callId || `call_${iteration}_${i}`,
              success: result.success,
              data: result.data,
              error: result.error,
              ...(result.attachments &&
                result.attachments.length > 0 && { attachments: result.attachments }),
              ...(result.perceptionCards &&
                result.perceptionCards.length > 0 && { perceptionCards: result.perceptionCards }),
              ...(result.backfillDiagnostics &&
                result.backfillDiagnostics.length > 0 && {
                  backfillDiagnostics: result.backfillDiagnostics,
                }),
              ...(metadata ? { metadata } : {}),
            },
          };
        }
      }
      break;

    case 'observe':
      break;

    case 'respond':
      if (step.thinking) {
        yield { type: 'thinking_content', thinking: step.thinking };
      }
      if (step.content) {
        yield { type: 'text', content: step.content };
      }
      break;
  }
}

function extractToolResultMetadata(result: {
  data?: unknown;
  metadata?: Record<string, unknown>;
}): Record<string, unknown> | undefined {
  if (result.metadata) return result.metadata;
  if (!isRecord(result.data)) return undefined;
  const providerAdaptation = result.data.providerAdaptation;
  if (providerAdaptation) return { providerAdaptation };

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// =============================================================================
// History Recording
// =============================================================================

/**
 * Record a step's messages into session history (side effects only).
 */
export function recordStepInHistory(
  step: AgentStep,
  iteration: number,
  history: ChatMessage[],
): void {
  switch (step.type) {
    case 'content_delta':
      // Deltas are accumulated — no history write needed
      break;

    case 'think':
      if (step.toolCalls && step.toolCalls.length > 0) {
        // Assistant message with tool calls
        history.push({
          role: 'assistant',
          content: step.content ?? '',
          toolCalls: step.toolCalls.map((tc, i) => ({
            id: tc.id || `call_${iteration}_${i}`,
            type: 'function' as const,
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments),
            },
          })),
        });
      } else if (step.content) {
        // Final text response (no tool calls)
        history.push({ role: 'assistant', content: step.content });
      }
      break;

    case 'act':
      if (step.toolResults) {
        for (let i = 0; i < step.toolResults.length; i++) {
          const result = step.toolResults[i] as {
            callId?: string;
            success: boolean;
            data?: unknown;
            error?: string;
          };
          history.push({
            role: 'tool',
            content: result.success
              ? JSON.stringify(result.data)
              : JSON.stringify({ error: result.error }),
            toolCallId: result.callId || `call_${iteration}_${i}`,
          } as ChatMessage);
        }
      }
      break;

    case 'respond':
      if (step.content) {
        history.push({ role: 'assistant', content: step.content });
      }
      break;

    case 'observe':
      // No history write
      break;
  }
}
