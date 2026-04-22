/**
 * ArtifactWatcher — watches `.neko/drafts|plans|tasks/` and emits artifact
 * lifecycle events onto the EventBus after validating frontmatter.
 *
 * See: docs/architecture/agent-unified-workflow.md §6.2 (EventBus), §6.5
 *      (Guardians / plumbing), §7.4 (project layout)
 *
 * Design rules:
 * - **Non-blocking**: the watcher fires *after* the file is on disk. Invalid
 *   frontmatter does not un-write the file; it emits an `artifact.invalid`
 *   event so the narrator + agent can surface a hint on the next turn.
 * - **Debounced**: 300ms, mirroring `HookLoader.watchDirectory()` so rapid
 *   rewrites (e.g. editor auto-save during AI authoring) collapse to one
 *   event per file.
 * - **Pure event side** only — the watcher does not read the SddRunStore or
 *   inject runId into files. Caller supplies `getRunId()` so the emitted event
 *   can carry the current run for correlation. Returns 'unknown' placeholder
 *   when no run is active.
 * - **Test-friendly**: `fsOps` is injectable so a test runner can spy on
 *   fs.watch without touching the real filesystem.
 *
 * What the watcher does NOT do:
 * - No index rebuild (future `.neko/cache/draft-index.json` consumer listens
 *   on the event instead).
 * - No permission enforcement; the generic Write tool already gates on
 *   workspace root.
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
import type { INekoPaths, NekoSubdir } from '../workspace/neko-paths';
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
  paths: INekoPaths;
  eventBus: IEventBus;
  /** Returns the active SddRun id. `null` → 'unknown' placeholder on events. */
  getRunId: () => string | null;
  /** Clock injection for deterministic tests. Defaults to Date.now. */
  now?: () => number;
  /** Debounce window (ms). Defaults to 300, matches HookLoader. */
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

/** Subdir → ArtifactKind mapping (only the three SDD families are watched). */
const WATCHED_KIND_BY_SUBDIR: Readonly<Record<string, ArtifactKind>> = {
  drafts: 'draft',
  plans: 'plan',
  tasks: 'task',
};

function subdirsToWatch(): NekoSubdir[] {
  return ['drafts', 'plans', 'tasks'];
}

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
  private readonly _paths: INekoPaths;
  private readonly _eventBus: IEventBus;
  private readonly _getRunId: () => string | null;
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
    this._now = config.now ?? (() => Date.now());
    this._debounceMs = config.debounceMs ?? 300;
    this._fs = config.fsOps ?? defaultFsOps();
  }

  async start(): Promise<void> {
    if (this._started || this._disposed) return;
    this._started = true;
    for (const subdir of subdirsToWatch()) {
      await this._watchSubdir(subdir);
    }
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

  private async _watchSubdir(subdir: NekoSubdir): Promise<void> {
    const dir = this._paths.dir(subdir);
    const kind = WATCHED_KIND_BY_SUBDIR[subdir];
    if (!kind) return;

    // Ensure the directory exists before watching — fs.watch on a missing dir
    // throws synchronously on some platforms. Creating it lazily is cheap and
    // keeps first-run callers from having to pre-provision the layout.
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
        if (!this._isArtifactFilename(filename, kind)) return;
        const absPath = path.join(dir, filename);
        this._schedule(absPath, kind);
      });
      this._handles.push(handle);
    } catch (err) {
      logger.warn(`Cannot watch ${dir}: ${String(err)}`);
    }
  }

  private _isArtifactFilename(filename: string, kind: ArtifactKind): boolean {
    // Convention from NekoPaths: `<kind>-<runId>.md`. Accept any `.md` file
    // under the watched dir so hand-edited artifacts also flow through, but
    // skip obvious non-artifacts (dotfiles, swap files).
    if (!filename.endsWith('.md')) return false;
    if (filename.startsWith('.')) return false;
    if (filename.endsWith('.swp') || filename.endsWith('~')) return false;
    // Soft prefix check — warn if the prefix doesn't match; don't reject.
    void kind;
    return true;
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
