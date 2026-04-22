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
  NEKO_MD_EXTENSIONS,
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

export { serializeTodoList } from './todo-markdown';
export { serializeProposal } from './proposal-markdown';
export { serializeExecutionPlan } from './plan-markdown';
