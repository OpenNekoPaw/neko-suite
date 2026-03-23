/**
 * Provider Resolution Factory
 *
 * Maps provider type + config to AI SDK provider instances.
 * Returns null for provider types that don't have AI SDK support,
 * signaling the caller to fall back to legacy adapters.
 */

import { createOpenAI } from '@ai-sdk/openai';
import type { LegacyMediaAdapter, ProviderConfig, ResolvedProvider } from './types';
import { createNewAPIProvider } from './providers/newapi';
import { createLegacyBridgeProvider } from './bridge';

/**
 * Resolve a provider type to an AI SDK provider instance.
 *
 * @returns ResolvedProvider if AI SDK supports this provider type, null otherwise.
 */
export function resolveProvider(
  providerType: string,
  config: ProviderConfig,
  legacyAdapter?: LegacyMediaAdapter,
): ResolvedProvider | null {
  switch (providerType) {
    case 'openai': {
      const openai = createOpenAI({
        baseURL: normalizeBaseUrl(config.apiUrl),
        apiKey: config.apiKey,
      });
      return {
        type: 'openai',
        image: (modelId: string) => openai.image(modelId),
        // OpenAI provider does not support video model creation
        video: () => null,
        speech: (modelId: string) => openai.speech(modelId),
      };
    }

    case 'newapi':
    case 'oneapi':
    case 'generic':
      return createNewAPIProvider(config);

    default:
      break;
  }

  // Bridge legacy adapter if provided
  if (legacyAdapter) {
    return createLegacyBridgeProvider(providerType, config, legacyAdapter);
  }

  return null;
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
