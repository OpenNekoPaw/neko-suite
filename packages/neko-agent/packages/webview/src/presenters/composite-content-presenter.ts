import type {
  CompositeBlockData,
  CompositeSection,
  ContentBlock,
  MediaRef,
  ToolCall,
} from '@/components/types';
import type {
  StoryboardTableV1,
  StoryboardValidationDiagnosticV1,
  DocumentArchiveResourceRef,
  ToolResultAttachment,
} from '@neko/shared';
import { parseDocumentArchiveResourceRef } from '@neko/shared';
import type { PluginsAvailable } from '@/components/ChatView/SendToMenu';

export type CompositeRichContentKind = 'storyboard-table' | 'comparison-grid' | 'asset-gallery';

export type CompositeMediaType = 'image' | 'video' | 'audio' | 'model' | 'unknown';

export type CompositeMediaDiagnosticCode = 'missing-tool-result' | 'missing-asset' | 'missing-uri';

export interface CompositeMediaDiagnostic {
  readonly code: CompositeMediaDiagnosticCode;
  readonly toolCallId: string;
  readonly assetIndex?: number;
  readonly assetId?: string;
  readonly message: string;
}

export type CompositeStoryboardDiagnostic = StoryboardValidationDiagnosticV1;

export interface ResolvedCompositeMedia {
  readonly id: string;
  readonly toolCallId: string;
  readonly assetIndex: number;
  readonly type: CompositeMediaType;
  readonly src: string;
  readonly assetId?: string;
  readonly stableUri?: string;
  readonly localPath?: string;
  readonly resourceRef?: DocumentArchiveResourceRef;
  readonly mimeType?: string;
  readonly caption?: string;
  readonly role?: string;
  readonly label?: string;
}

export interface ResolvedCompositeSection {
  readonly id: string;
  readonly index: number;
  readonly heading?: string;
  readonly content?: string;
  readonly layout?: CompositeSection['layout'];
  readonly media: readonly ResolvedCompositeMedia[];
  readonly diagnostics: readonly CompositeMediaDiagnostic[];
}

export interface CompositeRichContentData {
  readonly template: CompositeBlockData['template'];
  readonly title?: string;
  readonly plugins?: PluginsAvailable;
  readonly storyboardTable?: StoryboardTableV1;
  readonly storyboardDiagnostics?: readonly CompositeStoryboardDiagnostic[];
  readonly sections: readonly ResolvedCompositeSection[];
  readonly diagnostics: readonly CompositeMediaDiagnostic[];
}

export type StoryboardTableRichData = CompositeRichContentData & {
  readonly template: 'storyboard-table';
};

export type ComparisonGridRichData = CompositeRichContentData & {
  readonly template: 'comparison';
};

export type AssetGalleryRichData = CompositeRichContentData & {
  readonly template: 'gallery' | 'report';
};

export type CompositeRichContentProjection =
  | {
      readonly kind: 'storyboard-table';
      readonly data: StoryboardTableRichData;
    }
  | {
      readonly kind: 'comparison-grid';
      readonly data: ComparisonGridRichData;
    }
  | {
      readonly kind: 'asset-gallery';
      readonly data: AssetGalleryRichData;
    };

export interface ProjectCompositeBlockRichContentInput {
  readonly composite: CompositeBlockData;
  readonly siblingBlocks?: readonly ContentBlock[];
  readonly toolCalls?: readonly ToolCall[];
  readonly plugins?: PluginsAvailable;
}

interface MediaCandidate {
  readonly assetIndex: number;
  readonly type: CompositeMediaType;
  readonly src?: string;
  readonly assetId?: string;
  readonly stableUri?: string;
  readonly localPath?: string;
  readonly resourceRef?: DocumentArchiveResourceRef;
  readonly mimeType?: string;
  readonly label?: string;
}

const MAX_COMPOSITE_MEDIA_DIAGNOSTICS = 8;

