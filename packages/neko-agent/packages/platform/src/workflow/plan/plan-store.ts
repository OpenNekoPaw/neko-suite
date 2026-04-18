/**
 * PlanStore — persistent plan filesystem adapter.
 *
 * Stores `.nkplan` files under `<workDir>/.neko/plans/<id>.nkplan`.
 * Wraps the zero-dep @neko/shared/nkplan codec with a minimal fs contract
 * (injectable FileIOAdapter for tests).
 *
 * See docs/architecture/plan-mode.md §5.
 */

import { loadNkplan, saveNkplan } from '@neko/shared/nkplan';
import type { FileIOAdapter } from '../asset-library/types';
import type { PersistentPlan, PlanStatus } from './persistence-types';
import { transition, type TransitionOptions } from './plan-state-machine';

// =============================================================================
// Options
// =============================================================================

export interface PlanStoreOptions {
  /** Absolute workspace directory. Plans persist under `<workDir>/.neko/plans/`. */
  workDir: string;
  /** FileIO adapter. Defaults to node fs/promises (created via createNodeFileIO). */
  fileIO: FileIOAdapter;
  /** Override directory; defaults to `<workDir>/.neko/plans`. */
  dirOverride?: string;
}

// =============================================================================
// Implementation
// =============================================================================

export class PlanStore {
  private readonly dir: string;

  constructor(private readonly options: PlanStoreOptions) {
    this.dir = options.dirOverride ?? joinPath(options.workDir, '.neko', 'plans');
  }

  // ---------------------------------------------------------------------------
  // Save / load
  // ---------------------------------------------------------------------------

  async save(plan: PersistentPlan): Promise<void> {
    const json = saveNkplan(plan, { validate: true });
    await this.options.fileIO.mkdirp(this.dir);
    await this.options.fileIO.write(this.pathFor(plan.id), json);
  }

  async load(id: string): Promise<PersistentPlan | undefined> {
    const content = await this.options.fileIO.read(this.pathFor(id));
    if (content === undefined) return undefined;
    const { plan, validation } = loadNkplan(content);
    if (!validation.valid) {
      // Corrupt file: surface as undefined (logger can be added by caller)
      return undefined;
    }
    return plan;
  }

  async exists(id: string): Promise<boolean> {
    return (await this.options.fileIO.read(this.pathFor(id))) !== undefined;
  }

  /**
   * Apply a status transition and persist atomically.
   * Returns the updated plan.
   */
  async transition(
    id: string,
    to: PlanStatus,
    options: TransitionOptions = {},
  ): Promise<PersistentPlan> {
    const plan = await this.load(id);
    if (!plan) throw new Error(`Plan not found: ${id}`);
    const next = transition(plan, to, options);
    await this.save(next);
    return next;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  pathFor(id: string): string {
    if (!isSafeId(id)) throw new Error(`Invalid plan id: ${id}`);
    return joinPath(this.dir, `${id}.nkplan`);
  }
}

// =============================================================================
// Helpers
// =============================================================================

function joinPath(...parts: string[]): string {
  return parts
    .filter((p) => p.length > 0)
    .map((p) => p.replace(/[/\\]+$/, ''))
    .join('/');
}

/**
 * Plan ids are expected to be slug-like to keep the filesystem safe.
 * Matches what defaultIdGen (plan-builder.ts) produces.
 */
function isSafeId(id: string): boolean {
  return /^[A-Za-z0-9_.-]+$/.test(id);
}

export const __internal = { joinPath, isSafeId };
