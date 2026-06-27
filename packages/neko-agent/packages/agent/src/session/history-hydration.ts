import type { ChatMessage } from '@neko/shared';
import { sanitizeToolResultValueForHistory } from './tool-result-sanitizer';

export interface AgentHistoryToolCallContext {
  readonly id: string;
  readonly name: string;
  readonly arguments: Record<string, unknown>;
}

export interface AgentHistoryToolResultContext {
  readonly callId: string;
  readonly success: boolean;
  readonly data: unknown;
}

export interface AgentHistoryWithToolContextMessage {
  readonly role: 'user' | 'assistant' | 'system';
  readonly content: string;
  readonly toolCalls?: readonly AgentHistoryToolCallContext[];
  readonly toolResults?: readonly AgentHistoryToolResultContext[];
}

export function hydrateAgentHistoryWithToolResults(
  messages: readonly AgentHistoryWithToolContextMessage[],
): ChatMessage[] {
  const hydrated: ChatMessage[] = [];

  for (const message of messages) {
    hydrated.push({
      role: message.role,
      content: message.content,
    });

    if (message.role !== 'assistant' || !message.toolResults || message.toolResults.length === 0) {
      continue;
    }

    for (const result of message.toolResults) {
      hydrated.push({
        role: 'user',
        content: formatToolResultContext(result),
      });
    }
  }

  return hydrated;
}

export function formatToolResultContext(result: AgentHistoryToolResultContext): string {
  return `[Tool Result for ${result.callId}]: ${
    result.success ? 'Success' : 'Failed'
  }\n${stringifyToolResultData(result.data)}`;
}

function stringifyToolResultData(data: unknown): string {
  try {
    const serialized = JSON.stringify(sanitizeToolResultValueForHistory(data), null, 2);
    return serialized === undefined ? String(data) : serialized;
  } catch {
    return '[Unserializable tool result data]';
  }
}