export function projectCompositeBlockRichContent(
  input: ProjectCompositeBlockRichContentInput,
): CompositeRichContentProjection {
  const toolCalls = collectToolCalls(input.siblingBlocks, input.toolCalls);
  const diagnostics: CompositeMediaDiagnostic[] = [];
  const projectedSections = input.composite.sections.map((section, sectionIndex) =>
    projectCompositeSection({
      section,
      sectionIndex,
      toolCalls,
      diagnostics,
    }),
  );
  const sections = maybeBackfillStoryboardSectionMedia(
    projectedSections,
    input.composite.storyboardTable,
    toolCalls,
    diagnostics,
  );

  const base = {
    ...(input.composite.title ? { title: input.composite.title } : {}),
    ...(input.plugins ? { plugins: input.plugins } : {}),
    ...(input.composite.storyboardTable
      ? { storyboardTable: input.composite.storyboardTable }
      : {}),
    ...(input.composite.storyboardDiagnostics
      ? { storyboardDiagnostics: input.composite.storyboardDiagnostics }
      : {}),
    sections,
    diagnostics,
  };

  switch (input.composite.template) {
    case 'storyboard-table':
      return { kind: 'storyboard-table', data: { ...base, template: 'storyboard-table' } };
    case 'comparison':
      return { kind: 'comparison-grid', data: { ...base, template: 'comparison' } };
    case 'gallery':
    case 'report':
      return { kind: 'asset-gallery', data: { ...base, template: input.composite.template } };
  }
}

function maybeBackfillStoryboardSectionMedia(
  sections: readonly ResolvedCompositeSection[],
  storyboardTable: StoryboardTableV1 | undefined,
  toolCalls: ReadonlyMap<string, ToolCall>,
  diagnostics: CompositeMediaDiagnostic[],
): readonly ResolvedCompositeSection[] {
  if (!storyboardTable || sections.every((section) => section.media.length > 0)) {
    return sections;
  }

  const inferredRefs = collectSequentialStoryboardImageRefs(toolCalls);
  if (inferredRefs.length === 0) return sections;

  return sections.map((section) => {
    if (section.media.length > 0) return section;
    const inferredRef = inferredRefs[section.index];
    if (!inferredRef) return section;

    const resolved = resolveCompositeMediaRef(inferredRef, toolCalls);
    if ('media' in resolved) {
      return {
        ...section,
        media: [resolved.media],
      };
    }

    pushDiagnostic(diagnostics, resolved.diagnostic);
    return {
      ...section,
      diagnostics: [...section.diagnostics, resolved.diagnostic],
    };
  });
}

function collectSequentialStoryboardImageRefs(
  toolCalls: ReadonlyMap<string, ToolCall>,
): readonly MediaRef[] {
  const refs: MediaRef[] = [];
  for (const toolCall of toolCalls.values()) {
    if (!isStoryboardImageSourceTool(toolCall.name) || toolCall.result?.success !== true) {
      continue;
    }

    collectMediaCandidates(toolCall).forEach((candidate, candidateIndex) => {
      if (candidate.type !== 'image' || !candidate.src) return;
      refs.push({
        toolCallId: toolCall.id,
        assetIndex: candidateIndex,
        ...(candidate.label ? { caption: candidate.label } : {}),
        role: 'source',
      });
    });
  }
  return refs;
}

function isStoryboardImageSourceTool(toolName: string): boolean {
  return (
    toolName === 'ReadImage' || toolName === 'ReadDocumentImage' || toolName === 'ReadDocument'
  );
}

function projectCompositeSection(input: {
  readonly section: CompositeSection;
  readonly sectionIndex: number;
  readonly toolCalls: ReadonlyMap<string, ToolCall>;
  readonly diagnostics: CompositeMediaDiagnostic[];
}): ResolvedCompositeSection {
  const sectionDiagnostics: CompositeMediaDiagnostic[] = [];
  const media: ResolvedCompositeMedia[] = [];

  for (const mediaRef of input.section.mediaRefs ?? []) {
    const resolved = resolveCompositeMediaRef(mediaRef, input.toolCalls);
    if ('media' in resolved) {
      media.push(resolved.media);
      continue;
    }

    pushDiagnostic(sectionDiagnostics, resolved.diagnostic);
    pushDiagnostic(input.diagnostics, resolved.diagnostic);
  }

  return {
    id: `section-${input.sectionIndex}`,
    index: input.sectionIndex,
    ...(input.section.heading ? { heading: input.section.heading } : {}),
    ...(input.section.content ? { content: input.section.content } : {}),
    ...(input.section.layout ? { layout: input.section.layout } : {}),
    media,
    diagnostics: sectionDiagnostics,
  };
}

