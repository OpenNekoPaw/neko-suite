/**
 * Media Proxy Factory
 *
 * Provides singleton access to the media proxy.
 * Uses MediaRequestProxy for compatible mode (Extension FFmpeg via NAPI).
 */

import { MediaRequestProxy, type IMediaRequestProxy } from './MediaRequestProxy';

// =============================================================================
// Singleton Instance
// =============================================================================

let instance: MediaRequestProxy | null = null;

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Get the singleton media proxy instance
 *
 * Uses MediaRequestProxy for compatible mode (Extension FFmpeg via NAPI).
 */
export function getMediaProxy(): IMediaRequestProxy {
  if (!instance) {
    instance = new MediaRequestProxy();
  }
  return instance;
}

/**
 * Alias for getMediaProxy (backward compatibility)
 */
export const getRemoteMediaProxy = getMediaProxy;

/**
 * Reset the singleton instance
 *
 * Used for testing or when reinitializing the media proxy.
 */
export function resetMediaProxy(): void {
  if (instance) {
    instance.dispose();
    instance = null;
  }
}
