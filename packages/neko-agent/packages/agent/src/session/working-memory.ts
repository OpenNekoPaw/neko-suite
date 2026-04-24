import type { ChatMessage } from '@neko/shared';
import type { AgentEvent } from './types';
import type { JournalEntry } from './journal-writer';

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
  toolCalls: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
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

  for (const entry of entries) {
    const event = entry.event;

    switch (event.type) {
      case 'user_message':
        pendingAssistant = flushPendingAssistant(history, pendingAssistant);
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
            toolCalls: [],
            sourceEventIds: toSourceEventIds(entry.eventId),
          };
        }
        break;

      case 'tool_call':
        if (!event.toolCall) {
          break;
        }
        if (!pendingAssistant) {
          pendingAssistant = { content: '', toolCalls: [], sourceEventIds: [] };
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
        if (event.toolResult) {
          history.push({
            message: {
              role: 'tool',
              content: event.toolResult.success
                ? JSON.stringify(event.toolResult.data)
                : `Error: ${event.toolResult.error ?? 'Unknown error'}`,
              toolCallId: event.toolResult.toolCallId,
            },
            sourceEventIds: toSourceEventIds(entry.eventId),
          });
        }
        break;

      case 'compaction':
      case 'compaction_failed':
      case 'memory_extraction':
      case 'thinking':
      case 'thinking_content':
      case 'text_delta':
      case 'tool_progress':
      case 'tool_confirmation':
      case 'version_recorded':
      case 'coordinator_event':
      case 'iteration':
      case 'done':
      case 'error':
      case 'messageQueued':
        break;
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
      ...(pendingAssistant.toolCalls.length > 0 && {
        toolCalls: pendingAssistant.toolCalls,
      }),
    },
    sourceEventIds: [...pendingAssistant.sourceEventIds],
  });
  return null;
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
