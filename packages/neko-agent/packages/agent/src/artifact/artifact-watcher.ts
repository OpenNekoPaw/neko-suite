/**
 * ArtifactWatcher — optional host hook for visible creation documents.
 *
 * Creation documents live in project-owned creation directories, not hidden
 * managed runtime paths. This watcher is not wired by default; hosts may opt
 * in when they need to observe user edits.
 *
 * Design rules:
 * - **Non-blocking**: the watcher fires *after* the file is on disk. Invalid
 *   frontmatter does not un-write the file; it emits an `artifact.invalid`
 *   event so the narrator + agent can surface a hint on the next turn.
 * - **Debounced**: 300ms, so rapid rewrites (e.g. editor auto-save during AI
 *   authoring) collapse to one event per file.
 * - **Pure event side** only — the watcher does not read the IdcRunStore or
 *   inject runId into files. Caller supplies `getRunId()` for correlation and
 *   `getCreationId()` for the visible directory. With no active creation at
 *   startup the watcher does not create or observe a directory.
 * - **Test-friendly**: `fsOps` is injectable so a test runner can spy on
 *   fs.watch without touching the real filesystem.
 *
 * What the watcher does NOT do:
 * - No index rebuild; the runtime artifact service owns the rebuildable index.
 * - No permission enforcement; host approval gates own creation-document writes.
 */

import * as nodeFs from 'node:fs';
import * as nodeFsPromises from 'node:fs/promises';
import * as path from 'node:path';
import type {
  ArtifactKind,
  ExecutionArtifactInvalidEvent,
  ExecutionArtifactWrittenEvent,
} from '@neko-agent/types';
import { EXECUTION_CHANNELS } from '@neko-agent/types';
import type { IEventBus } from '../events/event-bus';
import type { ICreationArtifactPaths } from '../workspace/creation-artifact-paths';
import { CREATION_ARTIFACT_FILES } from '../workspace/creation-artifact-paths';
import { getLogger } from '../utils/logger';
import { validateArtifact, type ArtifactIssue } from './artifact-validator';

const logger = getLogger('ArtifactWatcher');

// =============================================================================
// Types
// =============================================================================

export interface ArtifactWatcherFsOps {
  watch: (
    dir: string,
    listener: (event: string, filename: string | null) => void,
  ) => ArtifactWatcherHandle;
  readFile: (path: string) => Promise<string>;
  mkdirP: (dir: string) => Promise<void>;
  exists: (dir: string) => Promise<boolean>;
}

export interface ArtifactWatcherHandle {
  close: () => void;
}

export interface ArtifactWatcherConfig {
  paths: ICreationArtifactPaths;
  eventBus: IEventBus;
  /** Returns the active IdcRun id. `null` skips watcher startup. */
  getRunId: () => string | null;
  /** Returns the active creator-facing creation id. `null` skips watcher startup. */
  getCreationId: () => string | null;
  /** Clock injection for deterministic tests. Defaults to Date.now. */
  now?: () => number;
  /** Debounce window (ms). Defaults to 300. */
  debounceMs?: number;
  /** FS ops injection. Defaults to node fs. */
  fsOps?: ArtifactWatcherFsOps;
}

export interface IArtifactWatcher {
  /** Begin watching. Safe to call once — subsequent calls are no-ops. */
  start(): Promise<void>;
  /** Stop watching + drop pending debounces. Idempotent. */
  dispose(): Promise<void>;
}

// =============================================================================
// Kind resolution
// =============================================================================

const WATCHED_KIND_BY_FILENAME: Readonly<Record<string, ArtifactKind>> = Object.freeze({
  [CREATION_ARTIFACT_FILES.draft]: 'draft',
  [CREATION_ARTIFACT_FILES.plan]: 'plan',
  [CREATION_ARTIFACT_FILES.task]: 'task',
});

// =============================================================================
// FS ops default (node:fs)
// =============================================================================

function defaultFsOps(): ArtifactWatcherFsOps {
  return {
    watch(dir, listener) {
      const w = nodeFs.watch(dir, (event, filename) => {
        listener(event, typeof filename === 'string' ? filename : null);
      });
      return {
        close: () => w.close(),
      };
    },
    readFile(filePath) {
      return nodeFsPromises.readFile(filePath, 'utf-8');
    },
    async mkdirP(dir) {
      await nodeFsPromises.mkdir(dir, { recursive: true });
    },
    async exists(dir) {
      try {
        await nodeFsPromises.access(dir);
        return true;
      } catch {
        return false;
      }
    },
  };
}

// =============================================================================
// Implementation
// =============================================================================

