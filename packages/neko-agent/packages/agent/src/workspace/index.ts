/**
 * Workspace module — `.neko/` directory resolver + JSONL sinks.
 *
 * See: docs/architecture/agent-unified-workflow.md §7 (product format
 * dichotomy) + §7.4 (canonical layout).
 */

export {
  createNekoPaths,
  NEKO_DIR,
  NEKO_SUBDIRS,
  NEKO_LOG_FILES,
  NEKO_CACHE_FILES,
  NEKO_STATE_FILES,
  NEKO_MD_PREFIXES,
  type INekoPaths,
  type NekoSubdir,
  type NekoLogFile,
  type NekoCacheFile,
  type NekoStateFile,
} from './neko-paths';

export {
  NEKO_AGENTS_FILE_NAME,
  NEKO_CONTENT_DIR,
  NEKO_CONTENT_SUBDIRS,
  resolveAgentsFile,
  resolveNekoContentDir,
  resolvePersonalAgentsFile,
  resolvePersonalNekoContentDir,
  resolveProjectAgentsFile,
  resolveProjectNekoContentDir,
  type NekoContentSource,
  type NekoContentSubdir,
} from './neko-content-layout';

export {
  createArtifactIndexStore,
  type ArtifactIndexEntry,
  type ArtifactIndexSnapshot,
  type ArtifactIndexStoreConfig,
  type ArtifactIndexStoreFsOps,
  type DraftArtifactIndexEntry,
  type IArtifactIndexStore,
  type PlanArtifactIndexEntry,
  type TaskArtifactIndexEntry,
} from './artifact-index-store';

export {
  createSessionLock,
  type ISessionLock,
  type SessionLockConfig,
  type SessionLockFsOps,
  type SessionLockPayload,
  type AcquireResult,
} from './session-lock';

export {
  createIdcRuntimeStateStore,
  type IIdcRuntimeStateStore,
  type IdcRuntimeStateFsOps,
  type IdcRuntimeStateInput,
  type IdcRuntimeStateSnapshot,
  type IdcRuntimeStageTransition,
  type PersistedFeedbackGuidanceSnapshot,
  type PersistedIdcRunSnapshot,
  type PendingApprovalSnapshot,
} from './idc-runtime-state-store';

export {
  readIdcRuntimeState,
  parseIdcRuntimeState,
  readPendingApprovalState,
  parsePendingApprovalState,
  type IdcRuntimeStateReadFsOps,
  type ReadIdcRuntimeStateConfig,
  type ReadPendingApprovalStateConfig,
  type IdcRuntimeRestoreState,
  type PendingApprovalRestoreState,
} from './idc-runtime-state-reader';

export {
  createNdjsonEventSink,
  type INdjsonEventSink,
  type NdjsonEventSinkConfig,
  type NdjsonFsOps,
} from './ndjson-event-sink';

export { serializeTask, parseTask } from './task-markdown';
export { serializeDraft, parseDraft } from './draft-markdown';
export { serializeExecutionPlan, parseExecutionPlan } from './plan-markdown';

export {
  parsePreferences,
  emptyPreferences,
  mergePreferences,
  type ParseResult as PreferencesParseResult,
} from './preferences-parser';

export {
  loadPreferences,
  type PreferencesLoaderConfig,
  type PreferencesFsOps,
  type LoadResult as PreferencesLoadResult,
} from './preferences-loader';
