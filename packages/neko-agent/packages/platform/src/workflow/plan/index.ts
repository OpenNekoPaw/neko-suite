/**
 * Plan layer barrel export.
 */

export { PlanBuilder, createPlanBuilder, type PlanBuilderOptions } from './plan-builder';
export type {
  LitePlan,
  LitePlanStatus,
  PlanBuildInput,
  PlannedStage,
  ShotBindingSummary,
} from './types';

// Phase 2: persistence + state machine
export { PlanStore, type PlanStoreOptions } from './plan-store';
export {
  editBinding as editPlanBinding,
  applyToAll as applyBindingToAll,
  type EditBindingInput,
  type ApplyToAllInput,
  type EditContext as PlanEditContext,
} from './plan-editor';
export {
  transition as transitionPlan,
  canTransition as canTransitionPlan,
  nextStatuses as nextPlanStatuses,
  IllegalPlanTransitionError,
  type TransitionOptions as PlanTransitionOptions,
} from './plan-state-machine';
export {
  toNkPlan,
  toLitePlan,
  type PersistentPlan,
  type PlanStatus,
  type PlanStatusEvent,
} from './persistence-types';
