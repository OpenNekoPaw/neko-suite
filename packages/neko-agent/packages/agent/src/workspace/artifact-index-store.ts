/**
 * Artifact Index Store - replace-on-write cache projection for
 * `.neko/.cache/artifact-index.json`.
 *
 * Markdown artifacts on disk remain the source of truth. This index exists so
 * restore/listing can avoid re-scanning every artifact file on every boot, and
 * callers must treat it as a rebuildable cache rather than authoritative state.
 */

import type { ArtifactKind, Draft, ExecutionPlan, Task } from '@neko-agent/types';
import { classifyCommonFailureReason, emitDiagnostic } from '@neko/shared';
import { getLogger } from '../utils/logger';

const logger = getLogger('ArtifactIndexStore');

// =============================================================================
// Types
// =============================================================================

interface ArtifactIndexEntryBase<K extends ArtifactKind> {
  kind: K;
  runId: string;
  artifactId: string;
  path: string;
  updatedAt: number;
}

export interface DraftArtifactIndexEntry extends ArtifactIndexEntryBase<'draft'> {
  title: string;
  status: Draft['status'];
  domain: Draft['domain'];
}

export interface PlanArtifactIndexEntry extends ArtifactIndexEntryBase<'plan'> {
  title: string;
  status: ExecutionPlan['status'];
  draftId: string;
}

export interface TaskArtifactIndexEntry extends ArtifactIndexEntryBase<'task'> {
  itemCount: number;
  counts: Record<Task['items'][number]['status'], number>;
}

export type ArtifactIndexEntry =
  | DraftArtifactIndexEntry
  | PlanArtifactIndexEntry
  | TaskArtifactIndexEntry;

export interface ArtifactIndexSnapshot {
  schemaVersion: 1;
  updatedAt: number;
  entries: readonly ArtifactIndexEntry[];
}

export interface ArtifactIndexStoreFsOps {
  mkdir(path: string, opts?: { recursive: boolean }): Promise<void>;
  writeFile(path: string, data: string, encoding: 'utf-8'): Promise<void>;
}

export interface ArtifactIndexStoreConfig {
  filePath: string;
  fsOps: ArtifactIndexStoreFsOps;
  now?: () => number;
}

export interface IArtifactIndexStore {
  replace(entries: readonly ArtifactIndexEntry[]): void;
  flush(): Promise<void>;
  dispose(): Promise<void>;
}

// =============================================================================
// Implementation
// =============================================================================

class ArtifactIndexStore implements IArtifactIndexStore {
  private readonly _filePath: string;
  private readonly _fsOps: ArtifactIndexStoreFsOps;
  private readonly _now: () => number;
  private _dirEnsured = false;
  private _pending: Promise<void> = Promise.resolve();
  private _disposed = false;

  constructor(config: ArtifactIndexStoreConfig) {
    if (!config.filePath) {
      throw new Error('ArtifactIndexStore: filePath is required');
    }
    this._filePath = config.filePath;
    this._fsOps = config.fsOps;
    this._now = config.now ?? (() => Date.now());
  }

  replace(entries: readonly ArtifactIndexEntry[]): void {
    if (this._disposed) {
      logger.warn('replace() after dispose ignored');
      return;
    }

    const payload: ArtifactIndexSnapshot = {
      schemaVersion: 1,
      updatedAt: this._now(),
      entries,
    };
    let serialized: string;
    try {
      serialized = JSON.stringify(payload, null, 2) + '\n';
    } catch (err) {
      emitDiagnostic(logger, 'warn', {
        code: 'agent.artifact-index.snapshot-skipped',
        reason: classifyCommonFailureReason(err),
        message: 'Skipping artifact index snapshot because serialization failed.',
        context: {
          filePath: this._filePath,
          entryCount: entries.length,
        },
        error: err,
      });
      return;
    }

    this._pending = this._pending
      .then(async () => {
        await this._ensureDir();
        await this._fsOps.writeFile(this._filePath, serialized, 'utf-8');
      })
      .catch((err) => {
        emitDiagnostic(logger, 'warn', {
          code: 'agent.artifact-index.write-failed',
          reason: classifyCommonFailureReason(err),
          message: 'Failed to write artifact index snapshot.',
          context: {
            filePath: this._filePath,
            entryCount: entries.length,
          },
          error: err,
        });
      });
  }

  async flush(): Promise<void> {
    await this._pending;
  }

  async dispose(): Promise<void> {
    if (this._disposed) return;
    this._disposed = true;
    await this._pending;
  }

  private async _ensureDir(): Promise<void> {
    if (this._dirEnsured) return;
    const dir = this._filePath.replace(/[/\\][^/\\]+$/, '');
    if (dir && dir !== this._filePath) {
      await this._fsOps.mkdir(dir, { recursive: true });
    }
    this._dirEnsured = true;
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createArtifactIndexStore(config: ArtifactIndexStoreConfig): IArtifactIndexStore {
  return new ArtifactIndexStore(config);
}
