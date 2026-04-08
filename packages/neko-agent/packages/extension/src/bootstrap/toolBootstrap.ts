/**
 * Tool Bootstrap — Register neko-agent's own meta-tools.
 *
 * All domain tools have been migrated to their respective sub-packages via
 * AgentCapabilityProvider protocol. Sub-packages register their own tools
 * at activation time via `neko.agent.registerCapabilities` command.
 *
 * This module now only registers:
 * - SkillProvider (meta-tool: enumerates skills from all installed extensions)
 *
 * Migrated sub-packages (2026-04-08):
 * - neko-cut → timeline tools + GenerateVideoForClip
 * - neko-engine → effects + transcribe + analysis tools
 * - neko-canvas → canvas node/generation tools
 * - neko-story → script index/search tools
 * - neko-sketch → AI painting tools
 * - neko-puppet → face parameter tools
 */

import { getRootLogger } from '../base';
import { createSkillProviderTools } from '../tools/extensionTools';
import type { Platform } from '@neko/platform';

/**
 * Register neko-agent's own meta-tools.
 * Domain tools are now registered by sub-packages via CapabilityProvider.
 */
export function registerExtensionTools(
  toolRegistry: { register: (tool: unknown) => void },
  _platform: Platform,
): void {
  const tools = createSkillProviderTools();
  for (const tool of tools) {
    toolRegistry.register(tool);
  }
  getRootLogger().info(`Registered ${tools.length} meta-tool(s)`);
}

/**
 * Builds an embed function backed by the platform's AI service.
 * Used by capabilityBootstrap to inject into AgentCapabilityContext.
 */
export function buildEmbedFn(platform: Platform): (texts: string[]) => Promise<number[][]> {
  let service: ReturnType<Platform['createService']> | undefined;
  return async (texts: string[]) => {
    if (!service) {
      service = platform.createService();
    }
    const result = await service.embed(texts);
    return result.embeddings;
  };
}