interface Pending {
  timer: ReturnType<typeof setTimeout>;
  absPath: string;
  kind: ArtifactKind;
}

class ArtifactWatcher implements IArtifactWatcher {
  private readonly _paths: ICreationArtifactPaths;
  private readonly _eventBus: IEventBus;
  private readonly _getRunId: () => string | null;
  private readonly _getCreationId: () => string | null;
  private readonly _now: () => number;
  private readonly _debounceMs: number;
  private readonly _fs: ArtifactWatcherFsOps;
  private readonly _handles: ArtifactWatcherHandle[] = [];
  private readonly _pending = new Map<string, Pending>();
  private _started = false;
  private _disposed = false;

  constructor(config: ArtifactWatcherConfig) {
    this._paths = config.paths;
    this._eventBus = config.eventBus;
    this._getRunId = config.getRunId;
    this._getCreationId = config.getCreationId;
    this._now = config.now ?? (() => Date.now());
    this._debounceMs = config.debounceMs ?? 300;
    this._fs = config.fsOps ?? defaultFsOps();
  }

  async start(): Promise<void> {
    if (this._started || this._disposed) return;
    this._started = true;
    const creationId = this._getCreationId();
    if (!creationId) {
      logger.debug('Creation document watcher skipped because no active creation is available');
      return;
    }
    await this._watchCreationDir(creationId);
  }

  async dispose(): Promise<void> {
    if (this._disposed) return;
    this._disposed = true;
    for (const p of this._pending.values()) clearTimeout(p.timer);
    this._pending.clear();
    for (const h of this._handles) {
      try {
        h.close();
      } catch (err) {
        logger.warn(`Close handle failed: ${String(err)}`);
      }
    }
    this._handles.length = 0;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private async _watchCreationDir(creationId: string): Promise<void> {
    const dir = this._paths.creationDir(creationId);

    // Ensure the visible creation directory exists before watching. This creates
    // `neko/creations/<creationId>`, never a managed `.neko` creation directory.
    if (!(await this._fs.exists(dir))) {
      try {
        await this._fs.mkdirP(dir);
      } catch (err) {
        logger.warn(`Cannot create watched dir ${dir}: ${String(err)}`);
        return;
      }
    }

    try {
      const handle = this._fs.watch(dir, (event, filename) => {
        if (this._disposed) return;
        if (!filename) return;
        const kind = this._kindForFilename(filename);
        if (!kind) return;
        const absPath = path.join(dir, filename);
        this._schedule(absPath, kind);
      });
      this._handles.push(handle);
    } catch (err) {
      logger.warn(`Cannot watch ${dir}: ${String(err)}`);
    }
  }

  private _kindForFilename(filename: string): ArtifactKind | null {
    if (!filename.endsWith('.md')) return null;
    if (filename.startsWith('.')) return null;
    if (filename.endsWith('.swp') || filename.endsWith('~')) return null;
    return WATCHED_KIND_BY_FILENAME[filename] ?? null;
  }

  private _schedule(absPath: string, kind: ArtifactKind): void {
    const prev = this._pending.get(absPath);
    if (prev) clearTimeout(prev.timer);
    const timer = setTimeout(() => {
      this._pending.delete(absPath);
      void this._fire(absPath, kind);
    }, this._debounceMs);
    this._pending.set(absPath, { timer, absPath, kind });
  }

  private async _fire(absPath: string, kind: ArtifactKind): Promise<void> {
    if (this._disposed) return;
    let content: string;
    try {
      content = await this._fs.readFile(absPath);
    } catch (err) {
      // File may have been deleted between debounce and read — silently drop.
      logger.debug(`Read after settle failed for ${absPath}: ${String(err)}`);
      return;
    }

    const result = validateArtifact(kind, content);
    const at = this._now();
    const runId = this._getRunId() ?? 'unknown';

    if (result.valid) {
      const event: ExecutionArtifactWrittenEvent = {
        channel: EXECUTION_CHANNELS.ARTIFACT_WRITTEN,
        runId,
        kind,
        path: absPath,
        artifactId: result.frontmatter.id ?? '',
        at,
      };
      this._eventBus.emit(event);
      return;
    }

    const event: ExecutionArtifactInvalidEvent = {
      channel: EXECUTION_CHANNELS.ARTIFACT_INVALID,
      runId,
      kind,
      path: absPath,
      issues: result.issues as readonly ArtifactIssue[],
      at,
    };
    this._eventBus.emit(event);
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createArtifactWatcher(config: ArtifactWatcherConfig): IArtifactWatcher {
  return new ArtifactWatcher(config);
}
