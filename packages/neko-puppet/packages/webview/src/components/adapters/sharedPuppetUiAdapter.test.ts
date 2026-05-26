import { describe, expect, it } from 'vitest';
import {
  mapPuppetFaceParametersToProperties,
  mapNativeBlendShapesToProperties,
  mapPuppetNodesToTreeViewItems,
  mapPuppetParametersToProperties,
} from './sharedPuppetUiAdapter';

describe('Puppet shared UI adapter', () => {
  it('maps puppet parameters into shared slider properties', () => {
    const result = mapPuppetParametersToProperties([
      { name: 'ParamAngleX', min: -30, max: 30, default: 0, current: 12 },
    ]);

    expect(result.groups).toEqual([
      { id: 'puppet-parameters', label: 'Parameters', propertyIds: ['ParamAngleX'] },
    ]);
    expect(result.properties[0]).toMatchObject({
      id: 'ParamAngleX',
      kind: 'slider',
      min: -30,
      max: 30,
      value: 12,
      step: 0.6,
      animatable: true,
    });
  });

  it('maps native blend shapes into bounded shared sliders', () => {
    const result = mapNativeBlendShapesToProperties([
      { meshId: 'mesh-face', name: 'Smile', current: 0.4 },
    ]);

    expect(result.properties[0]).toMatchObject({
      id: 'mesh-face:Smile',
      kind: 'slider',
      min: 0,
      max: 1,
      value: 0.4,
    });
  });

  it('maps standard face parameters into localized groups without category glyphs', () => {
    const result = mapPuppetFaceParametersToProperties(
      [
        { name: 'face_width', min: -1, max: 1, default: 0, current: 0.2 },
        { name: 'custom_param', min: 0, max: 10, default: 1, current: 4 },
      ],
      'en',
    );

    expect(result.groups).toEqual([
      { id: 'face_shape', label: 'Face Shape', propertyIds: ['face_width'] },
      { id: 'other', label: 'Other Parameters', propertyIds: ['custom_param'] },
    ]);
    expect(result.properties[0]).toMatchObject({
      id: 'face_width',
      kind: 'slider',
      label: 'Face Width',
      step: 0.01,
      animatable: true,
    });
  });

  it('maps puppet parent relationships into TreeView items', () => {
    const tree = mapPuppetNodesToTreeViewItems(
      [
        createNode('root', 'Root', null, 'root'),
        createNode('head', 'Head', 'root', 'group', true),
        createNode('eye', 'Eye', 'head', 'part'),
      ],
      'head',
    );

    expect(tree).toHaveLength(1);
    expect(tree[0]?.children?.[0]).toMatchObject({
      id: 'head',
      label: 'Head',
      selected: true,
      metadata: { nodeType: 'group', hasMesh: true },
    });
    expect(tree[0]?.children?.[0]?.children?.[0]?.id).toBe('eye');
  });
});

function createNode(
  id: string,
  name: string,
  parentId: string | null,
  nodeType: string,
  hasMesh = false,
) {
  return {
    id,
    name,
    parent_id: parentId,
    node_type: nodeType,
    position: [0, 0] as [number, number],
    rotation: 0,
    scale: [1, 1] as [number, number],
    z_order: 0,
    opacity: 1,
    has_mesh: hasMesh,
  };
}
