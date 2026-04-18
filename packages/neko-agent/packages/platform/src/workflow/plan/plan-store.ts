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
  // Enumeration
  // ---------------------------------------------------------------------------

  /**
   * List persisted plans.  Skips corrupt files (surfaces as `undefined` from
   * `loadNkplan`) and files with unsafe names.  Sorted by `updatedAt`
   * descending so "most recent" shows up first in UIs.
   *
   * Requires the injected FileIOAdapter to support `readdir`.  When it
   * doesn't, this returns an empty array (rather than throwing) so the
   * method is safe to call from UI code.
   */
  async listPlans(options: ListPlansOptions = {}): Promise<PlanListEntry[]> {
    const readdir = this.options.fileIO.readdir?.bind(this.options.fileIO);
    if (!readdir) return [];

    const entries = (await readdir(this.dir)) ?? [];
    const loaded: PlanListEntry[] = [];
    for (const filename of entries) {
      if (!filename.endsWith('.nkplan')) continue;
      const id = filename.slice(0, -'.nkplan'.length);
      if (!isSafeId(id)) continue;
      const plan = await this.load(id);
      if (!plan) continue;
      if (options.status !== undefined && plan.status !== options.status) continue;
      if (options.parentPlanId !== undefined && plan.parentPlanId !== options.parentPlanId)
        continue;
      loaded.push(summarise(plan));
    }
    loaded.sort((a, b) => b.updatedAt - a.updatedAt);
    if (options.limit !== undefined && options.limit > 0) {
      return loaded.slice(0, options.limit);
    }
    return loaded;
  }

  /** Convenience: list forks of a given parent plan id. */
  async listForks(parentPlanId: string): Promise<PlanListEntry[]> {
    return this.listPlans({ parentPlanId });
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
// Enumeration types
// =============================================================================

/**
 * Lightweight row for the plan-browser UI.  Strips the full shot/stage
 * payload so we don't post megabytes of data to the webview.
 */
export interface PlanListEntry {
  id: string;
  createdAt: number;
  updatedAt: number;
  status: PlanStatus;
  routeLevel: PersistentPlan['route']['level'];
  flowId: string;
  reason: string;
  parentPlanId: string | undefined;
  shotCount: number;
  pipelineId: string | undefined;
  errorMessage: string | undefined;
}

export interface ListPlansOptions {
  status?: PlanStatus;
  parentPlanId?: string;
  /** Clamp the number of rows returned. Newest first. */
  limit?: number;
}

function summarise(plan: PersistentPlan): PlanListEntry {
  return {
    id: plan.id,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
    status: plan.status,
    routeLevel: plan.route.level,
    flowId: plan.route.flowId,
    reason: plan.route.reason,
    parentPlanId: plan.parentPlanId,
    shotCount: plan.shots?.length ?? 0,
    pipelineId: plan.pipelineId,
    errorMessage: plan.errorMessage,
  };
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
