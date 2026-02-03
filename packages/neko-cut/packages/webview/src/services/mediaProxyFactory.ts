/**
 * Media Proxy Factory
 *
 * Provides singleton access to the mode-aware media proxy.
 * Routes requests based on current media engine mode:
 * - basic: LocalMediaProcessor (Webview-only)
 * - compatible: MediaRequestProxy (Extension FFmpeg)
 */

import { useEditorStore } from '../stores/editor-store';
import { getWebviewUrlResolver } from './urlResolverFactory';
import { LocalMediaProcessor } from './LocalMediaProcessor';
import { MediaRequestProxy, type IMediaRequestProxy } from './MediaRequestProxy';
import { ModeAwareMediaProxy } from './ModeAwareMediaProxy';

// =============================================================================
// Singleton Instance
// =============================================================================

let instance: IMediaRequestProxy | null = null;
let localProcessor: LocalMediaProcessor | null = null;
let remoteProxy: MediaRequestProxy | null = null;

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Get the singleton mode-aware media proxy instance
 *
 * This proxy automatically routes requests based on the current mode:
 * - basic mode: Uses LocalMediaProcessor (WebCodecs + libav.js)
 * - compatible mode: Uses MediaRequestProxy (Extension FFmpeg)
 */
export function getMediaProxy(): IMediaRequestProxy {
  if (!instance) {
    // Create local processor for basic mode
    localProcessor = new LocalMediaProcessor(getWebviewUrlResolver());

    // Create remote proxy for compatible mode
    remoteProxy = new MediaRequestProxy();

    // Create mode-aware proxy that delegates based on current mode
    instance = new ModeAwareMediaProxy(
      localProcessor,
      remoteProxy,
      () => useEditorStore.getState().currentMode
    ) as IMediaRequestProxy;
  }
  return instance;
}

/**
 * Get the local media processor directly
 *
 * Use this when you explicitly need the basic mode processor,
 * bypassing mode-based routing.
 */
export function getLocalMediaProcessor(): LocalMediaProcessor {
  if (!localProcessor) {
    localProcessor = new LocalMediaProcessor(getWebviewUrlResolver());
  }
  return localProcessor;
}

/**
 * Get the remote media proxy directly
 *
 * Use this when you explicitly need the Extension FFmpeg,
 * bypassing mode-based routing.
 */
export function getRemoteMediaProxy(): MediaRequestProxy {
  if (!remoteProxy) {
    remoteProxy = new MediaRequestProxy();
  }
  return remoteProxy;
}

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
  localProcessor = null;
  remoteProxy = null;
}
