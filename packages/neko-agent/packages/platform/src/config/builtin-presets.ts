/**
 * Builtin Presets Loader with i18n support
 */

import type { Provider, Model } from '../types/provider';
import type { ProviderTemplate } from '@neko/shared';
import type { RetryTimeoutPreset, BuiltinPresetName } from '../types/error';
import type { MCPServerPreset, WorkflowPreset, PromptPreset } from '../types/config';

// English (default) presets
import providersDataEn from './presets/en/providers.json';
import modelsDataEn from './presets/en/models.json';
import retryTimeoutDataEn from './presets/en/retry-timeout.json';
import mcpServersDataEn from './presets/en/mcp-servers.json';
import workflowsDataEn from './presets/en/workflows.json';
import promptsDataEn from './presets/en/prompts.json';

// Chinese presets
import providersDataZh from './presets/zh-cn/providers.json';
import modelsDataZh from './presets/zh-cn/models.json';
import retryTimeoutDataZh from './presets/zh-cn/retry-timeout.json';
import mcpServersDataZh from './presets/zh-cn/mcp-servers.json';
import workflowsDataZh from './presets/zh-cn/workflows.json';
import promptsDataZh from './presets/zh-cn/prompts.json';

/**
 * Locale data map (prevents tree-shaking)
 */
const LOCALE_DATA = {
  en: {
    providers: providersDataEn,
    models: modelsDataEn,
    retryTimeout: retryTimeoutDataEn,
    mcpServers: mcpServersDataEn,
    workflows: workflowsDataEn,
    prompts: promptsDataEn,
  },
  'zh-cn': {
    providers: providersDataZh,
    models: modelsDataZh,
    retryTimeout: retryTimeoutDataZh,
    mcpServers: mcpServersDataZh,
    workflows: workflowsDataZh,
    prompts: promptsDataZh,
  },
} as const;

/**
 * Supported locales
 */
export type SupportedLocale = 'en' | 'zh-cn';

/**
 * Current locale (set by ConfigManager or extension)
 */
let currentLocale: SupportedLocale = 'en';

/**
 * Set current locale
 */
export function setLocale(locale: string): void {
  // Normalize locale string
  const normalized = locale.toLowerCase().replace('_', '-');

  if (normalized.startsWith('zh')) {
    currentLocale = 'zh-cn';
  } else {
    currentLocale = 'en';
  }
}

/**
 * Get current locale
 */
export function getLocale(): SupportedLocale {
  return currentLocale;
}

/**
 * Builtin presets loaded from JSON files
 */
export interface BuiltinPresets {
  providers: Provider[];
  providerTemplates: ProviderTemplate[];
  models: Model[];
  retryTimeoutPresets: Record<BuiltinPresetName, RetryTimeoutPreset>;
  mcpServers: MCPServerPreset[];
  workflows: WorkflowPreset[];
  prompts: PromptPreset[];
}

/**
 * Load builtin presets from embedded JSON (i18n aware)
 */
export function loadBuiltinPresets(): BuiltinPresets {
  const data = LOCALE_DATA[currentLocale];
  const providersData = data.providers as { providers: Provider[]; templates?: ProviderTemplate[] };

  return {
    providers: providersData.providers,
    providerTemplates: providersData.templates || [],
    models: data.models.models as Model[],
    retryTimeoutPresets: data.retryTimeout.presets as Record<BuiltinPresetName, RetryTimeoutPreset>,
    mcpServers: data.mcpServers.mcpServers as MCPServerPreset[],
    workflows: data.workflows.workflows as WorkflowPreset[],
    prompts: data.prompts.prompts as PromptPreset[],
  };
}

/**
 * Get builtin provider by ID (i18n aware)
 */
export function getBuiltinProvider(id: string): Provider | undefined {
  const data = LOCALE_DATA[currentLocale];
  return (data.providers.providers as Provider[]).find((p) => p.id === id);
}

/**
 * Get all builtin provider templates (i18n aware)
 */
export function getBuiltinProviderTemplates(): ProviderTemplate[] {
  const data = LOCALE_DATA[currentLocale];
  const providersData = data.providers as { providers: Provider[]; templates?: ProviderTemplate[] };
  return providersData.templates || [];
}

/**
 * Get builtin provider template by ID (i18n aware)
 */
export function getBuiltinProviderTemplate(id: string): ProviderTemplate | undefined {
  return getBuiltinProviderTemplates().find((t) => t.id === id);
}

/**
 * Get builtin model by ID (i18n aware)
 */
export function getBuiltinModel(id: string): Model | undefined {
  const data = LOCALE_DATA[currentLocale];
  return (data.models.models as Model[]).find((m) => m.id === id);
}

/**
 * Get builtin retry/timeout preset by name (i18n aware)
 */
export function getBuiltinRetryTimeoutPreset(name: BuiltinPresetName): RetryTimeoutPreset {
  const data = LOCALE_DATA[currentLocale];
  const presets = data.retryTimeout.presets as Record<string, RetryTimeoutPreset>;
  return presets[name];
}

/**
 * Get builtin MCP server by ID (i18n aware)
 */
export function getBuiltinMCPServer(id: string): MCPServerPreset | undefined {
  const data = LOCALE_DATA[currentLocale];
  return (data.mcpServers.mcpServers as MCPServerPreset[]).find((s) => s.id === id);
}

/**
 * Get builtin workflow by ID (i18n aware)
 */
export function getBuiltinWorkflow(id: string): WorkflowPreset | undefined {
  const data = LOCALE_DATA[currentLocale];
  return (data.workflows.workflows as WorkflowPreset[]).find((w) => w.id === id);
}

/**
 * Get builtin prompt by ID (i18n aware)
 */
export function getBuiltinPrompt(id: string): PromptPreset | undefined {
  const data = LOCALE_DATA[currentLocale];
  return (data.prompts.prompts as PromptPreset[]).find((p) => p.id === id);
}
