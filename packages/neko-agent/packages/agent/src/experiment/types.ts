/**
 * Ablation Experiment Framework — Type Definitions
 *
 * Lightweight experiment infrastructure for measuring subsystem impact.
 * Provides independent toggles, each targeting a single indivisible feature unit.
 */

import type { AgentResult } from '@neko/shared';
import type { NarrativePreviewFeatureToggles } from '@neko/shared';
import type { AgentLegacyCreationTrace } from '@neko-agent/types';
import type { PermissionMode } from '../permission/types';
import type { AgentSessionConfig, ExecutionContext } from '../session/types';

export type AgentFirstToolEvidenceMode = 'off' | 'optional' | 'required-for-low-confidence';

export interface AgentFirstAblationToggles {
  /** Single kill switch. false disables Agent-first runtime augmentations where wired. */
  readonly enabled?: false;
  /** Observation/rationale Journal recording. false = keep prompt behavior but skip recorder writes. */
  readonly observation?: false;
  /** Tool evidence wrapping / feedback policy. false = guidance avoids tool-evidence requirements. */
  readonly toolEvidence?: false;
  /** Skill prompt-chain recovery guidance. false = do not inject recovery-specific prompt guidance. */
  readonly recoveryGuidance?: false;
  /** Confidence policy override for low-confidence evidence guidance. */
  readonly toolEvidenceMode?: AgentFirstToolEvidenceMode;
}

export type NarrativeAblationToggles = Partial<NarrativePreviewFeatureToggles>;

// =============================================================================
// Feature Toggles
// =============================================================================

/**
 * Ablation toggles — each controls exactly one feature unit.
 * `undefined` = use default behavior (no override).
 */
export interface AblationToggles {
  // --- Context management (2 independent dimensions) ---

  /** Context compression (ConversationCompressor.compress).
   *  false = disable, object = override thresholds */
  compression?: false | { tokenThreshold?: number; turnThreshold?: number };
  /** Creative compression (MessageClassifier + CreativeSummarizer).
   *  false = disable, fallback to basic compression */
  creativeCompression?: false;
  // --- Skill system (3 independent dimensions) ---

  /** Skill auto-matching (SkillService.match).
   *  false = disable discovery, manual activation still works */
  skillDiscovery?: false;
  /** Skill prompt injection (SkillInjectionCoordinator 3-track).
   *  false = disable injection, skill can be discovered but not injected */
  skillInjection?: false;
  /** ToolSet dynamic activation (ActivateToolSet/DeactivateToolSet meta tools).
   *  false = disable, only always-layer tools available */
  dynamicToolSets?: false;

  // --- Tool injection ---

  /** Tool injection layers: 'always-only' = skip dynamic layer */
  toolInjection?: 'always-only' | 'always+dynamic';

  // --- Hooks chain ---

  /** Validation hooks: false = disable all */
  validation?: false;
  /** Retry hooks: false = disable, object = override maxRetries */
  retry?: false | { maxRetries?: number };

  // --- Permission ---

  /** Permission mode override */
  permissionMode?: PermissionMode;
  /** Trait-based permission (creative auto mode).
   *  false = disable, auto mode allows all tools unconditionally */
  traitsRegistry?: false;

  // --- External integration ---

  /** External shell hooks (PreToolUse/UserPromptSubmit from .neko/settings.json).
   *  false = disable */
  settingsHooks?: false;
  /** Project memory injection into system prompt.
   *  false = disable */
  projectMemory?: false;
  /** Persist compaction provenance/events into the Journal.
   *  false = keep in-memory compression but skip compaction event logging */
  compactLogging?: false;
  /** Automatic project-memory KeyFact extraction from conversations.
   *  false = disable */
  autoMemoryExtraction?: false;
  /** Per-turn recall injection from project memory.
   *  false = keep memory file, disable recall prompt injection */
  memoryRecall?: false;

  // --- Provider Card Context ---

  /** Project ProviderCard auto-evolution: false = do not write .neko/providers/*.card.md. */
  providerCardAutoEvolve?: false;

  // --- Agent-first multimodal ---

  /** Agent-first multimodal observation/evidence/recovery toggles. */
  agentFirst?: AgentFirstAblationToggles;

  // --- Canvas interactive narrative ---

  /** Canvas Narrative Preview feature flags. */
  narrative?: NarrativeAblationToggles;

  // --- Prompt-chain/profile guidance ---

  /** Built-in creation profile guidance. false = run without IDC staged creation hints. */
  creationProfileGuidance?: false;
  /** PlanMode profile guidance. false = keep chat execution but remove PlanMode hints. */
  planModeProfile?: false;
  /** Capability protocol enforcement. false = discover capabilities without strict enforcement. */
  capabilityProtocol?: false;
  /** Runtime prompt/schema generator. false = fallback to base prompt and static schemas. */
  promptSchemaGenerator?: false;
  /** Subagent orchestration. false = use non-subagent fallback or record unavailable. */
  subagentOrchestration?: false;
  /** Multimodal context injection. false = record evidence existence but withhold it. */
  multimodalContext?: false;
  /** Evaluator prompt/schema hints. false = evaluator metrics may still run without hints. */
  evaluatorHints?: false;

  // --- LLM parameters ---

