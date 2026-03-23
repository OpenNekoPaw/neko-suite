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
