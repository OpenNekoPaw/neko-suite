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
