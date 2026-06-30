import type { ContentBlock, ToolCall } from '@neko-agent/types';
import {
  isRuntimeOnlyCanvasMarkdownResourceValue,
  isResourceRef,
  parseDocumentArchiveResourceRef,
  type CanvasMarkdownResourceRef,
  type DocumentArchiveResourceRef,
  type PerceptionCard,
  type PerceptualAssetRef,
  type ResourceRef,
  type ToolResultAttachment,
} from '@neko/shared';

export type MarkdownResourceStatus = 'bound' | 'ambiguous' | 'missing' | 'unsupported';

export interface MarkdownResourceDiagnostic {
  readonly severity: 'info' | 'warning' | 'error';
  readonly code: string;
  readonly message: string;
  readonly token?: string;
  readonly candidates?: readonly MarkdownResourceCandidateSummary[];
}

export interface MarkdownResourceCandidateSummary {
  readonly token?: string;
  readonly label?: string;
  readonly role?: string;
  readonly mimeType?: string;
  readonly width?: number;
  readonly height?: number;
  readonly sourceTitle?: string;
  readonly pageNumber?: number;
}

export interface MarkdownRenderedResourceToken {
  readonly token: string;
  readonly status: MarkdownResourceStatus;
  readonly refs: readonly MarkdownResourceCandidateSummary[];
  readonly resources: readonly CanvasMarkdownResourceRef[];
  readonly renderUris: readonly string[];
  readonly diagnostics: readonly MarkdownResourceDiagnostic[];
}

export interface MarkdownResourceRenderingProjection {
  readonly status: 'none' | 'ready' | 'diagnostic';
  readonly tokens: readonly MarkdownRenderedResourceToken[];
  readonly diagnostics: readonly MarkdownResourceDiagnostic[];
}

interface MarkdownToolResultImageRef {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly assetIndex: number;
  readonly label?: string;
  readonly alias?: string;
  readonly aliasScope?: string;
  readonly sourceDocumentId?: string;
  readonly entryPath?: string;
  readonly batchKey: string;
  readonly mimeType?: string;
  readonly pageNumber?: number;
  readonly sequenceNumber?: number;
  readonly documentResourceRef?: DocumentArchiveResourceRef;
  readonly resourceRef?: ResourceRef;
  readonly renderUri?: string;
  readonly extraTokens?: readonly string[];
  readonly width?: number;
  readonly height?: number;
}

export interface ProjectMarkdownResourceRenderingInput {
  readonly markdown: string;
  readonly siblingBlocks?: readonly ContentBlock[];
  readonly toolCalls?: readonly ToolCall[];
}

const COMMONMARK_IMAGE_RE = /!\[[^\]]*]\(([^)]+)\)/g;
const RESOURCE_REFERENCE_EMBED_OR_LINK_RE = /!?\[\[([^\]]+)]]/g;
const TABLE_ROW_RE = /^\s*\|.*\|\s*$/;
const RESOURCE_CELL_TOKEN_RE =
  /`?([A-Za-z][A-Za-z0-9_.-]{0,80})(?:#[A-Za-z][A-Za-z0-9_.:-]{0,80})?`?/g;
const RESOURCE_COLUMN_HINTS = new Set([
  'image',
  'images',
  'picture',
  'resource',
  'resources',
  'asset',
  'assets',
  'reference',
  'references',
  'ref',
  'media',
  'source',
  '来源',
  '源图',
  '图片',
  '图像',
  '资源',
  '素材',
  '参考图',
  '参考',
]);

export function projectMarkdownResourceRendering(
  input: ProjectMarkdownResourceRenderingInput,
): MarkdownResourceRenderingProjection {
  const refs = collectMarkdownToolResultImageRefs(input);
  const resourceIndex = createResourceIndex(refs);
  const diagnostics = detectUnsupportedResourceReferenceSyntax(input.markdown);
  const tokens = extractMarkdownResourceTokens(input.markdown).map((token) =>
    projectMarkdownResourceToken(token, resourceIndex),
  );
  const allDiagnostics = [
    ...diagnostics,
    ...tokens.flatMap((projection) => projection.diagnostics),
  ];
  if (tokens.length === 0 && allDiagnostics.length === 0) {
    return { status: 'none', tokens: [], diagnostics: [] };
  }
  return {
    status: allDiagnostics.some((diagnostic) => diagnostic.severity === 'error')
      ? 'diagnostic'
      : 'ready',
    tokens,
    diagnostics: allDiagnostics,
  };
}

