/**
 * Prompt Module - Prompt template management for agents
 *
 * Provides:
 * - PromptManager: Template registration and rendering
 * - ChainPromptExecutor: Multi-step prompt chain execution
 * - SystemPromptBuilder: Unified system prompt construction
 */

export {
  PromptManager,
  ChainPromptExecutor,
  createPromptManager,
  type ChainExecutionResult,
  type ChainExecutionOptions,
  type StepExecutor,
} from './prompt-manager';

// System Prompt Builder
export {
  SystemPromptBuilder,
  createSystemPromptBuilder,
  getDefaultPersonalPath,
  hasAgentsFile,
} from './system-prompt-builder';

export type {
  ISystemPromptBuilder,
  SystemPromptBuilderConfig,
  PromptMode,
  PromptLocale,
  AgentsSource,
  AgentsLoadResult,
} from './system-prompt-builder-types';

export {
  BUILTIN_PROMPTS,
  BUILTIN_DEFAULT_PROMPT_EN,
  BUILTIN_DEFAULT_PROMPT_ZH,
  BUILTIN_PLAN_PROMPT_EN,
  BUILTIN_PLAN_PROMPT_ZH,
  type BuiltinPromptKey,
} from './builtin-prompts';

// System Prompt Composer
export { SystemPromptComposer, createSystemPromptComposer } from './system-prompt-composer';

export type {
  ISystemPromptComposer,
  PromptLayer,
  PromptSection,
  PromptSectionInput,
  PromptLayerBudget,
  LayerUsage,
  SystemPromptComposerOptions,
  ComposedPromptSection,
  ComposedPromptResult,
  PromptDumpInfo,
} from './system-prompt-composer-types';

export { PROMPT_LAYER_ORDER, DEFAULT_PROMPT_LAYER_BUDGET } from './system-prompt-composer-types';

// Re-export types from @neko/shared for convenience
export type {
  Prompt,
  PromptVariable,
  PromptCategory,
  RenderedPrompt,
  IPromptManager,
  ChainPrompt,
  ChainPromptStep,
} from '@neko/shared';
