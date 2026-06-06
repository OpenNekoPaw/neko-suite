/**
 * NekoPaths — `.neko/` directory layout resolver.
 *
 * See: docs/architecture/agent-unified-workflow.md §7.4 (project workspace)
 *
 * Single source of truth for where IDC artifacts land on disk. Callers
 * pass the project root; NekoPaths returns the canonical subpath for
 * each artifact family. The resolver is platform-agnostic (no Node `fs`
 * imports) — the caller's fsOps actually creates/writes files. This
 * keeps the agent package free of vscode / node wiring at L0.
 *
 * Naming convention (2026-04-22 revision): artifacts use prefix + `.md`
 * rather than custom `.nk*.md` extensions. The prefix matches the IDC
 * stage vocabulary (draft / plan / task):
 *
 *   <root>/.neko/
 *     drafts/          AI-produced draft-<runId>.md
 *     plans/           AI-produced plan-<runId>.md
 *     tasks/           AI-produced task-<runId>.md
 *     sessions/        AI-produced session-<runId>.md
 *     logs/            Program-produced .jsonl (events / audits / steps)
 *     .cache/          Program-produced .json (indices, derivable)
 *     state/           Program-produced concurrency + lock files
 *     preferences.md   Project-level user preferences
 *     settings.json    Media-library variables (already used by PathResolver)
 *     settings.local.json  Local overrides (already used)
 *
 * Everything else (assets, media) lives in the media library — neko-assets
 * owns that root. This module does **not** attempt to span both.
 */

// =============================================================================
// Constants — subdirectory + filename conventions
// =============================================================================

export const NEKO_DIR = '.neko' as const;

/** Subdirectories under `.neko/`. Values are relative paths. */
export const NEKO_SUBDIRS = {
  drafts: 'drafts',
  plans: 'plans',
  tasks: 'tasks',
  sessions: 'sessions',
  logs: 'logs',
  cache: '.cache',
  state: 'state',
  archives: 'archives',
} as const;

export type NekoSubdir = keyof typeof NEKO_SUBDIRS;

/**
 * Canonical log-file names. Each is append-only JSONL.
 *   events.jsonl — every DualFlowEvent that lands on the bus
 *   audits.jsonl — ApprovalEngine decisions (who decided what, why)
 *   steps.jsonl  — per-ReAct-step records (tool / params / outcome)
 */
export const NEKO_LOG_FILES = {
  events: 'events.jsonl',
  audits: 'audits.jsonl',
  steps: 'steps.jsonl',
} as const;

export type NekoLogFile = keyof typeof NEKO_LOG_FILES;

/**
 * Canonical cache-file names (under `cache/`). Program-produced JSON
 * derived from markdown artifacts and registries, safe to rebuild.
 */
export const NEKO_CACHE_FILES = {
  capabilityIndex: 'capability-index.json',
  artifactIndex: 'artifact-index.json',
} as const;

export type NekoCacheFile = keyof typeof NEKO_CACHE_FILES;

/**
 * Canonical state file names (under `state/`). Program-produced JSON
 * concurrency / lock artifacts — not human-authored.
 */
export const NEKO_STATE_FILES = {
  sessionLock: 'session-lock.json',
  idcRuntime: 'idc-runtime.json',
} as const;

export type NekoStateFile = keyof typeof NEKO_STATE_FILES;

/**
 * Canonical filename prefixes for AI-produced markdown artifacts.
 * Files are named `<prefix>-<runId>.md` under the matching subdirectory.
 */
export const NEKO_MD_PREFIXES = {
  draft: 'draft',
  plan: 'plan',
  task: 'task',
  session: 'session',
} as const;

// =============================================================================
// Resolver
// =============================================================================

export interface INekoPaths {
  /** Absolute path to `<root>/.neko/`. */
  readonly root: string;
  /** Absolute path to `<root>/.neko/<subdir>/`. */
  dir(subdir: NekoSubdir): string;
  /**
   * Absolute path to an AI-produced artifact given its family.
   * Example: `file('drafts', 'tiktok-001')` → `<root>/.neko/drafts/draft-tiktok-001.md`
   */
  file(subdir: 'drafts', basename: string): string;
  file(subdir: 'plans', basename: string): string;
  file(subdir: 'tasks', basename: string): string;
  file(subdir: 'sessions', basename: string): string;
  file(subdir: Extract<NekoSubdir, 'archives'>, basename: string): string;
  /** Absolute path to a canonical JSONL log. */
  log(kind: NekoLogFile): string;
  /** Absolute path to a canonical cache snapshot. */
  cache(kind: NekoCacheFile): string;
  /** Absolute path to a canonical program-produced state file. */
  state(kind: NekoStateFile): string;
}

/**
 * Join path segments using forward slashes. Callers working on Windows
 * typically pass forward-slash project roots already (VSCode / git); if
 * they don't, the caller should `path.resolve()` before invoking.
 */
function join(a: string, ...rest: string[]): string {
  let out = a.replace(/\/+$/, '');
  for (const seg of rest) {
    const trimmed = seg.replace(/^\/+/, '').replace(/\/+$/, '');
    if (trimmed) out = `${out}/${trimmed}`;
  }
  return out;
}

/**
 * Create a path resolver rooted at `projectRoot`. The root is recorded
 * but no filesystem calls happen here — resolution is pure string
 * math. Writers / readers take fsOps and consume paths from this.
 */
export function createNekoPaths(projectRoot: string): INekoPaths {
  if (!projectRoot) {
    throw new Error('createNekoPaths: projectRoot is required');
  }
  const root = join(projectRoot, NEKO_DIR);

  const dir = (subdir: NekoSubdir): string => join(root, NEKO_SUBDIRS[subdir]);

  function prefixFor(subdir: NekoSubdir): string | null {
    switch (subdir) {
      case 'drafts':
        return NEKO_MD_PREFIXES.draft;
      case 'plans':
        return NEKO_MD_PREFIXES.plan;
      case 'tasks':
        return NEKO_MD_PREFIXES.task;
      case 'sessions':
        return NEKO_MD_PREFIXES.session;
      case 'archives':
        return null;
      default:
        throw new Error(`No canonical prefix for subdir "${subdir}"`);
    }
  }

  function file(subdir: NekoSubdir, basename: string): string {
    if (!basename) throw new Error('NekoPaths.file: basename is required');
    const prefix = prefixFor(subdir);
    const prefixPattern = prefix ? `${prefix}-` : '';
    // Strip any accidental `.md` the caller already appended.
    const withoutExt = basename.endsWith('.md') ? basename.slice(0, -'.md'.length) : basename;
    // Strip an already-applied prefix so callers can pass either raw runId or the full name.
    const runId =
      prefix && withoutExt.startsWith(prefixPattern)
        ? withoutExt.slice(prefixPattern.length)
        : withoutExt;
    const fileName = prefix ? `${prefixPattern}${runId}.md` : `${runId}.md`;
    return `${dir(subdir)}/${fileName}`;
  }

  return {
    root,
    dir,
    file: file as INekoPaths['file'],
    log: (kind) => `${dir('logs')}/${NEKO_LOG_FILES[kind]}`,
    cache: (kind) => `${dir('cache')}/${NEKO_CACHE_FILES[kind]}`,
    state: (kind) => `${dir('state')}/${NEKO_STATE_FILES[kind]}`,
  };
}
