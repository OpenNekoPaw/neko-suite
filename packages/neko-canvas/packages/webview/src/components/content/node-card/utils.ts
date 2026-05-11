import type { CanvasNode, CanvasPreviewRole } from '@neko/shared';
import { isSafeWebviewUrl, type PreviewSourceDescriptor } from '../../../preview';
import type {
  ActionCondition,
  ActionConditionContext,
  CardPreviewSource,
  TextPreviewSource,
} from './types';

const TEXT_PREVIEW_MAX_LENGTH = 60;
const SUBTITLE_MAX_LENGTH = 40;

export function evaluateActionCondition(
  condition: ActionCondition | undefined,
  ctx: ActionConditionContext,
): boolean {
  switch (condition ?? 'always') {
    case 'always':
      return true;
    case 'has-selection':
      return ctx.selection.nodeIds.length > 0;
    case 'has-preview':
      return hasRenderablePreview(ctx);
    case 'not-generating': {
      const targets = ctx.childNodes ?? [ctx.node];
      return targets.every((node) => readString(node.data, 'generationStatus') !== 'generating');
    }
    case 'has-asset':
      return Boolean(readAssetPath(ctx.node));
  }
}

export function hasRenderablePreview(ctx: ActionConditionContext): boolean {
  if (ctx.previewSource) {
    return isRenderablePreviewSource(ctx.previewSource);
  }

  if (ctx.childNodes) {
    return ctx.childNodes.some((node) => {
      if (node.preview?.thumbnailVariantId) {
        return true;
      }
      return (node.preview?.capabilities ?? []).some((capability) => capability.kind === 'preview');
    });
  }

  return Boolean(ctx.node.preview?.thumbnailVariantId);
}

export function isRenderablePreviewSource(source: CardPreviewSource): boolean {
  switch (source.renderForm) {
    case 'none':
    case 'icon':
      return false;
    case 'text':
      return source.textExcerpt.length > 0;
    case 'waveform':
      return true;
    case 'asset-thumbnail':
    case 'media-poster':
      return hasPreviewDescriptorContent(source.source);
  }
}

export function hasPreviewDescriptorContent(source: PreviewSourceDescriptor): boolean {
  return Boolean(source.asset?.path ?? source.asset?.uri ?? source.variants?.[0]?.sourcePath);
}

export function getStableSafeVariantUrl(source: PreviewSourceDescriptor): string | undefined {
  const variant = source.variants?.find((candidate) => candidate.role === source.role);
  const url = variant?.sourcePath;
  return url && isSafeWebviewUrl(url) ? url : undefined;
}

export function createAssetPreviewDescriptor(input: {
  id: string;
  role: CanvasPreviewRole;
  path?: string;
  mediaType?: string;
  title?: string;
  variants?: PreviewSourceDescriptor['variants'];
}): PreviewSourceDescriptor {
  return {
    id: input.id,
    role: input.role,
    asset: input.path
      ? {
          kind: 'asset-identity',
          path: input.path,
          mediaType: input.mediaType,
        }
      : undefined,
    variants: input.variants && input.variants.length > 0 ? [...input.variants] : undefined,
    title: input.title,
  };
}

export function createTextExcerpt(value: unknown, maxLength = TEXT_PREVIEW_MAX_LENGTH): string {
  if (typeof value !== 'string') {
    return '';
  }
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1))}...`;
}

export function createSubtitle(value: unknown): string | undefined {
  const excerpt = createTextExcerpt(value, SUBTITLE_MAX_LENGTH);
  return excerpt || undefined;
}

export function extractFileBasename(pathOrUrl: string): string {
  try {
    const url = new URL(pathOrUrl);
    return decodeURIComponent(url.pathname.split('/').pop() ?? pathOrUrl);
  } catch {
    return pathOrUrl.split(/[\\/]/).pop() ?? pathOrUrl;
  }
}

export function readRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

export function readString(data: unknown, key: string): string | undefined {
  const value = readRecord(data)[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function readNumber(data: unknown, key: string): number | undefined {
  const value = readRecord(data)[key];
  return typeof value === 'number' ? value : undefined;
}

export function readAssetPath(node: CanvasNode): string | undefined {
  const data = readRecord(node.data);
  const assetPath = data['assetPath'];
  return typeof assetPath === 'string' && assetPath.length > 0 ? assetPath : undefined;
}

export function readDocumentPath(node: CanvasNode): string | undefined {
  const data = readRecord(node.data);
  const candidates = ['docPath', 'scriptPath', 'canvasPath', 'projectPath', 'modelPath'];
  for (const key of candidates) {
    const path = data[key];
    if (typeof path === 'string' && path.length > 0) {
      return path;
    }
  }
  return undefined;
}

export function resolvePlacementTitle(node: CanvasNode, parent?: CanvasNode): string | undefined {
  const placementLabel = parent?.container?.childPlacements?.[node.id]?.metadata?.['label'];
  return typeof placementLabel === 'string' && placementLabel.length > 0
    ? placementLabel
    : undefined;
}

export function isTextPreviewSource(source: CardPreviewSource): source is TextPreviewSource {
  return source.renderForm === 'text';
}

export function capitalize(value: string): string {
  if (!value) {
    return value;
  }
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
