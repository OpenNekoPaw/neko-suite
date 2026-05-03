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
import * as vscode from 'vscode';
import {
  DEFAULT_PLUGIN_SKILL_PROVIDER_EXTENSION_IDS,
  createPluginSkillDiscoveryTools,
  type PluginSkillCatalogueEntry,
  type PluginSkillCatalogueSource,
} from '@neko/agent/tools';
import { type ISkillProvider } from '@neko/shared';
import type { Platform } from '@neko/platform';
import type { Tool } from '@neko/shared';

/**
 * Register neko-agent's own meta-tools.
 * Domain tools are now registered by sub-packages via CapabilityProvider.
 */
export function registerExtensionTools(
  toolRegistry: { register: (tool: Tool) => void },
  _platform: Platform,
): void {
  const tools = createPluginSkillDiscoveryTools(
    createVSCodePluginSkillCatalogueSource(),
    getRootLogger().child('PluginSkillDiscovery'),
  );
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

function createVSCodePluginSkillCatalogueSource(): PluginSkillCatalogueSource {
  return {
    async listPluginSkills(): Promise<readonly PluginSkillCatalogueEntry[]> {
      const catalogue: PluginSkillCatalogueEntry[] = [];

      for (const extensionId of DEFAULT_PLUGIN_SKILL_PROVIDER_EXTENSION_IDS) {
        const extension = vscode.extensions.getExtension<ISkillProvider>(extensionId);
        if (!extension) continue;

        let api: ISkillProvider;
        try {
          api = extension.isActive ? extension.exports : await extension.activate();
        } catch {
          continue;
        }

        if (typeof api.getSkills !== 'function') continue;

        let skills: ReturnType<ISkillProvider['getSkills']>;
        try {
          skills = api.getSkills();
        } catch {
          continue;
        }

        if (skills.length > 0) {
          catalogue.push({ extensionId, skills });
        }
      }

      return catalogue;
    },
  };
}
