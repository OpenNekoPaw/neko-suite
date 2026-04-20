/**
 * Workflow Orchestration Types — Contract-first definitions
 *
 * See docs/architecture/workflow-routing.md for the Workflow layer contract
 * and docs/architecture/workflow-orchestration.md for the umbrella overview.
 *
 * Layering:
 *   Workflow layer (this file + ./router)  → "which flow to run"
 *   Plan layer (./plan)                     → "what specifically to do"
 *   Pipeline layer (@neko/agent pipeline)   → "execute it"
 */

import type { FlowId, WorkflowConfig } from '@neko/agent/workflow';

// =============================================================================
// Route Level (L0..L4)
// =============================================================================

/**
 * Route level classification — maps to complexity of the creative workflow.
 *
 * See docs/architecture/workflow-routing.md §3 for the full definition.
 *
 * - L0: prompt → agent 直出（一句话 / 单镜头）
 * - L1: prompt → 分镜 → batch gen → cut（MV / 短视频）
 * - L2: 素材 → 解析 → 分镜 → 锚定 → gen → cut（广告片 / 预告片）
 * - L3: 长文本 → 剧本 → 分镜 → 角色表 → gen → cut（短剧 / 微电影）
 * - L4: 漫画 → 视觉解析 → 重绘 → 分镜 → gen → cut（动漫改编）
 */
export type RouteLevel = 'L0' | 'L1' | 'L2' | 'L3' | 'L4';

// =============================================================================
// Extension Identifiers
// =============================================================================

/** Entry extension for a route (where the user's journey starts) */
export type ExtensionId = 'agent' | 'story' | 'canvas' | 'sketch' | 'cut' | 'preview';

// =============================================================================
// Input / Probe
// =============================================================================

/**
 * Raw input handed to the Router.
 *
 * One of: text prompt, a file, a set of files, or a project reference.
 */
export type RawInput =
  | { kind: 'prompt'; text: string }
  | { kind: 'file'; path: string; size?: number }
  | { kind: 'files'; paths: string[]; totalSize?: number }
  | { kind: 'project'; path: string; workflow?: string };

/**
 * Context extracted from the raw input by InputProbe.
 *
 * See docs/architecture/workflow-routing.md §5 for probe dimensions.
 */
export interface ProbeContext {
  /** Source kind (normalized from RawInput) */
  inputType: 'prompt' | 'text' | 'file' | 'images' | 'project';
  /** Text length in characters (for prompt/text inputs) */
  textLength?: number;
  /** File extension (without dot, lowercase) */
  fileExt?: string;
  /** Number of files (for multi-file drops) */
  fileCount?: number;
  /** Extension that received the drop (explicit user intent) */
  dropTarget?: ExtensionId;
  /** Free-form hint from user ("make a short video", etc.) */
  userHint?: string;
  /** Reference to an existing project (.nkproj path) */
  existingProject?: string;
  /** Raw input echo for downstream consumers */
  raw: RawInput;
}

// =============================================================================
// FastProbe Output
// =============================================================================

/**
 * Result of the deterministic rule-based FastProbe.
 *
 * - confidence ≥ 0.9 → commit directly (skip LLMRouter)
 * - 0.6 ≤ confidence < 0.9 → use as hint, let LLMRouter refine
 * - confidence < 0.6 → ambiguous, fall through to LLMRouter
 *
 * See docs/architecture/workflow-routing.md §4 for the three-layer routing model.
 */
export interface FastProbeResult {
  /** 0..1 confidence in this decision */
  confidence: number;
  /** Chosen route level (undefined when rules don't fire at all) */
  route?: RouteLevel;
  /** Entry extension */
  entryExtension?: ExtensionId;
  /** Stages to skip (subset of pipeline stage names) */
  skipStages: string[];
  /** Human-readable reason (shown in Plan card) */
  reason: string;
}

// =============================================================================
// Route (Workflow layer's final output, handed to Plan layer)
// =============================================================================

/**
 * A concrete route decision, ready to be consumed by PlanBuilder.
 *
 * This is the contract between Workflow layer and Plan layer.
 * See docs/architecture/plan-mode.md §9 for how Plan layer consumes it.
 */
export interface Route {
  /** Route level classification */
  level: RouteLevel;
  /** Which pipeline flow this route maps to */
  flowId: FlowId;
  /** Entry extension */
  entryExtension: ExtensionId;
  /** Stages to skip */
  skipStages: string[];
  /** Per-stage parameter overrides */
  stageParams?: Record<string, Record<string, unknown>>;
  /** Human-readable reason (for chat card + audit log) */
  reason: string;
  /** 0..1 confidence at decision time */
  confidence: number;
  /** Which layer produced this decision */
  provenance: 'rules' | 'llm' | 'user-override' | 'memory';
}

/**
 * A route recipe in the RouteRegistry — static definition per RouteLevel.
 */
export interface RouteRecipe {
  level: RouteLevel;
  flowId: FlowId;
  entryExtension: ExtensionId;
  skipStages: string[];
  defaultStageParams?: Record<string, Record<string, unknown>>;
  description: string;
}

// =============================================================================
// Router Interface
// =============================================================================

/**
 * User-supplied overrides at decision time.
 *
 * `forceLevel` bypasses FastProbe entirely (used when user says "做个短剧" L3 or "直接生成" L0).
 * `skipPlanMode` forces execution without the Plan step (dangerous; only for power users).
 */
export interface RouterOverrides {
  forceLevel?: RouteLevel;
  skipPlanMode?: boolean;
  /** Deny list for specific LLM router tools, for testing/debug */
  disableLlmRouter?: boolean;
}

/**
 * The Router façade.
 *
 * Contract: given an input + optional overrides, return a Route.
 * Phase 1 MVP implementation is FastProbe-only; Phase 3 adds LLMRouter.
 */
export interface IRouter {
  decide(input: RawInput, overrides?: RouterOverrides): Promise<Route>;
}

// =============================================================================
// Re-export of pipeline config (convenience for consumers)
// =============================================================================

export type { FlowId, WorkflowConfig };
