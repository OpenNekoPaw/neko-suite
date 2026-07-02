/**
 * ArtifactValidator — pure, dependency-free frontmatter schema check for the
 * three IDC artifact families (Draft / Plan / Task).
 *
 * See: docs/architecture/agent-unified-workflow.md §4 (built-in creation stages), §7.5
 *      (frontmatter minimum)
 *
 * Phase B (2026-04-22): when the dedicated `DraftWriteTool` / `TaskWriteTool` /
 * `PlanWriteTool` are removed, AI writes these files through the generic
 * `Write` tool. Without a tool-level schema gate the post-write validator
 * becomes the safety net — it does NOT block the write (the file is already
 * on disk) but raises structured issues the narrator / agent can act on.
 *
 * Intentional non-goals:
 * - No fs I/O. Caller passes `content` — validator stays pure.
 * - No repair / quarantine — that is a policy decision for the watcher.
 * - No YAML parity with full spec. The tool surface produces minimal
 *   frontmatter (id / kind / status / timestamps); a simple key:value parser
 *   is sufficient. Multi-line block scalars are rejected for these artifacts.
 */

import type { ArtifactKind, ExecutionArtifactInvalidEvent } from '@neko-agent/types';

// =============================================================================
// Public types
// =============================================================================

export type ArtifactIssueCode = ExecutionArtifactInvalidEvent['issues'][number]['code'];

export interface ArtifactIssue {
  code: ArtifactIssueCode;
  /** Offending field name; empty string for structural issues. */
  field: string;
  message: string;
}

export interface ArtifactValidationResult {
  valid: boolean;
  /** Parsed frontmatter (best-effort; empty when frontmatter is missing). */
  frontmatter: Readonly<Record<string, string>>;
  /** Ordered list of issues, worst first. Empty when `valid === true`. */
  issues: readonly ArtifactIssue[];
}

// =============================================================================
// Schema
// =============================================================================

interface FieldSpec {
  name: string;
  /** Optional value validator. Return an issue code + message on mismatch. */
  check?: (value: string) => Pick<ArtifactIssue, 'code' | 'message'> | null;
}

const ISO8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/;

function isoTimestamp(field: string): FieldSpec {
  return {
    name: field,
    check: (value) =>
      ISO8601_RE.test(value)
        ? null
        : {
            code: 'invalid-timestamp',
            message: `"${field}" must be an ISO 8601 timestamp (got "${value}")`,
          },
  };
}

function statusEnum(field: string, allowed: readonly string[]): FieldSpec {
  return {
    name: field,
    check: (value) =>
      allowed.includes(value)
        ? null
        : {
            code: 'invalid-status',
            message: `"${field}" must be one of ${allowed.join(' | ')} (got "${value}")`,
          },
  };
}

const DRAFT_SCHEMA: readonly FieldSpec[] = [
  { name: 'id' },
  { name: 'kind' },
  { name: 'title' },
  statusEnum('status', ['draft', 'pending_review', 'approved', 'refined', 'rejected']),
  { name: 'domain' },
  isoTimestamp('createdAt'),
  isoTimestamp('updatedAt'),
];

const PLAN_SCHEMA: readonly FieldSpec[] = [
  { name: 'id' },
  { name: 'kind' },
  { name: 'draftId' },
  { name: 'title' },
  statusEnum('status', ['draft', 'ready', 'in_progress', 'completed', 'failed', 'aborted']),
  isoTimestamp('createdAt'),
  isoTimestamp('updatedAt'),
];

const TASK_SCHEMA: readonly FieldSpec[] = [
  { name: 'id' },
  { name: 'kind' },
  isoTimestamp('createdAt'),
  isoTimestamp('updatedAt'),
];

const SCHEMAS: Readonly<Record<ArtifactKind, readonly FieldSpec[]>> = {
  draft: DRAFT_SCHEMA,
  plan: PLAN_SCHEMA,
  task: TASK_SCHEMA,
};

// =============================================================================
// Entry point
// =============================================================================

/**
 * Validate the raw markdown content of an artifact file against its per-kind
 * schema. Caller supplies `kind` because the on-disk location determines it
 * (`drafts/` vs `plans/` vs `tasks/`).
 */