function resolveCompositeMediaRef(
  mediaRef: MediaRef,
  toolCalls: ReadonlyMap<string, ToolCall>,
): { readonly media: ResolvedCompositeMedia } | { readonly diagnostic: CompositeMediaDiagnostic } {
  const assetIndex = mediaRef.assetIndex ?? 0;
  const toolCall = toolCalls.get(mediaRef.toolCallId);
  if (!toolCall?.result || toolCall.result.success !== true) {
    return {
      diagnostic: {
        code: 'missing-tool-result',
        toolCallId: mediaRef.toolCallId,
        assetIndex,
        message: `Tool result is not ready for ${mediaRef.toolCallId}`,
      },
    };
  }

  const candidates = collectMediaCandidates(toolCall);
  const candidate = candidates[assetIndex];
  if (!candidate) {
    return {
      diagnostic: {
        code: 'missing-asset',
        toolCallId: mediaRef.toolCallId,
        assetIndex,
        message: `Asset ${assetIndex} is not available for ${mediaRef.toolCallId}`,
      },
    };
  }

  if (candidate.type === 'model' && !candidate.localPath) {
    return {
      diagnostic: {
        code: 'missing-uri',
        toolCallId: mediaRef.toolCallId,
        assetIndex,
        ...(candidate.assetId ? { assetId: candidate.assetId } : {}),
        message: `Asset ${assetIndex} does not have a local model path`,
      },
    };
  }

  if (!candidate.src && candidate.type !== 'model') {
    return {
      diagnostic: {
        code: 'missing-uri',
        toolCallId: mediaRef.toolCallId,
        assetIndex,
        ...(candidate.assetId ? { assetId: candidate.assetId } : {}),
        message: `Asset ${assetIndex} does not have a renderable webview URI`,
      },
    };
  }

  return {
    media: {
      id: [
        mediaRef.toolCallId,
        assetIndex,
        candidate.assetId ?? candidate.stableUri ?? candidate.src,
      ].join(':'),
      toolCallId: mediaRef.toolCallId,
      assetIndex,
      type: candidate.type,
      src: candidate.src ?? candidate.localPath ?? candidate.stableUri ?? '',
      ...(candidate.assetId ? { assetId: candidate.assetId } : {}),
      ...(candidate.stableUri ? { stableUri: candidate.stableUri } : {}),
      ...(candidate.localPath ? { localPath: candidate.localPath } : {}),
      ...(candidate.resourceRef ? { resourceRef: candidate.resourceRef } : {}),
      ...(candidate.mimeType ? { mimeType: candidate.mimeType } : {}),
      ...(mediaRef.caption || candidate.label
        ? { caption: mediaRef.caption ?? candidate.label }
        : {}),
      ...(mediaRef.role ? { role: mediaRef.role } : {}),
      ...(candidate.label ? { label: candidate.label } : {}),
    },
  };
}

function collectToolCalls(
  siblingBlocks: readonly ContentBlock[] | undefined,
  toolCalls: readonly ToolCall[] | undefined,
): ReadonlyMap<string, ToolCall> {
  const byId = new Map<string, ToolCall>();
  for (const block of siblingBlocks ?? []) {
    if (block.type === 'tool_call' && block.toolCall) {
      byId.set(block.toolCall.id, block.toolCall);
    }
  }
  for (const toolCall of toolCalls ?? []) {
    byId.set(toolCall.id, toolCall);
  }
  return byId;
}

