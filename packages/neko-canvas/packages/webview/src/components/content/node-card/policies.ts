import type { CanvasNode, CanvasPreviewRole, NodePreviewDescriptor } from '@neko/shared';
import type {
  CardActionDescriptor,
  CardBadge,
  NodeCardPolicy,
  NodeCardPolicyRegistry,
} from './types';
import {
  capitalize,
  createAssetPreviewDescriptor,
  createSubtitle,
  createTextExcerpt,
  extractFileBasename,
  readAssetPath,
  readNumber,
  readRecord,
  readString,
  resolvePlacementTitle,
} from './utils';

const REMOVE_ACTION: CardActionDescriptor = {
  id: 'remove',
  label: 'Remove',
  icon: 'x',
  position: 'top-right',
  visibleWhen: 'hover',
  danger: true,
};

const DEFAULT_ACTIONS: readonly CardActionDescriptor[] = [REMOVE_ACTION];

export const fallbackCardPolicy: NodeCardPolicy = {
  nodeType: 'annotation',
  resolvePreviewSource: (node) => ({
    renderForm: 'icon',
    icon: getFallbackIcon(node),
  }),
  resolveTitle: (node, parent) =>
    resolvePlacementTitle(node, parent) ?? node.preview?.title ?? capitalize(node.type),
  resolveSubtitle: (node) => node.preview?.subtitle,
  resolveBadges: (node) => normalizePreviewBadges(node.preview?.badges),
  resolveActions: () => DEFAULT_ACTIONS,
};

export const mediaCardPolicy: NodeCardPolicy = {
  nodeType: 'media',
  resolvePreviewSource: (node) => {
    const data = readRecord(node.data);
    const mediaType = readString(data, 'mediaType');
    if (mediaType === 'audio') {
      return { renderForm: 'waveform', waveformStyle: 'bars' };
    }

    const sourcePath = readString(data, 'thumbnailPath') ?? readString(data, 'assetPath');
    const title = resolveMediaTitle(node);
    const role: CanvasPreviewRole = mediaType === 'video' ? 'video-poster' : 'image';
    const source = createAssetPreviewDescriptor({
      id: `node-card:${node.id}:media`,
      role,
      path: sourcePath,
      mediaType,
      title,
    });

    if (mediaType === 'video') {
      return { renderForm: 'media-poster', aspectRatio: '3/2', source };
    }
    return { renderForm: 'asset-thumbnail', aspectRatio: '3/2', source };
  },
  resolveTitle: (node, parent) => resolvePlacementTitle(node, parent) ?? resolveMediaTitle(node),
  resolveSubtitle: (node) => readString(node.data, 'mediaType'),
  resolveBadges: (node) => normalizePreviewBadges(node.preview?.badges),
  resolveActions: () => [
    REMOVE_ACTION,
    {
      id: 'open-media-preview',
      label: 'Open preview',
      icon: 'play',
      position: 'overlay-center',
      visibleWhen: 'hover',
      enabledWhen: 'has-asset',
    },
  ],
};

export const shotCardPolicy: NodeCardPolicy = {
  nodeType: 'shot',
  resolvePreviewSource: (node) => {
    const selected = findSelectedGenerationCandidate(node);
    const generatedImage = readString(node.data, 'generatedImage');
    const sourcePath = selected?.dataUrl ?? generatedImage;
    const variants = sourcePath
      ? [
          {
            id: selected?.id ?? 'generated-image',
            role: 'generation-candidate' as const,
            sourcePath,
            selected: true,
          },
        ]
      : undefined;

    return {
      renderForm: 'asset-thumbnail',
      aspectRatio: '3/2',
      source: createAssetPreviewDescriptor({
        id: `node-card:${node.id}:shot`,
        role: 'generation-candidate',
        title: resolveShotTitle(node),
        variants,
      }),
    };
  },
  resolveTitle: (node, parent) => resolvePlacementTitle(node, parent) ?? resolveShotTitle(node),
  resolveSubtitle: (node) => createSubtitle(readRecord(node.data)['visualDescription']),
  resolveBadges: (node) => {
    const status = readString(node.data, 'generationStatus');
    return status ? [{ label: status, tone: badgeToneForGenerationStatus(status) }] : [];
  },
  resolveActions: () => [
    REMOVE_ACTION,
    {
      id: 'generate',
      label: 'Generate',
      icon: 'sparkles',
      position: 'bottom',
      visibleWhen: 'hover',
      enabledWhen: 'not-generating',
    },
    {
      id: 'open-content-overlay',
      label: 'Open',
      icon: 'maximize',
      position: 'overlay-center',
      visibleWhen: 'hover',
      enabledWhen: 'has-preview',
    },
  ],
};

export const annotationCardPolicy: NodeCardPolicy = {
  nodeType: 'annotation',
  resolvePreviewSource: (node) => ({
    renderForm: 'text',
    textExcerpt: createTextExcerpt(readRecord(node.data)['content']),
  }),
  resolveTitle: (node, parent) =>
    resolvePlacementTitle(node, parent) ??
    createTextExcerpt(readRecord(node.data)['content'], 30) ??
    'Annotation',
  resolveSubtitle: () => undefined,
  resolveActions: () => DEFAULT_ACTIONS,
};

