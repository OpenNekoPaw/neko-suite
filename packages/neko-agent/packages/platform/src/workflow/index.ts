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
  hashInput,
  estimateRouteCost,
  LLMRouter,
  ROUTER_TOOL_DEFS,
  ROUTER_TOOL_NAMES,
  runAnalyzeTextStructure,
  runCheckExistingAssets,
  runEstimateDuration,
  runAskUser,
  type RouterOptions,
  type HashInputOptions,
  type RouteCostEstimate,
  type LLMChatFn,
  type LLMRouterDecideInput,
  type LLMRouterOptions,
  type LLMRouterResult,
  type AskUserArgs,
  type AskUserBroker,
  type AskUserResult,
  type RouterToolContext,
  type RouterToolName,
} from './router';

// Router memory (Phase 3)
export {
  RouterMemory,
  ROUTER_MEMORY_SECTION_KEY,
  type RouterMemoryEntry,
  type RouterMemoryOptions,
  type RouterMemoryQuery,
  type RouterMemorySource,
  type RouterMemoryBackingStore,
} from './memory/router-memory';

// Plan layer
export {
  PlanBuilder,
  createPlanBuilder,
  PlanStore,
  transitionPlan,
  canTransitionPlan,
  nextPlanStatuses,
  IllegalPlanTransitionError,
  toNkPlan,
  toLitePlan,
  editPlanBinding,
  applyBindingToAll,
  togglePlanStageCheckpoint,
  forkPlan,
  diffPlans,
  type LitePlan,
  type LitePlanStatus,
  type PlanBuildInput,
  type PlanBuilderOptions,
  type PlannedStage,
  type PlanStoreOptions,
  type PlanListEntry,
  type ListPlansOptions,
  type PlanStatus,
  type PlanStatusEvent,
  type PlanTransitionOptions,
  type PersistentPlan,
  type ShotBindingSummary,
  type EditBindingInput,
  type ApplyToAllInput,
  type ToggleCheckpointInput,
  type PlanEditContext,
  type PlanForkOptions,
  type PlanDiff,
  type PlanDiffRouteChange,
  type PlanDiffRouteChangeKind,
  type PlanDiffStageChange,
  type PlanDiffStageChangeKind,
  type PlanDiffShotChange,
  type PlanDiffShotChangeKind,
  type PlanDiffConstraintChange,
  type PlanDiffConstraintChangeKind,
} from './plan';

// Horizontal subsystem: ConsistencyChecker
export {
  ConsistencyCheckerImpl,
  createConsistencyChecker,
  characterLockRule,
  timeProgressionRule,
  type CheckContext,
  type ConsistencyChecker,
  type ConsistencyCheckResult,
  type ConsistencyRule,
  type Constraint,
  type ConstraintKind,
  type Violation,
  type ViolationFix,
  type ViolationSeverity,
} from './consistency/consistency-checker';

// Horizontal subsystem: MatchingEngine
export {
  createMatchingEngine,
  createFullMatchingEngine,
  MatchingEngineImpl,
  explicitMatcher,
  parseExplicitRefs,
  nameMatcher,
  dice,
  continuityMatcher,
  // Phase 4.1 — CLIP TS contract + L3/L4 matchers (stub-friendly defaults)
  ClipUnavailableError,
  InMemoryClipProvider,
  UnimplementedClipProvider,
  cosineSimilarity,
  InMemoryEmbeddingCache,
  createSemanticMatcher,
  createLLMMatcher,
  DisabledLLMMatchBroker,
  type BindingCandidate,
  type ClipEmbedding,
  type ClipEncodeOptions,
  type ClipProvider,
  type EmbeddingCache,
  type EntityRef,
  type IMatcher,
  type LLMMatchBroker,
  type LLMMatchBrokerRequest,
  type LLMMatchDecision,
  type LLMMatcherOptions,
  type MatchContext,
  type MatchLayer,
  type MatchingEngine,
  type SemanticMatcherOptions,
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

// Phase 5 stub: Reference Chain builder (see creative-consistency.md §4).
export {
  buildReferenceChain,
  createReferenceChainBuilder,
  type BuildReferenceChainOptions,
  type ReferenceChainBuilder,
  type ReferenceChainEntry,
  type ReferenceChainShot,
  type ReferenceChainStrategy,
} from './reference-chain';
