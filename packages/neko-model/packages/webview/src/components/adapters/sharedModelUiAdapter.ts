import type { PropertyDefinition, PropertyGroupDefinition, TreeViewItem } from '@neko/ui/creative';
import type { SceneNodeSnapshot } from '../../types';
import type { FaceParameter } from '../../types/faceParameters';
import type { SelectionTarget } from '@neko/shared';

export interface ModelPropertyAdapterResult {
  readonly properties: readonly PropertyDefinition[];
  readonly groups: readonly PropertyGroupDefinition[];
}

export function mapModelFaceParametersToProperties(
  parameters: readonly FaceParameter[],
  values: Readonly<Record<string, number>>,
): ModelPropertyAdapterResult {
  const properties = parameters.map(
    (parameter): PropertyDefinition => ({
      id: parameter.name,
      kind: 'slider',
      label: parameter.label,
      value: values[parameter.name] ?? parameter.default,
      min: parameter.min,
      max: parameter.max,
      step: parameter.step,
    }),
  );

  const categoryIds = Array.from(new Set(parameters.map((parameter) => parameter.category)));
  const groups = categoryIds.map((category) => ({
    id: category,
    label: category,
    propertyIds: parameters
      .filter((parameter) => parameter.category === category)
      .map((parameter) => parameter.name),
  }));

  return { properties, groups };
}

export function mapModelSceneNodesToTreeViewItems(
  nodes: readonly SceneNodeSnapshot[],
  selectedNodeId: string | null,
  selectedTargets: readonly SelectionTarget[] = [],
): readonly TreeViewItem[] {
  const nodeMap = new Map<string, MutableTreeViewItem>();
  const parentByChildId = new Map<string, string>();
  const roots: MutableTreeViewItem[] = [];
  const selectedNodeIds = collectSelectedNodeIds(selectedNodeId, selectedTargets);

  for (const node of nodes) {
    nodeMap.set(node.nodeId, createModelTreeItem(node, selectedNodeIds));
  }

  for (const node of nodes) {
    if (node.parentId && nodeMap.has(node.parentId)) {
      parentByChildId.set(node.nodeId, node.parentId);
    }
  }

  for (const node of nodes) {
    for (const childId of node.children ?? []) {
      if (childId === node.nodeId || !nodeMap.has(childId) || parentByChildId.has(childId)) {
        continue;
      }
      parentByChildId.set(childId, node.nodeId);
    }
  }

  for (const node of nodes) {
    const item = nodeMap.get(node.nodeId);
    if (!item) continue;

    item.expanded = !parentByChildId.has(node.nodeId);
    const parent = nodeMap.get(parentByChildId.get(node.nodeId) ?? '');
    if (parent) {
      parent.children.push(item);
    } else {
      roots.push(item);
    }
  }

  return roots;
}

function createModelTreeItem(
  node: SceneNodeSnapshot,
  selectedNodeIds: ReadonlySet<string>,
): MutableTreeViewItem {
  return {
    id: node.nodeId,
    label: node.name,
    children: [],
    selected: selectedNodeIds.has(node.nodeId),
    visible: node.visible !== false,
    locked: false,
    metadata: {
      kind: node.kind,
      hasMesh: Boolean(node.mesh),
    },
  };
}

function collectSelectedNodeIds(
  selectedNodeId: string | null,
  selectedTargets: readonly SelectionTarget[],
): ReadonlySet<string> {
  const selectedNodeIds = new Set<string>();
  if (selectedNodeId) {
    selectedNodeIds.add(selectedNodeId);
  }
  for (const target of selectedTargets) {
    if (typeof target.nodeId === 'string' && target.nodeId.length > 0) {
      selectedNodeIds.add(target.nodeId);
    }
  }
  return selectedNodeIds;
}

type MutableTreeViewItem = Omit<TreeViewItem, 'children' | 'expanded'> & {
  children: TreeViewItem[];
  expanded?: boolean;
};
