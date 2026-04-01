/**
 * Apply Ablation Toggles — Pure function mapping AblationToggles to AgentSessionConfig
 *
 * Responsibility: Clone the base config and apply toggle overrides.
 * Does NOT mutate the original config. Each toggle maps to exactly one
 * config field or hook-factory option.
 */

import type { ExecutorHooks } from '@neko/shared';
import type { AgentSessionConfig } from '../session/types';
import type { AblationToggles } from './types';

/**
 * Collect hook names that should be excluded from the built-in chain.
 */
function collectDisabledHooks(toggles: AblationToggles): string[] {
  const disabled: string[] = [];
  if (toggles.validation === false) disabled.push('validation');
  if (toggles.retry === false) disabled.push('retry');
  return disabled;
}

/**
 * Build a marker hook that carries disableHooks metadata.
 * The executor-hooks-factory reads `disableHooks` from its config,
 * so we pass this through AgentSessionConfig.hooks as a tagged hook.
 *
 * This is a no-op hook whose only purpose is to be recognized by
 * apply-toggles-aware session creation code.
 */
export interface AblationMarkerHook extends ExecutorHooks {
  __ablation: true;
  disableHooks: string[];
  disableCompression: boolean;
  disableSessionMemory: boolean;
}

function createAblationMarkerHook(toggles: AblationToggles): AblationMarkerHook {
  return {
    name: 'ablation-marker',
    __ablation: true,
    disableHooks: collectDisabledHooks(toggles),
    disableCompression: toggles.compression === false,
    disableSessionMemory: toggles.sessionMemory === false,
  };
}

/**
 * Apply ablation toggles to a base AgentSessionConfig.
 *
 * Returns a new config — does NOT mutate the original.
 * The returned config can be passed directly to `new AgentSession(config)`.
 *
 * Toggle-to-config mapping:
 *
 * | Toggle                | Config field affected                              |
 * |-----------------------|----------------------------------------------------|
 * | compression: false    | MemoryHooksOptions.disableCompression via marker    |
 * | compression: {...}    | contextSettings.maxTokens                          |
 * | creativeCompression   | creativeCompression = undefined                    |
 * | sessionMemory: false  | MemoryHooksOptions.disableSessionMemory via marker  |
 * | skillDiscovery        | (marker flag for session-level wiring)              |
 * | skillInjection        | (marker flag for session-level wiring)              |
 * | dynamicToolSets       | (marker flag for session-level wiring)              |
 * | toolInjection         | (marker flag for injection manager config)          |
 * | validation: false     | disableHooks: ['validation']                       |
 * | retry: false          | disableHooks: ['retry']                            |
 * | retry: {...}          | (custom RetryHooks via hooks)                      |
 * | permissionMode        | executionMode                                      |
 * | traitsRegistry: false | traitsRegistry = undefined                         |
 * | settingsHooks: false  | settingsHookLoader = undefined                     |
 * | projectMemory: false  | projectMemoryManager = undefined                   |
 * | thinkingBudget        | thinkingBudget                                     |
 * | maxIterations         | maxIterations                                      |
 */
export function applyAblationToggles(
  base: AgentSessionConfig,
  toggles: AblationToggles,
): AgentSessionConfig {
  // Shallow clone — we only override top-level fields
  const config: AgentSessionConfig = { ...base };

  // --- Context management ---

  if (toggles.compression !== undefined && typeof toggles.compression === 'object') {
    config.contextSettings = {
      ...config.contextSettings,
      maxTokens: toggles.compression.tokenThreshold ?? config.contextSettings?.maxTokens,
    };
  }

  if (toggles.creativeCompression === false) {
    config.creativeCompression = undefined;
  }

  // --- Permission ---

  if (toggles.permissionMode !== undefined) {
    config.executionMode = toggles.permissionMode;
  }

  if (toggles.traitsRegistry === false) {
    config.traitsRegistry = undefined;
  }

  // --- External integration ---

  if (toggles.settingsHooks === false) {
    config.settingsHookLoader = undefined;
  }

  if (toggles.projectMemory === false) {
    config.projectMemoryManager = undefined;
  }

  // --- LLM parameters ---

  if (toggles.thinkingBudget !== undefined) {
    config.thinkingBudget = toggles.thinkingBudget;
  }

  if (toggles.maxIterations !== undefined) {
    config.maxIterations = toggles.maxIterations;
  }

  // --- Hooks chain modifications ---
  // Inject ablation marker hook at the beginning of custom hooks.
  // The marker carries metadata for session initialization:
  // - disableHooks: hook names to filter from the built-in chain
  // - disableCompression/disableSessionMemory: passed to MemoryHooksOptions
  const marker = createAblationMarkerHook(toggles);
  config.hooks = [marker, ...(config.hooks ?? [])];

  return config;
}

/**
 * Extract the AblationMarkerHook from a hooks array (if present).
 * Used by session initialization code to read ablation metadata.
 */
export function extractAblationMarker(hooks?: ExecutorHooks[]): AblationMarkerHook | undefined {
  if (!hooks) return undefined;
  return hooks.find((h): h is AblationMarkerHook => (h as AblationMarkerHook).__ablation === true);
}
