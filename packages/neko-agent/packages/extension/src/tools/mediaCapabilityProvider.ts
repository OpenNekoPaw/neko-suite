import {
  TOOL_NAMES_SYSTEM,
  type AgentCapabilityContext,
  type AgentCapabilityProvider,
  type Tool,
  type ToolGroup,
} from '@neko/shared';
import { createDocumentToolRuntime } from './documentToolRuntime';
import { createReadImageTool } from './readImageTool';
import { getCapabilityRuntimeBindings } from '../bootstrap/capabilityBootstrap';

export function createMediaReadCapabilityProvider(): AgentCapabilityProvider {
  return new MediaReadCapabilityProvider();
}

class MediaReadCapabilityProvider implements AgentCapabilityProvider {
  readonly id = 'neko-agent-platform-media';
  readonly version = '1.0.0';

  getTools(context: AgentCapabilityContext): Tool[] {
    const documentToolRuntime = createDocumentToolRuntime(context);

    return [
      createReadImageTool({
        contentAccessRuntime: getCapabilityRuntimeBindings().contentAccessRuntime,
        resolveResourceScope: documentToolRuntime.resolveDocumentResourceScope,
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