function collectMediaCandidates(toolCall: ToolCall): readonly MediaCandidate[] {
  const candidates: MediaCandidate[] = [];
  const seen = new Set<string>();
  const data = asRecord(toolCall.result?.data);

  const addCandidate = (candidate: MediaCandidate): void => {
    const key = candidate.assetId ?? candidate.stableUri ?? candidate.src ?? candidate.localPath;
    if (!key || seen.has(key)) return;
    seen.add(key);
    candidates.push(candidate);
  };

  for (const [index, asset] of readRecordArray(data, 'assets').entries()) {
    addCandidate(projectGeneratedAssetCandidate(asset, index));
  }

  for (const [index, asset] of readRecordArray(data, 'generatedAssets').entries()) {
    addCandidate(projectGeneratedAssetCandidate(asset, index));
  }

  for (const [index, ref] of readRecordArray(data, 'resultAssetRefs').entries()) {
    addCandidate(projectAssetRefCandidate(ref, index));
  }

  const thumbnailRef = asRecord(data?.['thumbnailAssetRef']);
  if (thumbnailRef) {
    addCandidate(projectAssetRefCandidate(thumbnailRef, 0, 'thumbnail'));
  }

  for (const candidate of collectDocumentImageCandidates(data)) {
    addCandidate(candidate);
  }

  for (const candidate of collectReadImageCandidates(data)) {
    addCandidate(candidate);
  }

  for (const [index, attachment] of (toolCall.result?.attachments ?? []).entries()) {
    addCandidate(projectAttachmentCandidate(attachment, index));
  }

  for (const [index, url] of collectResultUrls(data).entries()) {
    addCandidate({
      assetIndex: index,
      src: isRenderableUri(url) ? url : undefined,
      type: inferMediaType(readString(data, 'mimeType'), url),
      localPath: readAbsolutePath(readStringArray(data, 'localPaths')[index]),
      label: `Asset ${index + 1}`,
    });
  }

  return candidates;
}

function collectDocumentImageCandidates(
  data: Record<string, unknown> | undefined,
): readonly MediaCandidate[] {
  if (!data) return [];

  const imageInfo = readRecordArray(data, 'imageInfo');
  const imagePaths = readStringArray(data, 'imagePaths');
  const imagePathWebviewUris = readStringArray(data, 'imagePathWebviewUris');
  const candidates: MediaCandidate[] = [];
  const maxLength = Math.max(imageInfo.length, imagePaths.length, imagePathWebviewUris.length);

  for (let index = 0; index < maxLength; index += 1) {
    const info = imageInfo[index];
    const candidate = projectDocumentImageCandidate({
      index,
      info,
      path: readString(info, 'path') ?? imagePaths[index],
      webviewUri: readRenderableUri(info) ?? imagePathWebviewUris[index],
      label: readString(info, 'label') ?? formatDocumentImageCandidateLabel(info, index),
    });
    if (candidate) candidates.push(candidate);
  }

  return candidates;
}

function collectReadImageCandidates(
  data: Record<string, unknown> | undefined,
): readonly MediaCandidate[] {
  return readRecordArray(data, 'images').flatMap((image, index) => {
    const documentImage = asRecord(image['documentImage']);
    const candidate = projectDocumentImageCandidate({
      index,
      info: image,
      path: readString(image, 'path') ?? readString(documentImage, 'path'),
      webviewUri:
        readRenderableUri(image) ??
        readRenderableUri(documentImage) ??
        readString(documentImage, 'webviewUri'),
      label: readString(image, 'label') ?? formatDocumentImageCandidateLabel(documentImage, index),
    });
    return candidate ? [candidate] : [];
  });
}

function projectDocumentImageCandidate(input: {
  readonly index: number;
  readonly info?: Record<string, unknown>;
  readonly path?: string;
  readonly webviewUri?: string;
  readonly label?: string;
}): MediaCandidate | null {
  if (!input.path && !input.webviewUri) return null;
  const mimeType = readString(input.info, 'mimeType') ?? inferImageMimeType(input.path);
  const src = input.webviewUri && isRenderableUri(input.webviewUri) ? input.webviewUri : undefined;
  const resourceRef = parseDocumentArchiveResourceRef(input.info?.['resourceRef']);
  return {
    assetIndex: input.index,
    type: 'image',
    ...(src ? { src } : {}),
    ...(readAbsolutePath(input.path) ? { localPath: readAbsolutePath(input.path) } : {}),
    ...(resourceRef ? { resourceRef } : {}),
    ...(mimeType ? { mimeType } : {}),
    ...(input.label ? { label: input.label } : {}),
  };
}

