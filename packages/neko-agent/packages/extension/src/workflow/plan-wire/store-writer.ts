/**
 * Plan Wire — PlanStore read/write facade.
 *
 * Wraps the Workflow.PlanStore SDK with swallow-on-error semantics so
 * callers don't re-implement the same try/catch / "skip-when-store-is-
 * absent" boilerplate.  Owns all I/O to the persistent plan store for
 * PlanReviewSession + PipelineLifecycleBridge.
 */

import { Workflow } from '@neko/platform';
import { getLogger } from '../../base';

const logger = getLogger('PlanStoreWriter');

export class PlanStoreWriter {
  constructor(private readonly store: Workflow.PlanStore | undefined) {}

  get enabled(): boolean {
    return this.store !== undefined;
  }

  async persistInitial(plan: Workflow.LitePlan): Promise<void> {
    if (!this.store) return;
    try {
      await this.store.save(Workflow.toNkPlan(plan));
    } catch (err) {
      logger.warn('Failed to persist initial plan', {
        planId: plan.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async persistEdit(plan: Workflow.LitePlan): Promise<void> {
    if (!this.store) return;
    try {
      await this.store.save(Workflow.toNkPlan(plan));
    } catch (err) {
      logger.warn('Failed to persist plan edit', {
        planId: plan.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async transition(
    planId: string,
    to: Workflow.PlanStatus,
    options: Workflow.PlanTransitionOptions = {},
  ): Promise<void> {
    if (!this.store) return;
    try {
      await this.store.transition(planId, to, options);
    } catch (err) {
      // Illegal-transition errors are expected when the store is already
      // in a later state (auto-approve also calls transition).  Swallow
      // so best-effort persistence doesn't break the happy path.
      logger.debug('Plan transition skipped', {
        planId,
        to,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async loadPlan(planId: string): Promise<Workflow.PersistentPlan | undefined> {
    if (!this.store) return undefined;
    return this.store.load(planId);
  }

  async savePersistent(plan: Workflow.PersistentPlan): Promise<void> {
    if (!this.store) return;
    try {
      await this.store.save(plan);
    } catch (err) {
      logger.warn('Failed to persist plan', {
        planId: plan.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
