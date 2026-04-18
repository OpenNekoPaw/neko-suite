/**
 * Workflow Orchestration — Public barrel export.
 *
 * Three layers (see docs/architecture/workflow-orchestration.md):
 *   - Workflow (this module's ./router)  — "which flow to run"
 *   - Plan (./plan)                       — "what specifically to do"
 *   - Pipeline (@neko/agent pipeline)     — "execute it"
 *
 * Plus horizontal subsystems (consumed by Plan layer):
 *   - AssetLibrary  (./asset-library)
 *   - MatchingEngine (./matching)
 *   - ConsistencyChecker (./consistency)
 */

// Contracts
export * from './types';

// Workflow layer
export {
  Router,
  createRouter,
  fastProbe,
  isCommittable,
  runInputProbe,
  getRouteRecipe,
  listRouteLevels,
  listRouteRecipes,
  type RouterOptions,
} from './router';

// Plan layer
export {
  PlanBuilder,
  createPlanBuilder,
  type LitePlan,
  type LitePlanStatus,
  type PlanBuildInput,
  type PlanBuilderOptions,
  type PlannedStage,
  type ShotBindingSummary,
} from './plan';

// Horizontal subsystem: MatchingEngine
export {
  createMatchingEngine,
  MatchingEngineImpl,
  explicitMatcher,
  parseExplicitRefs,
  nameMatcher,
  dice,
  continuityMatcher,
  type BindingCandidate,
  type EntityRef,
  type IMatcher,
  type MatchContext,
  type MatchLayer,
  type MatchingEngine,
  type Shot,
  type ShotBindings,
} from './matching';

// Horizontal subsystem: AssetLibrary
export {
  createAssetLibrary,
  BindingHistory,
  createMemoryFileIO,
  createNodeFileIO,
  type AssetLibrary,
  type AssetLibraryDeps,
  type Asset,
  type AssetKind,
  type Binding,
  type BindingProvenance,
  type BindingQuery,
  type BindingSlot,
  type Entity,
  type EntityKind,
  type FileIOAdapter,
  type RawAssetManifestEntry,
  type Relation,
  type RelationKind,
} from './asset-library';
