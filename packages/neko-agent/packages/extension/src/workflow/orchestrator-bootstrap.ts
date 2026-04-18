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

import * as vscode from 'vscode';
import type { Platform } from '@neko/platform';
import { Workflow } from '@neko/platform';
import type { FlowId, PipelineContext, PipelineHandle } from '@neko/agent/pipeline';
import { getLogger } from '../base';

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
    overrides?: { skipStages?: string[]; globalStyle?: string },
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
  /** Optional persistent store (available when a workspace folder exists). */
  readonly planStore: PlanStore | undefined;

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
  const router = Workflow.createRouter();
  const matchingEngine = Workflow.createMatchingEngine();
  const consistencyChecker = Workflow.createConsistencyChecker();

  // AssetLibrary is optional in Phase 1 — only load when a workspace dir exists
  // AND the required data files are readable. A missing library still allows
  // routing / plan generation; bindings will be empty.
  const assetLibrary = await tryCreateAssetLibrary(options.workDir);
  const planStore = await tryCreatePlanStore(options.workDir);

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
    planStore,

    async startRoutedPipeline(req: RoutedPipelineRequest): Promise<RoutedPipelineResult> {
      const route = await router.decide(req.input, req.routerOverrides);
      const plan = await planBuilder.build({ route });

      logger.info('Routed pipeline', {
        routeLevel: route.level,
        flowId: route.flowId,
        skipStages: route.skipStages,
        reason: route.reason,
      });

      const ctx: PipelineContext = {
        ...buildBaseContext(req.input),
        ...req.contextOverrides,
      };

      const handle = options.startPipeline(route.flowId, ctx, {
        skipStages: [...route.skipStages],
        ...(req.globalStyle !== undefined && { globalStyle: req.globalStyle }),
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

const FLAG_ID = 'workflow.orchestrator.enabled';

/**
 * Reads the workflow.orchestrator.enabled flag from VSCode settings.
 * Phase 1: simple settings lookup; Phase 2 will route through AblationToggles.
 */
export function isOrchestratorEnabled(): boolean {
  const cfg = vscode.workspace.getConfiguration('neko.workflow');
  return cfg.get<boolean>('orchestrator.enabled', false);
}

export { FLAG_ID as ORCHESTRATOR_FLAG_ID };
