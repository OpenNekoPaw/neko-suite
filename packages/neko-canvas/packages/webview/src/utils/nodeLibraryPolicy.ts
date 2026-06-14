import type { CanvasNodeType } from '@neko/shared';

export type NodeLibraryCreationKind = 'create' | 'file-bound' | 'source-bound' | 'projection-only';

export type NodeLibraryPickerMessageType =
  | 'pickMediaFile'
  | 'pickScriptDocument'
  | 'pickReferenceDocument'
  | 'pickModelReference'
  | 'pickCanvasDocument'
  | 'pickProjectDocument';

export interface NodeLibraryCreationPolicy {
  readonly kind: NodeLibraryCreationKind;
  readonly canDragToCreate: boolean;
  readonly badgeKey?: string;
  readonly titleKey: string;
  readonly pickerMessageType?: NodeLibraryPickerMessageType;
}

const FILE_BOUND_NODE_PICKERS: Partial<Record<CanvasNodeType, NodeLibraryPickerMessageType>> = {
  media: 'pickMediaFile',
  script: 'pickScriptDocument',
  document: 'pickReferenceDocument',
  model: 'pickModelReference',
  'canvas-embed': 'pickCanvasDocument',
  project: 'pickProjectDocument',
};

const SOURCE_BOUND_NODE_TYPES = new Set<CanvasNodeType>(['entity']);

const PROJECTION_ONLY_NODE_TYPES = new Set<CanvasNodeType>([
  'representation-slot',
  'occurrence',
  'generated-asset',
]);

export function getNodeLibraryCreationPolicy(nodeType: CanvasNodeType): NodeLibraryCreationPolicy {
  const pickerMessageType = FILE_BOUND_NODE_PICKERS[nodeType];
  if (pickerMessageType) {
    return {
      kind: 'file-bound',
      canDragToCreate: false,
      badgeKey: 'library.badge.file',
      titleKey: 'library.action.pickFile',
      pickerMessageType,
    };
  }

  if (SOURCE_BOUND_NODE_TYPES.has(nodeType)) {
    return {
      kind: 'source-bound',
      canDragToCreate: false,
      badgeKey: 'library.badge.source',
      titleKey: 'library.action.sourceBound',
    };
  }

  if (PROJECTION_ONLY_NODE_TYPES.has(nodeType)) {
    return {
      kind: 'projection-only',
      canDragToCreate: false,
      badgeKey: 'library.badge.projected',
      titleKey: 'library.action.projected',
    };
  }

  return {
    kind: 'create',
    canDragToCreate: true,
    titleKey: 'library.action.create',
  };
}

export function isNodeLibraryDirectCreateType(nodeType: CanvasNodeType): boolean {
  return getNodeLibraryCreationPolicy(nodeType).kind === 'create';
}

export function isNodeLibraryFileBoundType(nodeType: CanvasNodeType): boolean {
  return getNodeLibraryCreationPolicy(nodeType).kind === 'file-bound';
}

export function isNodeLibraryVisibleCreateType(nodeType: CanvasNodeType): boolean {
  return getNodeLibraryCreationPolicy(nodeType).kind === 'create';
}

export function getNodeLibraryPickerMessageType(
  nodeType: CanvasNodeType,
): NodeLibraryPickerMessageType | undefined {
  return getNodeLibraryCreationPolicy(nodeType).pickerMessageType;
}