  /** Thinking budget override (0 = disable extended thinking) */
  thinkingBudget?: number;
  /** Max iterations override */
  maxIterations?: number;
}

// =============================================================================
// Experiment Variant
// =============================================================================

/**
 * A named experiment variant with specific feature toggles.
 */
export interface ExperimentVariant {
  /** Unique variant name (e.g. 'baseline', 'no-compression') */
  name: string;
  /** Human-readable description */
  description: string;
  /** Feature toggles to apply */
  toggles: AblationToggles;
  /** Number of repetitions for statistical significance */
  repetitions?: number;
}

// =============================================================================
// Experiment Config
// =============================================================================

/**
 * Full experiment configuration.
 */
export interface ExperimentConfig {
  /** Experiment name */
  name: string;
  /** Task prompt to execute across all variants */
  taskPrompt: string;
  /** Optional execution context */
  taskContext?: ExecutionContext;
  /** Variants to compare */
  variants: ExperimentVariant[];
  /** Base session config (variants override specific fields) */
  baseSessionConfig: AgentSessionConfig;
  /** Maximum time per variant in milliseconds */
  variantTimeoutMs?: number;
  /** Output directory for results and per-run isolation metadata */
  outputDir?: string;
  /**
   * Run isolation mode.
   * - 'none': reuse the base session config and task context as-is
   * - 'metadata-only': add a deterministic per-run output directory to context metadata
   * - 'workspace-root': also override taskContext.workspaceRoot with the per-run directory
   *
   * Default: 'metadata-only' when outputDir is provided, otherwise 'none'.
   */
  isolation?: ExperimentIsolationMode;
  /** Optional quality evaluator merged into metrics.custom.evaluation */
  evaluator?: ExperimentEvaluator;
  /** Optional writer for persisting result JSON and comparison markdown */
  outputWriter?: ExperimentOutputWriter;
}

export type ExperimentIsolationMode = 'none' | 'metadata-only' | 'workspace-root';

export interface ExperimentRunDescriptor {
  experimentName: string;
  variantName: string;
  repetitionIndex: number;
  outputDir?: string;
  isolationMode: ExperimentIsolationMode;
}

export interface ExperimentRunIsolation {
  outputDir?: string;
  contextMetadata: Record<string, unknown>;
}

export interface EvaluationResult {
  score?: number;
  passed?: boolean;
  reason?: string;
  metrics?: Record<string, number | boolean | string>;
  details?: Record<string, unknown>;
}

export interface ExperimentEvaluator {
  evaluate(result: AgentResult, descriptor: ExperimentRunDescriptor): Promise<EvaluationResult>;
}

export interface ExperimentOutputFile {
  kind: 'json' | 'markdown';
  path: string;
}

export interface ExperimentOutputWriter {
  writeTextFile(path: string, content: string): Promise<void>;
}

// =============================================================================
// Metrics
// =============================================================================

/** Token usage breakdown */
export interface TokenMetrics {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** Metrics for a single tool call */
export interface ToolCallMetric {
  name: string;
  success: boolean;
  latencyMs: number;
  retryCount: number;
  error?: string;
}

/** Per-turn metrics snapshot */
export interface TurnMetrics {
  turnIndex: number;
  tokenUsage: TokenMetrics;
  toolCalls: ToolCallMetric[];
  latencyMs: number;
}

/** Aggregated metrics for one experiment run */
export interface ExperimentMetrics {
  totalTokens: TokenMetrics;
  turns: TurnMetrics[];
  iterations: number;
  totalLatencyMs: number;
  toolSummary: {
    totalCalls: number;
    successCount: number;
    failureCount: number;
    byTool: Record<string, { calls: number; successes: number; failures: number }>;
  };
  custom: Record<string, unknown>;
}

// =============================================================================
// Results
// =============================================================================

/** Result of a single variant run */
export interface VariantRunResult {
  variantName: string;
  repetitionIndex: number;
  success: boolean;
  agentResult: AgentResult;
  metrics: ExperimentMetrics;
  toggles: AblationToggles;
  error?: string;
}

/** Aggregated result for one variant across repetitions */
export interface VariantResult {
  variant: ExperimentVariant;
  runs: VariantRunResult[];
  averageMetrics: ExperimentMetrics;
}

/** Full experiment result */
export interface ExperimentResult {
  name: string;
  startedAt: string;
  completedAt: string;
  taskPrompt: string;
  variants: VariantResult[];
  comparison: ComparisonEntry[];
  outputFiles?: ExperimentOutputFile[];
}

/** Comparison table entry (one per variant) */
export interface ComparisonEntry {
  variantName: string;
  avgTotalTokens: number;
  avgLatencyMs: number;
  avgIterations: number;
  avgToolCalls: number;
  toolSuccessRate: number;
  successRate: number;
}

// =============================================================================
// Progress Events
// =============================================================================

/** Progress event emitted during experiment execution */
export type ExperimentProgressEvent =
  | { type: 'variant_start'; variant: string; repetition: number }
  | {
      type: 'variant_complete';
      variant: string;
      repetition: number;
      metrics: ExperimentMetrics;
    }
  | { type: 'variant_error'; variant: string; repetition: number; error: string }
  | { type: 'experiment_complete'; result: ExperimentResult };
