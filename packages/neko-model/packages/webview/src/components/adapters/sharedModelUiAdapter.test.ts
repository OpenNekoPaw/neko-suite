import { describe, expect, it } from 'vitest';
import { FACE_PARAMETERS } from '../../types/faceParameters';
import {
  mapModelFaceParametersToProperties,
  mapModelSceneNodesToTreeViewItems,
} from './sharedModelUiAdapter';

describe('Model shared UI adapter', () => {
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

  it('marks all node targets as selected for multi-part scene feedback', () => {
    const tree = mapModelSceneNodesToTreeViewItems(
      [
        createNode('root', 'Root', undefined, 'character', true, ['body', 'hair']),
        createNode('body', 'Body', 'root', 'mesh'),
        createNode('hair', 'Hair', 'root', 'mesh'),
      ],
      'body',
      [
        { kind: 'node', nodeId: 'body' },
        { kind: 'materialSlot', nodeId: 'hair', materialSlotId: 'slot-0' },
      ],
    );

    expect(tree[0]?.children?.[0]).toMatchObject({ id: 'body', selected: true });
    expect(tree[0]?.children?.[1]).toMatchObject({ id: 'hair', selected: true });
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
