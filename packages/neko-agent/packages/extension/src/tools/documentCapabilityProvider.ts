import {
  TOOL_NAMES_SYSTEM,
  type AgentCapabilityContext,
  type AgentCapabilityProvider,
  type Tool,
  type ToolGroup,
} from '@neko/shared';
import { createDocumentToolRuntime } from './documentToolRuntime';
import { createReadDocumentTool } from './readDocumentTool';
import { getCapabilityRuntimeBindings } from '../bootstrap/capabilityBootstrap';

export function createDocumentReadCapabilityProvider(): AgentCapabilityProvider {
  return new DocumentReadCapabilityProvider();
}

class DocumentReadCapabilityProvider implements AgentCapabilityProvider {
  readonly id = 'neko-agent-platform-document';
  readonly version = '1.0.0';

  getTools(context: AgentCapabilityContext): Tool[] {
    const { resolveDocumentResourceScope } = createDocumentToolRuntime(context);
    const contentAccessRuntime = getCapabilityRuntimeBindings().contentAccessRuntime;

    return [
      createReadDocumentTool({
        contentAccessRuntime,
        resolveResourceScope: resolveDocumentResourceScope,
      }),
    ];
  }

  getToolGroups(): ToolGroup[] {
    return [
      {
        name: 'document-reading',
        description:
          'Document reading tools for EPUB, PDF, DOC/DOCX, PPT/PPTX, Excel, text, Final Draft, comic archives, and image pages',
        tools: [TOOL_NAMES_SYSTEM.READ_DOCUMENT],
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
