/**
 * Tool Bootstrap — Register neko-agent's own meta-tools.
 *
 * All domain tools have been migrated to their respective sub-packages via
 * AgentCapabilityProvider protocol. Sub-packages register their own tools
 * at activation time via `neko.agent.registerCapabilities` command.
 *
 * This module now only registers:
 * - SkillProvider (meta-tool: enumerates skills from all installed extensions)
 * - ReadDocument (agent-owned document reader bridge)
 *
 * Migrated sub-packages (2026-04-08):
 * - neko-cut → timeline tools + GenerateVideoForClip
 * - neko-engine → effects + transcribe + analysis tools
 * - neko-canvas → canvas node/generation tools
 * - neko-story → script index/search tools
 * - neko-sketch → AI painting tools
 * - neko-puppet → face parameter tools
 */

import * as vscode from 'vscode';
import {
  DEFAULT_PLUGIN_SKILL_PROVIDER_EXTENSION_IDS,
  createPluginSkillDiscoveryTools,
  type PluginSkillCatalogueEntry,
  type PluginSkillCatalogueSource,
} from '@neko/agent/tools';
import { TOOL_NAMES_SYSTEM, type ISkillProvider } from '@neko/shared';
import type { Platform } from '@neko/platform';
import type { IToolGroupRegistry, Tool } from '@neko/shared';
import { getRootLogger } from '../base';
import { createDocumentReaderService } from '../services/DocumentReaderService';
import { createDocumentResourceCacheService } from '../services/documentResourceCacheService';
import { getEngineClientProvider } from '../services/engineClientProvider';
import { createReadDocumentTool } from '../tools/readDocumentTool';
import { createReadDocumentImageTool } from '../tools/readDocumentImageTool';
import { createReadImageTool } from '../tools/readImageTool';

/**
 * Register neko-agent's own meta-tools.
 * Domain tools are now registered by sub-packages via CapabilityProvider.
 */
export function registerExtensionTools(
  toolRegistry: { register: (tool: Tool) => void; get?: (name: string) => Tool | undefined },
  _platform: Platform,
  context?: vscode.ExtensionContext,
): void {
  const documentReader = createDocumentReaderService(getEngineClientProvider(), context);
  const documentResourceCache = context
    ? createDocumentResourceCacheService({ reader: documentReader, context })
    : undefined;
  const resolveDocumentResourceScope = () =>
    vscode.workspace.workspaceFolders?.[0] ? ('project' as const) : ('extension-private' as const);
  const tools = createPluginSkillDiscoveryTools(
    createVSCodePluginSkillCatalogueSource(),
    getRootLogger().child('PluginSkillDiscovery'),
  );
  tools.push(
    createReadDocumentTool({
      reader: documentReader,
      resourceCache: documentResourceCache,
      resolveResourceScope: resolveDocumentResourceScope,
    }),
    createReadImageTool({
      platform: _platform,
    }),
    createReadDocumentImageTool({
      reader: documentReader,
      platform: _platform,
      resourceCache: documentResourceCache,
      resolveResourceScope: resolveDocumentResourceScope,
    }),
  );
  for (const tool of tools) {
    if (!toolRegistry.get?.(tool.name)) {
      toolRegistry.register(tool);
    }
  }
  getRootLogger().info(`Registered ${tools.length} extension tool(s)`);
}

export function registerExtensionToolGroups(toolGroupRegistry: IToolGroupRegistry): void {
  toolGroupRegistry.register({
    name: 'document-reading',
    description:
      'Document and image reading tools for EPUB, PDF, DOC/DOCX, PPT/PPTX, Excel, text, Final Draft, comic archives, and image pages',
    tools: [
      TOOL_NAMES_SYSTEM.READ_DOCUMENT,
      TOOL_NAMES_SYSTEM.READ_IMAGE,
      TOOL_NAMES_SYSTEM.READ_DOCUMENT_IMAGE,
    ],
    alwaysActive: true,
    priority: 100,
    loadingTier: 'resident',
    source: 'builtin',
    enabled: true,
    icon: '📄',
  });
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
