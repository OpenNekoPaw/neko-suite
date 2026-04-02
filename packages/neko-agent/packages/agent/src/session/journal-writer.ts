/**
 * JournalWriter — Append-only JSONL session event writer
 *
 * Each AgentEvent is serialized as a single JSON line, appended to a JSONL file.
 * Designed for crash recovery: every write is immediately flushed to disk.
 */

import type { AgentEvent, ExecutionMode, IJournalWriter } from './types';

// =============================================================================
// Types
// =============================================================================

/** File system operations required by JournalWriter */
export interface JournalFsOps {
  appendFile: (path: string, data: string) => Promise<void>;
  mkdir: (path: string, opts?: { recursive: boolean }) => Promise<void>;
}

/** State snapshot written at end of each execute() call */
export interface StateSnapshot {
  historyLength: number;
  executionMode: ExecutionMode;
  versionLogSize: number;
}

/** SubAgent sidechain reference */
export interface SubAgentRef {
  subAgentId: string;
  journalPath: string;
}

/** Single JSONL line entry */
export interface JournalEntry {
  /** Monotonically increasing sequence number */
  seq: number;
  /** Timestamp (ms) */
  ts: number;
  /** Entry type */
  type: 'event' | 'snapshot' | 'subagent_ref';
  /** AgentEvent payload (when type='event') */
  event?: AgentEvent;
  /** State snapshot (when type='snapshot') */
  snapshot?: StateSnapshot;
  /** SubAgent sidechain ref (when type='subagent_ref') */
  subAgentRef?: SubAgentRef;
}

export interface JournalWriterOptions {
  filePath: string;
  fsOps: JournalFsOps;
}

// =============================================================================
// JournalWriter
// =============================================================================

export class JournalWriter implements IJournalWriter {
  private readonly _filePath: string;
  private readonly _fsOps: JournalFsOps;
  private _initialized = false;
  private _pendingWrite: Promise<void> = Promise.resolve();

  constructor(options: JournalWriterOptions) {
    this._filePath = options.filePath;
    this._fsOps = options.fsOps;
  }

  /** Ensure directory exists on first write */
  private async _ensureDir(): Promise<void> {
    if (this._initialized) return;
    const dir = this._filePath.replace(/[/\\][^/\\]+$/, '');
    if (dir && dir !== this._filePath) {
      await this._fsOps.mkdir(dir, { recursive: true });
    }
    this._initialized = true;
  }

  /** Append a raw JournalEntry to the JSONL file */
  async append(entry: JournalEntry): Promise<void> {
    await this._ensureDir();
    // Serialize error objects (not JSON-serializable by default)
    const sanitized = entry.event?.error
      ? {
          ...entry,
          event: {
            ...entry.event,
            error: { message: entry.event.error.message, name: entry.event.error.name },
          },
        }
      : entry;
    const line = JSON.stringify(sanitized) + '\n';
    // Chain writes to maintain order
    this._pendingWrite = this._pendingWrite.then(() =>
      this._fsOps.appendFile(this._filePath, line),
    );
    await this._pendingWrite;
  }

  /** Append an AgentEvent entry */
  async appendEvent(seq: number, event: AgentEvent): Promise<void> {
    await this.append({ seq, ts: Date.now(), type: 'event', event });
  }

  /** Append a state snapshot entry */
  async appendSnapshot(seq: number, snapshot: StateSnapshot): Promise<void> {
    await this.append({ seq, ts: Date.now(), type: 'snapshot', snapshot });
  }

  /** Append a SubAgent sidechain reference */
  async appendSubAgentRef(seq: number, ref: SubAgentRef): Promise<void> {
    await this.append({ seq, ts: Date.now(), type: 'subagent_ref', subAgentRef: ref });
  }

  /** Flush pending writes */
  async flush(): Promise<void> {
    await this._pendingWrite;
  }

  /** Dispose writer (flush and release) */
  async dispose(): Promise<void> {
    await this.flush();
  }
}
