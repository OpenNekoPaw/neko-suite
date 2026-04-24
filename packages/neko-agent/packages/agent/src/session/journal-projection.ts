/**
 * JournalProjection — build resume-oriented views from journal JSONL files.
 *
 * Recovery reads are projection-backed; legacy conversation JSON migration is
 * handled separately and is not part of the steady-state runtime path.
 */

import * as path from 'node:path';
import type { ChatMessage } from '@neko/shared';
import { JournalReader } from './journal-reader';
import type { JournalReaderFsOps } from './journal-reader';
import type { AgentEventType } from './types';
import type { JournalEntry } from './journal-writer';
import { projectJournalEntriesToHistory, type ProjectedHistory } from './working-memory';

export interface JournalProjectionOptions {
  includeCompacted?: boolean;
  upToEventId?: string;
}

export interface ConversationSummary {
  conversationId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  source: 'journal-projection';
}

export interface IJournalProjection {
  projectToHistory(
    conversationId: string,
    options?: JournalProjectionOptions,
  ): Promise<ChatMessage[]>;
  projectToHistoryWithEventIds(
    conversationId: string,
    options?: JournalProjectionOptions,
  ): Promise<ProjectedHistory>;
  projectToSummary(conversationId: string): Promise<ConversationSummary | null>;
  filterEvents(
    conversationId: string,
    type: AgentEventType,
  ): AsyncIterable<JournalEntry & { type: 'event'; event: { type: AgentEventType } }>;
}

export class JournalProjection implements IJournalProjection {
  constructor(
    private readonly _baseDir: string,
    private readonly _fsOps: JournalReaderFsOps,
  ) {}

  async projectToHistory(
    conversationId: string,
    options?: JournalProjectionOptions,
  ): Promise<ChatMessage[]> {
    const projected = await this.projectToHistoryWithEventIds(conversationId, options);
    return projected.messages;
  }

  async projectToHistoryWithEventIds(
    conversationId: string,
    options?: JournalProjectionOptions,
  ): Promise<ProjectedHistory> {
    const entries = await this._readEntries(conversationId, options);
    return projectJournalEntriesToHistory(entries, options);
  }

  async projectToSummary(conversationId: string): Promise<ConversationSummary | null> {
    const entries = await this._readEntries(conversationId);
    if (entries.length === 0) return null;

    const history = projectEntriesToHistory(entries);
    const firstUserMessage = history.find(
      (message): message is ChatMessage & { role: 'user'; content: string } =>
        message.role === 'user' &&
        typeof message.content === 'string' &&
        message.content.trim().length > 0,
    );

    return {
      conversationId,
      title: summarizeConversationTitle(firstUserMessage?.content),
      createdAt: entries[0]!.ts,
      updatedAt: entries[entries.length - 1]!.ts,
      messageCount: history.length,
      source: 'journal-projection',
    };
  }

  async *filterEvents(
    conversationId: string,
    type: AgentEventType,
  ): AsyncIterable<JournalEntry & { type: 'event'; event: { type: AgentEventType } }> {
    const entries = await this._readEntries(conversationId);
    for (const entry of entries) {
      if (entry.type === 'event' && entry.event?.type === type) {
        yield entry as JournalEntry & { type: 'event'; event: { type: AgentEventType } };
      }
    }
  }

  private async _readEntries(
    conversationId: string,
    options?: JournalProjectionOptions,
  ): Promise<JournalEntry[]> {
    const reader = new JournalReader({
      filePath: path.join(this._baseDir, `${conversationId}.jsonl`),
      fsOps: this._fsOps,
    });
    const entries = await reader.readAll();

    if (!options?.upToEventId) return entries;

    const sliced: JournalEntry[] = [];
    for (const entry of entries) {
      sliced.push(entry);
      if (entry.eventId === options.upToEventId) break;
    }
    return sliced;
  }
}

export function projectEntriesToHistory(entries: readonly JournalEntry[]): ChatMessage[] {
  return projectJournalEntriesToHistory(entries).messages;
}

function summarizeConversationTitle(content?: string): string {
  const trimmed = content?.trim();
  if (!trimmed) return 'Untitled Conversation';
  return trimmed.length > 50 ? `${trimmed.slice(0, 50)}...` : trimmed;
}
