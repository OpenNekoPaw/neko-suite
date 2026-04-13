/**
 * Pipeline Types — Contract-first type definitions for the Pipeline orchestration layer
 *
 * Pipeline sits at L2 in the architecture:
 *   L3 User Entry   → Skill matching → Pipeline selection
 *   L2 Pipeline     → Stage chain execution + progress aggregation (this layer)
 *   L1 Task Engine  → TaskManager / AgentExecutor (existing)
 *   L0 Atomic       → MediaGeneration / NekoCutAPI / Parser (existing)
 */

import type { CreatedCanvasStoryboard, StoryScenePlan, StoryShotPlan } from '@neko/shared';

// =============================================================================
// Stage Types
// =============================================================================

/**
 * Stage execution mode
 * - linear:   Execute once, pass through
 * - parallel: Multiple concurrent tasks, merge results
 * - reactive: Execute → evaluate → retry loop (Phase 3+, interface only)
 */
export type StageType = 'linear' | 'parallel' | 'reactive';

/**
 * Gate behavior between stages
 * - auto:    Proceed automatically
 * - confirm: Pause and wait for user confirmation
 */
export type GateType = 'auto' | 'confirm';

/**
 * Base interface for all Pipeline stages
 */
export interface IPipelineStage<TCtx extends PipelineContext = PipelineContext> {
  /** Unique stage name */
  readonly name: string;
  /** Execution mode */
  readonly type: StageType;
  /** Whether to pause for user confirmation before this stage */
  readonly gate: GateType;
  /** Execute the stage logic */
  execute(ctx: TCtx): Promise<TCtx>;
}

/**
 * Parallel stage — spawns multiple concurrent tasks and merges results
 */
export interface IParallelStage<
  TCtx extends PipelineContext = PipelineContext,
> extends IPipelineStage<TCtx> {
  readonly type: 'parallel';
  /** Create parallel tasks from context */
  tasks(ctx: TCtx): ParallelTask[];
  /** Merge task results back into context */
  merge(ctx: TCtx, results: ParallelTaskResult[]): TCtx;
}

/**
 * Reactive stage — execute → evaluate → decide loop (Phase 3+ implementation)
 */
export interface IReactiveStage<
  TCtx extends PipelineContext = PipelineContext,
> extends IPipelineStage<TCtx> {
  readonly type: 'reactive';
  /** Maximum iterations to prevent infinite loops */
  readonly maxIterations: number;
  /** Evaluate execution result and decide next action */
  evaluate(ctx: TCtx): Promise<EvalResult>;
}

// =============================================================================
// Parallel Task Types
// =============================================================================

/** A single task within a parallel stage */
export interface ParallelTask {
  /** Task identifier (for progress tracking) */
  id: string;
  /** Human-readable task name */
  name: string;
  /** Execute the task */
  execute(): Promise<ParallelTaskResult>;
}

/** Result of a parallel task */
export interface ParallelTaskResult {
  id: string;
  success: boolean;
  /** Output data (media path, etc.) */
  data?: unknown;
  error?: string;
}

// =============================================================================
// Reactive Evaluation (Phase 3+)
// =============================================================================

/** Result of a reactive stage evaluation */
export interface EvalResult {
  /** Decision: pass through, retry with adjustments, or escalate to user/agent */
  verdict: 'pass' | 'retry' | 'escalate';
  /** Quality score (0-1) */
  score?: number;
  /** Explanation of the evaluation */
  reason?: string;
  /** Context adjustments for retry */
  adjustments?: Partial<PipelineContext>;
}

// =============================================================================
// Pipeline Context (data flowing between stages)
// =============================================================================

/** Storyboard scene — output of parseStoryboard stage */
export interface StoryboardScene {
  /** Scene index (0-based) */
  index: number;
  /** Stable story scene ID when the source came from ScriptIndex */
  sceneId?: string;
  /** Scene heading (e.g., "INT. COFFEE SHOP - DAY") */
  heading: string;
  /** Visual description of the scene */
  description: string;
  /** Dialogue lines */
  dialogue: string[];
  /** Estimated duration in seconds */
  estimatedDuration: number;
  /** AI-generated video prompt for this scene */
  suggestedPrompt: string;
  /** Semantic shot plan source when available */
  shotPlans?: readonly StoryShotPlan[];
}

/**
 * Pipeline context — mutable data bag passed between stages.
 * Each stage reads what it needs and writes its outputs.
 */
export interface PipelineContext {
  // — Input —
  /** Source file path or inline text */
  source?: string;
  /** Source format hint */
  sourceFormat?: 'fountain' | 'freeform' | 'document';
  /** Extracted document text (from readDocument stage) */
  documentText?: string;

  // — Storyboard —
  /** Structured scenes (from parseStoryboard stage) */
  scenes?: StoryboardScene[];
  /** Deterministic semantic scene plans (for downstream canvas import) */
  scenePlans?: readonly StoryScenePlan[];
  /** Result of importing semantic storyboard into canvas */
  canvasStoryboard?: CreatedCanvasStoryboard;
  /** Generation granularity — 'scene' generates one media per scene, 'shot' generates per shot */
  generationUnit?: 'scene' | 'shot';

  // — Generation —
  /** Batch ID for tracking parallel generation */
  batchId?: string;
  /** Task IDs for each generated scene/shot */
  taskIds?: string[];
  /** Local file paths of generated media (aligned with generation units) */
  generatedPaths?: string[];
  /** Scene indices that failed generation (scene mode) */
  failedScenes?: number[];
  /** Shot task IDs that failed generation (shot mode, format: "scene-{i}-shot-{j}") */
  failedShots?: string[];

  // — Pilot —
  /** Generated pilot scene path (from generatePilot stage) */
  pilotPath?: string;
  /** Index of the pilot scene */
  pilotSceneIndex?: number;