function projectGeneratedAssetCandidate(
  asset: Record<string, unknown>,
  index: number,
): MediaCandidate {
  const assetRef = asRecord(asset['assetRef']);
  const mimeType = readString(asset, 'mimeType') ?? readString(assetRef, 'mimeType');
  const src = readRenderableUri(asset) ?? readRenderableUri(assetRef);
  const stableUri = readString(assetRef, 'uri');

  return {
    assetIndex: index,
    type: inferGeneratedAssetType(readString(asset, 'type'), mimeType),
    ...(src ? { src } : {}),
    ...((readString(asset, 'id') ?? readString(assetRef, 'assetId'))
      ? { assetId: readString(asset, 'id') ?? readString(assetRef, 'assetId') }
      : {}),
    ...(stableUri ? { stableUri } : {}),
    ...(readAbsolutePath(readString(asset, 'path'))
      ? { localPath: readAbsolutePath(readString(asset, 'path')) }
      : {}),
    ...(mimeType ? { mimeType } : {}),
    ...(readString(asset, 'label') ? { label: readString(asset, 'label') } : {}),
  };
}

function projectAssetRefCandidate(
  assetRef: Record<string, unknown>,
  index: number,
  label?: string,
): MediaCandidate {
  const mimeType = readString(assetRef, 'mimeType');
  const stableUri = readString(assetRef, 'uri');
  const src = readRenderableUri(assetRef);

  return {
    assetIndex: index,
    type: inferMediaType(mimeType, stableUri),
    ...(src ? { src } : {}),
    ...(readString(assetRef, 'assetId') ? { assetId: readString(assetRef, 'assetId') } : {}),
    ...(stableUri ? { stableUri } : {}),
    ...(mimeType ? { mimeType } : {}),
    ...((label ?? readString(assetRef, 'label'))
      ? { label: label ?? readString(assetRef, 'label') }
      : {}),
  };
}

function projectAttachmentCandidate(
  attachment: ToolResultAttachment,
  index: number,
): MediaCandidate {
  const attachmentRecord = asRecord(attachment);
  const assetRef = asRecord(attachmentRecord?.['assetRef']);
  const mimeType = attachment.mimeType ?? readString(assetRef, 'mimeType');
  const src = readRenderableUri(attachmentRecord) ?? readRenderableUri(assetRef);
  const stableUri = readString(assetRef, 'uri') ?? attachment.path;

  return {
    assetIndex: index,
    type: inferMediaType(mimeType, stableUri, attachment.type),
    ...(src ? { src } : {}),
    ...(readString(assetRef, 'assetId') ? { assetId: readString(assetRef, 'assetId') } : {}),
    ...(stableUri ? { stableUri } : {}),
    ...(readAbsolutePath(attachment.path) ? { localPath: readAbsolutePath(attachment.path) } : {}),
    ...(mimeType ? { mimeType } : {}),
    label: `Attachment ${index + 1}`,
  };
}

function collectResultUrls(data: Record<string, unknown> | undefined): readonly string[] {
  const urls = new Set<string>();
  for (const key of ['url', 'thumbnailUrl', 'imageUrl', 'videoUrl', 'audioUrl', 'src']) {
    const value = readString(data, key);
    if (value) urls.add(value);
  }
  for (const value of readStringArray(data, 'urls')) {
    urls.add(value);
  }
  return Array.from(urls);
}

function readRenderableUri(record: Record<string, unknown> | undefined): string | undefined {
  if (!record) return undefined;
  for (const key of [
    'webviewUri',
    'previewUri',
    'preview',
    'thumbnailUrl',
    'url',
    'imageUrl',
    'videoUrl',
    'audioUrl',
    'src',
  ]) {
    const value = readString(record, key);
    if (value && isRenderableUri(value)) return value;
  }
  return undefined;
}

function inferGeneratedAssetType(
  assetType: string | undefined,
  mimeType: string | undefined,
): CompositeMediaType {
  if (assetType === 'generated-video') return 'video';
  if (assetType === 'generated-audio') return 'audio';
  if (assetType === 'generated-image' || assetType === 'generated-storyboard') return 'image';
  if (assetType === 'generated-model') return 'model';
  return inferMediaType(mimeType);
}

