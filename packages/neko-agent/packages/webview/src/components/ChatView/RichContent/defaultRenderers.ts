/**
 * Default renderer registration — call once at app init to populate the registry
 * with all built-in content renderers.
 */

import { richContentRegistry } from './RichContentRegistry';
import {
  imageRendererEntry,
  imageGridRendererEntry,
  videoRendererEntry,
  audioRendererEntry,
  storyboardRendererEntry,
} from './renderers';

let initialized = false;

/**
 * Register all built-in renderers. Safe to call multiple times (idempotent).
 */
export function registerDefaultRenderers(): void {
  if (initialized) return;
  initialized = true;

  richContentRegistry.register(imageRendererEntry);
  richContentRegistry.register(imageGridRendererEntry);
  richContentRegistry.register(videoRendererEntry);
  richContentRegistry.register(audioRendererEntry);
  richContentRegistry.register(storyboardRendererEntry);
}
