/**
 * JournalReader — Read and replay JSONL session event logs
 *
 * Reads a JSONL journal file and rebuilds session state from events.
 * Corrupted lines are silently skipped (JSONL fault tolerance).
 */

import type { ChatMessage, CreativeVersionEntry } from '@neko/shared';
import type { ExecutionMode } from './types';
import type { JournalEntry, SubAgentRef, StateSnapshot } from './journal-writer';
import { projectJournalEntriesToHistory } from './working-memory';

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

    for (const [lineIndex, line] of lines.entries()) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed) as JournalEntry;
        entries.push({
          ...parsed,
          eventId:
            parsed.eventId ??
            createFallbackJournalEntryId(parsed.seq, parsed.ts, trimmed, lineIndex),
        });
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
          case 'version_recorded':
            if (evt.versionEntry) {
              versionLogEntries.push(evt.versionEntry);
            }
            break;

          case 'user_message':
          case 'compaction':
          case 'compaction_failed':
          case 'memory_extraction':
          case 'validation.stage_transition_requested':
          case 'text':
          case 'thinking_content':
          case 'tool_call':
          case 'tool_result':
          case 'text_delta':
          case 'assistant_text_replacement':
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
    const projectedHistory = projectJournalEntriesToHistory(entries).messages;
    history.push(...projectedHistory);

    return { history, executionMode, versionLogEntries, subAgentRefs, lastSeq, lastSnapshot };
  }
}

function createFallbackJournalEntryId(
  seq: number,
  ts: number,
  rawLine: string,
  lineIndex: number,
): string {
  const crypto = require('node:crypto') as typeof import('node:crypto');
  const digest = crypto.createHash('sha1').update(rawLine).digest('hex').slice(0, 12);
  return `fallback-${seq}-${ts}-${lineIndex.toString(36)}-${digest}`;
}
