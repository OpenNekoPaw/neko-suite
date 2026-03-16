/**
 * Default Configuration
 *
 * Provides default user configuration for first-run generation.
 * When ~/.neko/config.json does not exist, this default is written out.
 */

import type { UnifiedConfig } from '@neko/shared';
import type { ProviderConfig, ModelConfig } from '@neko/shared';
import { readUserConfig, writeUserConfig } from '@neko/shared/config/config-reader.ts';

// =============================================================================
// Default Providers (4)
// =============================================================================

const DEFAULT_PROVIDERS: ProviderConfig[] = [
  {
    id: 'anthropic',
    name: 'anthropic',
    displayName: 'Anthropic',
    type: 'anthropic',
    apiUrl: 'https://api.anthropic.com',
    enabled: true,
  },
  {
    id: 'openai',
    name: 'openai',
    displayName: 'OpenAI',
    type: 'openai',
    apiUrl: 'https://api.openai.com/v1',
    enabled: true,
  },
  {
    id: 'google',
    name: 'google',
    displayName: 'Google',
    type: 'google',
    apiUrl: 'https://generativelanguage.googleapis.com/v1beta',
    enabled: true,
  },
  {
    id: 'deepseek',
    name: 'deepseek',
    displayName: 'DeepSeek',
    type: 'openai',
    apiUrl: 'https://api.deepseek.com',
    enabled: true,
  },
];

// =============================================================================
// Default Models (10)
// =============================================================================

const DEFAULT_MODELS: ModelConfig[] = [
  // Anthropic
  {
    id: 'anthropic-claude-sonnet-4',
    name: 'claude-sonnet-4-20250514',
    displayName: 'Claude Sonnet 4',
    providerId: 'anthropic',
    capabilities: ['chat', 'vision', 'function_calling', 'streaming', 'code'],
    contextWindow: 200000,
    maxOutputTokens: 16384,
    inputCostPer1k: 0.003,
    outputCostPer1k: 0.015,
    enabled: true,
  },
  {
    id: 'anthropic-claude-opus-4',
    name: 'claude-opus-4-20250514',
    displayName: 'Claude Opus 4',
    providerId: 'anthropic',
    capabilities: ['chat', 'vision', 'function_calling', 'streaming', 'code'],
    contextWindow: 200000,
    maxOutputTokens: 32768,
    inputCostPer1k: 0.015,
    outputCostPer1k: 0.075,
    enabled: true,
  },
  {
    id: 'anthropic-claude-3-5-haiku',
    name: 'claude-3-5-haiku-20241022',
    displayName: 'Claude 3.5 Haiku',
    providerId: 'anthropic',
    capabilities: ['chat', 'vision', 'function_calling', 'streaming', 'code'],
    contextWindow: 200000,
    maxOutputTokens: 8192,
    inputCostPer1k: 0.0008,
    outputCostPer1k: 0.004,
    enabled: true,
  },
  // OpenAI
  {
    id: 'openai-gpt-4o',
    name: 'gpt-4o',
    displayName: 'GPT-4o',
    providerId: 'openai',
    capabilities: ['chat', 'vision', 'function_calling', 'streaming', 'code', 'json_mode'],
    contextWindow: 128000,
    maxOutputTokens: 16384,
    inputCostPer1k: 0.0025,
    outputCostPer1k: 0.01,
    enabled: true,
  },
  {
    id: 'openai-gpt-4o-mini',
    name: 'gpt-4o-mini',
    displayName: 'GPT-4o Mini',
    providerId: 'openai',
    capabilities: ['chat', 'vision', 'function_calling', 'streaming', 'code', 'json_mode'],
    contextWindow: 128000,
    maxOutputTokens: 16384,
    inputCostPer1k: 0.00015,
    outputCostPer1k: 0.0006,
    enabled: true,
  },
  {
    id: 'openai-o3-mini',
    name: 'o3-mini',
    displayName: 'o3-mini',
    providerId: 'openai',
    capabilities: ['chat', 'function_calling', 'streaming', 'code', 'reasoning'],
    contextWindow: 200000,
    maxOutputTokens: 100000,
    inputCostPer1k: 0.0011,
    outputCostPer1k: 0.0044,
    enabled: true,
  },
  // Google
  {
    id: 'google-gemini-2-5-pro',
    name: 'gemini-2.5-pro-preview-06-05',
    displayName: 'Gemini 2.5 Pro',
    providerId: 'google',
    capabilities: ['chat', 'vision', 'function_calling', 'streaming', 'code'],
    contextWindow: 1048576,
    maxOutputTokens: 65536,
    inputCostPer1k: 0.00125,
    outputCostPer1k: 0.01,
    enabled: true,
  },
  {
    id: 'google-gemini-2-5-flash',
    name: 'gemini-2.5-flash-preview-05-20',
    displayName: 'Gemini 2.5 Flash',
    providerId: 'google',
    capabilities: ['chat', 'vision', 'function_calling', 'streaming', 'code'],
    contextWindow: 1048576,
    maxOutputTokens: 65536,
    inputCostPer1k: 0.00015,
    outputCostPer1k: 0.0006,
    enabled: true,
  },
  // DeepSeek
  {
    id: 'deepseek-v3',
    name: 'deepseek-chat',
    displayName: 'DeepSeek V3',
    providerId: 'deepseek',
    capabilities: ['chat', 'function_calling', 'streaming', 'code'],
    contextWindow: 64000,
    maxOutputTokens: 8192,
    inputCostPer1k: 0.00027,
    outputCostPer1k: 0.0011,
    enabled: true,
  },
  {
    id: 'deepseek-r1',
    name: 'deepseek-reasoner',
    displayName: 'DeepSeek R1',
    providerId: 'deepseek',
    capabilities: ['chat', 'streaming', 'code', 'reasoning'],
    contextWindow: 64000,
    maxOutputTokens: 8192,
    inputCostPer1k: 0.00055,
    outputCostPer1k: 0.00219,
    enabled: true,
  },
];

// =============================================================================
// Default User Config
// =============================================================================

/**
 * Default user configuration written on first run.
 */
export const DEFAULT_USER_CONFIG: UnifiedConfig = {
  defaultProvider: 'anthropic',
  defaultModel: 'claude-sonnet-4-20250514',
  maxTokens: 8192,
  temperature: 0.7,
  providers: DEFAULT_PROVIDERS,
  models: DEFAULT_MODELS,
  mcpServers: [],
};

/**
 * Ensure user config file exists.
 * If ~/.neko/config.json does not exist, write the default config.
 */
export function ensureUserConfig(): void {
  const existing = readUserConfig();
  if (existing) return;

  writeUserConfig(DEFAULT_USER_CONFIG);
}
