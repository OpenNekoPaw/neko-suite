import {
  GALLERY_NODE_PORTS,
  MEDIA_NODE_PORTS,
  SCENE_NODE_PORTS,
  SHOT_NODE_PORTS,
} from '@neko/shared';
import type {
  CanvasBlock,
  CanvasNode,
  CanvasPreviewRole,
  ContainerCapability,
  ContainerSection,
  JsonPointerPath,
  NodePreviewDescriptor,
  PortDefinition,
} from '@neko/shared';

type WithoutNodeId<T extends CanvasNode> = T extends CanvasNode ? Omit<T, 'id'> : never;

export type CanvasNodeDraft = WithoutNodeId<CanvasNode>;

type NodePreviewDescriptorDraft = Omit<NodePreviewDescriptor, 'nodeId'>;

export interface CanvasNodePreset {
  name: string;
  nodeType: CanvasNode['type'];
  createContent: (node: CanvasNodeDraft) => ContainerSection;
  createContainer?: (node: CanvasNodeDraft) => ContainerCapability;
  createPreview?: (node: CanvasNodeDraft) => NodePreviewDescriptorDraft;
  createPorts?: (node: CanvasNodeDraft) => readonly PortDefinition[];
}

export type CanvasNodePresetRegistry = ReadonlyMap<string, CanvasNodePreset>;

const PENDING_PREVIEW_NODE_ID = '';

