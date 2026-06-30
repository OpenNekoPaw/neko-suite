import type {
  CanvasMarkdownCapabilityInput,
  CanvasMarkdownCapabilityTarget,
  CanvasMarkdownResourceRef,
} from '@neko/shared';
import type { PluginTransferProvenance, PluginTransferTargetRef } from '@neko-agent/types';
import type { MarkdownResourceRenderingProjection } from './markdown-resource-rendering-presenter';

export interface ProjectCanvasMarkdownCapabilityInputOptions {
  readonly markdown: string;
  readonly markdownResources?: MarkdownResourceRenderingProjection;
  readonly target?: PluginTransferTargetRef;
  readonly provenance?: PluginTransferProvenance;
  readonly title?: string;
  readonly capabilityId?: CanvasMarkdownCapabilityInput['capabilityId'];
  readonly intentHint?: Extract<
    CanvasMarkdownCapabilityInput,
    { capabilityId: 'canvas.ingestMarkdown' }
  >['intentHint'];
  readonly profileHint?: string;
}

export function projectCanvasMarkdownCapabilityInput(
  options: ProjectCanvasMarkdownCapabilityInputOptions,
): CanvasMarkdownCapabilityInput | null {
  const markdown = options.markdown.trim();
  if (!markdown) return null;

  const capabilityId = options.capabilityId ?? 'canvas.ingestMarkdown';
  if (capabilityId === 'canvas.attachResource') return null;
  const resources = projectCanvasMarkdownResources(options.markdownResources);
  const target = projectCanvasMarkdownTarget(options.target);
  const provenance = projectCanvasMarkdownProvenance(options.provenance);
  const hasGfmTable = containsGfmTable(markdown);

  return {
    capabilityId,
    markdown,
    sourceFormat: hasGfmTable ? 'gfm-table' : 'markdown',
    ...(options.title ? { title: options.title } : {}),
    ...(capabilityId === 'canvas.createTableFromMarkdown' && options.title
      ? { tableTitle: options.title }
      : {}),
    ...(capabilityId === 'canvas.createStoryboardFromMarkdown' ? { mode: 'create-nodes' } : {}),
    ...(capabilityId === 'canvas.ingestMarkdown'
      ? { intentHint: options.intentHint ?? (hasGfmTable ? 'auto' : 'note') }
      : {}),
    ...(options.profileHint ? { profileHint: options.profileHint } : {}),
    ...(resources.length > 0 ? { resources } : {}),
    ...(target ? { target } : {}),
    ...(provenance ? { provenance } : {}),
  };
}

function projectCanvasMarkdownResources(
  projection: MarkdownResourceRenderingProjection | undefined,
): readonly CanvasMarkdownResourceRef[] {
  if (!projection) return [];
  const byKey = new Map<string, CanvasMarkdownResourceRef>();
  for (const token of projection.tokens) {
    for (const resource of token.resources) {
      const key = canvasMarkdownResourceKey(resource);
      if (!byKey.has(key)) byKey.set(key, resource);
    }
  }
  return Array.from(byKey.values());
}

function containsGfmTable(markdown: string): boolean {
  const lines = markdown.split(/\r?\n/);
  return lines.some((line, index) => {
    const next = lines[index + 1];
    return Boolean(
      next &&
      /^\s*\|.*\|\s*$/.test(line) &&
      /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(next),
    );
  });
}

function projectCanvasMarkdownTarget(
  target: PluginTransferTargetRef | undefined,
): CanvasMarkdownCapabilityTarget | undefined {
  if (!target) return undefined;
  const { plugin: _plugin, ...rest } = target;
  return Object.keys(rest).length > 0 ? rest : undefined;
}

function projectCanvasMarkdownProvenance(
  provenance: PluginTransferProvenance | undefined,
): CanvasMarkdownCapabilityInput['provenance'] | undefined {
  if (!provenance) return undefined;
  const { metadata: _metadata, ...rest } = provenance;
  return Object.keys(rest).length > 0 ? rest : undefined;
}

function canvasMarkdownResourceKey(resource: CanvasMarkdownResourceRef): string {
  return (
    (resource.resourceRef
      ? `resource:${resource.resourceRef.provider}:${resource.resourceRef.id}`
      : undefined) ??
    (resource.documentResourceRef
      ? `document:${resource.documentResourceRef.source.filePath}:${resource.documentResourceRef.entryPath ?? JSON.stringify(resource.documentResourceRef.locator)}`
      : undefined) ??
    (resource.sourcePath ? `path:${resource.sourcePath}` : undefined) ??
    `token:${resource.token ?? ''}`
  );
}
