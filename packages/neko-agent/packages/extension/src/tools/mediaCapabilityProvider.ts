import {
  TOOL_NAMES_SYSTEM,
  type AgentCapabilityContext,
  type AgentCapabilityProvider,
  type Tool,
  type ToolGroup,
} from '@neko/shared';
import type { ResourceCacheService } from '@neko/shared/vscode/extension';
import { createDocumentFileAccessPolicy, createDocumentToolRuntime } from './documentToolRuntime';
import { createReadImageTool } from './readImageTool';

export interface MediaReadCapabilityProviderOptions {
  readonly resourceCache?: ResourceCacheService;
}

export function createMediaReadCapabilityProvider(
  options: MediaReadCapabilityProviderOptions,
): AgentCapabilityProvider {
  return new MediaReadCapabilityProvider(options);
}

class MediaReadCapabilityProvider implements AgentCapabilityProvider {
  readonly id = 'neko-agent-platform-media';
  readonly version = '1.0.0';

  constructor(private readonly options: MediaReadCapabilityProviderOptions) {}

  getTools(context: AgentCapabilityContext): Tool[] {
    const documentRuntime = this.options.resourceCache
      ? undefined
      : createDocumentToolRuntime(context);
    const resourceCache = this.options.resourceCache ?? documentRuntime?.documentResourceCache;
    const fileAccessPolicy = documentRuntime?.fileAccessPolicy ?? createDocumentFileAccessPolicy();

    return [
      createReadImageTool({
        resourceCache,
        fileAccessPolicy,
      }),
    ];
  }

  getToolGroups(): ToolGroup[] {
    return [
      {
        name: 'image-reading',
        description:
          'Image metadata and native multimodal resource exposure for local images, generated assets, screenshots, and document image pages',
        tools: [TOOL_NAMES_SYSTEM.READ_IMAGE],
        alwaysActive: true,
        priority: 100,
        loadingTier: 'resident',
        source: 'builtin',
        enabled: true,
        icon: 'image',
      },
    ];
  }
}
