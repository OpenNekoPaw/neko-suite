import type {
  ChatMessage,
  PerceptionCard,
  ToolResultArtifactTransfer,
  ToolResultAttachment,
  ToolResultBackfillDiagnostic,
  ToolResultBackfillPayload,
} from '@neko/shared';
import type { AgentEvent } from './types';
import type { JournalEntry } from './journal-writer';
import {
  applyToolResultBackfillToResult,
  type BackfillableToolResult,
} from '../runtime/tool-result-backfill';
import { sanitizeToolResultFieldsForHistory } from './tool-result-sanitizer';

const TOOL_RESULT_ENVELOPE_SCHEMA = 'neko.tool-result.v1';

export interface WorkingMemoryMessage {
  message: ChatMessage;
  sourceEventIds: string[];
}

export interface PersistedAgentEvent {
  event: AgentEvent;
  eventId?: string;
}

export interface WorkingMemoryProjectionOptions {
  includeCompacted?: boolean;
}

export interface ProjectedHistory {
  messages: ChatMessage[];
  messageEventIds: string[][];
}

interface PendingAssistantMessage {
  content: string;
  reasoningContent?: string;
  toolCalls: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  sourceEventIds: string[];
}

interface PendingReasoningContent {
  content: string;
  sourceEventIds: string[];
}

interface ProjectedCompactionEvent {
  eventId?: string;
  replacedEventIds: string[];
  summaryContent: string;
  summaryMessageRole: 'system' | 'user';
}

export function projectPersistedEventsToWorkingMemory(
  entries: readonly PersistedAgentEvent[],
  options?: { flushPendingAssistant?: boolean },
): WorkingMemoryMessage[] {
  const history: WorkingMemoryMessage[] = [];
  let pendingAssistant: PendingAssistantMessage | null = null;
  let pendingReasoningContent: PendingReasoningContent | null = null;

  for (const entry of entries) {
    const event = entry.event;

    switch (event.type) {
      case 'user_message':
        pendingAssistant = flushPendingAssistant(history, pendingAssistant);
        pendingReasoningContent = null;
        if (typeof event.content === 'string' && event.content.length > 0) {
          history.push({
            message: { role: 'user', content: event.content },
            sourceEventIds: toSourceEventIds(entry.eventId),
          });
        }
        break;

      case 'text':
        if (
          pendingAssistant &&
          (pendingAssistant.content.length > 0 || pendingAssistant.toolCalls.length > 0)
        ) {
          pendingAssistant = flushPendingAssistant(history, pendingAssistant);
        }
        if (typeof event.content === 'string' && event.content.length > 0) {
          pendingAssistant = {
            content: event.content,
            reasoningContent: takePendingReasoningContent(pendingReasoningContent),
            toolCalls: [],
            sourceEventIds: mergeSourceEventIds(
              toSourceEventIds(entry.eventId),
              pendingReasoningContent?.sourceEventIds ?? [],
            ),
          };
          pendingReasoningContent = null;
        }
        break;

      case 'tool_call':
        if (!event.toolCall) {
          break;
        }
        if (!pendingAssistant) {
          pendingAssistant = {
            content: '',
            reasoningContent: takePendingReasoningContent(pendingReasoningContent),
            toolCalls: [],
            sourceEventIds: pendingReasoningContent?.sourceEventIds ?? [],
          };
          pendingReasoningContent = null;
        }
        pendingAssistant.toolCalls.push({
          id: event.toolCall.id,
          type: 'function',
          function: {
            name: event.toolCall.name,
            arguments: JSON.stringify(event.toolCall.arguments),
          },
        });
        pendingAssistant.sourceEventIds = mergeSourceEventIds(
          pendingAssistant.sourceEventIds,
          toSourceEventIds(entry.eventId),
        );
        break;

      case 'tool_result':
        pendingAssistant = flushPendingAssistant(history, pendingAssistant);
        pendingReasoningContent = null;
        if (event.toolResult) {
          history.push({
            message: {
              role: 'tool',
              content: serializeToolResultMessageContent(event.toolResult),
              toolCallId: event.toolResult.toolCallId,
            },
            sourceEventIds: toSourceEventIds(entry.eventId),
          });
        }
        break;

      case 'tool_result_backfill':
        applyToolResultBackfillToHistory(history, event.toolResultBackfill);
        break;

      case 'compaction':
      case 'compaction_failed':
      case 'memory_extraction':
      case 'validation.stage_transition_requested':
      case 'thinking':
      case 'text_delta':
      case 'tool_progress':
      case 'tool_confirmation':
      case 'version_recorded':
      case 'coordinator_event':
      case 'iteration':
      case 'done':
      case 'messageQueued':
        break;

      case 'thinking_content':
        if (event.reasoningContent) {
          pendingReasoningContent = appendPendingReasoningContent(
            pendingReasoningContent,
            event.reasoningContent,
            toSourceEventIds(entry.eventId),
          );
        }
        break;

      case 'assistant_text_replacement':
        pendingAssistant = null;
        pendingReasoningContent = null;
        break;

      case 'error': {
        pendingAssistant = flushPendingAssistant(history, pendingAssistant);
        pendingReasoningContent = null;
        const message = event.error?.message || 'An error occurred';
        history.push({
          message: { role: 'assistant', content: message },
          sourceEventIds: toSourceEventIds(entry.eventId),
        });
        break;
      }
    }
  }

  if (options?.flushPendingAssistant !== false) {
    flushPendingAssistant(history, pendingAssistant);
  }

  return history;
}

