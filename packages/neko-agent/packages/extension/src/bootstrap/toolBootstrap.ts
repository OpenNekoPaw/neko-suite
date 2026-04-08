/**
 * Tool Bootstrap — Register tools from other Neko extensions.
 *
 * Extracted from index.ts to reduce coupling in the main entry point.
 * Each sub-package's tools are registered via factory functions that
 * gracefully return empty arrays when the corresponding extension is not installed.
 *
 * NOTE: This is a transitional module. As sub-packages adopt the
 * AgentCapabilityProvider protocol (P0-1), their factory functions will
 * migrate out of neko-agent into the sub-packages themselves.
 */

import { getRootLogger } from '../base';
import {
  createNekoCutTools,
  createNekoCanvasTools,
  createNekoEngineEffectsTools,
  createTranscribeTools,
  createNekoStoryTools,
  createNekoSketchTools,
  createNekoCutVideoGenerationTools,
  createSkillProviderTools,
} from '../tools/extensionTools';
import { createPuppetFaceTools } from '../tools/puppetFaceTools';
import type { Platform } from '@neko/platform';

/**
 * Register tools from other Neko extensions (NekoCut, NekoCanvas, Engine Effects, NekoStory, etc.).
 *
 * `platform` is used to build an embedFn for SearchScriptIndex (L3 semantic search).
 * If no embedding-capable provider is configured, SearchScriptIndex is omitted gracefully.
 */
export function registerExtensionTools(
  toolRegistry: { register: (tool: unknown) => void },
  platform: Platform,
): void {
  const batches: Array<{ name: string; tools: unknown[] }> = [
    { name: 'NekoCut', tools: createNekoCutTools() },
    { name: 'NekoCanvas', tools: createNekoCanvasTools(platform.media, platform.config) },
    { name: 'EngineEffects', tools: createNekoEngineEffectsTools() },
    { name: 'Transcribe', tools: createTranscribeTools() },
    { name: 'NekoStory', tools: createNekoStoryTools(buildEmbedFn(platform)) },
    { name: 'NekoSketch', tools: createNekoSketchTools(platform.media) },
    { name: 'NekoCutVideo', tools: createNekoCutVideoGenerationTools(platform.media) },
    { name: 'SkillProvider', tools: createSkillProviderTools() },
    { name: 'PuppetFace', tools: createPuppetFaceTools() },
  ];

  let total = 0;
  for (const batch of batches) {
    for (const tool of batch.tools) {
      toolRegistry.register(tool);
    }
    total += batch.tools.length;
  }

  getRootLogger().info(`Registered ${total} extension tools`);
}

/**
 * Builds an embed function backed by the platform's AI service.
 * The service is created lazily on first call. Errors (e.g. no embedding-capable
 * provider configured) propagate to the caller so SearchScriptIndex can surface
 * a descriptive error message instead of silently failing.
 */
function buildEmbedFn(platform: Platform): (texts: string[]) => Promise<number[][]> {
  let service: ReturnType<Platform['createService']> | undefined;
  return async (texts: string[]) => {
    if (!service) {
      service = platform.createService();
    }
    const result = await service.embed(texts);
    return result.embeddings;
  };
}
