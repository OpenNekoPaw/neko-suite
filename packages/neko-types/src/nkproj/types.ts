// =============================================================================
// NKPROJ Format SDK — Types
//
// Top-level project container that references (never embeds) the artifacts
// produced by the creation pipeline: `.nks` scripts, `.nkc` canvases,
// `.nkv` timelines, and `.nkplan` workflow plans.
//
// Design invariants:
//   - postMessage-safe JSON (no class instances, no Float32Array, no Date).
//   - Paths are workspace-relative by convention; absolute paths are tolerated
//     by the validator but flagged with a warning.
//   - Forward-compatible via `version` + nkproj/migrator.ts.
//   - Artifact additions are logged in `upgradeHistory` so "L0 prompt → L2
//     script" Lossless Upgrade flows can be replayed or undone.
// =============================================================================
//
// See docs/architecture/agent-unified-workflow.md and
// docs/architecture/format-strategy.md for the broader format family.

import type { ValidationError, ValidationResult } from '../config/config-adapter';

export type { ValidationResult, ValidationError };

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------

/** Supported NKPROJ format versions */
export type NkprojVersion = '1.0';

/** Current NKPROJ format version */
export const CURRENT_NKPROJ_VERSION: NkprojVersion = '1.0';

// ---------------------------------------------------------------------------
// Artifact references
// ---------------------------------------------------------------------------

export type NkprojArtifactKind = 'script' | 'canvas' | 'timeline' | 'plan' | 'asset';

/**
 * Reference to a single artifact file.  The container never stores artifact
 * contents inline — editors continue to own their formats end-to-end and
 * this container only tracks the membership + lineage.
 */
export interface NkprojArtifactRef {
  /** Stable id used within this project (not a filesystem path). */
  readonly id: string;
  /** Kind of artifact this ref points at. */
  readonly kind: NkprojArtifactKind;
  /**
   * Relative (preferred) or absolute path to the artifact.  Workspace-relative
   * paths survive repo moves; absolute paths emit a validator warning.
   */
  readonly path: string;
  /** UI label — defaults to the filename when absent. */
  readonly label?: string;
  /** Optional sha256 hex of the file contents for integrity checks. */
  readonly checksum?: string;
  /**
   * Route level that produced this artifact, if known.  Used by Lossless
   * Upgrade to decide which artifacts supersede which.
   */
  readonly producedByRouteLevel?: NkprojRouteLevel;
  /** Optional lineage pointer — artifact id this one was derived from. */
  readonly derivedFromArtifactId?: string;
  /** Free-form project-level tags (e.g., 'pilot', 'approved'). */
  readonly tags?: readonly string[];
}

// ---------------------------------------------------------------------------
// Lossless Upgrade history
// ---------------------------------------------------------------------------

export type NkprojRouteLevel = 'L0' | 'L1' | 'L2' | 'L3' | 'L4';

/**
 * A single Lossless Upgrade event: "at time T, route level R upgraded
 * N artifacts".  The event doesn't mutate earlier artifacts — every upgrade
 * appends new ones and the union is the project content.  Undoing an
 * upgrade is a matter of filtering artifacts by `addedArtifactIds`.
 */
export interface NkprojUpgradeEvent {
  readonly at: number;
  readonly fromLevel?: NkprojRouteLevel;
  readonly toLevel: NkprojRouteLevel;
  /** Artifact ids introduced by this upgrade. */
  readonly addedArtifactIds: readonly string[];
  /** Optional reason — typically the router's rationale. */
  readonly reason?: string;
  /** Optional actor ('user' / 'auto-approve' / 'system'). */
  readonly by?: string;
}

// ---------------------------------------------------------------------------
// Workflow preferences
// ---------------------------------------------------------------------------

/** Per-project preferences that override global `neko.workflow.*` settings. */
export interface NkprojWorkflowPrefs {
  /** When set, Router's `forceLevel` is pinned to this for the project. */
  readonly pinnedRouteLevel?: NkprojRouteLevel;
  /** Default render mode for puppet/scene shots. */
  readonly defaultRenderMode?: 'pure-render' | 'render-then-ai' | 'reference-only';
  /** Auto-approve plans at or above this confidence (0..1). */
  readonly autoApproveThreshold?: number;
  /** Skip specific pipeline stages by default (e.g. `qualityGate`). */
  readonly defaultSkipStages?: readonly string[];
}

// ---------------------------------------------------------------------------
// NkProj — the persistent root
// ---------------------------------------------------------------------------

export interface NkProj {
  readonly version: NkprojVersion;
  readonly id: string;
  readonly createdAt: number;
  readonly updatedAt: number;

  /** Human-readable project name (shown in picker / window title). */
  readonly name: string;
  readonly description?: string;

  /**
   * Working directory anchor — defaults to `.` (same folder as the .nkproj
   * file).  Artifact paths are resolved against this.
   */
  readonly workDir?: string;

  /** Artifact inventory — flat list, filtered by kind at read time. */
  readonly artifacts: readonly NkprojArtifactRef[];

  /** Ordered log of Lossless Upgrade events. */
  readonly upgradeHistory?: readonly NkprojUpgradeEvent[];

  /** Project-level workflow overrides. */
  readonly workflow?: NkprojWorkflowPrefs;

  /** Optional parent project id when this one was forked. */
  readonly parentProjectId?: string;

  /** Free-form notes — never shown as metadata, only as user memory. */
  readonly notes?: readonly string[];
}

// ---------------------------------------------------------------------------
// SDK options
// ---------------------------------------------------------------------------

export interface NkprojValidateOptions {
  /** Treat warnings as errors. */
  readonly strict?: boolean;
}

export interface NkprojLoadResult {
  readonly proj: NkProj;
  readonly validation: ValidationResult;
  readonly migration?: NkprojMigrationResult;
}

export interface NkprojSaveOptions {
  /** Run validation before serialising.  Default: true. */
  readonly validate?: boolean;
  /** JSON indent (default 2). */
  readonly indent?: number;
}

export interface NkprojMigrationResult {
  readonly data: NkProj;
  readonly fromVersion: NkprojVersion;
  readonly toVersion: NkprojVersion;
  readonly appliedMigrations: readonly string[];
  readonly warnings: readonly string[];
}
