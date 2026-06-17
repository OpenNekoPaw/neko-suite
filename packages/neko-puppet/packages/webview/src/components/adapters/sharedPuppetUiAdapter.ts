import type { PropertyDefinition, PropertyGroupDefinition, TreeViewItem } from '@neko/ui/creative';
import {
  PUPPET_FACE_CATEGORIES,
  PUPPET_FACE_CATEGORY_ORDER,
  PUPPET_FACE_PARAMETERS,
  type PuppetFaceCategory,
} from '@neko/shared';
import type {
  NativeBlendShapeInfo,
  ParameterInfo,
  PuppetNodeSnapshot,
} from '../../animation/types';

export interface PuppetParameterAdapterResult {
  readonly properties: readonly PropertyDefinition[];
  readonly groups: readonly PropertyGroupDefinition[];
}

interface FaceParameterMatch {
  readonly category: PuppetFaceCategory;
  readonly label: string;
  readonly info: ParameterInfo;
  readonly step: number;
}

export function mapPuppetParametersToProperties(
  parameters: readonly ParameterInfo[],
  {
    groupId = 'puppet-parameters',
    groupLabel = 'Parameters',
  }: {
    readonly groupId?: string;
    readonly groupLabel?: string;
  } = {},
): PuppetParameterAdapterResult {
  const properties = parameters.map((parameter): PropertyDefinition => {
    const range = parameter.max - parameter.min;
    return {
      id: parameter.name,
      kind: 'slider',
      label: parameter.name,
      value: parameter.current,
      min: parameter.min,
      max: parameter.max,
      step: range > 0 ? range / 100 : 0.01,
      animatable: true,
      hasKeyframes: false,
      isAtKeyframe: false,
    };
  });

  return {
    properties,
    groups: [{ id: groupId, label: groupLabel, propertyIds: properties.map((item) => item.id) }],
  };
}

export function mapNativeBlendShapesToProperties(
  blendShapes: readonly NativeBlendShapeInfo[],
  {
    groupLabel = 'Blend Shapes',
  }: {
    readonly groupLabel?: string;
  } = {},
): PuppetParameterAdapterResult {
  const properties = blendShapes.map(
    (shape): PropertyDefinition => ({
      id: `${shape.meshId}:${shape.name}`,
      kind: 'slider',
      label: shape.name,
      value: shape.current,
      min: 0,
      max: 1,
      step: 0.01,
    }),
  );

  return {
    properties,
    groups: [
      {
        id: 'native-blend-shapes',
        label: groupLabel,
        propertyIds: properties.map((item) => item.id),
      },
    ],
  };
}

export function mapPuppetFaceParametersToProperties(
  parameters: readonly ParameterInfo[],
  locale: 'en' | 'zh',
): PuppetParameterAdapterResult {
  const matched = matchFaceParameters(parameters, locale);
  const matchedNames = new Set(matched.map(({ info }) => info.name));
  const unmatched = parameters.filter((parameter) => !matchedNames.has(parameter.name));
  const properties: PropertyDefinition[] = [
    ...matched.map(
      ({ info, label, step }): PropertyDefinition => ({
        id: info.name,
        kind: 'slider',
        label,
        value: info.current,
        min: info.min,
        max: info.max,
        step,
        animatable: true,
        hasKeyframes: false,
        isAtKeyframe: false,
      }),
    ),
    ...unmatched.map((parameter): PropertyDefinition => {
      const range = parameter.max - parameter.min;
      return {
        id: parameter.name,
        kind: 'slider',
        label: parameter.name,
        value: parameter.current,
        min: parameter.min,
        max: parameter.max,
        step: range > 0 ? range / 100 : 0.01,
        animatable: true,
        hasKeyframes: false,
        isAtKeyframe: false,
      };
    }),
  ];
  const groups: PropertyGroupDefinition[] = PUPPET_FACE_CATEGORY_ORDER.flatMap((category) => {
    const propertyIds = matched
      .filter((item) => item.category === category)
      .map(({ info }) => info.name);
    if (propertyIds.length === 0) return [];
    const meta = PUPPET_FACE_CATEGORIES[category];
    return [{ id: category, label: locale === 'zh' ? meta.zh : meta.en, propertyIds }];
  });

  if (unmatched.length > 0) {
    groups.push({
      id: 'other',
      label: locale === 'zh' ? '其他参数' : 'Other Parameters',
      propertyIds: unmatched.map((parameter) => parameter.name),
    });
  }

  return { properties, groups };
}

export function mapPuppetNodesToTreeViewItems(
  nodes: readonly PuppetNodeSnapshot[],
  selectedId: string | null,
): readonly TreeViewItem[] {
  const nodeMap = new Map<string, TreeViewItem & { children: TreeViewItem[] }>();
  const roots: (TreeViewItem & { children: TreeViewItem[] })[] = [];

  for (const node of nodes) {
    nodeMap.set(node.id, {
      id: node.id,
      label: node.name,
      children: [],
      selected: node.id === selectedId,
      visible: node.opacity > 0,
      locked: false,
      metadata: {
        nodeType: node.node_type,
        hasMesh: node.has_mesh,
      },
    });
  }

  for (const node of nodes) {
    const item = nodeMap.get(node.id);
    if (!item) continue;

    const parent = node.parent_id ? nodeMap.get(node.parent_id) : undefined;
    if (parent) {
      parent.children.push(item);
    } else {
      roots.push(item);
    }
  }

  return roots;
}

function matchFaceParameters(
  parameters: readonly ParameterInfo[],
  locale: 'en' | 'zh',
): readonly FaceParameterMatch[] {
  const parameterByName = new Map(parameters.map((parameter) => [parameter.name, parameter]));
  return PUPPET_FACE_PARAMETERS.flatMap((definition): FaceParameterMatch[] => {
    const info = parameterByName.get(definition.name);
    if (!info) return [];
    return [
      {
        category: definition.category,
        label: locale === 'zh' ? definition.label_zh : definition.label_en,
        info,
        step: definition.step,
      },
    ];
  });
}
