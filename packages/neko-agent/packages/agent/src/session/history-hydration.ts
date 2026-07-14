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

interface MutableAgentHistoryWithToolContextMessage {
  role: AgentHistoryWithToolContextMessage['role'];
  content: string;
  toolCalls?: AgentHistoryToolCallContext[];
  toolResults?: AgentHistoryToolResultContext[];
}

export function projectJournalHistoryWithToolContext(
  messages: readonly ChatMessage[],
): AgentHistoryWithToolContextMessage[] {
  const projected: MutableAgentHistoryWithToolContextMessage[] = [];
  const assistantByToolCallId = new Map<string, MutableAgentHistoryWithToolContextMessage>();
  for (const message of messages) {
    if (message.role === 'tool') {
      const toolCallId = requireNonEmptyHistoryString(message.toolCallId, 'toolCallId');
      const assistant = assistantByToolCallId.get(toolCallId);
      if (!assistant) {
        throw new Error(`Journal tool result has no preceding tool call: ${toolCallId}.`);
      }
      const result = parseJournalToolResult(message.content, toolCallId);
      assistant.toolResults = [...(assistant.toolResults ?? []), result];
      continue;
    }
    const entry: MutableAgentHistoryWithToolContextMessage = {
      role: message.role,
      content: projectHistoryContent(message.content),
    };
    if (message.role === 'assistant' && message.toolCalls && message.toolCalls.length > 0) {
      entry.toolCalls = message.toolCalls.map((toolCall) => {
        const call = {
          id: requireNonEmptyHistoryString(toolCall.id, 'toolCall.id'),
          name: requireNonEmptyHistoryString(toolCall.function.name, 'toolCall.function.name'),
          arguments: parseToolCallArguments(toolCall.function.arguments),
        };
        assistantByToolCallId.set(call.id, entry);
        return call;
      });
    }
    projected.push(entry);
  }
  return projected;
}

function projectHistoryContent(content: ChatMessage['content']): string {
  if (typeof content === 'string') return content;
  return content
    .map((part) => (part.type === 'text' ? part.text : JSON.stringify(part)))
    .join('\n');
}

function parseToolCallArguments(value: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error('Journal tool call arguments are not valid JSON.', { cause: error });
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Journal tool call arguments must be an object.');
  }
  return { ...parsed };
}

function parseJournalToolResult(
  content: ChatMessage['content'],
  toolCallId: string,
): AgentHistoryToolResultContext {
  if (typeof content !== 'string') {
    throw new Error(`Journal tool result ${toolCallId} must contain structured JSON text.`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(`Journal tool result ${toolCallId} is not valid JSON.`, { cause: error });
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Journal tool result ${toolCallId} must be an object.`);
  }
  const success = Reflect.get(parsed, 'success');
  if (typeof success !== 'boolean') {
    throw new Error(`Journal tool result ${toolCallId} is missing boolean success.`);
  }
  return { callId: toolCallId, success, data: Reflect.get(parsed, 'data') };
}

function requireNonEmptyHistoryString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Journal history ${field} must be a non-empty string.`);
  }
  return value;
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
