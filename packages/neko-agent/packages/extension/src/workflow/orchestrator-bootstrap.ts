/**
 * Orchestrator Bootstrap — Phase 1 MVP glue between Workflow/Plan layers
 * and the existing Pipeline executor.
 *
 * Responsibilities:
 *   1. Instantiate Router / AssetLibrary / MatchingEngine / PlanBuilder once.
 *   2. Expose startRoutedPipeline(input) that ties them together:
 *        Route ← Router.decide(input)
 *        Plan  ← PlanBuilder.build(route)
 *        PipelineHandle ← startPipeline(route.flowId, ctx, overrides)
 *
 * Feature-flagged: callers should check workflow.orchestrator.enabled
 * (see docs/architecture/ablation-experiment-framework.md) before
 * delegating here. This module does not read the flag itself so it can be
 * independently unit-tested.
 *
 * Out-of-scope for Phase 1:
 *   - Plan persistence (.nkplan) — Phase 2
 *   - Interactive Plan card / matrix UI — Phase 1.5
 *   - LLM Router — Phase 3
 *
 * See docs/development/workflow-orchestration-impl-plan.md §4.
 */

import type { Platform } from '@neko/platform';
import { Workflow } from '@neko/platform';
import type { FlowId, PipelineContext, PipelineHandle } from '@neko/agent/pipeline';
import { getLogger } from '../base';
import {
  isLLMRouterEnabled as _isLLMRouterEnabled,
  readWorkflowSettings,
} from './workflow-settings';

type AssetLibrary = Workflow.AssetLibrary;
type LitePlan = Workflow.LitePlan;
type MatchingEngine = Workflow.MatchingEngine;
type PlanStore = Workflow.PlanStore;
type RawInput = Workflow.RawInput;
type Route = Workflow.Route;
type Router = Workflow.Router;
type RouterOverrides = Workflow.RouterOverrides;

const logger = getLogger('OrchestratorBootstrap');

// =============================================================================
// Types
// =============================================================================

export interface OrchestratorBootstrapOptions {
  platform: Platform;
  workDir: string | undefined;
  startPipeline: (
    flowId: FlowId,
    ctx: PipelineContext,
    overrides?: {
      skipStages?: string[];
      globalStyle?: string;
      userCheckpoints?: string[];
    },
  ) => PipelineHandle;
}

export interface RoutedPipelineRequest {
  input: RawInput;
  /** Optional per-request router overrides (e.g., from user "make a short video" hint) */
  routerOverrides?: RouterOverrides;
  /** Optional global-style override passed through to the pipeline */
  globalStyle?: string;
  /** Additional pipeline context fields (source, sourceFormat, etc.) */
  contextOverrides?: Partial<PipelineContext>;
  /**
   * Existing plan to dispatch (skipping Router+PlanBuilder). Used for
   * approved / forked plans where the caller has already staged the edits.
   */
  plan?: LitePlan;
}

export interface RoutedPipelineResult {
  route: Route;
  plan: LitePlan;
  handle: PipelineHandle;
}

export interface Orchestrator {
  readonly router: Router;
  readonly assetLibrary: AssetLibrary | undefined;
  readonly matchingEngine: MatchingEngine;
  readonly planBuilder: Workflow.PlanBuilder;
  readonly consistencyChecker: Workflow.ConsistencyChecker;
  /** Optional persistent store (available when a workspace folder exists). */
  readonly planStore: PlanStore | undefined;
  /** Phase 3 LLM router, undefined when the feature flag is off. */
  readonly llmRouter: Workflow.LLMRouter | undefined;
  /** Phase 3 router memory (recent decisions), undefined when no workDir / file IO. */
  readonly routerMemory: Workflow.RouterMemory | undefined;

  /**
   * Build a plan from a raw input and dispatch it to the pipeline.
   *
   * Phase 1 MVP: auto-approves the plan (no interactive UI yet).
   */
  startRoutedPipeline(req: RoutedPipelineRequest): Promise<RoutedPipelineResult>;

  /** Probe an input to get a plan WITHOUT dispatching. Useful for UI previews. */
  buildPlan(
    input: RawInput,
    overrides?: RouterOverrides,
  ): Promise<{ route: Route; plan: LitePlan }>;

  dispose(): void;
}

// =============================================================================
// Implementation
// =============================================================================

