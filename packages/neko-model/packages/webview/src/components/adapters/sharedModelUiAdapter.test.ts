import { describe, expect, it } from 'vitest';
import { FACE_PARAMETERS } from '../../types/faceParameters';
import {
  mapModelFaceParametersToProperties,
  mapModelSceneNodesToTreeViewItems,
  mapModelTransformToProperties,
} from './sharedModelUiAdapter';

describe('Model shared UI adapter', () => {
  it('maps transform fields into grouped number properties', () => {
    const result = mapModelTransformToProperties(
      {
        position: { x: 1, y: 2, z: 3 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        scale: { x: 1, y: 1, z: 1 },
      },
      (key) => key,
    );

    expect(result.groups.map((group) => group.id)).toEqual(['position', 'rotation', 'scale']);
    expect(result.properties.find((property) => property.id === 'scale.x')).toMatchObject({
      kind: 'number',
      label: 'X',
      value: 1,
      min: 0,
      step: 0.001,
    });
  });

  it('maps face parameters into slider properties grouped by category', () => {
    const result = mapModelFaceParametersToProperties(FACE_PARAMETERS.slice(0, 2), {
      faceWidth: 0.8,
    });

    expect(result.groups[0]).toMatchObject({
      id: 'face',
      propertyIds: ['faceWidth', 'faceLength'],
    });
    expect(result.properties[0]).toMatchObject({
      id: 'faceWidth',
      kind: 'slider',
      value: 0.8,
      min: 0,
      max: 1,
    });
  });

  it('maps scene nodes into TreeView hierarchy with visibility state', () => {
    const tree = mapModelSceneNodesToTreeViewItems(
      [
        createNode('root', 'Root', undefined, 'character'),
        createNode('mesh', 'Mesh', 'root', 'mesh', false),
      ],
      'mesh',
    );

    expect(tree[0]?.expanded).toBe(true);
    expect(tree[0]?.children?.[0]).toMatchObject({
      id: 'mesh',
      label: 'Mesh',
      selected: true,
      visible: false,
      metadata: { kind: 'mesh' },
    });
  });

  it('reconstructs scene hierarchy from children edges when parentId is absent', () => {
    const tree = mapModelSceneNodesToTreeViewItems(
      [
        createNode('scene', 'Scene', undefined, 'node', true, ['armature']),
        createNode('armature', 'Armature', undefined, 'skeleton', true, ['mesh']),
        createNode('mesh', 'Body Mesh', undefined, 'mesh'),
      ],
      null,
    );

    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({ id: 'scene', label: 'Scene', expanded: true });
    expect(tree[0]?.children?.[0]).toMatchObject({ id: 'armature', label: 'Armature' });
    expect(tree[0]?.children?.[0]?.children?.[0]).toMatchObject({
      id: 'mesh',
      label: 'Body Mesh',
    });
  });
});

function createNode(
  nodeId: string,
  name: string,
  parentId: string | null | undefined,
  kind: string,
  visible = true,
  children: string[] = [],
) {
  return {
    nodeId,
    name,
    parentId,
    kind,
    visible,
    children,
  } as never;
}
