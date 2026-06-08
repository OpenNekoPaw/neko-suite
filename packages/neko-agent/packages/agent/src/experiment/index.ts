/**
 * Ablation Experiment Framework
 *
 * Lightweight infrastructure for measuring the impact of individual
 * agent subsystems via controlled feature toggling.
 *
 * Usage:
 * ```typescript
 * import {
 *   ExperimentRunner,
 *   applyAblationToggles,
 *   createStandardAblationSuite,
 *   BASELINE,
 *   NO_COMPRESSION,
 * } from './experiment';
 * ```
 */

// Types
export type {
  AblationToggles,
  EvaluationResult,
  ExperimentEvaluator,
  ExperimentIsolationMode,
  ExperimentOutputFile,
  ExperimentOutputWriter,
  ExperimentVariant,
  ExperimentConfig,
  CapabilityEvolutionEvent,
  CapabilityEvolutionEventKind,
  ExperimentRunDescriptor,
  ExperimentRunIsolation,
  PromptSchemaSnapshotRef,
  TokenMetrics,
  ToolCallMetric,
  TurnMetrics,
  ExperimentMetrics,
  WorkflowEvaluationComparison,
  WorkflowEvaluationFixture,
  WorkflowEvaluationHarnessInput,
  WorkflowEvaluationHarnessResult,
  WorkflowEvaluationVariantInput,
  WorkflowMetricSnapshot,
  VariantRunResult,
  VariantResult,
  ExperimentResult,
  ComparisonEntry,
  ExperimentProgressEvent,
} from './types';

// Core
export { applyAblationToggles, extractAblationMarker } from './apply-toggles';
export type { AblationMarkerHook } from './apply-toggles';
export { MetricsHooks } from './metrics-hooks';
export { ExperimentRunner } from './experiment-runner';
export type { ISessionFactory, IExperimentSession } from './experiment-runner';
export {
  IDC_CREATION_FIXTURE,
  MULTIMODAL_TOOL_CALL_FIXTURE,
  PROMPT_CHAIN_WORKFLOW_FIXTURE,
  SKILL_INJECTION_FIXTURE,
  SUBAGENT_TASK_FIXTURE,
  createCapabilityEvolutionEvent,
  createDeterministicAssetComplianceEvaluator,
  createJudgeEvaluatorRunner,
  createMockLlmJudgeAdapter,
  createPromptSchemaSnapshotRef,
  createUnifiedWorkflowEvaluationFixtures,
  createWorkflowMetricSnapshot,
  runWorkflowEvaluationHarness,
  runWorkflowEvaluationHarnessWithEvaluators,
} from './workflow-evaluation-harness';

// Analysis
export { buildComparison, formatComparisonMarkdown } from './comparison';

// Presets
export {
  // Single-feature variants
  BASELINE,
  NO_COMPRESSION,
  NO_CREATIVE_COMPRESSION,
  NO_COMPACT_LOGGING,
  NO_AUTO_MEMORY_EXTRACTION,
  NO_MEMORY_RECALL,
  NO_SKILL_DISCOVERY,
  NO_SKILL_INJECTION,
  NO_DYNAMIC_TOOLSETS,
  NO_VALIDATION,
  NO_RETRY,
  NO_SETTINGS_HOOKS,
  NO_PROJECT_MEMORY,
  NO_TRAITS,
  NO_THINKING,
  NO_CAPABILITY_PROTOCOL,
  NO_EVALUATOR_HINTS,
  NO_IDC_WORKFLOW,
  NO_MULTIMODAL_CONTEXT,
  NO_PLAN_MODE_PROFILE,
  NO_PROMPT_SCHEMA_GENERATOR,
  NO_SUBAGENT_ORCHESTRATION,
  NO_NARRATIVE_PREVIEW,
  NO_NARRATIVE_TYPEWRITER,
  NO_NARRATIVE_AUTO_EXPRESSION,
  HIDE_LOCKED_NARRATIVE_CHOICES,
  NO_NARRATIVE_PREVIEW_AUTO_SYNC,
  NARRATIVE_LIVE2D_PERFORMANCE,
  ALWAYS_ONLY_TOOLS,
  PLAN_PERMISSION_MODE,
  ASK_PERMISSION_MODE,
  SINGLE_ITERATION,
  // Group variants
  NO_ALL_COMPRESSION,
  NO_ALL_SKILLS,
  NO_ALL_EXTERNAL,
  NO_NARRATIVE_PREVIEW_STACK,
  MINIMAL,
  // Suite builders
  createStandardAblationSuite,
  createGroupAblationSuite,
  createParameterAblationSuite,
} from './presets';
