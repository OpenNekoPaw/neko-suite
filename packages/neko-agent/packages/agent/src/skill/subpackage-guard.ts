/**
 * Subpackage guard — activation-time check that a Skill's declared
 * `requiredSubpackages` are actually available.
 *
 * See: docs/architecture/agent-unified-workflow.md §5.2.10
 *
 * SkillService runs in the agent package and therefore cannot call
 * `vscode.extensions.*` directly. Activation callers (extension,
 * CLI, TUI) supply an `ISubpackageResolver` implementation; this
 * module stays platform-agnostic.
 *
 * Enforcement rules:
 *   - `required: true` missing → throw SkillActivationError (blocks apply)
 *   - `required: true` version mismatch → throw SkillActivationError
 *   - `required: false` missing → log warn + fallback.message (degrade)
 *   - `required: false` version mismatch → same as missing
 *   - No requiredSubpackages declared → noop (Skill activates freely)
 */

import type { Skill, RequiredSubpackage } from '@neko/shared';
import { getLogger } from '../utils/logger';

// =============================================================================
// Resolver contract
// =============================================================================

/**
 * Snapshot of a subpackage as seen by the host. Callers populate this
 * from their platform-specific registry (vscode.extensions, plugin
 * manager, etc.).
 */
export interface SubpackageInfo {
  id: string;
  version: string;
  /** `true` if the subpackage is currently loaded / activated. */
  enabled: boolean;
}

/**
 * Host-side resolver. `null` means "subpackage registry not wired up";
 * the guard treats that as a best-effort skip (log warn once, do not
 * block). Non-null resolver + missing id = actually missing.
 */
export interface ISubpackageResolver {
  /** Look up a subpackage by id. Returns null if unknown to the host. */
  get(id: string): SubpackageInfo | null;
}

// =============================================================================
// Errors
// =============================================================================

export type SkillActivationIssueCode =
  /** A required subpackage is not installed / enabled. */
  | 'subpackage-missing'
  /** A required subpackage's version does not satisfy minVersion. */
  | 'subpackage-version-mismatch';

export interface SkillActivationIssue {
  code: SkillActivationIssueCode;
  subpackageId: string;
  minVersion?: string;
  installedVersion?: string;
  defaultMessage?: string;
}

/**
 * Thrown by the guard when one or more required subpackages are
 * missing / incompatible. Carries the structured issue list so
 * callers (UI, CLI) can render the blocker and offer install prompts.
 */
export class SkillActivationError extends Error {
  readonly skillName: string;
  readonly issues: readonly SkillActivationIssue[];

  constructor(skillName: string, issues: readonly SkillActivationIssue[]) {
    const summary = issues
      .map((i) => {
        if (i.code === 'subpackage-version-mismatch') {
          return `${i.subpackageId} ${i.installedVersion ?? '?'} < ${i.minVersion ?? '?'}`;
        }
        return `${i.subpackageId} missing`;
      })
      .join(', ');
    super(`Skill "${skillName}" cannot activate: ${summary}`);
    this.name = 'SkillActivationError';
    this.skillName = skillName;
    this.issues = issues;
  }
}

// =============================================================================
// Guard
// =============================================================================

const logger = getLogger('SubpackageGuard');

/**
 * Validate `skill.requiredSubpackages` against the resolver.
 *
 * Returns silently when all required deps are satisfied. Throws
 * `SkillActivationError` on blocking failures. Degrades via warn-log
 * for optional-deps that are missing — the fallback message is
 * propagated to the logger so the UI can surface it if desired.
 */
export function assertSubpackagesAvailable(
  skill: Skill,
  resolver: ISubpackageResolver | null,
): void {
  const deps = skill.requiredSubpackages;
  if (!deps || deps.length === 0) return;

  if (resolver === null) {
    // Resolver not wired — record once per skill and continue. Callers
    // that care about strict enforcement should supply a resolver.
    logger.warn(
      `Skill "${skill.name}" declares requiredSubpackages but no resolver is configured; skipping guard`,
    );
    return;
  }

  const blocking: SkillActivationIssue[] = [];

  for (const dep of deps) {
    const issue = _evaluate(dep, resolver);
    if (!issue) continue;

    if (dep.required) {
      blocking.push(issue);
    } else {
      // Optional dep: log + fallback message, never block.
      const msg = dep.fallback?.message ?? `optional subpackage ${dep.id} unavailable`;
      logger.warn(`Skill "${skill.name}": ${_describeIssue(issue)} — degrading (${msg})`);
    }
  }

  if (blocking.length > 0) {
    throw new SkillActivationError(skill.name, blocking);
  }
}

// =============================================================================
// Internals
// =============================================================================

function _evaluate(
  dep: RequiredSubpackage,
  resolver: ISubpackageResolver,
): SkillActivationIssue | null {
  const info = resolver.get(dep.id);
  if (!info || !info.enabled) {
    return {
      code: 'subpackage-missing',
      subpackageId: dep.id,
      minVersion: dep.minVersion,
      defaultMessage: dep.fallback?.message,
    };
  }

  if (dep.minVersion && !_satisfiesMinVersion(info.version, dep.minVersion)) {
    return {
      code: 'subpackage-version-mismatch',
      subpackageId: dep.id,
      minVersion: dep.minVersion,
      installedVersion: info.version,
      defaultMessage: dep.fallback?.message,
    };
  }

  return null;
}

function _describeIssue(issue: SkillActivationIssue): string {
  if (issue.code === 'subpackage-version-mismatch') {
    return `${issue.subpackageId} installed ${issue.installedVersion ?? '?'}, need >= ${issue.minVersion ?? '?'}`;
  }
  return `${issue.subpackageId} missing`;
}

/**
 * Minimal semver comparator — handles `major.minor.patch` plus an
 * optional pre-release suffix. Sufficient for the Skill dependency
 * use case; if a heavier comparator is needed later, swap in `semver`.
 *
 * Returns true iff `installed >= required`.
 */
function _satisfiesMinVersion(installed: string, required: string): boolean {
  const lhs = _parseVersion(installed);
  const rhs = _parseVersion(required);
  if (!lhs || !rhs) {
    // Unparseable version — be lenient, don't block on parse failure.
    return true;
  }
  for (let i = 0; i < 3; i++) {
    const a = lhs[i] ?? 0;
    const b = rhs[i] ?? 0;
    if (a > b) return true;
    if (a < b) return false;
  }
  return true;
}

function _parseVersion(v: string): [number, number, number] | null {
  const cleaned = v.replace(/^[v=]/, '').split(/[-+]/)[0];
  if (!cleaned) return null;
  const parts = cleaned.split('.').map((p) => Number(p));
  if (parts.some((n) => Number.isNaN(n))) return null;
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}