export function projectJournalEntriesToWorkingMemory(
  entries: readonly JournalEntry[],
  options?: WorkingMemoryProjectionOptions,
): WorkingMemoryMessage[] {
  const eventEntries: PersistedAgentEvent[] = [];
  const compactionEvents: ProjectedCompactionEvent[] = [];

  for (const entry of entries) {
    if (entry.type !== 'event' || !entry.event) {
      continue;
    }

    if (entry.event.type === 'compaction' && entry.event.compaction) {
      compactionEvents.push({
        eventId: entry.eventId,
        replacedEventIds: [...entry.event.compaction.replacedEventIds],
        summaryContent: entry.event.compaction.summaryContent,
        summaryMessageRole: entry.event.compaction.summaryMessageRole,
      });
      continue;
    }

    eventEntries.push({
      event: entry.event,
      eventId: entry.eventId,
    });
  }

  const history = projectPersistedEventsToWorkingMemory(eventEntries);
  if (options?.includeCompacted === true) {
    return history;
  }

  return applyCompactionEvents(history, compactionEvents);
}

export function projectJournalEntriesToHistory(
  entries: readonly JournalEntry[],
  options?: WorkingMemoryProjectionOptions,
): ProjectedHistory {
  return workingMemoryToHistory(projectJournalEntriesToWorkingMemory(entries, options));
}

export function workingMemoryToHistory(entries: readonly WorkingMemoryMessage[]): ProjectedHistory {
  return {
    messages: entries.map((entry) => entry.message),
    messageEventIds: entries.map((entry) => [...entry.sourceEventIds]),
  };
}

export function applyToolResultBackfillToChatHistory(
  history: ChatMessage[],
  payload: ToolResultBackfillPayload | undefined,
): boolean {
  if (!payload) return false;

  for (let index = history.length - 1; index >= 0; index--) {
    const message = history[index];
    if (message?.role !== 'tool' || message.toolCallId !== payload.toolCallId) {
      continue;
    }

    const existingResult = parseToolMessageResult(message);
    const merged = applyToolResultBackfillToResult(existingResult, payload);
    history[index] = {
      ...message,
      content: serializeToolResultMessageContent(merged.result),
    };
    return true;
  }

  return false;
}

function applyCompactionEvents(
  history: readonly WorkingMemoryMessage[],
  compactionEvents: readonly ProjectedCompactionEvent[],
): WorkingMemoryMessage[] {
  let current = history.map((entry) => ({
    message: entry.message,
    sourceEventIds: [...entry.sourceEventIds],
  }));

  for (const event of compactionEvents) {
    if (event.replacedEventIds.length === 0 || event.summaryContent.length === 0) {
      continue;
    }

    const replacedSet = new Set(event.replacedEventIds);
    const next: WorkingMemoryMessage[] = [];
    let summaryIndex = -1;

    for (const entry of current) {
      if (entry.sourceEventIds.some((eventId) => replacedSet.has(eventId))) {
        if (summaryIndex < 0) {
          summaryIndex = next.length;
        }
        continue;
      }
      next.push(entry);
    }

    if (summaryIndex >= 0) {
      next.splice(summaryIndex, 0, {
        message: {
          role: event.summaryMessageRole,
          content: event.summaryContent,
        },
        sourceEventIds: toSourceEventIds(event.eventId),
      });
    }

    current = next;
  }

  return current;
}

function flushPendingAssistant(
  history: WorkingMemoryMessage[],
  pendingAssistant: PendingAssistantMessage | null,
): null {
  if (!pendingAssistant) {
    return null;
  }

  history.push({
    message: {
      role: 'assistant',
      content: pendingAssistant.content,
      reasoningContent: pendingAssistant.reasoningContent,
      ...(pendingAssistant.toolCalls.length > 0 && {
        toolCalls: pendingAssistant.toolCalls,
      }),
    },
    sourceEventIds: [...pendingAssistant.sourceEventIds],
  });
  return null;
}

function takePendingReasoningContent(
  pendingReasoningContent: PendingReasoningContent | null,
): string | undefined {
  return pendingReasoningContent?.content || undefined;
}

function appendPendingReasoningContent(
  current: PendingReasoningContent | null,
  content: string,
  sourceEventIds: readonly string[],
): PendingReasoningContent {
  return {
    content: (current?.content ?? '') + content,
    sourceEventIds: mergeSourceEventIds(current?.sourceEventIds ?? [], sourceEventIds),
  };
}

