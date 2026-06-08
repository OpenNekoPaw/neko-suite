/**
 * Preset Ablation Variants — Ready-to-use experiment configurations
 *
 * Three suites:
 * - Standard: baseline + one feature off per variant
 * - Group: baseline + subsystem-level off variants
 * - Parameter: baseline + policy/budget overrides
 */

import type { ExperimentVariant } from './types';

// =============================================================================
// Single-Feature Ablation Variants
// =============================================================================

export const BASELINE: ExperimentVariant = {
  name: 'baseline',
  description: 'All features enabled with default configuration',
  toggles: {},
};

// --- Context management ---

export const NO_COMPRESSION: ExperimentVariant = {
  name: 'no-compression',
  description: 'Context compression disabled',
  toggles: { compression: false },
};

export const NO_CREATIVE_COMPRESSION: ExperimentVariant = {
  name: 'no-creative-compression',
  description: 'Creative compression disabled, fallback to basic',
  toggles: { creativeCompression: false },
};

// --- Skill system ---

export const NO_SKILL_DISCOVERY: ExperimentVariant = {
  name: 'no-skill-discovery',
  description: 'Skill auto-matching disabled',
  toggles: { skillDiscovery: false },
};

export const NO_SKILL_INJECTION: ExperimentVariant = {
  name: 'no-skill-injection',
  description: 'Skill prompt/tools/rules injection disabled',
  toggles: { skillInjection: false },
};

export const NO_DYNAMIC_TOOLSETS: ExperimentVariant = {
  name: 'no-dynamic-toolsets',
  description: 'ToolSet activation/deactivation disabled',
  toggles: { dynamicToolSets: false },
};

// --- Hooks ---

export const NO_VALIDATION: ExperimentVariant = {
  name: 'no-validation',
  description: 'Validation hooks disabled',
  toggles: { validation: false },
};

export const NO_RETRY: ExperimentVariant = {
  name: 'no-retry',
  description: 'Retry hooks disabled',
  toggles: { retry: false },
};

// --- External integration ---

export const NO_SETTINGS_HOOKS: ExperimentVariant = {
  name: 'no-settings-hooks',
  description: 'External shell hooks disabled',
  toggles: { settingsHooks: false },
};

export const NO_PROJECT_MEMORY: ExperimentVariant = {
  name: 'no-project-memory',
  description: 'Project memory backend disabled (recall, injection, and extraction target)',
  toggles: { projectMemory: false },
};

export const NO_COMPACT_LOGGING: ExperimentVariant = {
  name: 'no-compact-logging',
  description: 'Compaction keeps working in memory but skips journal compaction events',
  toggles: { compactLogging: false },
};

export const NO_AUTO_MEMORY_EXTRACTION: ExperimentVariant = {
  name: 'no-auto-memory-extraction',
  description: 'Automatic project-memory KeyFact extraction disabled',
  toggles: { autoMemoryExtraction: false },
};

export const NO_MEMORY_RECALL: ExperimentVariant = {
  name: 'no-memory-recall',
  description: 'Per-turn memory recall injection disabled',
  toggles: { memoryRecall: false },
};

export const NO_TRAITS: ExperimentVariant = {
  name: 'no-traits',
  description: 'Trait-based permission disabled',
  toggles: { traitsRegistry: false },
};

// --- LLM parameters ---

export const NO_THINKING: ExperimentVariant = {
  name: 'no-thinking',
  description: 'Extended thinking disabled',
  toggles: { thinkingBudget: 0 },
};

export const NO_IDC_WORKFLOW: ExperimentVariant = {
  name: 'no-idc-workflow',
  description: 'Unified IDC workflow envelope disabled',
  toggles: { idcWorkflow: false },
};

export const NO_PLAN_MODE_PROFILE: ExperimentVariant = {
  name: 'no-plan-mode-profile',
  description: 'PlanMode workflow profile hints disabled',
  toggles: { planModeProfile: false },
};

