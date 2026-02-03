/**
 * Provider Module - Public API
 */

export {
  ProviderRegistry,
  type ProviderRegistryOptions,
  type ExtendedProviderStatus,
  type ProviderRateLimitConfig,
} from './provider-registry';
export { GroupManager } from './group-manager';
export { discoverOllamaModels, discoverLMStudioModels, discoverLocalModels } from './local-discovery';
export { PlatformError, calculateBackoff, shouldRetry, sleep } from './platform-error';
export { executeWithRetry, withStreamTimeout, type RetryExecutorOptions } from './retry-executor';
