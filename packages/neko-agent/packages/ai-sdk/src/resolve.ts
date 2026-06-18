/**
 * Provider Resolution Factory
 *
 * Maps provider type + config to AI SDK provider instances.
 * Returns null for provider types that don't have AI SDK support.
 * Legacy media adapters require an explicit migration bridge opt-in.
 */

import { createOpenAI } from '@ai-sdk/openai';
import type { LegacyMediaAdapter, ProviderConfig, ResolvedProvider } from './types';
import { createNewAPIProvider } from './providers/newapi';
import { createLegacyBridgeProvider } from './bridge';

export interface ResolveProviderOptions {
  readonly imageMode?: 'standard' | 'chat';
  readonly allowLegacyBridge?: boolean;
}

export const AI_SDK_LEGACY_BRIDGE_MIGRATION_PROVIDER_TYPES = [
  'fal',
  'dashscope',
  'runway',
  'luma',
  'suno',
  'vidu',
  'midjourney',
  'minimax',
  'liblib',
] as const;

export function isAISDKLegacyBridgeMigrationProvider(providerType: string): boolean {
  return AI_SDK_LEGACY_BRIDGE_MIGRATION_PROVIDER_TYPES.includes(
    providerType as (typeof AI_SDK_LEGACY_BRIDGE_MIGRATION_PROVIDER_TYPES)[number],
  );
}

/**
 * Resolve a provider type to an AI SDK provider instance.
 *
 * @returns ResolvedProvider if AI SDK supports this provider type, null otherwise.
 */
export function resolveProvider(
  providerType: string,
  config: ProviderConfig,
  legacyAdapter?: LegacyMediaAdapter,
  options?: ResolveProviderOptions,
): ResolvedProvider | null {
  switch (providerType) {
    case 'openai': {
      const openai = createOpenAI({
        baseURL: normalizeBaseUrl(config.apiUrl),
        apiKey: config.apiKey,
      });
      return {
        type: 'openai',
        source: 'native',
        image: (modelId: string) => openai.image(modelId),
        // OpenAI provider does not support video model creation
        video: () => null,
        speech: (modelId: string) => openai.speech(modelId),
      };
    }

    case 'newapi':
    case 'oneapi':
    case 'generic':
      return createNewAPIProvider(config, options);

    case 'xai':
    case 'kling':
      return createCompatibleProvider(providerType, config, options);

    default:
      break;
  }

  if (legacyAdapter && options?.allowLegacyBridge === true) {
    return createLegacyBridgeProvider(providerType, config, legacyAdapter);
  }

  return null;
}

function createCompatibleProvider(
  providerType: string,
  config: ProviderConfig,
  options?: ResolveProviderOptions,
): ResolvedProvider {
  const provider = createNewAPIProvider(config, options);
  return {
    ...provider,
    type: providerType,
  };
}

/**
 * Normalize base URL: remove trailing slash and /v1 suffix
 * (AI SDK providers add their own path prefixes)
 */
function normalizeBaseUrl(url: string): string {
  let base = url.replace(/\/+$/, '');
  base = base.replace(/\/v1$/, '');
  return base;
}