export const NO_CAPABILITY_PROTOCOL: ExperimentVariant = {
  name: 'no-capability-protocol',
  description: 'Capability protocol enforcement disabled',
  toggles: { capabilityProtocol: false },
};

export const NO_PROMPT_SCHEMA_GENERATOR: ExperimentVariant = {
  name: 'no-dynamic-schema',
  description: 'Runtime prompt/schema generator disabled',
  toggles: { promptSchemaGenerator: false },
};

export const NO_SUBAGENT_ORCHESTRATION: ExperimentVariant = {
  name: 'no-subagent',
  description: 'Subagent orchestration disabled',
  toggles: { subagentOrchestration: false },
};

export const NO_MULTIMODAL_CONTEXT: ExperimentVariant = {
  name: 'no-multimodal-context',
  description: 'Multimodal context injection disabled',
  toggles: { multimodalContext: false },
};

export const NO_EVALUATOR_HINTS: ExperimentVariant = {
  name: 'no-evaluator-hints',
  description: 'Evaluator prompt/schema hints disabled',
  toggles: { evaluatorHints: false },
};

export const NO_NARRATIVE_PREVIEW: ExperimentVariant = {
  name: 'no-narrative-preview',
  description: 'Canvas Narrative Preview command and panel disabled',
  toggles: { narrative: { preview: false } },
};

export const NO_NARRATIVE_TYPEWRITER: ExperimentVariant = {
  name: 'no-narrative-typewriter',
  description: 'Narrative Preview dialogue text renders immediately',
  toggles: { narrative: { typewriterEffect: false } },
};

export const NO_NARRATIVE_AUTO_EXPRESSION: ExperimentVariant = {
  name: 'no-narrative-auto-expression',
  description: 'Narrative Preview skips parenthetical-to-expression matching',
  toggles: { narrative: { autoExpressionMatch: false } },
};

export const HIDE_LOCKED_NARRATIVE_CHOICES: ExperimentVariant = {
  name: 'hide-locked-narrative-choices',
  description: 'Narrative Preview hides choices whose conditions are not met',
  toggles: { narrative: { showLockedChoices: false } },
};

export const NO_NARRATIVE_PREVIEW_AUTO_SYNC: ExperimentVariant = {
  name: 'no-narrative-preview-auto-sync',
  description: 'Canvas selection does not automatically sync into Narrative Preview',
  toggles: { narrative: { previewAutoSync: false } },
};

export const NARRATIVE_LIVE2D_PERFORMANCE: ExperimentVariant = {
  name: 'narrative-live2d-performance',
  description: 'Narrative Preview prefers Live2D performance over static portraits',
  toggles: { narrative: { live2dPerformance: true } },
};

// =============================================================================
// Parameter Override Variants
// =============================================================================

export const ALWAYS_ONLY_TOOLS: ExperimentVariant = {
  name: 'always-only-tools',
  description: 'Use only always-layer tools; skip dynamic tool injection',
  toggles: { toolInjection: 'always-only' },
};

export const PLAN_PERMISSION_MODE: ExperimentVariant = {
  name: 'permission-plan-mode',
  description: 'Run in plan mode without tool execution',
  toggles: { permissionMode: 'plan' },
};

export const ASK_PERMISSION_MODE: ExperimentVariant = {
  name: 'permission-ask-mode',
  description: 'Run with per-tool confirmation mode',
  toggles: { permissionMode: 'ask' },
};

export const SINGLE_ITERATION: ExperimentVariant = {
  name: 'single-iteration',
  description: 'Limit execution loop to one iteration',
  toggles: { maxIterations: 1 },
};

// =============================================================================
// Group Ablation Variants (subsystem-level)
// =============================================================================

export const NO_ALL_COMPRESSION: ExperimentVariant = {
  name: 'no-all-compression',
  description: 'All compression disabled (basic + creative)',
  toggles: { compression: false, creativeCompression: false },
};

export const NO_ALL_SKILLS: ExperimentVariant = {
  name: 'no-all-skills',
  description: 'Entire skill system disabled',
  toggles: { skillDiscovery: false, skillInjection: false, dynamicToolSets: false },
};