export function validateArtifact(kind: ArtifactKind, content: string): ArtifactValidationResult {
  const parse = parseFrontmatter(content);
  if (parse.kind === 'missing') {
    return {
      valid: false,
      frontmatter: Object.freeze({}),
      issues: [
        {
          code: 'missing-frontmatter',
          field: '',
          message: 'Artifact is missing a YAML frontmatter block (expected --- ... ---)',
        },
      ],
    };
  }
  if (parse.kind === 'malformed') {
    return {
      valid: false,
      frontmatter: Object.freeze({}),
      issues: [
        {
          code: 'malformed-frontmatter',
          field: '',
          message: parse.message,
        },
      ],
    };
  }

  const fm = parse.fields;
  const issues: ArtifactIssue[] = [];

  // Kind mismatch is a top-priority failure; keep it first so consumers reading
  // `issues[0]` always see the most severe problem.
  const declaredKind = fm.kind;
  if (declaredKind !== kind) {
    issues.push({
      code: 'wrong-kind',
      field: 'kind',
      message: declaredKind
        ? `Expected kind="${kind}" for this directory; found "${declaredKind}"`
        : `Missing "kind" field (expected "${kind}")`,
    });
  }

  for (const spec of SCHEMAS[kind]) {
    const value = fm[spec.name];
    if (value === undefined || value.length === 0) {
      // `kind` mismatch is already reported above; don't double-log.
      if (spec.name === 'kind' && declaredKind !== kind) continue;
      issues.push({
        code: 'missing-field',
        field: spec.name,
        message: `Required frontmatter field "${spec.name}" is missing or empty`,
      });
      continue;
    }
    if (spec.check) {
      const violation = spec.check(value);
      if (violation) {
        issues.push({ ...violation, field: spec.name });
      }
    }
  }

  return {
    valid: issues.length === 0,
    frontmatter: Object.freeze({ ...fm }),
    issues,
  };
}

// =============================================================================
// Frontmatter parser (minimal by design — see file header)
// =============================================================================

type ParseResult =
  | { kind: 'ok'; fields: Record<string, string> }
  | { kind: 'missing' }
  | { kind: 'malformed'; message: string };

function parseFrontmatter(content: string): ParseResult {
  if (!content.startsWith('---')) return { kind: 'missing' };

  const afterOpening = content.slice(3);
  // The opener may be `---\n` or `---\r\n`; accept either.
  const lineBreak = afterOpening.startsWith('\r\n') ? '\r\n' : '\n';
  if (!afterOpening.startsWith(lineBreak)) {
    return {
      kind: 'malformed',
      message: 'Frontmatter opening "---" must be followed by a newline',
    };
  }

  const body = afterOpening.slice(lineBreak.length);
  const closeIdx = findClosingFence(body, lineBreak);
  if (closeIdx === -1) {
    return {
      kind: 'malformed',
      message: 'Frontmatter opening "---" has no matching closing fence',
    };
  }

  const frontmatter = body.slice(0, closeIdx);
  const fields: Record<string, string> = {};
  const lines = frontmatter.split(/\r?\n/);
  let activeListKey: string | null = null;
  for (const line of lines) {
    // Skip blank / comment lines.
    if (!line || /^\s*#/.test(line)) continue;
    if (/^\s+-/.test(line)) {
      if (!activeListKey) {
        return {
          kind: 'malformed',
          message: `Unsupported frontmatter construct (nested list without key): "${line.trim()}"`,
        };
      }
      continue;
    }
    // Reject orphan list items and block scalars — the validator contract
    // covers minimal frontmatter only, but permits simple top-level lists
    // such as `referenceChain:`.
    if (/:\s*[|>]\s*$/.test(line)) {
      return {
        kind: 'malformed',
        message: `Unsupported frontmatter construct (block scalar / nested list): "${line.trim()}"`,
      };
    }
    const colon = line.indexOf(':');
    if (colon === -1) {
      return {
        kind: 'malformed',
        message: `Frontmatter line missing ":" separator: "${line.trim()}"`,
      };
    }
    const key = line.slice(0, colon).trim();
    let value = line.slice(colon + 1).trim();
    if (!key) {
      return { kind: 'malformed', message: `Empty key before ":" in "${line.trim()}"` };
    }
    activeListKey = null;
    if (value.length === 0) {
      fields[key] = '';
      activeListKey = key;
      continue;
    }
    // Strip a single pair of surrounding quotes (single or double).
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    fields[key] = value;
  }

  return { kind: 'ok', fields };
}

function findClosingFence(body: string, lineBreak: string): number {
  // The closing fence is a line containing exactly "---" (optionally followed
  // by the trailing newline or EOF). Scan line-by-line so we don't mis-match
  // a horizontal rule in the body.
  let cursor = 0;
  while (cursor <= body.length) {
    const eol = body.indexOf(lineBreak, cursor);
    const line = eol === -1 ? body.slice(cursor) : body.slice(cursor, eol);
    if (line.trim() === '---') return cursor;
    if (eol === -1) return -1;
    cursor = eol + lineBreak.length;
  }
  return -1;
}