  // — Timeline —
  /** Element IDs added to timeline */
  elementIds?: string[];
  /** Total duration of arranged timeline */
  totalDuration?: number;

  // — Global settings —
  /** Global visual style (e.g., "anime", "cinematic", "corporate") */
  globalStyle?: string;
  /** Video resolution */
  resolution?: string;
  /** Aspect ratio */
  aspectRatio?: string;

  // — Extensible —
  /** Stage-specific parameters (from Skill frontmatter pipeline-params) */
  stageParams?: Record<string, Record<string, unknown>>;

  /** Allow additional properties for custom stages */
  [key: string]: unknown;
}

// =============================================================================
// Pipeline Configuration (parsed from Skill frontmatter)
// =============================================================================

/** Flow identifiers — predefined stage combinations */
export type FlowId = 'flowA' | 'flowB' | 'flowC' | 'flowD' | 'flowE' | 'flowF';

/** Hook configuration for injecting custom logic before/after stages */
export interface StageHookConfig {
  /** Target stage name (or '*' for all stages) */
  stageName: string;
  /** When to execute relative to the stage */
  timing: 'before' | 'after';
  /** Hook action identifier */
  action: string;
  /** Hook parameters */
  params?: Record<string, unknown>;
}

/**
 * Pipeline configuration — resolved from Skill frontmatter pipeline-* fields
 */
export interface PipelineConfig {
  /** Which flow to execute */
  flowId: FlowId;
  /** Stages to skip */
  skipStages?: string[];
  /** Per-stage parameter overrides */
  stageParams?: Record<string, Record<string, unknown>>;
  /** Hooks to inject */
  hooks?: StageHookConfig[];
  /** Global style override */
  globalStyle?: string;
}

// =============================================================================
// Pipeline Events (for progress tracking and UI)
// =============================================================================

/** Events emitted during pipeline execution */
export type PipelineEvent =
  | { type: 'pipeline_start'; flowId: FlowId; stages: string[] }
  | { type: 'stage_start'; stage: string; index: number; total: number }
  | { type: 'stage_complete'; stage: string }
  | { type: 'stage_skipped'; stage: string; reason: string }
  | { type: 'gate_waiting'; stage: string; preview: unknown }
  | { type: 'gate_confirmed'; stage: string }
  | { type: 'gate_cancelled'; stage: string }
  | { type: 'task_progress'; stage: string; taskId: string; progress: number; total: number }
  | { type: 'pipeline_complete'; result: PipelineContext }
  | { type: 'pipeline_error'; error: string; stage: string };

// =============================================================================
// Pipeline Executor Interface
// =============================================================================

/** Pipeline execution handle (returned by executor) */
export interface PipelineHandle {
  /** Unique pipeline execution ID */
  readonly id: string;
  /** Flow being executed */
  readonly flowId: FlowId;

  /** Confirm a pending gate */
  confirmGate(modifications?: Partial<PipelineContext>): void;
  /** Cancel a pending gate (aborts pipeline) */
  cancelGate(): void;
  /** Cancel the entire pipeline */
  cancel(): void;

  /** Event stream */
  readonly events: AsyncIterable<PipelineEvent>;
  /** Final result (resolves when pipeline completes) */
  readonly result: Promise<PipelineContext>;
}

/** Pipeline executor — runs a stage chain */
export interface IPipelineExecutor {
  execute(
    stages: IPipelineStage[],
    config: PipelineConfig,
    initialCtx: PipelineContext,
  ): PipelineHandle;
}

// =============================================================================
// Pipeline Registry Interface
// =============================================================================

/** Pipeline registry — manages stage pool and flow definitions */
export interface IPipelineRegistry {
  /** Register a stage implementation */
  registerStage(stage: IPipelineStage): void;
  /** Get a registered stage by name */
  getStage(name: string): IPipelineStage | undefined;
  /** List all registered stages */
  listStages(): string[];

  /** Get stages for a flow */
  getFlow(flowId: FlowId): IPipelineStage[];
  /** List all available flows */
  listFlows(): { id: FlowId; stages: string[] }[];
}

// =============================================================================
// Pipeline Run Report (P0: execution diagnostics)
// =============================================================================

/** Per-stage execution record within a pipeline run */
export interface StageRecord {
  /** Stage name */
  name: string;
  /** Execution outcome */
  status: 'success' | 'failed' | 'skipped';
  /** Wall-clock duration in milliseconds */
  durationMs: number;
  /** Error message if status is 'failed' */
  error?: string;
  /** Reason if status is 'skipped' */
  skipReason?: string;
}

/** Scene-level summary within a pipeline run report */
export interface SceneSummary {
  /** Total scene count from storyboard */
  total: number;
  /** Successfully generated scenes */
  generated: number;
  /** Failed scene count */
  failed: number;
  /** Indices of failed scenes (for retry) */
  failedIndices: number[];
}

/** Complete pipeline execution report */
export interface PipelineRunReport {
  /** Pipeline execution ID (matches PipelineHandle.id) */
  id: string;
  /** Flow that was executed */
  flowId: FlowId;
  /** ISO 8601 timestamp when pipeline started */
  startedAt: string;
  /** ISO 8601 timestamp when pipeline completed/failed */
  completedAt: string;
  /** Overall execution outcome */
  status: 'completed' | 'failed' | 'cancelled';
  /** Per-stage execution records */
  stages: StageRecord[];
  /** Final (or partial) pipeline context */
  finalContext: PipelineContext;
  /** Index of the stage that caused failure (undefined if completed) */
  failedStageIndex?: number;
  /** Scene generation summary (populated when batchGenerate stage ran) */
  sceneSummary?: SceneSummary;
}
