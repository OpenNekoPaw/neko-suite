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
  NEKO_STATE_FILES,
  NEKO_MD_PREFIXES,
  type INekoPaths,
  type NekoSubdir,
  type NekoLogFile,
  type NekoStateFile,
} from './neko-paths';

export {
  createSessionLock,
  type ISessionLock,
  type SessionLockConfig,
  type SessionLockFsOps,
  type SessionLockPayload,
  type AcquireResult,
} from './session-lock';

export {
  createNdjsonEventSink,
  type INdjsonEventSink,
  type NdjsonEventSinkConfig,
  type NdjsonFsOps,
} from './ndjson-event-sink';

export { serializeTask } from './task-markdown';
export { serializeDraft } from './draft-markdown';
export { serializeExecutionPlan } from './plan-markdown';

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