export const NO_ALL_EXTERNAL: ExperimentVariant = {
  name: 'no-all-external',
  description: 'All external integrations disabled',
  toggles: {
    settingsHooks: false,
    projectMemory: false,
    compactLogging: false,
    autoMemoryExtraction: false,
    memoryRecall: false,
    traitsRegistry: false,
  },
};

export const NO_NARRATIVE_PREVIEW_STACK: ExperimentVariant = {
  name: 'no-narrative-preview-stack',
  description: 'Canvas interactive narrative Preview and renderer assists disabled',
  toggles: {
    narrative: {
      preview: false,
      typewriterEffect: false,
      autoExpressionMatch: false,
      showLockedChoices: false,
      previewAutoSync: false,
      live2dPerformance: false,
    },
  },
};

export const MINIMAL: ExperimentVariant = {
  name: 'minimal',
  description: 'Only permission hooks, everything else off',
  toggles: {
    compression: false,
    creativeCompression: false,
    skillDiscovery: false,
    skillInjection: false,
    dynamicToolSets: false,
    validation: false,
    retry: false,
    settingsHooks: false,
    projectMemory: false,
    compactLogging: false,
    autoMemoryExtraction: false,
    memoryRecall: false,
    traitsRegistry: false,
    narrative: {
      preview: false,
      typewriterEffect: false,
      autoExpressionMatch: false,
      showLockedChoices: false,
      previewAutoSync: false,
      live2dPerformance: false,
    },
    thinkingBudget: 0,
  },
};

// =============================================================================
// Suite Builders
// =============================================================================

/**
 * Standard ablation suite: baseline + single-feature variants.
 */
export function createStandardAblationSuite(): ExperimentVariant[] {
  return [
    BASELINE,
    NO_COMPRESSION,
    NO_CREATIVE_COMPRESSION,
    NO_SKILL_DISCOVERY,
    NO_SKILL_INJECTION,
    NO_DYNAMIC_TOOLSETS,
    NO_VALIDATION,
    NO_RETRY,
    NO_SETTINGS_HOOKS,
    NO_PROJECT_MEMORY,
    NO_COMPACT_LOGGING,
    NO_AUTO_MEMORY_EXTRACTION,
    NO_MEMORY_RECALL,
    NO_TRAITS,
    NO_THINKING,
    NO_IDC_WORKFLOW,
    NO_PLAN_MODE_PROFILE,
    NO_CAPABILITY_PROTOCOL,
    NO_PROMPT_SCHEMA_GENERATOR,
    NO_SUBAGENT_ORCHESTRATION,
    NO_MULTIMODAL_CONTEXT,
    NO_EVALUATOR_HINTS,
    NO_NARRATIVE_PREVIEW,
    NO_NARRATIVE_TYPEWRITER,
    NO_NARRATIVE_AUTO_EXPRESSION,
    HIDE_LOCKED_NARRATIVE_CHOICES,
    NO_NARRATIVE_PREVIEW_AUTO_SYNC,
    NARRATIVE_LIVE2D_PERFORMANCE,
  ];
}

/**
 * Group ablation suite: baseline + subsystem-level off.
 */
export function createGroupAblationSuite(): ExperimentVariant[] {
  return [
    BASELINE,
    NO_ALL_COMPRESSION,
    NO_ALL_SKILLS,
    NO_ALL_EXTERNAL,
    NO_NARRATIVE_PREVIEW_STACK,
    MINIMAL,
  ];
}

/**
 * Parameter ablation suite: baseline + parameter override controls.
 * Kept separate from standard single-feature-off suite because these variants
 * change execution policy or numeric budgets rather than disabling a subsystem.
 */
export function createParameterAblationSuite(): ExperimentVariant[] {
  return [BASELINE, ALWAYS_ONLY_TOOLS, PLAN_PERMISSION_MODE, ASK_PERMISSION_MODE, SINGLE_ITERATION];
}
