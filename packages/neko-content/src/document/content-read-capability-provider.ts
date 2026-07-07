import {
  TOOL_NAMES_SYSTEM,
  type AgentCapabilityContext,
  type AgentCapabilityProvider,
  type ResourceRef,
  type Tool,
  type ToolGroup,
} from '@neko/shared';
import {
  createReadDocumentTool,
  type ReadDocumentContentAccessRuntime,
} from './read-document-tool';
import { createReadImageTool, type ReadImageContentAccessRuntime } from './read-image-tool';

export interface ContentReadCapabilityProviderDeps {
  readonly contentAccessRuntime?: ReadDocumentContentAccessRuntime & ReadImageContentAccessRuntime;
  readonly getContentAccessRuntime?: () =>
    (ReadDocumentContentAccessRuntime & ReadImageContentAccessRuntime) | undefined;
  readonly resolveResourceScope?: () => ResourceRef['scope'];
  readonly now?: () => number;
}

type ContentReadToolSet = 'all' | 'document' | 'image';

export function createContentReadCapabilityProvider(
  deps: ContentReadCapabilityProviderDeps = {},
): AgentCapabilityProvider {
  return new ContentReadCapabilityProvider('neko-content-read', deps, 'all');
}

export function createContentDocumentReadCapabilityProvider(
  deps: ContentReadCapabilityProviderDeps = {},
): AgentCapabilityProvider {
  return new ContentReadCapabilityProvider('neko-agent-platform-document', deps, 'document');
}

export function createContentMediaReadCapabilityProvider(
  deps: ContentReadCapabilityProviderDeps = {},
): AgentCapabilityProvider {
  return new ContentReadCapabilityProvider('neko-agent-platform-media', deps, 'image');
}

class ContentReadCapabilityProvider implements AgentCapabilityProvider {
  readonly version = '1.0.0';
  readonly hostRequirements = [{ host: 'vscode' as const }, { host: 'tui' as const }];
  readonly requirements = { contentAccess: true };

  constructor(
    readonly id: string,
    private readonly deps: ContentReadCapabilityProviderDeps,
    private readonly toolSet: ContentReadToolSet,
  ) {}

  getTools(context: AgentCapabilityContext): Tool[] {
    void context;
    const tools: Tool[] = [];
    if (this.toolSet === 'all' || this.toolSet === 'document') {
      tools.push(
        createReadDocumentTool({
          contentAccessRuntime: this.readContentAccessRuntime(),
          resolveResourceScope: this.resolveResourceScope,
        }),
      );
    }
    if (this.toolSet === 'all' || this.toolSet === 'image') {
      tools.push(
        createReadImageTool({
          contentAccessRuntime: this.readContentAccessRuntime(),
          resolveResourceScope: this.resolveResourceScope,
          now: this.deps.now,
        }),
      );
    }
    return tools;
  }

  getToolGroups(): ToolGroup[] {
    const groups: ToolGroup[] = [];
    if (this.toolSet === 'all' || this.toolSet === 'document') {
      groups.push(createDocumentReadingToolGroup());
    }
    if (this.toolSet === 'all' || this.toolSet === 'image') {
      groups.push(createImageReadingToolGroup());
    }
    return groups;
  }

  private readonly resolveResourceScope = (): ResourceRef['scope'] =>
    this.deps.resolveResourceScope?.() ?? 'project';

  private readContentAccessRuntime():
    (ReadDocumentContentAccessRuntime & ReadImageContentAccessRuntime) | undefined {
    return this.deps.contentAccessRuntime ?? this.deps.getContentAccessRuntime?.();
  }
}

function createDocumentReadingToolGroup(): ToolGroup {
  return {
    name: 'document-reading',
    description:
      'Document reading tools for EPUB, PDF, DOC/DOCX, PPT/PPTX, Excel, text, Final Draft, comic archives, and image pages',
    tools: [TOOL_NAMES_SYSTEM.READ_DOCUMENT],
    alwaysActive: true,
    priority: 100,
    loadingTier: 'resident',
    source: 'builtin',
    enabled: true,
    icon: 'document',
  };
}

function createImageReadingToolGroup(): ToolGroup {
  return {
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
  };
}
