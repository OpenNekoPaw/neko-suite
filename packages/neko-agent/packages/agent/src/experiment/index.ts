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
  ExperimentRunDescriptor,
  ExperimentRunIsolation,
  TokenMetrics,
  ToolCallMetric,
  TurnMetrics,
  ExperimentMetrics,
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

// Analysis
export { buildComparison, formatComparisonMarkdown } from './comparison';

// Presets
export {
  // Single-feature variants
  BASELINE,
  NO_COMPRESSION,
  NO_CREATIVE_COMPRESSION,
  NO_JOURNAL_AS_SSOT,
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
  ALWAYS_ONLY_TOOLS,
  PLAN_PERMISSION_MODE,
  ASK_PERMISSION_MODE,
  SINGLE_ITERATION,
  // Group variants
  NO_ALL_COMPRESSION,
  NO_ALL_SKILLS,
  NO_ALL_EXTERNAL,
  MINIMAL,
  // Suite builders
  createStandardAblationSuite,
  createGroupAblationSuite,
  createParameterAblationSuite,
} from './presets';