export async function bootstrapOrchestrator(
  options: OrchestratorBootstrapOptions,
): Promise<Orchestrator> {
  const settings = readWorkflowSettings();
  const matchingEngine = createMatchingEngineFromSettings(settings);
  const consistencyChecker = Workflow.createConsistencyChecker();

  // AssetLibrary is optional in Phase 1 — only load when a workspace dir exists
  // AND the required data files are readable. A missing library still allows
  // routing / plan generation; bindings will be empty.
  const assetLibrary = await tryCreateAssetLibrary(options.workDir);
  const planStore = await tryCreatePlanStore(options.workDir);

  // Phase 3: optional LLMRouter + RouterMemory behind the
  // `neko.workflow.router.llm.enabled` flag.
  const routerMemory = await tryCreateRouterMemory(options.workDir);
  const llmRouter = _isLLMRouterEnabled()
    ? tryCreateLLMRouter(options.platform, routerMemory, assetLibrary, settings)
    : undefined;

  const router = Workflow.createRouter({
    ...(llmRouter !== undefined && { llmRouter }),
    ...(routerMemory !== undefined && { memory: routerMemory }),
    ...(options.workDir !== undefined && { workDir: options.workDir }),
  });

  const planBuilder = Workflow.createPlanBuilder({
    consistencyChecker,
    ...(assetLibrary !== undefined && {
      matchingEngine,
      assetLibrary,
    }),
  });

  return {
    router,
    assetLibrary,
    matchingEngine,
    planBuilder,
    consistencyChecker,
    planStore,
    llmRouter,
    routerMemory,

    async startRoutedPipeline(req: RoutedPipelineRequest): Promise<RoutedPipelineResult> {
      let route: Route;
      let plan: LitePlan;
      if (req.plan) {
        plan = req.plan;
        route = req.plan.route;
      } else {
        route = await router.decide(req.input, req.routerOverrides);
        plan = await planBuilder.build({ route });
      }

      const userCheckpoints = plan.stages
        .filter((s) => s.userCheckpoint === true && !s.skipped)
        .map((s) => s.id);

      logger.info('Routed pipeline', {
        routeLevel: route.level,
        flowId: route.flowId,
        skipStages: route.skipStages,
        reason: route.reason,
        userCheckpoints,
      });

      const ctx: PipelineContext = {
        ...buildBaseContext(req.input),
        ...req.contextOverrides,
      };

      const handle = options.startPipeline(route.flowId, ctx, {
        skipStages: [...route.skipStages],
        ...(req.globalStyle !== undefined && { globalStyle: req.globalStyle }),
        ...(userCheckpoints.length > 0 && { userCheckpoints }),
      });

      return { route, plan, handle };
    },

    async buildPlan(input, overrides) {
      const route = await router.decide(input, overrides);
      const plan = await planBuilder.build({ route });
      return { route, plan };
    },

    dispose() {
      assetLibrary?.dispose();
    },
  };
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Build the matching engine chain based on live workflow settings.
 *
 * Phase 1 default: L1 / L5 / L2 (no options → `createMatchingEngine()`).
 *
 * Phase 4.1: when `matching.semantic.enabled` is true we plug in an L3
 * SemanticMatcher with an `UnimplementedClipProvider` — the matcher
 * short-circuits silently via `ClipUnavailableError`, so enabling the
 * flag is harmless until the engine-side CLIP binding ships.  At that
 * point the production wire-up can swap the provider (and an embedding
 * cache) without touching the chain topology.
 *
 * Similarly, `matching.llm.enabled` installs an L4 LLMMatcher backed by
 * `DisabledLLMMatchBroker` so the flag can be flipped on without the
 * chain actually calling any LLM until a real broker is injected.
 */
export function createMatchingEngineFromSettings(settings: {
  matchingSemanticEnabled: boolean;
  matchingLlmEnabled: boolean;
}): MatchingEngine {
  const semanticEnabled = settings.matchingSemanticEnabled;
  const llmEnabled = settings.matchingLlmEnabled;
  if (!semanticEnabled && !llmEnabled) return Workflow.createMatchingEngine();
  return Workflow.createFullMatchingEngine({
    ...(semanticEnabled && {
      semantic: { clip: new Workflow.UnimplementedClipProvider() },
    }),
    ...(llmEnabled && {
      llm: { broker: Workflow.DisabledLLMMatchBroker },
    }),
  });
}

async function tryCreateAssetLibrary(
  workDir: string | undefined,
): Promise<AssetLibrary | undefined> {
  if (!workDir) return undefined;
  try {
    return await Workflow.createAssetLibrary({
      workDir,
      loadCharacterRegistry: async () => loadJsonIfExists(workDir, '.neko/characters.json'),
      loadEntityGraph: async () => loadJsonIfExists(workDir, '.neko/.cache/asset-graph.json'),
      // Asset manifest discovery is non-trivial; Phase 1 returns [] and
      // lets other subsystems (BatchGenerationScheduler, canvas API) feed
      // assets directly into memory when they're actually needed.
      loadAssetManifests: async () => [],
    });
  } catch (err) {
    logger.warn('AssetLibrary bootstrap failed — continuing without it', {
      error: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}

async function tryCreatePlanStore(workDir: string | undefined): Promise<PlanStore | undefined> {
  if (!workDir) return undefined;
  try {
    const fileIO = await Workflow.createNodeFileIO();
    return new Workflow.PlanStore({ workDir, fileIO });
  } catch (err) {
    logger.warn('PlanStore bootstrap failed — continuing without persistence', {
      error: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}

// =============================================================================
// Phase 3 helpers — RouterMemory + LLMRouter
// =============================================================================

async function tryCreateRouterMemory(
  workDir: string | undefined,
): Promise<Workflow.RouterMemory | undefined> {
  if (!workDir) return undefined;
  try {
    const pathMod = await import('node:path');
    const memoryPath = pathMod.join(workDir, '.neko', 'memory.md');
    const { createFileProjectMemoryManager } = await import('@neko/agent');
    const fileMemory = createFileProjectMemoryManager(memoryPath);
    await fileMemory.load();
    return new Workflow.RouterMemory(fileMemory);
  } catch (err) {
    logger.warn('RouterMemory bootstrap failed — continuing without memory', {
      error: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}

function tryCreateLLMRouter(
  platform: Platform,
  memory: Workflow.RouterMemory | undefined,
  assetLibrary: AssetLibrary | undefined,
  settings: { routerLlmBudgetMs: number; routerAskTimeoutMs: number },
): Workflow.LLMRouter | undefined {
  try {
    const service = platform.createService();
    const chat: Workflow.LLMChatFn = async (messages, chatOptions) => {
      // Service.chat forwards the options onward; the modelId / tools /
      // signal / toolChoice all pass through verbatim.
      const response = await service.chat(messages, chatOptions);
      // Service returns ServiceResponse which extends ChatResponse with
      // routing/timing metadata — downcast is safe.
      return response;
    };
    return new Workflow.LLMRouter({
      chat,
      budgetMs: settings.routerLlmBudgetMs,
      askTimeoutMs: settings.routerAskTimeoutMs,
      ...(memory !== undefined && { memory }),
      ...(assetLibrary !== undefined && { assetLibrary }),
    });
  } catch (err) {
    logger.warn('LLMRouter bootstrap failed — falling back to FastProbe only', {
      error: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}

async function loadJsonIfExists<T>(workDir: string, relPath: string): Promise<T | undefined> {
  try {
    const fsp = await import('node:fs/promises');
    const pathMod = await import('node:path');
    const abs = pathMod.join(workDir, relPath);
    const raw = await fsp.readFile(abs, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

function buildBaseContext(input: RawInput): PipelineContext {
  switch (input.kind) {
    case 'prompt':
      return { source: input.text, sourceFormat: 'freeform' };
    case 'file':
      return { source: input.path, sourceFormat: inferFormat(input.path) };
    case 'files':
      return { source: input.paths.join('\n'), sourceFormat: 'freeform' };
    case 'project':
      return { source: input.path, sourceFormat: 'freeform' };
  }
}

function inferFormat(path: string): PipelineContext['sourceFormat'] {
  const lower = path.toLowerCase();
  if (lower.endsWith('.fountain')) return 'fountain';
  if (
    lower.endsWith('.txt') ||
    lower.endsWith('.md') ||
    lower.endsWith('.docx') ||
    lower.endsWith('.pdf')
  ) {
    return 'document';
  }
  return 'freeform';
}

// =============================================================================
// Feature flag helper (placeholder until Ablation framework wiring lands)
// =============================================================================

// Settings are centralised in workflow-settings.ts so the package.json
// `contributes.configuration` and runtime defaults stay in one place.
export {
  isOrchestratorEnabled,
  isLLMRouterEnabled,
  readWorkflowSettings,
  WORKFLOW_SETTING_KEYS,
  WORKFLOW_SETTING_DEFAULTS,
  WORKFLOW_SETTINGS_SECTION,
  type WorkflowSettings,
  type WorkflowSettingKey,
} from './workflow-settings';

/** Deprecated — kept for backward compat with older callers. */
export const ORCHESTRATOR_FLAG_ID = 'workflow.orchestrator.enabled';
/** Deprecated — kept for backward compat with older callers. */
export const LLM_ROUTER_FLAG_ID = 'workflow.router.llm.enabled';