const BUILT_IN_CONTENT_PRESETS: CanvasNodePreset[] = [
  {
    name: 'annotation.basic',
    nodeType: 'annotation',
    createContent: () => ({
      id: 'annotation-root',
      layout: 'stack',
      blocks: [
        {
          id: 'annotation-content',
          kind: 'textarea',
          label: 'preset.annotation.note',
          binding: { path: '/content', valueType: 'string' },
        },
      ],
    }),
  },
  {
    name: 'text.basic',
    nodeType: 'text',
    createContent: () => ({
      id: 'text-root',
      layout: 'stack',
      blocks: [
        {
          id: 'text-content',
          kind: 'textarea',
          label: 'preset.text.content',
          binding: { path: '/content', valueType: 'string' },
        },
      ],
    }),
  },
  {
    name: 'shot.basic',
    nodeType: 'shot',
    createContent: () => ({
      id: 'shot-root',
      layout: 'stack',
      sections: [
        {
          id: 'shot-controls',
          layout: 'row',
          visibleWhen: 'selected',
          blocks: [
            fieldBlock('shot-status', 'status', '/generationStatus', 'preset.shot.status'),
            selectBlock('shot-scale', '/shotScale', SHOT_SCALE_OPTIONS, 'preset.shot.scale'),
            selectBlock(
              'camera-movement',
              '/cameraMovement',
              CAMERA_MOVEMENT_OPTIONS,
              'preset.shot.cameraMovement',
            ),
            selectBlock(
              'camera-angle',
              '/cameraAngle',
              CAMERA_ANGLE_OPTIONS,
              'preset.shot.cameraAngle',
            ),
            fieldBlock('shot-duration', 'number', '/duration', 'preset.shot.duration'),
          ],
        },
        {
          id: 'shot-preview',
          layout: 'stack',
          blocks: [
            {
              id: 'shot-generated-preview',
              kind: 'asset-preview',
              label: 'preset.shot.generatedImage',
              binding: { path: '/generatedImage', valueType: 'asset' },
              capabilities: [
                {
                  kind: 'preview',
                  roles: ['generation-candidate'],
                  preferredRole: 'generation-candidate',
                },
                {
                  kind: 'generation-preview',
                  candidates: { path: '/generationHistory', valueType: 'array' },
                  status: { path: '/generationStatus', valueType: 'string' },
                },
              ],
            },
          ],
        },
        {
          id: 'shot-metadata',
          layout: 'stack',
          blocks: [
            fieldBlock(
              'shot-visual-description',
              'textarea',
              '/visualDescription',
              'preset.shot.visual',
            ),
            fieldBlock(
              'shot-character-action',
              'textarea',
              '/characterAction',
              'preset.shot.action',
            ),
            fieldBlock('shot-characters', 'list', '/characters', 'preset.shot.characters'),
            fieldBlock('shot-emotion', 'tag-list', '/emotion', 'preset.shot.emotion'),
            fieldBlock('shot-scene-tags', 'tag-list', '/sceneTags', 'preset.shot.tags'),
          ],
        },
        {
          id: 'shot-detail',
          title: 'preset.shot.detail',
          layout: 'stack',
          visibleWhen: 'selected',
          collapsible: true,
          defaultCollapsed: true,
          blocks: [
            fieldBlock('shot-dialogue', 'textarea', '/dialogue', 'preset.shot.dialogue'),
            fieldBlock('shot-voice-over', 'textarea', '/voiceOver', 'preset.shot.voiceOver'),
            fieldBlock('shot-sound-cue', 'input', '/soundCue', 'preset.shot.sound'),
          ],
        },
      ],
    }),
    createPreview: (node) => {
      const data = node.type === 'shot' ? node.data : undefined;
      const selected = data?.generationHistory.find((candidate) => candidate.selected);
      return {
        title: data ? `Shot ${data.shotNumber}` : 'Shot',
        subtitle: data?.visualDescription,
        role: 'generation-candidate',
        thumbnailVariantId: selected?.id,
        metadata: selected
          ? {
              selectedAssetId: selected.assetId,
            }
          : undefined,
        badges: data?.generationStatus
          ? [{ label: data.generationStatus, tone: 'neutral' }]
          : undefined,
        capabilities: [
          {
            kind: 'generation-preview',
            candidates: { path: '/generationHistory', valueType: 'array' },
            status: { path: '/generationStatus', valueType: 'string' },
          },
        ],
      };
    },
    createPorts: () => SHOT_NODE_PORTS,
  },
  {
    name: 'scene.basic',
    nodeType: 'scene',
    createContent: () => ({
      id: 'scene-root',
      layout: 'stack',
      sections: [
        {
          id: 'scene-header',
          layout: 'row',
          blocks: [
            fieldBlock('scene-number', 'number', '/sceneNumber', 'preset.scene.number'),
            fieldBlock('scene-title', 'input', '/sceneTitle', 'preset.scene.title'),
            fieldBlock('scene-location', 'input', '/location', 'preset.scene.location'),
            fieldBlock('scene-time-of-day', 'input', '/timeOfDay', 'preset.scene.time'),
          ],
        },
        {
          id: 'scene-actions',
          layout: 'row',
          visibleWhen: 'selected',
          blocks: [
            actionBlock(
              'scene-assign-selected',
              'preset.scene.assignSelected',
              'assignSelectedShots',
            ),
            actionBlock('scene-auto-layout', 'preset.scene.autoLayout', 'autoLayoutShots'),
            actionBlock('scene-batch-generate', 'preset.scene.batchGenerate', 'batchGenerateShots'),
          ],
        },
      ],
      childSlots: [
        {
          id: 'scene-children',
          layout: 'grid',
          summaryRole: 'node-summary',
          emptyLabel: 'preset.scene.noChildren',
        },
      ],
    }),
    createContainer: () => ({
      policy: 'scene',
      childIds: [],
      layout: { mode: 'sequence' },
      acceptedChildren: {
        nodeTypes: ['shot', 'media', 'annotation', 'text', 'gallery', 'group'],
      },
      deleteBehavior: 'release-children',
    }),
    createPreview: (node) => {
      const data = node.type === 'scene' ? node.data : undefined;
      return {
        title: data?.sceneTitle ?? 'Scene',
        subtitle: joinLabelParts([data?.location, data?.timeOfDay]),
        role: 'node-summary',
        badges: data
          ? [{ label: `${getDraftContainerChildIds(node).length} shots`, tone: 'info' }]
          : undefined,
      };
    },
    createPorts: () => SCENE_NODE_PORTS,
  },
  {
    name: 'gallery.basic',
    nodeType: 'gallery',
    createContent: () => ({
      id: 'gallery-root',
      layout: 'stack',
      sections: [
        {
          id: 'gallery-header',
          layout: 'row',
          blocks: [
            selectBlock(
              'gallery-preset',
              '/preset',
              GALLERY_PRESET_OPTIONS,
              'preset.gallery.preset',
            ),
            fieldBlock(
              'gallery-character-name',
              'input',
              '/characterName',
              'preset.gallery.character',
            ),
          ],
        },
        {
          id: 'gallery-prompt',
          layout: 'stack',
          visibleWhen: 'selected',
          blocks: [
            fieldBlock(
              'gallery-global-prompt',
              'textarea',
              '/globalPromptPrefix',
              'preset.gallery.promptPrefix',
            ),
          ],
        },
        {
          id: 'gallery-cells',
          layout: 'gallery',
          blocks: [
            {
              id: 'gallery-cell-collection',
              kind: 'collection',
              label: 'preset.gallery.cells',
              collection: {
                id: 'gallery-cells',
                source: { path: '/cells', valueType: 'array' },
                itemKeyPath: '/id',
                itemLabelPath: '/label',
                itemPreviewPath: '/image',
                itemBlocks: [
                  fieldBlock('gallery-cell-label', 'input', '/label', 'preset.gallery.cellLabel'),
                  fieldBlock(
                    'gallery-cell-prompt',
                    'textarea',
                    '/prompt',
                    'preset.gallery.cellPrompt',
                  ),
                  fieldBlock('gallery-cell-image', 'input', '/image', 'preset.gallery.cellPreview'),
                ],
                layout: 'gallery',
                emptyLabel: 'preset.gallery.noCells',
              },
              capabilities: [
                {
                  kind: 'collection-preview',
                  collection: { path: '/cells', valueType: 'array' },
                  itemPreview: { path: '/image', valueType: 'asset' },
                },
              ],
            },
          ],
        },
      ],
    }),
    createPreview: (node) => {
      const data = node.type === 'gallery' ? node.data : undefined;
      const selectedCell =
        data?.cells.find((cell) =>
          cell.generationHistory?.some((candidate) => candidate.selected),
        ) ?? data?.cells.find((cell) => cell.image);
      const selectedCandidate = selectedCell?.generationHistory?.find(
        (candidate) => candidate.selected,
      );
      return {
        title: data?.characterName ?? 'Gallery',
        subtitle: data?.preset,
        role: 'collection',
        thumbnailVariantId: selectedCandidate?.id ?? selectedCell?.id,
        metadata: selectedCell
          ? {
              selectedCellId: selectedCell.id,
              selectedAssetId: selectedCandidate?.assetId,
            }
          : undefined,
        badges: data ? [{ label: `${data.cells.length} cells`, tone: 'info' }] : undefined,
        capabilities: [
          {
            kind: 'collection-preview',
            collection: { path: '/cells', valueType: 'array' },
            itemPreview: { path: '/image', valueType: 'asset' },
            selectedItem: { path: '/cells', valueType: 'array' },
          },
        ],
      };
    },
    createPorts: () => GALLERY_NODE_PORTS,
  },
  {
    name: 'media.basic',
    nodeType: 'media',
    createContent: (node) => {
      const role = getMediaPreviewRole(node);
      return {
        id: 'media-root',
        layout: 'stack',
        sections: [
          {
            id: 'media-preview',
            layout: 'stack',
            blocks: [
              {
                id: 'media-asset-preview',
                kind: 'asset-preview',
                label: 'preset.media.preview',
                binding: { path: '/assetPath', valueType: 'asset' },
                capabilities: [
                  {
                    kind: 'preview',
                    roles: [role],
                    preferredRole: role,
                  },
                  {
                    kind: 'asset-identity',
                    mediaType: node.type === 'media' ? node.data.mediaType : undefined,
                  },
                  {
                    kind: 'delegate',
                    actions: [
                      {
                        id: 'open-media',
                        label: 'Open',
                        target: 'preview',
                        assetBinding: { path: '/assetPath', valueType: 'asset' },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };
    },
    createPreview: (node) => {
      const data = node.type === 'media' ? node.data : undefined;
      return {
        title: data?.assetPath || 'Media',
        subtitle: data?.mediaType,
        role: getMediaPreviewRole(node),
        thumbnailVariantId: data?.thumbnailPath,
        capabilities: [
          {
            kind: 'asset-identity',
            path: data?.assetPath,
            mediaType: data?.mediaType,
          },
          {
            kind: 'preview',
            roles: [getMediaPreviewRole(node)],
            preferredRole: getMediaPreviewRole(node),
          },
        ],
      };
    },
    createPorts: () => MEDIA_NODE_PORTS,
  },
  {
    name: 'table.basic',
    nodeType: 'table',
    createContent: () => ({
      id: 'table-root',
      layout: 'stack',
      sections: [
        {
          id: 'table-header',
          layout: 'row',
          blocks: [
            fieldBlock('table-label', 'input', '/label', 'preset.table.label'),
            fieldBlock('table-columns', 'number', '/columnCount', 'preset.table.columns'),
            fieldBlock('table-rows', 'number', '/rowCount', 'preset.table.rows'),
          ],
        },
      ],
      childSlots: [
        {
          id: 'table-children',
          layout: 'table',
          summaryRole: 'node-summary',
          emptyLabel: 'preset.table.noChildren',
        },
      ],
    }),
    createContainer: () => ({
      policy: 'table',
      childIds: [],
      layout: {
        mode: 'table',
        columns: 3,
        columnWidth: 200,
        rowHeight: 120,
      },
      deleteBehavior: 'release-children',
    }),
    createPreview: (node) => {
      const data = node.type === 'table' ? node.data : undefined;
      return {
        title: data?.label ?? 'Table',
        role: 'node-summary',
        badges: data
          ? [{ label: `${data.columnCount}×${data.rowCount}`, tone: 'info' }]
          : undefined,
      };
    },
  },
  {
    name: 'project.basic',
    nodeType: 'project',
    createContent: () => ({
      id: 'project-root',
      layout: 'stack' as const,
      sections: [
        {
          id: 'project-preview',
          layout: 'stack' as const,
          blocks: [
            {
              id: 'project-asset-preview',
              kind: 'asset-preview' as const,
              label: 'preset.project.preview',
              binding: { path: '/projectPath' as JsonPointerPath, valueType: 'asset' as const },
              capabilities: [
                {
                  kind: 'preview' as const,
                  roles: ['project-thumbnail'] as CanvasPreviewRole[],
                  preferredRole: 'project-thumbnail' as const,
                },
                {
                  kind: 'delegate' as const,
                  actions: [
                    {
                      id: 'open-project',
                      label: 'Open',
                      target: 'project',
                      assetBinding: {
                        path: '/projectPath' as JsonPointerPath,
                        valueType: 'asset' as const,
                      },
                    },
                  ],
                },
              ],
            } satisfies CanvasBlock,
          ],
        },
      ],
    }),
    createPreview: (node) => {
      const data = node.type === 'project' ? node.data : undefined;
      return {
        title: data?.projectTitle ?? 'Project',
        subtitle: data?.projectType,
        role: 'project-thumbnail' as const,
        thumbnailVariantId: data?.thumbnailData ? 'thumb' : undefined,
        capabilities: [
          {
            kind: 'preview' as const,
            roles: ['project-thumbnail'] as CanvasPreviewRole[],
            preferredRole: 'project-thumbnail' as const,
          },
        ],
      };
    },
  },
];

export function createBuiltInCanvasNodePresetRegistry(): CanvasNodePresetRegistry {
  return new Map(BUILT_IN_CONTENT_PRESETS.map((preset) => [preset.name, preset]));
}

const BUILT_IN_CANVAS_NODE_PRESET_REGISTRY = createBuiltInCanvasNodePresetRegistry();

export function getCanvasNodePreset(
  registry: CanvasNodePresetRegistry,
  name: string | undefined,
): CanvasNodePreset | undefined {
  return name ? registry.get(name) : undefined;
}

export function applyCanvasNodePreset(
  node: CanvasNodeDraft,
  preset: CanvasNodePreset | undefined,
): CanvasNodeDraft {
  if (!preset || node.type !== preset.nodeType) {
    return node;
  }

  const ports = preset.createPorts?.(node);
  const preview = preset.createPreview?.(node);

  return {
    ...node,
    preset: preset.name,
    content: preset.createContent(node),
    container: preset.createContainer?.(node),
    preview: preview ? { nodeId: PENDING_PREVIEW_NODE_ID, ...preview } : node.preview,
    ports: ports ? [...ports] : node.ports,
  } as CanvasNodeDraft;
}

export function hydrateCanvasNodePreview(node: CanvasNode): CanvasNode {
  return refreshCanvasNodePreview(node);
}

export function refreshCanvasNodePreview(node: CanvasNode): CanvasNode {
  const preset = getCanvasNodePreset(BUILT_IN_CANVAS_NODE_PRESET_REGISTRY, node.preset);
  if (!preset?.createPreview) {
    if (!node.preview || node.preview.nodeId === node.id) {
      return node;
    }

    return {
      ...node,
      preview: {
        ...node.preview,
        nodeId: node.id,
      },
    } as CanvasNode;
  }

  const preview = preset.createPreview(node as CanvasNodeDraft);
  const nextPreview = {
    nodeId: node.id,
    ...preview,
  };

  if (arePreviewDescriptorsEqual(node.preview, nextPreview)) {
    return node;
  }

  return {
    ...node,
    preview: nextPreview,
  } as CanvasNode;
}

function fieldBlock(
  id: string,
  kind: CanvasBlock['kind'],
  path: JsonPointerPath,
  label: string,
): CanvasBlock {
  return {
    id,
    kind,
    label,
    binding: { path, valueType: kind === 'number' ? 'number' : 'string' },
  };
}

function selectBlock(
  id: string,
  path: JsonPointerPath,
  options: readonly string[],
  label: string,
): CanvasBlock {
  return {
    id,
    kind: 'select',
    label,
    binding: { path, valueType: 'string' },
    metadata: { options: [...options] },
  };
}

function actionBlock(id: string, label: string, action: string): CanvasBlock {
  return {
    id,
    kind: 'button',
    label,
    metadata: { action },
  };
}

const SHOT_SCALE_OPTIONS = ['ECU', 'CU', 'MCU', 'MS', 'MLS', 'LS', 'VLS', 'ELS'] as const;
const CAMERA_MOVEMENT_OPTIONS = [
  'static',
  'pan',
  'tilt',
  'zoom-in',
  'zoom-out',
  'dolly',
  'dolly-in',
  'dolly-out',
  'handheld',
  'crane',
] as const;
const CAMERA_ANGLE_OPTIONS = ['eye-level', 'high-angle', 'low-angle', 'bird-eye', 'dutch'] as const;
const GALLERY_PRESET_OPTIONS = [
  'character-3view',
  'character-4view',
  'expression-9',
  'turnaround-8',
  'scene-views',
  'custom',
] as const;

function getMediaPreviewRole(node: CanvasNodeDraft): CanvasPreviewRole {
  if (node.type !== 'media') {
    return 'fallback';
  }

  switch (node.data.mediaType) {
    case 'video':
      return 'video-proxy';
    case 'audio':
      return 'audio-waveform';
    case 'image':
      return 'image';
    default:
      return 'fallback';
  }
}

function getDraftContainerChildIds(node: CanvasNodeDraft): string[] {
  const legacyChildIds = node.type === 'group' ? node.data.childIds : [];

  return uniqueStrings([...(node.container?.childIds ?? []), ...legacyChildIds]);
}

function joinLabelParts(parts: Array<string | undefined>): string | undefined {
  const value = parts.filter((part): part is string => Boolean(part)).join(' · ');
  return value || undefined;
}

function uniqueStrings<T extends string>(values: readonly T[]): T[] {
  return Array.from(new Set(values));
}

function arePreviewDescriptorsEqual(
  left: NodePreviewDescriptor | undefined,
  right: NodePreviewDescriptor,
): boolean {
  if (!left) {
    return false;
  }

  return areValuesEqual(left, right);
}

function areValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }

    return left.every((entry, index) => areValuesEqual(entry, right[index]));
  }

  if (!isPlainRecord(left) || !isPlainRecord(right)) {
    return false;
  }

  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(right, key) && areValuesEqual(left[key], right[key]),
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
