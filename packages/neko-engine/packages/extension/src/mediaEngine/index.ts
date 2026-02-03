/**
 * Media Engine - Extension Host
 *
 * Provides the compatible mode (Native FFmpeg + wgpu) implementation
 * and the MediaEngineManager for mode selection.
 *
 * Usage:
 * ```typescript
 * import {
 *   createMediaEngineManager,
 *   IMediaEngineManager,
 * } from './mediaEngine';
 *
 * // In service bootstrap
 * const manager = createMediaEngineManager(context.globalStorageUri);
 * services.set(IMediaEngineManager, manager);
 *
 * // When processing media
 * const mediaInfo = await probeMedia(filePath);
 * const recommendation = manager.analyzeMedia(mediaInfo);
 *
 * if (recommendation.recommendedMode === 'basic') {
 *   // Tell Webview to use WebMediaEngine
 *   webview.postMessage({ type: 'useBasicMode', mediaInfo });
 * } else {
 *   // Use compatible mode in Extension Host
 *   const engine = await manager.getCompatibleEngine();
 *   const decoder = await engine.createVideoDecoder({ source: filePath });
 *   // ...
 * }
 * ```
 */

// Service identifiers
export { IMediaEngineManager } from './serviceIds';

// Manager
export {
	MediaEngineManager,
	createMediaEngineManager,
	BasicModeRequiredError,
	type MediaEngineManagerConfig,
} from './MediaEngineManager';

// Native engine
export { NativeMediaEngine, createNativeMediaEngine } from './NativeMediaEngine';
