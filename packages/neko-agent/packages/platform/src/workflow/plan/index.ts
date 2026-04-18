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
  toggleStageCheckpoint as togglePlanStageCheckpoint,
  type EditBindingInput,
  type ApplyToAllInput,
  type ToggleCheckpointInput,
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
export { forkPlan, type ForkOptions as PlanForkOptions } from './plan-forker';
export {
  diffPlans,
  type PlanDiff,
  type RouteChange as PlanDiffRouteChange,
  type RouteChangeKind as PlanDiffRouteChangeKind,
  type StageChange as PlanDiffStageChange,
  type StageChangeKind as PlanDiffStageChangeKind,
  type ShotChange as PlanDiffShotChange,
  type ShotChangeKind as PlanDiffShotChangeKind,
  type ConstraintChange as PlanDiffConstraintChange,
  type ConstraintChangeKind as PlanDiffConstraintChangeKind,
} from './plan-diff';
