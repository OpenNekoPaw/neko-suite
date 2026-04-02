/**
 * JournalReader — Read and replay JSONL session event logs
 *
 * Reads a JSONL journal file and rebuilds session state from events.
 * Corrupted lines are silently skipped (JSONL fault tolerance).
 */

import type { ChatMessage, CreativeVersionEntry } from '@neko/shared';
import type { ExecutionMode } from './types';
import type { JournalEntry, SubAgentRef, StateSnapshot } from './journal-writer';

// =============================================================================
// Types
// =============================================================================

/** File system operations required by JournalReader */
export interface JournalReaderFsOps {
  readFile: (path: string) => Promise<string>;
  exists: (path: string) => Promise<boolean>;
}

/** Rebuilt session state from journal entries */
export interface ResumedSessionState {
  /** Rebuilt chat message history */
  history: ChatMessage[];
  /** Last known execution mode */
  executionMode: ExecutionMode;
  /** Rebuilt version log entries */
  versionLogEntries: CreativeVersionEntry[];
  /** SubAgent sidechain references */
  subAgentRefs: SubAgentRef[];
  /** Last sequence number (for continuing writes) */
  lastSeq: number;
  /** Last snapshot (if any) */
  lastSnapshot?: StateSnapshot;
}

export interface JournalReaderOptions {
  filePath: string;
  fsOps: JournalReaderFsOps;
}

// =============================================================================
// JournalReader
// =============================================================================

export class JournalReader {
  private readonly _filePath: string;
  private readonly _fsOps: JournalReaderFsOps;

  constructor(options: JournalReaderOptions) {
    this._filePath = options.filePath;
    this._fsOps = options.fsOps;
  }

  /** Read all journal entries, skipping corrupted lines */
  async readAll(): Promise<JournalEntry[]> {
    const exists = await this._fsOps.exists(this._filePath);
    if (!exists) return [];

    const content = await this._fsOps.readFile(this._filePath);
    const lines = content.split('\n');
    const entries: JournalEntry[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        entries.push(JSON.parse(trimmed) as JournalEntry);
      } catch {
        // Skip corrupted lines — JSONL fault tolerance
      }
    }

    return entries;
  }

  /**
   * Read journal and rebuild session state.
   * Returns null if journal doesn't exist or is empty.
   */
  async readSessionState(): Promise<ResumedSessionState | null> {
    const entries = await this.readAll();
    if (entries.length === 0) return null;

    const history: ChatMessage[] = [];
    const versionLogEntries: CreativeVersionEntry[] = [];
    const subAgentRefs: SubAgentRef[] = [];
    let executionMode: ExecutionMode = 'auto';
    let lastSeq = 0;
    let lastSnapshot: StateSnapshot | undefined;

    // Pending assistant message accumulator
    let pendingAssistant: {
      content: string;
      toolCalls?: Array<{
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
      }>;
    } | null = null;

    for (const entry of entries) {
      if (entry.seq > lastSeq) lastSeq = entry.seq;

      if (entry.type === 'snapshot' && entry.snapshot) {
        executionMode = entry.snapshot.executionMode;
        lastSnapshot = entry.snapshot;
        continue;
      }

      if (entry.type === 'subagent_ref' && entry.subAgentRef) {
        subAgentRefs.push(entry.subAgentRef);
        continue;
      }

      if (entry.type === 'event' && entry.event) {
        const evt = entry.event;

        switch (evt.type) {
          case 'text':
            // Flush pending assistant message if exists
            if (pendingAssistant) {
              history.push({
                role: 'assistant',
                content: pendingAssistant.content,
                toolCalls: pendingAssistant.toolCalls,
              });
              pendingAssistant = null;
            }
            // Complete text event → assistant message
            if (evt.content) {
              history.push({ role: 'assistant', content: evt.content });
            }
            break;

          case 'thinking_content':
            // Accumulate thinking into pending assistant
            if (!pendingAssistant) pendingAssistant = { content: '' };
            // Thinking content is metadata, not part of history
            break;

          case 'tool_call':
            if (evt.toolCall) {
              if (!pendingAssistant) pendingAssistant = { content: '' };
              if (!pendingAssistant.toolCalls) pendingAssistant.toolCalls = [];
              pendingAssistant.toolCalls.push({
                id: evt.toolCall.id,
                type: 'function' as const,
                function: {
                  name: evt.toolCall.name,
                  arguments: JSON.stringify(evt.toolCall.arguments),
                },
              });
            }
            break;

          case 'tool_result':
            // Flush pending assistant (with tool calls) before tool result
            if (pendingAssistant) {
              history.push({
                role: 'assistant',
                content: pendingAssistant.content,
                toolCalls: pendingAssistant.toolCalls,
              });
              pendingAssistant = null;
            }
            if (evt.toolResult) {
              history.push({
                role: 'tool',
                content: evt.toolResult.success
                  ? JSON.stringify(evt.toolResult.data)
                  : `Error: ${evt.toolResult.error ?? 'Unknown error'}`,
                toolCallId: evt.toolResult.toolCallId,
              });
            }
            break;

          case 'version_recorded':
            if (evt.versionEntry) {
              versionLogEntries.push(evt.versionEntry);
            }
            break;

          // Skip non-history events
          case 'text_delta':
          case 'thinking':
          case 'tool_progress':
          case 'tool_confirmation':
          case 'coordinator_event':
          case 'iteration':
          case 'done':
          case 'error':
          case 'messageQueued':
            break;
        }
      }
    }

    // Flush any remaining pending assistant
    if (pendingAssistant) {
      history.push({
        role: 'assistant',
        content: pendingAssistant.content,
        toolCalls: pendingAssistant.toolCalls,
      });
    }

    return { history, executionMode, versionLogEntries, subAgentRefs, lastSeq, lastSnapshot };
  }
}
