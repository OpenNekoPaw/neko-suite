import type { PropertyDefinition, PropertyGroupDefinition, TreeViewItem } from '@neko/ui/creative';
import type { EditableNodeTransform } from '../../scene/SceneEditingTypes';
import { MODEL_COMPONENT_SCHEMA_REGISTRY } from '../../scene/ComponentSchemaRegistry';
import type { SceneNodeSnapshot } from '../../types';
import type { FaceParameter } from '../../types/faceParameters';

export interface ModelPropertyAdapterResult {
  readonly properties: readonly PropertyDefinition[];
  readonly groups: readonly PropertyGroupDefinition[];
}

export function mapModelTransformToProperties(
  transform: EditableNodeTransform,
  translate: (key: string) => string,
): ModelPropertyAdapterResult {
  const groups: PropertyGroupDefinition[] = [
    { id: 'position', label: translate('transform.position'), propertyIds: [] },
    { id: 'rotation', label: translate('transform.rotation'), propertyIds: [] },
    { id: 'scale', label: translate('transform.scale'), propertyIds: [] },
  ];
  const properties: PropertyDefinition[] = [];

  for (const section of ['position', 'rotation', 'scale'] as const) {
    const group = groups.find((item) => item.id === section);
    if (!group) continue;

    const propertyIds: string[] = [];
    if (section === 'rotation') {
      for (const axis of ['x', 'y', 'z', 'w'] as const) {
        const id = `${section}.${axis}`;
        const schema = MODEL_COMPONENT_SCHEMA_REGISTRY.getField('transform', id);
        properties.push({
          id,
          kind: 'number',
          label: axis.toUpperCase(),
          value: transform.rotation[axis],
          min: schema?.min,
          max: schema?.max,
          step: schema?.step,
        });
        propertyIds.push(id);
      }
    } else {
      for (const axis of ['x', 'y', 'z'] as const) {
        const id = `${section}.${axis}`;
        const schema = MODEL_COMPONENT_SCHEMA_REGISTRY.getField('transform', id);
        properties.push({
          id,
          kind: 'number',
          label: axis.toUpperCase(),
          value: transform[section][axis],
          min: schema?.min,
          max: schema?.max,
          step: schema?.step,
        });
        propertyIds.push(id);
      }
    }

    groups[groups.indexOf(group)] = { ...group, propertyIds };
  }

  return { properties, groups };
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
): readonly TreeViewItem[] {
  const nodeMap = new Map<string, TreeViewItem & { children: TreeViewItem[] }>();
  const roots: (TreeViewItem & { children: TreeViewItem[] })[] = [];

  for (const node of nodes) {
    nodeMap.set(node.nodeId, {
      id: node.nodeId,
      label: node.name,
      children: [],
      expanded: node.parentId === null,
      selected: node.nodeId === selectedNodeId,
      visible: node.visible !== false,
      locked: false,
      metadata: {
        kind: node.kind,
        hasMesh: Boolean(node.mesh),
      },
    });
  }

  for (const node of nodes) {
    const item = nodeMap.get(node.nodeId);
    if (!item) continue;

    const parent = node.parentId ? nodeMap.get(node.parentId) : undefined;
    if (parent) {
      parent.children.push(item);
    } else {
      roots.push(item);
    }
  }

  return roots;
}
