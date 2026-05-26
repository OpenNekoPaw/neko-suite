import type {
  PropertyDefinition,
  PropertyGroupDefinition,
  PropertyValue,
  TreeViewBadge,
  TreeViewItem,
} from '@neko/ui/creative';
import type { CanvasNode, CanvasNodeType, CanvasSubsystemManifest } from '@neko/shared';
import type { NodeTypeDescriptorRegistry } from '../nodes/nodeTypeDescriptor';
import { t } from '../../i18n';
import { getNodeLibraryCreationPolicy } from '../../utils/nodeLibraryPolicy';
import type { NodeLibraryGroup } from '../panels/NodeLibraryPanel';

export interface CanvasNodePropertyAdapterResult {
  readonly properties: readonly PropertyDefinition[];
  readonly groups: readonly PropertyGroupDefinition[];
}

export type CanvasNodePropertyId =
  | 'position.x'
  | 'position.y'
  | 'size.width'
  | 'size.height'
  | 'rotation';

export function mapCanvasNodeTransformToProperties(
  node: CanvasNode,
  translate: (key: string) => string,
): CanvasNodePropertyAdapterResult {
  return {
    properties: [
      {
        id: 'position.x',
        kind: 'number',
        label: 'X',
        value: node.position.x,
        step: 1,
      },
      {
        id: 'position.y',
        kind: 'number',
        label: 'Y',
        value: node.position.y,
        step: 1,
      },
      {
        id: 'size.width',
        kind: 'number',
        label: 'W',
        value: node.size.width,
        min: 50,
        step: 1,
      },
      {
        id: 'size.height',
        kind: 'number',
        label: 'H',
        value: node.size.height,
        min: 30,
        step: 1,
      },
      {
        id: 'rotation',
        kind: 'number',
        label: 'R',
        value: node.rotation ?? 0,
        min: 0,
        max: 359,
        step: 1,
        unit: 'deg',
      },
    ],
    groups: [
      {
        id: 'transform',
        label: translate('panel.transform'),
        propertyIds: ['position.x', 'position.y', 'size.width', 'size.height', 'rotation'],
      },
    ],
  };
}

export function mapCanvasNodePropertyCommit(
  node: CanvasNode,
  id: string,
  value: PropertyValue,
): Partial<CanvasNode> {
  if (typeof value !== 'number') {
    return {};
  }

  switch (id as CanvasNodePropertyId) {
    case 'position.x':
      return { position: { ...node.position, x: value } };
    case 'position.y':
      return { position: { ...node.position, y: value } };
    case 'size.width':
      return { size: { ...node.size, width: Math.max(50, value) } };
    case 'size.height':
      return { size: { ...node.size, height: Math.max(30, value) } };
    case 'rotation':
      return { rotation: ((value % 360) + 360) % 360 };
    default:
      return {};
  }
}

export function mapCanvasNodeLibraryGroupToTreeItems({
  activeSubsystemIds,
  descriptors,
  group,
}: {
  readonly activeSubsystemIds: readonly string[];
  readonly descriptors: NodeTypeDescriptorRegistry;
  readonly group: NodeLibraryGroup;
}): readonly TreeViewItem[] {
  const groupActive = group.subsystemId ? activeSubsystemIds.includes(group.subsystemId) : true;
  return [
    {
      id: group.id,
      label: group.label,
      expanded: true,
      badges: group.subsystemId
        ? [{ id: 'subsystem-state', label: groupActive ? 'Active' : 'Available' }]
        : [],
      metadata: {
        kind: 'group',
        subsystemId: group.subsystemId,
      },
      children: group.nodeTypes.map((nodeType) =>
        mapCanvasNodeLibraryTypeToTreeItem({
          descriptors,
          nodeType,
          subsystemId: group.subsystemId,
        }),
      ),
    },
  ];
}

export function mapCanvasNodeLibraryTypeToTreeItem({
  descriptors,
  nodeType,
  subsystemId,
}: {
  readonly descriptors: NodeTypeDescriptorRegistry;
  readonly nodeType: CanvasNodeType;
  readonly subsystemId?: CanvasSubsystemManifest['id'];
}): TreeViewItem {
  const descriptor = descriptors[nodeType];
  const policy = getNodeLibraryCreationPolicy(nodeType);
  const badge = policy.badgeKey ? createNodeLibraryBadge(policy.badgeKey) : undefined;
  return {
    id: nodeType,
    label: resolveCanvasNodeLibraryLabel(nodeType, descriptor),
    icon: descriptor?.icon,
    draggable: policy.canDragToCreate,
    disabled: policy.kind !== 'create' && !policy.pickerMessageType,
    badges: badge ? [badge] : [],
    metadata: {
      kind: 'node-type',
      nodeType,
      subsystemId,
      creationPolicy: policy,
    },
  };
}

function resolveCanvasNodeLibraryLabel(
  nodeType: CanvasNodeType,
  descriptor?: NodeTypeDescriptorRegistry[CanvasNodeType],
): string {
  const key = descriptor?.labelKey ?? NODE_TYPE_LABEL_KEY_FALLBACK[nodeType] ?? `node.${nodeType}`;
  const label = t(key);
  return label === key ? nodeType : label;
}

function createNodeLibraryBadge(badgeKey: string): TreeViewBadge {
  return {
    id: badgeKey,
    label: t(badgeKey),
  };
}

const NODE_TYPE_LABEL_KEY_FALLBACK: Partial<Record<CanvasNodeType, string>> = {
  annotation: 'node.note',
  text: 'toolbar.text',
  scene: 'node.sceneGroup',
  'canvas-embed': 'node.canvasEmbed',
  'narrative-scene': 'node.narrativeScene',
  'narrative-note': 'node.narrativeNote',
  'representation-slot': 'node.representationSlot',
  'generated-asset': 'node.generatedAsset',
};