function applyToolResultBackfillToHistory(
  history: WorkingMemoryMessage[],
  payload: ToolResultBackfillPayload | undefined,
): void {
  if (!payload) return;
  for (let index = history.length - 1; index >= 0; index--) {
    const entry = history[index];
    if (entry?.message.role !== 'tool' || entry.message.toolCallId !== payload.toolCallId) {
      continue;
    }

    const existingResult = parseToolMessageResult(entry.message);
    const merged = applyToolResultBackfillToResult(existingResult, payload);
    entry.message = {
      ...entry.message,
      content: serializeToolResultMessageContent(merged.result),
    };
    return;
  }
}

function serializeToolResultMessageContent(
  result: BackfillableToolResult | NonNullable<AgentEvent['toolResult']>,
): string {
  const sanitizedFields = sanitizeToolResultFieldsForHistory(result);
  const data = sanitizedFields.data;
  const attachments = sanitizedFields.attachments;
  const perceptionCards = sanitizedFields.perceptionCards;
  const artifacts = sanitizedFields.artifacts;
  const hasExtendedFields =
    (attachments?.length ?? 0) > 0 ||
    (perceptionCards?.length ?? 0) > 0 ||
    (result.backfillDiagnostics?.length ?? 0) > 0 ||
    (artifacts?.length ?? 0) > 0;

  if (!result.success) {
    if (!hasExtendedFields && data === undefined) {
      return `Error: ${result.error ?? 'Unknown error'}`;
    }
    return stringifyToolResultContent({
      schema: TOOL_RESULT_ENVELOPE_SCHEMA,
      success: false,
      error: result.error ?? 'Unknown error',
      data,
      attachments,
      perceptionCards,
      backfillDiagnostics: result.backfillDiagnostics,
      artifacts,
    });
  }

  if (!hasExtendedFields) {
    return stringifyToolResultContent(data);
  }

  return stringifyToolResultContent({
    schema: TOOL_RESULT_ENVELOPE_SCHEMA,
    data,
    attachments,
    perceptionCards,
    backfillDiagnostics: result.backfillDiagnostics,
    artifacts,
  });
}

function parseToolMessageResult(message: ChatMessage): BackfillableToolResult {
  if (typeof message.content !== 'string') {
    return { success: true, data: message.content };
  }

  try {
    const parsed = JSON.parse(message.content) as unknown;
    if (isSerializedToolResultEnvelope(parsed)) {
      return {
        success: parsed.success ?? true,
        data: parsed.data,
        ...(typeof parsed.error === 'string' ? { error: parsed.error } : {}),
        ...(parsed.attachments ? { attachments: parsed.attachments } : {}),
        ...(parsed.perceptionCards ? { perceptionCards: parsed.perceptionCards } : {}),
        ...(parsed.backfillDiagnostics ? { backfillDiagnostics: parsed.backfillDiagnostics } : {}),
        ...(parsed.artifacts ? { artifacts: parsed.artifacts } : {}),
      };
    }
    if (
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      typeof (parsed as { readonly error?: unknown }).error === 'string' &&
      Object.keys(parsed).length === 1
    ) {
      return { success: false, data: {}, error: (parsed as { readonly error: string }).error };
    }
    return { success: true, data: parsed };
  } catch {
    if (message.content.startsWith('Error:')) {
      return { success: false, data: {}, error: message.content.slice('Error:'.length).trim() };
    }
    return { success: true, data: message.content };
  }
}

interface SerializedToolResultEnvelope {
  readonly schema: typeof TOOL_RESULT_ENVELOPE_SCHEMA;
  readonly success?: boolean;
  readonly data: unknown;
  readonly error?: string;
  readonly attachments?: readonly ToolResultAttachment[];
  readonly perceptionCards?: readonly PerceptionCard[];
  readonly backfillDiagnostics?: readonly ToolResultBackfillDiagnostic[];
  readonly artifacts?: readonly ToolResultArtifactTransfer[];
}

function isSerializedToolResultEnvelope(value: unknown): value is SerializedToolResultEnvelope {
  if (!isRecord(value) || value['schema'] !== TOOL_RESULT_ENVELOPE_SCHEMA) {
    return false;
  }

  return Object.prototype.hasOwnProperty.call(value, 'data');
}

function stringifyToolResultContent(value: unknown): string {
  const serialized = JSON.stringify(value);
  return serialized === undefined ? String(value) : serialized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function mergeSourceEventIds(left: readonly string[], right: readonly string[]): string[] {
  const merged = [...left];
  for (const eventId of right) {
    if (!merged.includes(eventId)) {
      merged.push(eventId);
    }
  }
  return merged;
}

function toSourceEventIds(eventId?: string): string[] {
  return eventId ? [eventId] : [];
}
