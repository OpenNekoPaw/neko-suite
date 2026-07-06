import {
  type CanvasMarkdownCapabilityTarget,
  type CanvasMarkdownResourceRef,
  isRuntimeOnlyCanvasMarkdownResourceValue,
} from '@neko/shared';
import type {
  CanvasAuthoringHandoffDiagnostic,
  CanvasAuthoringHandoffPromptSpan,
  CanvasAuthoringHandoffStableRef,
  PluginTransferProvenance,
  PluginTransferTargetRef,
} from '@neko-agent/types';
import type { MarkdownResourceRenderingProjection } from './markdown-resource-rendering-presenter';

export interface CanvasMarkdownHandoffRequest {
  readonly markdown: string;
  readonly title?: string;
  readonly sourceFormat?:
    'markdown' | 'markdown-table' | 'gfm-table' | 'resource-reference-markdown';
  readonly resources?: readonly CanvasMarkdownResourceRef[];
  readonly stableRefs?: readonly CanvasAuthoringHandoffStableRef[];
  readonly diagnostics?: readonly CanvasAuthoringHandoffDiagnostic[];
  readonly promptSpans?: readonly CanvasAuthoringHandoffPromptSpan[];
  readonly target?: CanvasMarkdownCapabilityTarget;
  readonly provenance?: PluginTransferProvenance;
  readonly userIntent?: string;
  readonly declaredIntentHint?: 'auto' | 'note' | 'table' | 'creative-table';
  readonly declaredProfileHint?: string;
}

export interface ProjectCanvasMarkdownHandoffRequestOptions {
  readonly markdown: string;
  readonly markdownResources?: MarkdownResourceRenderingProjection;
  readonly target?: PluginTransferTargetRef;
  readonly provenance?: PluginTransferProvenance;
  readonly title?: string;
  readonly userIntent?: string;
  readonly declaredIntentHint?: CanvasMarkdownHandoffRequest['declaredIntentHint'];
  readonly declaredProfileHint?: string;
}

export function projectCanvasMarkdownHandoffRequest(
  options: ProjectCanvasMarkdownHandoffRequestOptions,
): CanvasMarkdownHandoffRequest | null {
  const markdown = options.markdown.trim();
  if (!markdown) return null;

  const handoffKind = inferCanvasMarkdownHandoffKind(markdown);
  if (!handoffKind) return null;

  const resources = projectCanvasMarkdownResources(options.markdownResources);
  const stableRefs = projectCanvasMarkdownStableRefs(options.markdownResources);
  const diagnostics = projectCanvasMarkdownDiagnostics(options.markdownResources);
  const promptSpans = projectCanvasMarkdownPromptSpans(options.markdownResources);
  const target = projectCanvasMarkdownTarget(options.target);
  const provenance = projectCanvasMarkdownProvenance(options.provenance);
  const declaredIntentHint = options.declaredIntentHint ?? handoffKind.declaredIntentHint;
  const declaredProfileHint = options.declaredProfileHint ?? handoffKind.declaredProfileHint;

  return {
    markdown,
    sourceFormat: 'gfm-table',
    ...(options.title ? { title: options.title } : {}),
    ...(options.userIntent ? { userIntent: options.userIntent } : {}),
    ...(declaredIntentHint ? { declaredIntentHint } : {}),
    ...(declaredProfileHint ? { declaredProfileHint } : {}),
    ...(resources.length > 0 ? { resources } : {}),
    ...(stableRefs.length > 0 ? { stableRefs } : {}),
    ...(diagnostics.length > 0 ? { diagnostics } : {}),
    ...(promptSpans.length > 0 ? { promptSpans } : {}),
    ...(target ? { target } : {}),
    ...(provenance ? { provenance } : {}),
  };
}

function projectCanvasMarkdownStableRefs(
  projection: MarkdownResourceRenderingProjection | undefined,
): readonly CanvasAuthoringHandoffStableRef[] {
  if (!projection) return [];
  const byKey = new Map<string, CanvasAuthoringHandoffStableRef>();
  for (const mention of projection.mentions ?? []) {
    if (!mention.ref) continue;
    const ref = {
      ...mention.ref,
      token: mention.raw,
    };
    byKey.set(canvasAuthoringStableRefKey(ref), ref);
  }
  return Array.from(byKey.values());
}

