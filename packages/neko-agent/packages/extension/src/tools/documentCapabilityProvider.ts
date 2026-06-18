import {
  TOOL_NAMES_SYSTEM,
  type AgentCapabilityContext,
  type AgentCapabilityProvider,
  type Tool,
  type ToolGroup,
} from '@neko/shared';
import type { Platform } from '@neko/platform';
import { createDocumentToolRuntime } from './documentToolRuntime';
import { createReadDocumentImageTool } from './readDocumentImageTool';
import { createReadDocumentTool } from './readDocumentTool';

export function createDocumentReadCapabilityProvider(platform: Platform): AgentCapabilityProvider {
  return new DocumentReadCapabilityProvider(platform);
}

class DocumentReadCapabilityProvider implements AgentCapabilityProvider {
  readonly id = 'neko-agent-platform-document';
  readonly version = '1.0.0';

  constructor(private readonly platform: Platform) {}

  getTools(context: AgentCapabilityContext): Tool[] {
    const { documentReader, documentResourceCache, resolveDocumentResourceScope } =
      createDocumentToolRuntime(context);

    return [
      createReadDocumentTool({
        reader: documentReader,
        resourceCache: documentResourceCache,
        resolveResourceScope: resolveDocumentResourceScope,
      }),
      createReadDocumentImageTool({
        reader: documentReader,
        platform: this.platform,
        resourceCache: documentResourceCache,
        resolveResourceScope: resolveDocumentResourceScope,
      }),
    ];
  }

  getToolGroups(): ToolGroup[] {
    return [
      {
        name: 'document-reading',
        description:
          'Document and document-image reading tools for EPUB, PDF, DOC/DOCX, PPT/PPTX, Excel, text, Final Draft, comic archives, and image pages',
        tools: [TOOL_NAMES_SYSTEM.READ_DOCUMENT, TOOL_NAMES_SYSTEM.READ_DOCUMENT_IMAGE],
        alwaysActive: true,
        priority: 100,
        loadingTier: 'resident' as const,
        source: 'builtin' as const,
        enabled: true,
        icon: 'document',
      },
    ];
  }
}
