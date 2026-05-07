/**
 * @neko/ai-sdk - AI SDK Integration Layer
 *
 * Provides provider resolution and custom providers for media generation.
 * Used by @neko/platform to replace legacy media adapters.
 */

export { resolveProvider } from './resolve';
export type { ProviderConfig, ResolvedProvider } from './types';
export type { LegacyMediaAdapter, LegacyAdapterResult, LegacyMediaOutput } from './types';
export { createNewAPIProvider } from './providers/newapi';
export { createLegacyBridgeProvider } from './bridge';
export {
  projectMultimodalPacketToChatMessageAsync,
  projectMultimodalPacketToChatMessage,
  projectPerceptionCardToContentParts,
  resolveProviderInputModalities,
  type AsyncMultimodalMessageProjectionOptions,
  type AsyncMultimodalMessageProjectionResult,
  type PerceptionAssetLoader,
  type ProjectionDiagnostic,
  type ProviderInputModalities,
  type ProviderInputModalityResolverInput,
  type MultimodalMessageProjectionOptions,
  type ProviderReadyAssetPayload,
  type VisionPreprocessPolicy,
} from './multimodal-message-projection';