function projectCanvasMarkdownDiagnostics(
  projection: MarkdownResourceRenderingProjection | undefined,
): readonly CanvasAuthoringHandoffDiagnostic[] {
  return (
    projection?.diagnostics.map((diagnostic) => ({
      severity: diagnostic.severity,
      code: diagnostic.code,
      message: diagnostic.message,
      ...(diagnostic.token ? { token: diagnostic.token } : {}),
      ...(diagnostic.range ? { range: diagnostic.range } : {}),
    })) ?? []
  );
}

function projectCanvasMarkdownPromptSpans(
  projection: MarkdownResourceRenderingProjection | undefined,
): readonly CanvasAuthoringHandoffPromptSpan[] {
  return (
    projection?.promptSpans?.map((span) => ({
      kind: span.kind,
      range: span.range,
      ...(span.fieldId ? { fieldId: span.fieldId } : {}),
      ...(span.label ? { label: span.label } : {}),
      ...(span.ref ? { ref: span.ref } : {}),
      ...(span.tone ? { tone: span.tone } : {}),
      ...(span.tooltip ? { tooltip: span.tooltip } : {}),
    })) ?? []
  );
}

function projectCanvasMarkdownResources(
  projection: MarkdownResourceRenderingProjection | undefined,
): readonly CanvasMarkdownResourceRef[] {
  if (!projection) return [];
  const byKey = new Map<string, CanvasMarkdownResourceRef>();
  for (const token of projection.tokens) {
    for (const resource of token.resources) {
      if (!isSafeCanvasMarkdownHandoffResource(resource)) continue;
      const key = canvasMarkdownResourceKey(resource);
      if (!byKey.has(key)) byKey.set(key, resource);
    }
  }
  return Array.from(byKey.values());
}

function isSafeCanvasMarkdownHandoffResource(resource: CanvasMarkdownResourceRef): boolean {
  if (resource.token && isRuntimeOnlyCanvasMarkdownResourceValue(resource.token)) return false;
  if (resource.sourcePath && isRuntimeOnlyCanvasMarkdownResourceValue(resource.sourcePath)) {
    return false;
  }
  return true;
}

interface CanvasMarkdownHandoffKind {
  readonly declaredIntentHint?: CanvasMarkdownHandoffRequest['declaredIntentHint'];
  readonly declaredProfileHint?: string;
}

function inferCanvasMarkdownHandoffKind(markdown: string): CanvasMarkdownHandoffKind | null {
  const tables = extractGfmTables(markdown);
  if (tables.length === 0) return null;
  return {};
}

function extractGfmTables(markdown: string): readonly (readonly string[])[] {
  const lines = markdown.split(/\r?\n/);
  const tables: string[][] = [];
  let inFence = false;

  for (let index = 0; index < lines.length - 1; index += 1) {
    const line = lines[index] ?? '';
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const next = lines[index + 1] ?? '';
    if (looksLikeTableRow(line) && looksLikeDividerRow(next)) {
      tables.push(parseTableCells(line));
    }
  }

  return tables;
}

function looksLikeTableRow(line: string): boolean {
  return line.includes('|') && parseTableCells(line).length > 1;
}

function looksLikeDividerRow(line: string): boolean {
  const cells = parseTableCells(line);
  return cells.length > 1 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function parseTableCells(line: string): string[] {
  const trimmed = line.trim();
  const withoutLeading = trimmed.startsWith('|') ? trimmed.slice(1) : trimmed;
  const withoutTrailing = withoutLeading.endsWith('|')
    ? withoutLeading.slice(0, -1)
    : withoutLeading;
  return withoutTrailing.split('|').map((cell) => stripInlineMarkdown(cell.trim()));
}

function stripInlineMarkdown(value: string): string {
  return value.replace(/^`(.+)`$/, '$1').trim();
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
): PluginTransferProvenance | undefined {
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

function canvasAuthoringStableRefKey(ref: CanvasAuthoringHandoffStableRef): string {
  return `${ref.namespace ?? 'default'}:${ref.kind}:${ref.id}:${ref.token ?? ''}`;
}
