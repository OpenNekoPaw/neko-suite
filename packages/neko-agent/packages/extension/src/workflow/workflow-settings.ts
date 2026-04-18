/**
 * Workflow settings helper — single source of truth for reading the
 * `neko.workflow.*` family of VSCode settings.
 *
 * Keeps call sites (orchestrator bootstrap, handler, commands) from each
 * building their own `getConfiguration` call + default list.  Also
 * centralises the defaults so the package.json `contributes.configuration`
 * stays in sync with runtime behaviour.
 *
 * See docs/architecture/workflow-routing.md §11 for the feature flag list.
 */

import * as vscode from 'vscode';

// =============================================================================
// Config keys (mirrored in package.json contributes.configuration)
// =============================================================================

/** The VSCode settings namespace used by the helpers below. */
export const WORKFLOW_SETTINGS_SECTION = 'neko.workflow';

/** Settings keys, relative to `WORKFLOW_SETTINGS_SECTION`. */
export const WORKFLOW_SETTING_KEYS = {
  /** Phase 1: orchestrator + plan-mode master switch */
  orchestratorEnabled: 'orchestrator.enabled',
  /** Phase 3: LLM router (off by default) */
  routerLlmEnabled: 'router.llm.enabled',
  /** Phase 3: wall-clock budget for LLM routing, in ms */
  routerLlmBudgetMs: 'router.llm.budgetMs',
  /** Phase 3.5: timeout for ask_user clarifying questions, in ms */
  routerAskTimeoutMs: 'router.askTimeoutMs',
  /** Phase 1.5: auto-approve threshold for plan preview (0..1, 1.1 = never). */
  planAutoApproveThreshold: 'plan.autoApproveThreshold',
  /** Phase 2: consistency checker on/off */
  consistencyEnabled: 'consistency.enabled',
  /** Phase 1: L5 continuity matcher on/off */
  matchingContinuityEnabled: 'matching.continuity.enabled',
  /** Phase 4: L3 semantic (CLIP) matcher on/off */
  matchingSemanticEnabled: 'matching.semantic.enabled',
  /** Phase 4: L4 LLM tie-breaker on/off */
  matchingLlmEnabled: 'matching.llm.enabled',
} as const;

export type WorkflowSettingKey = (typeof WORKFLOW_SETTING_KEYS)[keyof typeof WORKFLOW_SETTING_KEYS];

// =============================================================================
// Defaults (mirror package.json contributes.configuration)
// =============================================================================

export const WORKFLOW_SETTING_DEFAULTS = {
  orchestratorEnabled: false,
  routerLlmEnabled: false,
  routerLlmBudgetMs: 2000,
  routerAskTimeoutMs: 60_000,
  /** 1.1 disables auto-approve because confidence ≤ 1.0 never exceeds it. */
  planAutoApproveThreshold: 1.1,
  consistencyEnabled: true,
  matchingContinuityEnabled: true,
  matchingSemanticEnabled: false,
  matchingLlmEnabled: false,
} as const;

// =============================================================================
// Settings snapshot
// =============================================================================

export interface WorkflowSettings {
  orchestratorEnabled: boolean;
  routerLlmEnabled: boolean;
  routerLlmBudgetMs: number;
  routerAskTimeoutMs: number;
  planAutoApproveThreshold: number;
  consistencyEnabled: boolean;
  matchingContinuityEnabled: boolean;
  matchingSemanticEnabled: boolean;
  matchingLlmEnabled: boolean;
}

/**
 * Read a fresh snapshot of all workflow settings.  Each call hits the
 * VSCode configuration surface, so the result reflects any user edit made
 * since the last call.  Cheap enough to call per-operation.
 *
 * Pass `override` to inject settings in tests without touching the
 * VSCode layer.
 */
export function readWorkflowSettings(override?: {
  getConfiguration?: typeof vscode.workspace.getConfiguration;
}): WorkflowSettings {
  const getCfg = override?.getConfiguration ?? vscode.workspace.getConfiguration;
  const cfg = getCfg(WORKFLOW_SETTINGS_SECTION);
  return {
    orchestratorEnabled: cfg.get<boolean>(
      WORKFLOW_SETTING_KEYS.orchestratorEnabled,
      WORKFLOW_SETTING_DEFAULTS.orchestratorEnabled,
    ),
    routerLlmEnabled: cfg.get<boolean>(
      WORKFLOW_SETTING_KEYS.routerLlmEnabled,
      WORKFLOW_SETTING_DEFAULTS.routerLlmEnabled,
    ),
    routerLlmBudgetMs: clampNumber(
      cfg.get<number>(
        WORKFLOW_SETTING_KEYS.routerLlmBudgetMs,
        WORKFLOW_SETTING_DEFAULTS.routerLlmBudgetMs,
      ),
      { min: 250, max: 60_000, fallback: WORKFLOW_SETTING_DEFAULTS.routerLlmBudgetMs },
    ),
    routerAskTimeoutMs: clampNumber(
      cfg.get<number>(
        WORKFLOW_SETTING_KEYS.routerAskTimeoutMs,
        WORKFLOW_SETTING_DEFAULTS.routerAskTimeoutMs,
      ),
      { min: 1000, max: 600_000, fallback: WORKFLOW_SETTING_DEFAULTS.routerAskTimeoutMs },
    ),
    planAutoApproveThreshold: clampAutoApprove(
      cfg.get<number>(
        WORKFLOW_SETTING_KEYS.planAutoApproveThreshold,
        WORKFLOW_SETTING_DEFAULTS.planAutoApproveThreshold,
      ),
    ),
    consistencyEnabled: cfg.get<boolean>(
      WORKFLOW_SETTING_KEYS.consistencyEnabled,
      WORKFLOW_SETTING_DEFAULTS.consistencyEnabled,
    ),
    matchingContinuityEnabled: cfg.get<boolean>(
      WORKFLOW_SETTING_KEYS.matchingContinuityEnabled,
      WORKFLOW_SETTING_DEFAULTS.matchingContinuityEnabled,
    ),
    matchingSemanticEnabled: cfg.get<boolean>(
      WORKFLOW_SETTING_KEYS.matchingSemanticEnabled,
      WORKFLOW_SETTING_DEFAULTS.matchingSemanticEnabled,
    ),
    matchingLlmEnabled: cfg.get<boolean>(
      WORKFLOW_SETTING_KEYS.matchingLlmEnabled,
      WORKFLOW_SETTING_DEFAULTS.matchingLlmEnabled,
    ),
  };
}

// =============================================================================
// Convenience readers (compat with existing isFoo() callers)
// =============================================================================

export function isOrchestratorEnabled(): boolean {
  return readWorkflowSettings().orchestratorEnabled;
}

export function isLLMRouterEnabled(): boolean {
  return readWorkflowSettings().routerLlmEnabled;
}

export function getPlanAutoApproveThreshold(): number {
  return readWorkflowSettings().planAutoApproveThreshold;
}

// =============================================================================
// Internals
// =============================================================================

function clampNumber(
  value: number,
  { min, max, fallback }: { min: number; max: number; fallback: number },
): number {
  if (!Number.isFinite(value)) return fallback;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Auto-approve threshold is typically 0..1 (confidence score) but we
 * deliberately allow 1.1 as a sentinel "never auto-approve".  Accept any
 * finite number in [0, 1.1]; clamp out-of-range to the default.
 */
function clampAutoApprove(value: number): number {
  if (!Number.isFinite(value)) return WORKFLOW_SETTING_DEFAULTS.planAutoApproveThreshold;
  if (value < 0) return 0;
  if (value > 1.1) return 1.1;
  return value;
}