export function normalizeMarkdownResourceLookupToken(value: string): string {
  return stripResourcePlacementHint(stripMarkdownToken(value))
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function projectMarkdownResourceToken(
  token: string,
  resourceIndex: ReadonlyMap<string, readonly MarkdownToolResultImageRef[]>,
): MarkdownRenderedResourceToken {
  const refs = resourceIndex.get(normalizeMarkdownResourceLookupToken(token)) ?? [];
  if (refs.length === 0) {
    return {
      token,
      status: 'missing',
      refs: [],
      resources: [],
      renderUris: [],
      diagnostics: [
        {
          severity: 'error',
          code: 'missing-resource-token',
          token,
          message: `Creative draft resource token "${token}" does not match a known resource.`,
        },
      ],
    };
  }
  const summaries = refs.map(createSafeCandidateSummary);
  if (refs.length > 1) {
    return {
      token,
      status: 'ambiguous',
      refs: summaries,
      resources: refs.flatMap((ref) => projectCanvasMarkdownResourceRef(token, ref) ?? []),
      renderUris: uniqueStrings(refs.flatMap((ref) => (ref.renderUri ? [ref.renderUri] : []))),
      diagnostics: [
        {
          severity: 'error',
          code: 'ambiguous-resource-token',
          token,
          message: `Creative draft resource token "${token}" matches multiple resources.`,
          candidates: summaries,
        },
      ],
    };
  }
  const ref = refs[0];
  if (!ref) {
    throw new Error(`Resource index returned an empty candidate for token "${token}".`);
  }
  const resource = projectCanvasMarkdownResourceRef(token, ref);
  return {
    token,
    status: 'bound',
    refs: summaries,
    resources: resource ? [resource] : [],
    renderUris: ref.renderUri ? [ref.renderUri] : [],
    diagnostics: [],
  };
}

function projectCanvasMarkdownResourceRef(
  token: string,
  ref: MarkdownToolResultImageRef,
): CanvasMarkdownResourceRef | undefined {
  const sourcePath = ref.documentResourceRef ? undefined : ref.entryPath;
  const resource: CanvasMarkdownResourceRef = {
    token,
    ...(ref.label ? { label: ref.label } : {}),
    role: 'source',
    ...(sourcePath && !isRuntimeOnlyCanvasMarkdownResourceValue(sourcePath) ? { sourcePath } : {}),
    ...(ref.resourceRef ? { resourceRef: ref.resourceRef } : {}),
    ...(ref.documentResourceRef ? { documentResourceRef: ref.documentResourceRef } : {}),
  };
  return resource.sourcePath || resource.resourceRef || resource.documentResourceRef
    ? resource
    : undefined;
}

function createSafeCandidateSummary(
  ref: MarkdownToolResultImageRef,
): MarkdownResourceCandidateSummary {
  return {
    ...((ref.alias ?? ref.label) ? { token: ref.alias ?? ref.label } : {}),
    ...(ref.label ? { label: ref.label } : {}),
    ...(ref.mimeType ? { mimeType: ref.mimeType } : {}),
    ...(ref.width !== undefined ? { width: ref.width } : {}),
    ...(ref.height !== undefined ? { height: ref.height } : {}),
    ...(ref.sourceDocumentId ? { sourceTitle: ref.sourceDocumentId } : {}),
    ...(ref.pageNumber !== undefined ? { pageNumber: ref.pageNumber } : {}),
    role: 'source',
  };
}

function extractMarkdownResourceTokens(markdown: string): readonly string[] {
  return uniqueStrings([
    ...extractCommonMarkImageTargets(markdown),
    ...extractTableResourceCellTokens(markdown),
  ]);
}

function extractCommonMarkImageTargets(markdown: string): readonly string[] {
  return Array.from(markdown.matchAll(COMMONMARK_IMAGE_RE))
    .map((match) => match[1])
    .filter(isNonEmptyString)
    .map((target) => stripResourcePlacementHint(stripMarkdownToken(target)));
}

function extractTableResourceCellTokens(markdown: string): readonly string[] {
  const tokens: string[] = [];
  const lines = markdown.split(/\r?\n/);
  for (let index = 0; index < lines.length - 2; index += 1) {
    const header = parseTableLine(lines[index] ?? '');
    const separator = parseTableLine(lines[index + 1] ?? '');
    if (!header || !separator || !isSeparatorRow(separator)) continue;
    const resourceColumnIndexes = header
      .map((label, columnIndex) =>
        RESOURCE_COLUMN_HINTS.has(normalizeMarkdownResourceLookupToken(label)) ? columnIndex : -1,
      )
      .filter((columnIndex) => columnIndex >= 0);
    for (let rowIndex = index + 2; rowIndex < lines.length; rowIndex += 1) {
      if (!TABLE_ROW_RE.test(lines[rowIndex] ?? '')) break;
      const cells = parseTableLine(lines[rowIndex] ?? '');
      if (!cells) break;
      for (const columnIndex of resourceColumnIndexes) {
        tokens.push(...extractCellTokens(cells[columnIndex] ?? ''));
      }
    }
  }
  return tokens;
}

function extractCellTokens(value: string): readonly string[] {
  const imageTargets = extractCommonMarkImageTargets(value);
  const valueWithoutImages = value.replace(COMMONMARK_IMAGE_RE, ' ');
  const plainTokens = Array.from(valueWithoutImages.matchAll(RESOURCE_CELL_TOKEN_RE))
    .map((match) => stripMarkdownToken(match[1] ?? match[0]))
    .filter((token) => token.length > 0 && !isIgnoredResourceWord(token));
  return uniqueStrings([...imageTargets, ...plainTokens]);
}

function detectUnsupportedResourceReferenceSyntax(
  markdown: string,
): readonly MarkdownResourceDiagnostic[] {
  return Array.from(markdown.matchAll(RESOURCE_REFERENCE_EMBED_OR_LINK_RE)).map((match) => ({
    severity: 'warning',
    code: 'unsupported-resource-reference-markdown-extension',
    token: match[1],
    message:
      'Neko resource-reference embeds and links are not enabled for Agent Markdown rendering yet.',
  }));
}

function parseTableLine(line: string): readonly string[] | undefined {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return undefined;
  return trimmed
    .slice(1, -1)
    .split('|')
    .map((cell) => cell.trim());
}

function isSeparatorRow(cells: readonly string[]): boolean {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function createResourceIndex(
  refs: readonly MarkdownToolResultImageRef[],
): ReadonlyMap<string, readonly MarkdownToolResultImageRef[]> {
  const index = new Map<string, MarkdownToolResultImageRef[]>();
  for (const ref of refs) {
    for (const token of createMarkdownToolResultTokens(ref)) {
      const key = normalizeMarkdownResourceLookupToken(token);
      const existing = index.get(key) ?? [];
      if (
        existing.some((candidate) => resourceIdentityKey(candidate) === resourceIdentityKey(ref))
      ) {
        continue;
      }
      index.set(key, [...existing, ref]);
    }
  }
  return index;
}

function resourceIdentityKey(ref: MarkdownToolResultImageRef): string {
  if (ref.resourceRef) return `resource:${ref.resourceRef.id}`;
  if (ref.documentResourceRef) {
    return `document:${ref.documentResourceRef.source.filePath}:${ref.documentResourceRef.entryPath ?? ''}`;
  }
  return `tool:${ref.toolCallId}:${ref.assetIndex}`;
}

function createMarkdownToolResultTokens(ref: MarkdownToolResultImageRef): readonly string[] {
  return uniqueStrings(
    [
      ref.alias,
      ref.label,
      ref.resourceRef?.id,
      ...(ref.resourceRef ? resourceRefLookupTokens(ref.resourceRef) : []),
      ref.documentResourceRef?.entryPath,
      ref.pageNumber !== undefined ? `page_${ref.pageNumber}` : undefined,
      ref.pageNumber !== undefined ? `P${ref.pageNumber}` : undefined,
      ref.sequenceNumber !== undefined ? `image_${ref.sequenceNumber}` : undefined,
      ref.sequenceNumber !== undefined ? `page_${ref.sequenceNumber}` : undefined,
      ref.sequenceNumber !== undefined ? `P${ref.sequenceNumber}` : undefined,
      ...(ref.entryPath ? pathLookupTokens(ref.entryPath) : []),
      ...(ref.documentResourceRef?.entryPath
        ? pathLookupTokens(ref.documentResourceRef.entryPath)
        : []),
      ...(ref.toolName === 'ReadImage' ? readImageDerivedAssetTokens(ref) : []),
      ...(ref.extraTokens ?? []),
    ]
      .filter(isNonEmptyString)
      .flatMap((value) => [value, normalizeMarkdownResourceLookupToken(value)]),
  );
}

function collectMarkdownToolResultImageRefs(
  options: Pick<ProjectMarkdownResourceRenderingInput, 'siblingBlocks' | 'toolCalls'>,
): readonly MarkdownToolResultImageRef[] {
  return dedupeMarkdownImageRefs(
    collectMarkdownToolCalls(options).flatMap((toolCall) =>
      collectMarkdownImageRefsFromToolCall(toolCall),
    ),
  );
}

function collectMarkdownToolCalls(
  options: Pick<ProjectMarkdownResourceRenderingInput, 'siblingBlocks' | 'toolCalls'>,
): readonly ToolCall[] {
  const byId = new Map<string, ToolCall>();
  for (const block of options.siblingBlocks ?? []) {
    if (block.type === 'tool_call' && block.toolCall) byId.set(block.toolCall.id, block.toolCall);
  }
  for (const toolCall of options.toolCalls ?? []) {
    byId.set(toolCall.id, toolCall);
  }
  return Array.from(byId.values());
}

function collectMarkdownImageRefsFromToolCall(
  toolCall: ToolCall,
): readonly MarkdownToolResultImageRef[] {
  const data = asRecord(toolCall.result?.data);
  if (!data) return [];
  const renderUrisByIndex = createToolResultRenderUriIndex(toolCall);
  const assetTokensByIndex = createToolResultAssetTokenIndex(toolCall);
  const refs: MarkdownToolResultImageRef[] = [];
  for (const [index, image] of readRecordArray(data, 'imageInfo').entries()) {
    refs.push(
      projectMarkdownImageRef(
        toolCall.id,
        toolCall.name,
        index,
        image,
        renderUrisByIndex.get(index),
        index + 1,
        assetTokensByIndex.get(index),
      ),
    );
  }
  for (const [index, image] of readRecordArray(data, 'images').entries()) {
    const documentImage = asRecord(image['documentImage']);
    refs.push(
      projectMarkdownImageRef(
        toolCall.id,
        toolCall.name,
        index,
        {
          ...(documentImage ?? {}),
          ...image,
          ...(documentImage?.['resourceRef'] !== undefined
            ? { resourceRef: documentImage['resourceRef'] }
            : {}),
        },
        renderUrisByIndex.get(index),
        index + 1,
        assetTokensByIndex.get(index),
      ),
    );
  }
  return refs;
}

function projectMarkdownImageRef(
  toolCallId: string,
  toolName: string,
  assetIndex: number,
  image: Record<string, unknown>,
  renderUri?: string,
  sequenceNumber?: number,
  extraTokens?: readonly string[],
): MarkdownToolResultImageRef {
  const locator = asRecord(image['locator']);
  const documentResourceRef = parseStableDocumentArchiveResourceRef(image['resourceRef']);
  const resourceRef = parseStableResourceRef(image['resourceRef']);
  const label = readString(image, 'label');
  const alias = readString(image, 'alias');
  const sourceDocumentId =
    readString(image, 'sourceDocumentId') ?? readDocumentResourceSourceId(documentResourceRef);
  const entryPath = readString(image, 'entryPath') ?? documentResourceRef?.entryPath;
  const pageNumber =
    readFinitePositiveInteger(locator?.['pageNumber']) ??
    resolveStoryboardSourceImageNumber(alias) ??
    resolveStoryboardSourceImageNumber(label) ??
    readDocumentResourcePageNumber(documentResourceRef);
  return {
    toolCallId,
    toolName,
    assetIndex,
    batchKey: sourceDocumentId ?? `tool:${toolCallId}`,
    ...(label ? { label } : {}),
    ...(alias ? { alias } : {}),
    ...(sourceDocumentId ? { sourceDocumentId } : {}),
    ...(entryPath ? { entryPath } : {}),
    ...(readString(image, 'mimeType') ? { mimeType: readString(image, 'mimeType') } : {}),
    ...((readRenderableUri(image) ?? renderUri)
      ? { renderUri: readRenderableUri(image) ?? renderUri }
      : {}),
    ...(extraTokens && extraTokens.length > 0 ? { extraTokens } : {}),
    ...(pageNumber !== undefined ? { pageNumber } : {}),
    ...(sequenceNumber !== undefined ? { sequenceNumber } : {}),
    ...(documentResourceRef ? { documentResourceRef } : {}),
    ...(resourceRef ? { resourceRef } : {}),
    ...(readFinitePositiveInteger(image['width'])
      ? { width: readFinitePositiveInteger(image['width']) }
      : {}),
    ...(readFinitePositiveInteger(image['height'])
      ? { height: readFinitePositiveInteger(image['height']) }
      : {}),
  };
}

function createToolResultRenderUriIndex(toolCall: ToolCall): ReadonlyMap<number, string> {
  const renderUris = new Map<number, string>();
  for (const [index, attachment] of (toolCall.result?.attachments ?? []).entries()) {
    const uri = readRenderableAttachmentUri(attachment);
    if (uri) renderUris.set(index, uri);
  }
  for (const [index, card] of (toolCall.result?.perceptionCards ?? []).entries()) {
    if (renderUris.has(index)) continue;
    const uri = readRenderablePerceptionCardUri(card);
    if (uri) renderUris.set(index, uri);
  }
  return renderUris;
}

function createToolResultAssetTokenIndex(
  toolCall: ToolCall,
): ReadonlyMap<number, readonly string[]> {
  const tokensByIndex = new Map<number, string[]>();
  const addTokens = (index: number, values: readonly (string | undefined)[]): void => {
    const stableValues = values.filter(isStableResourceLookupTokenCandidate);
    if (stableValues.length === 0) return;
    tokensByIndex.set(index, uniqueStrings([...(tokensByIndex.get(index) ?? []), ...stableValues]));
  };

  for (const [index, attachment] of (toolCall.result?.attachments ?? []).entries()) {
    addTokens(index, readToolResultAttachmentLookupTokens(attachment));
  }
  for (const [index, card] of (toolCall.result?.perceptionCards ?? []).entries()) {
    addTokens(index, readPerceptionCardLookupTokens(card));
  }

  return tokensByIndex;
}

function readToolResultAttachmentLookupTokens(
  attachment: ToolResultAttachment,
): readonly (string | undefined)[] {
  return readPerceptualAssetRefLookupTokens(attachment.assetRef);
}

function readPerceptionCardLookupTokens(card: PerceptionCard): readonly (string | undefined)[] {
  return [
    card.assetId,
    card.cacheKey,
    ...readPerceptualAssetRefLookupTokens(card.perceptual?.thumbnailRef),
    ...(card.perceptual?.keyframeRefs ?? []).flatMap(readPerceptualAssetRefLookupTokens),
    ...(card.perceptual?.multiViewRefs ?? []).flatMap(readPerceptualAssetRefLookupTokens),
  ];
}

function readPerceptualAssetRefLookupTokens(
  ref: PerceptualAssetRef | undefined,
): readonly (string | undefined)[] {
  return ref ? [ref.assetId, ref.label, ref.uri, ref.documentResourceRef?.entryPath] : [];
}

function readRenderableAttachmentUri(attachment: ToolResultAttachment): string | undefined {
  const record = asRecord(attachment);
  return readRenderableUri(record) ?? readRenderableUri(asRecord(record?.['assetRef']));
}

function readRenderablePerceptionCardUri(card: PerceptionCard): string | undefined {
  return (
    readRenderableUri(asRecord(card.perceptual?.thumbnailRef)) ??
    (card.perceptual?.keyframeRefs ?? [])
      .map((ref) => readRenderableUri(asRecord(ref)))
      .find(isNonEmptyString)
  );
}

function readRenderableUri(record: Record<string, unknown> | undefined): string | undefined {
  if (!record) return undefined;
  for (const key of [
    'renderUri',
    'previewUri',
    'preview',
    'thumbnailUrl',
    'url',
    'imageUrl',
    'src',
    'path',
    'uri',
  ]) {
    const value = readString(record, key);
    if (value && isRenderableUri(value)) return value;
  }
  return undefined;
}

function isRenderableUri(value: string): boolean {
  if (!value) return false;
  if (value.startsWith('file:') || value.startsWith('data:') || value.startsWith('blob:')) {
    return false;
  }
  if (value.startsWith('${') || isAbsolutePath(value)) return false;
  if (value.startsWith('http://') || value.startsWith('https://')) return true;
  if (value.startsWith('webview://')) return true;
  return value.includes('vscode-resource') || value.includes('vscode-webview');
}

function isStableResourceLookupTokenCandidate(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false;
  const trimmed = value.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return false;
  if (trimmed.startsWith('file:') || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return false;
  }
  if (trimmed.startsWith('${') || isAbsolutePath(trimmed)) return false;
  return !isRuntimeOnlyCanvasMarkdownResourceValue(trimmed);
}

function dedupeMarkdownImageRefs(
  refs: readonly MarkdownToolResultImageRef[],
): readonly MarkdownToolResultImageRef[] {
  const seen = new Set<string>();
  const deduped: MarkdownToolResultImageRef[] = [];
  for (const ref of refs) {
    const key =
      (ref.documentResourceRef
        ? `${ref.documentResourceRef.source.filePath}:${ref.documentResourceRef.entryPath ?? JSON.stringify(ref.documentResourceRef.locator)}`
        : undefined) ??
      (ref.resourceRef ? `${ref.resourceRef.provider}:${ref.resourceRef.id}` : undefined) ??
      `${ref.toolCallId}:${ref.assetIndex}`;
    if (seen.has(key)) {
      const existingIndex = deduped.findIndex(
        (candidate) => markdownImageRefDedupeKey(candidate) === key,
      );
      const existing = existingIndex >= 0 ? deduped[existingIndex] : undefined;
      if (existing) {
        deduped[existingIndex] = mergeMarkdownImageRefs(existing, ref);
      }
      continue;
    }
    seen.add(key);
    deduped.push(ref);
  }
  return deduped;
}

function markdownImageRefDedupeKey(ref: MarkdownToolResultImageRef): string {
  return (
    (ref.documentResourceRef
      ? `${ref.documentResourceRef.source.filePath}:${ref.documentResourceRef.entryPath ?? JSON.stringify(ref.documentResourceRef.locator)}`
      : undefined) ??
    (ref.resourceRef ? `${ref.resourceRef.provider}:${ref.resourceRef.id}` : undefined) ??
    `${ref.toolCallId}:${ref.assetIndex}`
  );
}

function mergeMarkdownImageRefs(
  existing: MarkdownToolResultImageRef,
  incoming: MarkdownToolResultImageRef,
): MarkdownToolResultImageRef {
  return {
    ...incoming,
    toolCallId: existing.toolCallId,
    toolName: existing.toolName,
    assetIndex: existing.assetIndex,
    batchKey: existing.batchKey,
    ...((existing.label ?? incoming.label) ? { label: existing.label ?? incoming.label } : {}),
    ...((existing.alias ?? incoming.alias) ? { alias: existing.alias ?? incoming.alias } : {}),
    ...((existing.aliasScope ?? incoming.aliasScope)
      ? { aliasScope: existing.aliasScope ?? incoming.aliasScope }
      : {}),
    ...((existing.sourceDocumentId ?? incoming.sourceDocumentId)
      ? { sourceDocumentId: existing.sourceDocumentId ?? incoming.sourceDocumentId }
      : {}),
    ...((existing.entryPath ?? incoming.entryPath)
      ? { entryPath: existing.entryPath ?? incoming.entryPath }
      : {}),
    ...((existing.mimeType ?? incoming.mimeType)
      ? { mimeType: existing.mimeType ?? incoming.mimeType }
      : {}),
    ...((existing.pageNumber ?? incoming.pageNumber)
      ? { pageNumber: existing.pageNumber ?? incoming.pageNumber }
      : {}),
    ...((existing.sequenceNumber ?? incoming.sequenceNumber)
      ? { sequenceNumber: existing.sequenceNumber ?? incoming.sequenceNumber }
      : {}),
    ...((existing.documentResourceRef ?? incoming.documentResourceRef)
      ? { documentResourceRef: existing.documentResourceRef ?? incoming.documentResourceRef }
      : {}),
    ...((existing.resourceRef ?? incoming.resourceRef)
      ? { resourceRef: existing.resourceRef ?? incoming.resourceRef }
      : {}),
    ...((existing.renderUri ?? incoming.renderUri)
      ? { renderUri: existing.renderUri ?? incoming.renderUri }
      : {}),
    extraTokens: uniqueStrings([...(existing.extraTokens ?? []), ...(incoming.extraTokens ?? [])]),
    ...((existing.width ?? incoming.width) ? { width: existing.width ?? incoming.width } : {}),
    ...((existing.height ?? incoming.height) ? { height: existing.height ?? incoming.height } : {}),
  };
}

function readDocumentResourcePageNumber(
  resourceRef: DocumentArchiveResourceRef | undefined,
): number | undefined {
  if (resourceRef?.locator?.kind === 'page' || resourceRef?.locator?.kind === 'region') {
    return resourceRef.locator.pageNumber;
  }
  return resolveStoryboardSourceImageNumber(resourceRef?.entryPath);
}

function readDocumentResourceSourceId(
  resourceRef: DocumentArchiveResourceRef | undefined,
): string | undefined {
  if (!resourceRef) return undefined;
  return (
    resourceRef.source.identity?.hash ??
    resourceRef.source.identity?.fileId ??
    resourceRef.source.fileId ??
    resourceRef.source.filePath
  );
}

function parseStableResourceRef(value: unknown): ResourceRef | undefined {
  return isResourceRef(value) ? value : undefined;
}

function parseStableDocumentArchiveResourceRef(
  value: unknown,
): DocumentArchiveResourceRef | undefined {
  return parseDocumentArchiveResourceRef(value);
}

function resolveStoryboardSourceImageNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const match =
    /(?:^|[\s/:：#_.\\-])(?:p|page|pg|页|原页|来源页|source|image|img|图|图片|panel|分格)[\s_#_.:-]*(\d{1,4})(?:\b|$)/i.exec(
      value.trim(),
    );
  return parsePositiveIntegerValue(match?.[1]);
}

function fileStem(value: string): string | undefined {
  const name = value.replace(/\\/g, '/').split('/').pop();
  if (!name) return undefined;
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

function fileName(value: string): string | undefined {
  return value.replace(/\\/g, '/').split('/').pop();
}

function pathLookupTokens(value: string): readonly string[] {
  return [value, fileName(value), fileStem(value)].filter(isNonEmptyString);
}

function stripMarkdownToken(value: string): string {
  return value.trim().replace(/^`+|`+$/g, '');
}

function stripResourcePlacementHint(value: string): string {
  const trimmed = value.trim();
  if (/^[A-Za-z][A-Za-z0-9_.~:@/%+-]*#[A-Za-z][A-Za-z0-9_.:-]*$/.test(trimmed)) {
    return trimmed.slice(0, trimmed.indexOf('#'));
  }
  return trimmed;
}

function resourceRefLookupTokens(resourceRef: ResourceRef): readonly string[] {
  return uniqueStrings(
    [
      resourceRef.source.filePath,
      resourceRef.source.projectRelativePath,
      resourceRef.locator?.kind === 'file' ? resourceRef.locator.path : undefined,
    ]
      .filter(isNonEmptyString)
      .flatMap(pathLookupTokens),
  );
}

function readImageDerivedAssetTokens(ref: MarkdownToolResultImageRef): readonly string[] {
  return uniqueStrings(
    [
      ref.alias,
      ref.label,
      ref.entryPath ? fileName(ref.entryPath) : undefined,
      ref.entryPath ? fileStem(ref.entryPath) : undefined,
      ref.resourceRef?.source.filePath ? fileName(ref.resourceRef.source.filePath) : undefined,
      ref.resourceRef?.source.projectRelativePath
        ? fileName(ref.resourceRef.source.projectRelativePath)
        : undefined,
      ref.resourceRef?.locator?.kind === 'file' && ref.resourceRef.locator.path
        ? fileName(ref.resourceRef.locator.path)
        : undefined,
    ]
      .filter(isNonEmptyString)
      .map(toReadImageDerivedAssetToken)
      .filter(isNonEmptyString),
  );
}

function toReadImageDerivedAssetToken(value: string): string | undefined {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!normalized || normalized.startsWith('read-image-')) return undefined;
  return `read-image-${normalized}`;
}

function isIgnoredResourceWord(value: string): boolean {
  const normalized = value.toLowerCase();
  return (
    normalized === 'image' ||
    normalized === 'asset' ||
    normalized === 'resource' ||
    normalized === 'source' ||
    normalized === 'http' ||
    normalized === 'https'
  );
}

function readRecordArray(
  record: Record<string, unknown> | undefined,
  key: string,
): Record<string, unknown>[] {
  const value = record?.[key];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function readString(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readFinitePositiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

function parsePositiveIntegerValue(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAbsolutePath(value: string): boolean {
  return value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values));
}
