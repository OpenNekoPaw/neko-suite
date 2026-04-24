/**
 * Preset Ablation Variants — Ready-to-use experiment configurations
 *
 * Two suites:
 * - Standard: baseline + one feature off per variant (16 variants total)
 * - Group: baseline + subsystem-level off (5 variants total)
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
  description: 'Project memory injection disabled',
  toggles: { projectMemory: false },
};

export const NO_JOURNAL_AS_SSOT: ExperimentVariant = {
  name: 'no-journal-as-ssot',
  description: 'Journal-backed projection disabled; runtime falls back to legacy record-first mode',
  toggles: { journalAsSSOT: false },
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
    journalAsSSOT: false,
    compactLogging: false,
    autoMemoryExtraction: false,
    memoryRecall: false,
    traitsRegistry: false,
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
    journalAsSSOT: false,
    compactLogging: false,
    autoMemoryExtraction: false,
    memoryRecall: false,
    traitsRegistry: false,
    thinkingBudget: 0,
  },
};

// =============================================================================
// Suite Builders
// =============================================================================

/**
 * Standard ablation suite: baseline + one feature off per variant.
 * 16 variants total (baseline + 15 single-feature).
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
    NO_JOURNAL_AS_SSOT,
    NO_COMPACT_LOGGING,
    NO_AUTO_MEMORY_EXTRACTION,
    NO_MEMORY_RECALL,
    NO_TRAITS,
    NO_THINKING,
  ];
}

/**
 * Group ablation suite: baseline + subsystem-level off.
 * 5 variants total.
 */
export function createGroupAblationSuite(): ExperimentVariant[] {
  return [BASELINE, NO_ALL_COMPRESSION, NO_ALL_SKILLS, NO_ALL_EXTERNAL, MINIMAL];
}
