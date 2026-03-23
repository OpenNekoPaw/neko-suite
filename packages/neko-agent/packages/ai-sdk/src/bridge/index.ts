/**
 * Legacy Adapter Bridge
 *
 * Creates AI SDK ResolvedProvider from legacy MediaAdapter instances.
 */

import type { LegacyMediaAdapter, ProviderConfig, ResolvedProvider } from '../types';
import { LegacyImageModel } from './legacy-image-model';
import { LegacyVideoModel } from './legacy-video-model';
import { LegacySpeechModel } from './legacy-speech-model';

/**
 * Create an AI SDK ResolvedProvider that delegates to a legacy MediaAdapter.
 */
export function createLegacyBridgeProvider(
  providerType: string,
  config: ProviderConfig,
  adapter: LegacyMediaAdapter,
): ResolvedProvider {
  return {
    type: providerType,
    image: (modelId: string) => new LegacyImageModel(providerType, modelId, adapter, config),
    video: (modelId: string) => new LegacyVideoModel(providerType, modelId, adapter, config),
    speech: (modelId: string) => new LegacySpeechModel(providerType, modelId, adapter, config),
  };
}