export const textCardPolicy: NodeCardPolicy = {
  nodeType: 'text',
  resolvePreviewSource: (node) => ({
    renderForm: 'text',
    textExcerpt: createTextExcerpt(readRecord(node.data)['content']),
  }),
  resolveTitle: (node, parent) =>
    resolvePlacementTitle(node, parent) ??
    createTextExcerpt(readRecord(node.data)['content'], 30) ??
    'Text',
  resolveSubtitle: () => undefined,
  resolveActions: () => DEFAULT_ACTIONS,
};

export const containerSummaryCardPolicy: NodeCardPolicy = {
  nodeType: 'group',
  resolvePreviewSource: () => ({ renderForm: 'icon', icon: 'C' }),
  resolveTitle: (node, parent) =>
    resolvePlacementTitle(node, parent) ?? node.preview?.title ?? resolveContainerTitle(node),
  resolveSubtitle: (node) => node.preview?.subtitle,
  resolveBadges: (node) => normalizePreviewBadges(node.preview?.badges),
  resolveActions: () => DEFAULT_ACTIONS,
};

export function createBuiltInNodeCardPolicyRegistry(): NodeCardPolicyRegistry {
  return {
    media: mediaCardPolicy,
    shot: shotCardPolicy,
    annotation: annotationCardPolicy,
    text: textCardPolicy,
    scene: { ...containerSummaryCardPolicy, nodeType: 'scene' },
    gallery: { ...containerSummaryCardPolicy, nodeType: 'gallery' },
    group: { ...containerSummaryCardPolicy, nodeType: 'group' },
    artboard: { ...containerSummaryCardPolicy, nodeType: 'artboard' },
    table: { ...containerSummaryCardPolicy, nodeType: 'table' },
  };
}

export function getNodeCardPolicy(
  registry: NodeCardPolicyRegistry,
  node: CanvasNode,
): NodeCardPolicy {
  return registry[node.type] ?? fallbackCardPolicy;
}

interface SelectedGenerationCandidate {
  id: string;
  dataUrl?: string;
}

function findSelectedGenerationCandidate(
  node: CanvasNode,
): SelectedGenerationCandidate | undefined {
  const history = readRecord(node.data)['generationHistory'];
  if (!Array.isArray(history)) {
    return undefined;
  }

  const selected = history.find(
    (candidate): candidate is Record<string, unknown> =>
      isRecord(candidate) && candidate['selected'] === true,
  );
  if (!selected) {
    return undefined;
  }

  const id = typeof selected['id'] === 'string' ? selected['id'] : 'selected';
  const dataUrl = typeof selected['dataUrl'] === 'string' ? selected['dataUrl'] : undefined;
  return { id, dataUrl };
}

function resolveMediaTitle(node: CanvasNode): string {
  if (node.preview?.title) {
    return extractFileBasename(node.preview.title);
  }

  const assetPath = readAssetPath(node);
  if (assetPath) {
    return extractFileBasename(assetPath);
  }

  const mediaType = readString(node.data, 'mediaType');
  if (mediaType === 'video') return 'Empty video';
  if (mediaType === 'audio') return 'Empty audio';
  return 'Empty image';
}

function resolveShotTitle(node: CanvasNode): string {
  if (node.preview?.title) {
    return node.preview.title;
  }

  const shotNumber = readNumber(node.data, 'shotNumber');
  return typeof shotNumber === 'number' ? `Shot ${shotNumber}` : 'Shot';
}

function resolveContainerTitle(node: CanvasNode): string {
  switch (node.type) {
    case 'scene':
      return readString(node.data, 'sceneTitle') ?? 'Scene';
    case 'gallery':
      return readString(node.data, 'characterName') ?? 'Gallery';
    case 'table':
      return readString(node.data, 'label') ?? 'Table';
    case 'group':
      return readString(node.data, 'label') ?? 'Group';
    case 'artboard':
      return readString(node.data, 'title') ?? 'Artboard';
    default:
      return capitalize(node.type);
  }
}

function normalizePreviewBadges(badges: NodePreviewDescriptor['badges'] | undefined): CardBadge[] {
  if (!Array.isArray(badges)) {
    return [];
  }

  return badges.map((badge) => ({
    label: String(badge.label),
    tone: normalizeBadgeTone(badge.tone),
  }));
}

function normalizeBadgeTone(tone: unknown): CardBadge['tone'] {
  switch (tone) {
    case 'success':
    case 'warning':
    case 'info':
    case 'neutral':
      return tone;
    case 'danger':
    case 'error':
      return 'error';
    default:
      return 'neutral';
  }
}

function badgeToneForGenerationStatus(status: string): CardBadge['tone'] {
  switch (status) {
    case 'done':
      return 'success';
    case 'error':
      return 'error';
    case 'generating':
      return 'warning';
    default:
      return 'neutral';
  }
}

function getFallbackIcon(node: CanvasNode): string {
  switch (node.type) {
    case 'media':
      return 'M';
    case 'shot':
      return 'S';
    case 'scene':
      return 'SC';
    case 'gallery':
      return 'G';
    case 'table':
      return 'T';
    default:
      return 'N';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