function inferMediaType(
  mimeType: string | undefined,
  uri?: string,
  fallback?: CompositeMediaType,
): CompositeMediaType {
  if (fallback) return fallback;
  if (mimeType?.startsWith('image/')) return 'image';
  if (mimeType?.startsWith('video/')) return 'video';
  if (mimeType?.startsWith('audio/')) return 'audio';
  if (isModelMimeType(mimeType)) return 'model';

  const lowerUri = uri?.toLowerCase() ?? '';
  if (/\.(png|jpe?g|gif|webp|bmp|svg)(\?|#|$)/.test(lowerUri)) return 'image';
  if (/\.(mp4|webm|mov|avi|mkv)(\?|#|$)/.test(lowerUri)) return 'video';
  if (/\.(mp3|wav|ogg|aac|flac|m4a)(\?|#|$)/.test(lowerUri)) return 'audio';
  if (/\.(glb|gltf|vrm)(\?|#|$)/.test(lowerUri)) return 'model';
  return 'unknown';
}

function inferImageMimeType(path: string | undefined): string | undefined {
  const lowerPath = path?.toLowerCase() ?? '';
  if (lowerPath.endsWith('.jpg') || lowerPath.endsWith('.jpeg')) return 'image/jpeg';
  if (lowerPath.endsWith('.png')) return 'image/png';
  if (lowerPath.endsWith('.webp')) return 'image/webp';
  if (lowerPath.endsWith('.gif')) return 'image/gif';
  if (lowerPath.endsWith('.bmp')) return 'image/bmp';
  if (lowerPath.endsWith('.svg')) return 'image/svg+xml';
  return undefined;
}

function formatDocumentImageCandidateLabel(
  info: Record<string, unknown> | undefined,
  index: number,
): string {
  const locator = asRecord(info?.['locator']);
  if (locator) {
    const kind = readString(locator, 'kind');
    if (kind === 'page') {
      const pageNumber = readFiniteNumber(locator, 'pageNumber');
      return pageNumber === undefined ? `page ${index + 1}` : `page ${pageNumber}`;
    }
    if (kind === 'chapter') {
      return (
        readString(locator, 'title') ?? readString(locator, 'chapterHref') ?? `image ${index + 1}`
      );
    }
    if (kind === 'slide') {
      const slideNumber = readFiniteNumber(locator, 'slideNumber');
      return slideNumber === undefined ? `slide ${index + 1}` : `slide ${slideNumber}`;
    }
  }
  return `image ${index + 1}`;
}

function isModelMimeType(mimeType: string | undefined): boolean {
  return (
    mimeType === 'model/gltf-binary' ||
    mimeType === 'model/gltf+json' ||
    mimeType === 'model/vrm' ||
    mimeType === 'application/octet-stream+glb' ||
    mimeType === 'application/x-vrm'
  );
}

function isRenderableUri(value: string): boolean {
  if (!value) return false;
  if (value.startsWith('file://')) return false;
  if (value.startsWith('data:')) return false;
  if (value.startsWith('${')) return false;
  if (isAbsolutePath(value)) return false;
  if (value.startsWith('http://') || value.startsWith('https://')) return true;
  if (value.startsWith('blob:')) return true;
  if (value.startsWith('webview://')) return true;
  return value.includes('vscode-resource') || value.includes('vscode-webview');
}

function pushDiagnostic(
  diagnostics: CompositeMediaDiagnostic[],
  diagnostic: CompositeMediaDiagnostic,
): void {
  if (diagnostics.length >= MAX_COMPOSITE_MEDIA_DIAGNOSTICS) return;
  diagnostics.push(diagnostic);
}

function readRecordArray(
  record: Record<string, unknown> | undefined,
  key: string,
): Record<string, unknown>[] {
  const value = record?.[key];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function readStringArray(record: Record<string, unknown> | undefined, key: string): string[] {
  const value = record?.[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];
}

function readString(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readFiniteNumber(
  record: Record<string, unknown> | undefined,
  key: string,
): number | undefined {
  const value = record?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readAbsolutePath(value: string | undefined): string | undefined {
  return value && isAbsolutePath(value) ? value : undefined;
}

function isAbsolutePath(value: string): boolean {
  return value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
